-- =============================================================================
-- 072_organization_roles_and_governance.sql
-- LaukaaInfo – Organisaatioiden roolihallinta, kooditodennus ja päätöksenteon auditointi
-- =============================================================================
-- TILA: VALMIS HYVÄKSYNTÄTESTATTAVAKSI (v0.9.2, pragmaattinen yhdistysmalli)
--
-- Tavoite ja arkkitehtoninen linjaus:
--   LaukaaInfo on suunnattu pienille yhdistyksille ja seuroille. Ei rakenneta
--   tarpeetonta yritystason meta-arkkitehtuuria, vaan varmistetaan kolme ydinasiaa:
--     1. Tunnistaminen: Kuka kirjautuu henkilökohtaisella koodilla?
--     2. Toimivalta: Mitä henkilön rooli sallii tehdä juuri nyt?
--     3. Jäljitettävyys: Kuka teki muutoksen ja mitä muuttui?
--
-- Täsmäkorjaukset v0.9.2 (auditoinnin A–D):
--   A. Viimeisen puheenjohtajan suoja roolin peruutuksessa:
--      revoke_organization_role() estää nyt ainoan voimassaolevan puheenjohtajan
--      perumisen ilman uuden pj:n nimeämistä (estää hallinnon lukkiutumisen).
--   B. Rajoitteiden sisällöllinen validointi:
--      chk_org_session_type, fk_org_sessions_credential ja istunnon jäsenviite
--      validoidaan sisällön perusteella eikä pelkällä nimellä.
--   C. Istunnon ja jäsenen täysi organisaatiosidos tietokantatasolla:
--      org_publisher_sessions käyttää yhdistelmävierasavainta
--      (member_id, organization_id) -> organization_members(id, organization_id),
--      jolloin tietokantataso takaa, ettei istunto voi koskaan kuulua väärälle yhdistykselle.
--   D. Roolipohjainen kirjautuminen ja kuormitustarkastelu:
--      Henkilökohtainen valtuuskoodi sisältää 128 bittiä satunnaisuutta, joten
--      koodin arvaaminen on käytännössä erittäin epätodennäköistä. Tuntemattomat
--      koodit kirjataan turvallisuuslokiin ilman yksittäisen valtuuskoodin lukitsemista.
--      Kirjautumisen sarjallistus organisaatiolukolla tarkoittaa, että liiallinen
--      kuormitus suojataan sovelluskerroksen pyyntörajoituksilla. Tunnettujen
--      koodien väärinkäyttö lukitaan koodikohtaisesti.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. EHEYSRAPOITTEET POHJATAULUILLE (IDEMPOTENTTI & SISÄLLÖLLINEN)
-- =============================================================================

-- Varmistetaan board_items-taulun yhdistelmäavain (id, organization_id)
DO $$
DECLARE
    v_attnum_id  SMALLINT;
    v_attnum_org SMALLINT;
    v_conname    TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'board_items') THEN
        SELECT attnum INTO v_attnum_id FROM pg_attribute
        WHERE attrelid = 'public.board_items'::regclass AND attname = 'id';
        SELECT attnum INTO v_attnum_org FROM pg_attribute
        WHERE attrelid = 'public.board_items'::regclass AND attname = 'organization_id';

        IF v_attnum_id IS NOT NULL AND v_attnum_org IS NOT NULL THEN
            SELECT conname INTO v_conname
            FROM pg_constraint
            WHERE conrelid = 'public.board_items'::regclass
              AND contype IN ('u', 'p')
              AND conkey = ARRAY[v_attnum_id, v_attnum_org]::smallint[];

            IF v_conname IS NULL THEN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.board_items'::regclass AND conname = 'uq_board_items_id_org'
                ) THEN
                    ALTER TABLE public.board_items DROP CONSTRAINT uq_board_items_id_org;
                END IF;

                ALTER TABLE public.board_items
                    ADD CONSTRAINT uq_board_items_id_org UNIQUE (id, organization_id);
            END IF;
        END IF;
    END IF;
END $$;

-- =============================================================================
-- 1. TAULURAKENTEET, SKEEMAVALIDOINTI & EHEYSRAPOITTEET
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 organization_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
    id               UUID         DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name        TEXT         NOT NULL DEFAULT '',
    email            TEXT,
    phone            TEXT,
    member_number    TEXT,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS full_name     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS email         TEXT,
    ADD COLUMN IF NOT EXISTS phone         TEXT,
    ADD COLUMN IF NOT EXISTS member_number TEXT,
    ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.organization_members SET full_name = '' WHERE full_name IS NULL;
ALTER TABLE public.organization_members ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.organization_members ALTER COLUMN full_name SET DEFAULT '';

UPDATE public.organization_members SET is_active = TRUE WHERE is_active IS NULL;
ALTER TABLE public.organization_members ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.organization_members ALTER COLUMN is_active SET DEFAULT TRUE;

UPDATE public.organization_members SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.organization_members ALTER COLUMN created_at SET NOT NULL;

UPDATE public.organization_members SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.organization_members ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'organization_members sisältää rivejä, joilta puuttuu organization_id (NULL).';
    END IF;
    ALTER TABLE public.organization_members ALTER COLUMN organization_id SET NOT NULL;
END $$;

-- Varmistetaan organization_members.organization_id FK
DO $$
DECLARE
    v_attnum_org SMALLINT;
    v_ref_id     SMALLINT;
BEGIN
    SELECT attnum INTO v_attnum_org FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'organization_id';
    SELECT attnum INTO v_ref_id FROM pg_attribute
    WHERE attrelid = 'public.organizations'::regclass AND attname = 'id';

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.organization_members'::regclass
          AND confrelid = 'public.organizations'::regclass
          AND contype = 'f'
          AND conkey = ARRAY[v_attnum_org]::smallint[]
          AND confkey = ARRAY[v_ref_id]::smallint[]
          AND confdeltype = 'c'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.organization_members'::regclass AND conname = 'organization_members_organization_id_fkey'
        ) THEN
            ALTER TABLE public.organization_members DROP CONSTRAINT organization_members_organization_id_fkey;
        END IF;

        ALTER TABLE public.organization_members
            ADD CONSTRAINT organization_members_organization_id_fkey
                FOREIGN KEY (organization_id)
                REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Yhdistelmäavain (id, organization_id)
DO $$
DECLARE
    v_attnum_id  SMALLINT;
    v_attnum_org SMALLINT;
    v_conname    TEXT;
BEGIN
    SELECT attnum INTO v_attnum_id FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'id';
    SELECT attnum INTO v_attnum_org FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'organization_id';

    SELECT conname INTO v_conname
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[v_attnum_id, v_attnum_org]::smallint[];

    IF v_conname IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.organization_members'::regclass AND conname = 'uq_org_members_id_org'
        ) THEN
            ALTER TABLE public.organization_members DROP CONSTRAINT uq_org_members_id_org;
        END IF;

        ALTER TABLE public.organization_members
            ADD CONSTRAINT uq_org_members_id_org UNIQUE (id, organization_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_members_org_active
    ON public.organization_members(organization_id)
    WHERE is_active IS TRUE;

-- -----------------------------------------------------------------------------
-- 1.2 organization_role_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_role_assignments (
    id               UUID         DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT         NOT NULL,
    member_id        UUID         NOT NULL,
    role_type        TEXT         NOT NULL CHECK (role_type IN ('board_chair', 'board_member', 'secretary', 'coordinator', 'lead')),
    scope_item_id    UUID         NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    valid_from       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    valid_until      TIMESTAMPTZ  NULL,
    granted_by       TEXT         NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_role_assignments
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS member_id       UUID,
    ADD COLUMN IF NOT EXISTS role_type       TEXT,
    ADD COLUMN IF NOT EXISTS scope_item_id   UUID NULL,
    ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS valid_until     TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS granted_by      TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.organization_role_assignments WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'organization_role_assignments sisältää NULL organization_id -arvoja.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_role_assignments WHERE member_id IS NULL) THEN
        RAISE EXCEPTION 'organization_role_assignments sisältää NULL member_id -arvoja.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_role_assignments WHERE role_type IS NULL) THEN
        RAISE EXCEPTION 'organization_role_assignments sisältää NULL role_type -arvoja.';
    END IF;

    ALTER TABLE public.organization_role_assignments ALTER COLUMN organization_id SET NOT NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN member_id SET NOT NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN role_type SET NOT NULL;

    UPDATE public.organization_role_assignments SET is_active = TRUE WHERE is_active IS NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN is_active SET NOT NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN is_active SET DEFAULT TRUE;

    UPDATE public.organization_role_assignments SET valid_from = now() WHERE valid_from IS NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN valid_from SET NOT NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN valid_from SET DEFAULT now();

    UPDATE public.organization_role_assignments SET created_at = now() WHERE created_at IS NULL;
    ALTER TABLE public.organization_role_assignments ALTER COLUMN created_at SET NOT NULL;
END $$;

-- CHECK-rajoitteen sisällöllinen validointi
DO $$
DECLARE
    v_def TEXT;
    v_is_valid BOOLEAN := FALSE;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
    WHERE conrelid = 'public.organization_role_assignments'::regclass
      AND contype = 'c'
      AND conname = 'chk_org_role_type';

    IF v_def IS NOT NULL THEN
        IF v_def ~ 'board_chair' AND v_def ~ 'board_member' AND v_def ~ 'secretary'
           AND v_def ~ 'coordinator' AND v_def ~ 'lead' THEN
            v_is_valid := TRUE;
        ELSE
            ALTER TABLE public.organization_role_assignments DROP CONSTRAINT chk_org_role_type;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        IF EXISTS (
            SELECT 1 FROM public.organization_role_assignments
            WHERE role_type NOT IN ('board_chair', 'board_member', 'secretary', 'coordinator', 'lead')
        ) THEN
            RAISE EXCEPTION 'organization_role_assignments sisältää tuntemattomia role_type-arvoja.';
        END IF;

        ALTER TABLE public.organization_role_assignments
            ADD CONSTRAINT chk_org_role_type
            CHECK (role_type IN ('board_chair', 'board_member', 'secretary', 'coordinator', 'lead'));
    END IF;
END $$;

-- FK: fk_role_member_org
DO $$
DECLARE
    v_attnum_member SMALLINT;
    v_attnum_org    SMALLINT;
    v_ref_id        SMALLINT;
    v_ref_org       SMALLINT;
    v_con RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_attnum_member FROM pg_attribute
        WHERE attrelid = 'public.organization_role_assignments'::regclass AND attname = 'member_id';
    SELECT attnum INTO v_attnum_org FROM pg_attribute
        WHERE attrelid = 'public.organization_role_assignments'::regclass AND attname = 'organization_id';
    SELECT attnum INTO v_ref_id FROM pg_attribute
        WHERE attrelid = 'public.organization_members'::regclass AND attname = 'id';
    SELECT attnum INTO v_ref_org FROM pg_attribute
        WHERE attrelid = 'public.organization_members'::regclass AND attname = 'organization_id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.organization_role_assignments'::regclass
      AND conname = 'fk_role_member_org';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum_member, v_attnum_org]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_id, v_ref_org]::smallint[]
           AND v_con.confdeltype = 'c' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.organization_role_assignments DROP CONSTRAINT fk_role_member_org;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.organization_role_assignments
            ADD CONSTRAINT fk_role_member_org FOREIGN KEY (member_id, organization_id)
            REFERENCES public.organization_members(id, organization_id) ON DELETE CASCADE;
    END IF;
END $$;

-- FK: fk_role_scope_item_org
DO $$
DECLARE
    v_attnum_scope SMALLINT;
    v_attnum_org   SMALLINT;
    v_ref_id       SMALLINT;
    v_ref_org      SMALLINT;
    v_has_uq       BOOLEAN := FALSE;
    v_con          RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_ref_id FROM pg_attribute
        WHERE attrelid = 'public.board_items'::regclass AND attname = 'id';
    SELECT attnum INTO v_ref_org FROM pg_attribute
        WHERE attrelid = 'public.board_items'::regclass AND attname = 'organization_id';

    IF v_ref_id IS NULL OR v_ref_org IS NULL THEN
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.board_items'::regclass
          AND contype IN ('u', 'p')
          AND conkey = ARRAY[v_ref_id, v_ref_org]::smallint[]
    ) INTO v_has_uq;

    IF NOT v_has_uq THEN
        RAISE EXCEPTION 'board_items -taululta puuttuu vaadittu UNIQUE (id, organization_id) -rajoite.';
    END IF;

    SELECT attnum INTO v_attnum_scope FROM pg_attribute
        WHERE attrelid = 'public.organization_role_assignments'::regclass AND attname = 'scope_item_id';
    SELECT attnum INTO v_attnum_org FROM pg_attribute
        WHERE attrelid = 'public.organization_role_assignments'::regclass AND attname = 'organization_id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.organization_role_assignments'::regclass
      AND conname = 'fk_role_scope_item_org';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum_scope, v_attnum_org]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_id, v_ref_org]::smallint[]
           AND v_con.confdeltype = 'c' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.organization_role_assignments DROP CONSTRAINT fk_role_scope_item_org;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.organization_role_assignments
            ADD CONSTRAINT fk_role_scope_item_org FOREIGN KEY (scope_item_id, organization_id)
            REFERENCES public.board_items(id, organization_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Siivotaan mahdolliset useat aktiiviset puheenjohtajat ennen yksikäsitteisyysindeksiä
WITH ranked_chairs AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.organization_role_assignments
    WHERE role_type = 'board_chair' AND is_active IS TRUE
)
UPDATE public.organization_role_assignments
SET is_active = FALSE, valid_until = now()
WHERE id IN (SELECT id FROM ranked_chairs WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_one_active_board_chair
    ON public.organization_role_assignments (organization_id)
    WHERE role_type = 'board_chair' AND is_active IS TRUE;

CREATE INDEX IF NOT EXISTS idx_org_roles_member_active
    ON public.organization_role_assignments(member_id, organization_id)
    WHERE is_active IS TRUE;

CREATE INDEX IF NOT EXISTS idx_org_roles_scope
    ON public.organization_role_assignments(scope_item_id)
    WHERE scope_item_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 1.3 organization_role_credentials
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_role_credentials (
    id               UUID         DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT         NOT NULL,
    member_id        UUID         NOT NULL,
    code_hash        TEXT         NOT NULL UNIQUE,
    failed_attempts  INT          NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ  NULL,
    revoked_at       TIMESTAMPTZ  NULL,
    last_used_at     TIMESTAMPTZ  NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_role_credentials
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS member_id       UUID,
    ADD COLUMN IF NOT EXISTS code_hash       TEXT,
    ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS revoked_at      TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS last_used_at    TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
DECLARE
    v_dup_cnt INT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.organization_role_credentials WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'organization_role_credentials sisältää NULL organization_id -arvoja.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_role_credentials WHERE member_id IS NULL) THEN
        RAISE EXCEPTION 'organization_role_credentials sisältää NULL member_id -arvoja.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_role_credentials WHERE code_hash IS NULL) THEN
        RAISE EXCEPTION 'organization_role_credentials sisältää NULL code_hash -arvoja.';
    END IF;

    SELECT COUNT(*) INTO v_dup_cnt
    FROM (
        SELECT code_hash FROM public.organization_role_credentials
        GROUP BY code_hash HAVING COUNT(*) > 1
    ) dup;

    IF v_dup_cnt > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: organization_role_credentials sisältää % kpl päällekkäisiä code_hash-tiivisteitä.', v_dup_cnt;
    END IF;

    ALTER TABLE public.organization_role_credentials ALTER COLUMN organization_id SET NOT NULL;
    ALTER TABLE public.organization_role_credentials ALTER COLUMN member_id SET NOT NULL;
    ALTER TABLE public.organization_role_credentials ALTER COLUMN code_hash SET NOT NULL;

    UPDATE public.organization_role_credentials SET failed_attempts = 0 WHERE failed_attempts IS NULL;
    ALTER TABLE public.organization_role_credentials ALTER COLUMN failed_attempts SET NOT NULL;
    ALTER TABLE public.organization_role_credentials ALTER COLUMN failed_attempts SET DEFAULT 0;

    UPDATE public.organization_role_credentials SET created_at = now() WHERE created_at IS NULL;
    ALTER TABLE public.organization_role_credentials ALTER COLUMN created_at SET NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.organization_role_credentials'::regclass
          AND contype = 'u'
          AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.organization_role_credentials'::regclass AND attname = 'code_hash')]::smallint[]
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.organization_role_credentials'::regclass AND conname = 'uq_role_creds_code_hash'
        ) THEN
            ALTER TABLE public.organization_role_credentials DROP CONSTRAINT uq_role_creds_code_hash;
        END IF;

        ALTER TABLE public.organization_role_credentials
            ADD CONSTRAINT uq_role_creds_code_hash UNIQUE (code_hash);
    END IF;
END $$;

-- FK: fk_cred_member_org
DO $$
DECLARE
    v_attnum_member SMALLINT;
    v_attnum_org    SMALLINT;
    v_ref_id        SMALLINT;
    v_ref_org       SMALLINT;
    v_con           RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_attnum_member FROM pg_attribute
        WHERE attrelid = 'public.organization_role_credentials'::regclass AND attname = 'member_id';
    SELECT attnum INTO v_attnum_org FROM pg_attribute
        WHERE attrelid = 'public.organization_role_credentials'::regclass AND attname = 'organization_id';
    SELECT attnum INTO v_ref_id FROM pg_attribute
        WHERE attrelid = 'public.organization_members'::regclass AND attname = 'id';
    SELECT attnum INTO v_ref_org FROM pg_attribute
        WHERE attrelid = 'public.organization_members'::regclass AND attname = 'organization_id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.organization_role_credentials'::regclass
      AND conname = 'fk_cred_member_org';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum_member, v_attnum_org]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_id, v_ref_org]::smallint[]
           AND v_con.confdeltype = 'c' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.organization_role_credentials DROP CONSTRAINT fk_cred_member_org;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.organization_role_credentials
            ADD CONSTRAINT fk_cred_member_org FOREIGN KEY (member_id, organization_id)
            REFERENCES public.organization_members(id, organization_id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_role_creds_hash_active
    ON public.organization_role_credentials(code_hash)
    WHERE revoked_at IS NULL;

-- -----------------------------------------------------------------------------
-- 1.4 organization_login_attempts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_login_attempts (
    id               UUID         DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    attempted_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_success       BOOLEAN      NOT NULL DEFAULT FALSE,
    failure_reason   TEXT         NULL
);

ALTER TABLE public.organization_login_attempts
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS is_success      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS failure_reason  TEXT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.organization_login_attempts WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'organization_login_attempts sisältää NULL organization_id -arvoja.';
    END IF;

    ALTER TABLE public.organization_login_attempts ALTER COLUMN organization_id SET NOT NULL;

    UPDATE public.organization_login_attempts SET attempted_at = now() WHERE attempted_at IS NULL;
    ALTER TABLE public.organization_login_attempts ALTER COLUMN attempted_at SET NOT NULL;

    UPDATE public.organization_login_attempts SET is_success = FALSE WHERE is_success IS NULL;
    ALTER TABLE public.organization_login_attempts ALTER COLUMN is_success SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_login_attempts_org_recent
    ON public.organization_login_attempts (organization_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_org_reason
    ON public.organization_login_attempts (organization_id, failure_reason, attempted_at DESC)
    WHERE is_success IS FALSE;

-- -----------------------------------------------------------------------------
-- 1.5 organization_governance_audit & VAHINKOTYHJENNYKSEN ESTO
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_governance_audit (
    id               UUID         DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT         NOT NULL,
    actor_member_id  UUID         NULL,
    actor_name       TEXT         NOT NULL DEFAULT '',
    actor_role       TEXT         NOT NULL DEFAULT '',
    action           TEXT         NOT NULL DEFAULT '',
    target_type      TEXT         NOT NULL DEFAULT '',
    target_id        TEXT         NULL,
    details          JSONB        NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_governance_audit
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS actor_member_id UUID NULL,
    ADD COLUMN IF NOT EXISTS actor_name      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS actor_role      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS action          TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS target_type     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS target_id       TEXT NULL,
    ADD COLUMN IF NOT EXISTS details         JSONB NULL,
    ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.organization_governance_audit WHERE organization_id IS NULL) THEN
        RAISE EXCEPTION 'organization_governance_audit sisältää NULL organization_id -arvoja.';
    END IF;

    ALTER TABLE public.organization_governance_audit ALTER COLUMN organization_id SET NOT NULL;

    UPDATE public.organization_governance_audit SET actor_name = '' WHERE actor_name IS NULL;
    ALTER TABLE public.organization_governance_audit ALTER COLUMN actor_name SET NOT NULL;

    UPDATE public.organization_governance_audit SET actor_role = '' WHERE actor_role IS NULL;
    ALTER TABLE public.organization_governance_audit ALTER COLUMN actor_role SET NOT NULL;

    UPDATE public.organization_governance_audit SET action = '' WHERE action IS NULL;
    ALTER TABLE public.organization_governance_audit ALTER COLUMN action SET NOT NULL;

    UPDATE public.organization_governance_audit SET target_type = '' WHERE target_type IS NULL;
    ALTER TABLE public.organization_governance_audit ALTER COLUMN target_type SET NOT NULL;

    UPDATE public.organization_governance_audit SET created_at = now() WHERE created_at IS NULL;
    ALTER TABLE public.organization_governance_audit ALTER COLUMN created_at SET NOT NULL;
END $$;

-- FK: org_gov_audit_org_fk -> organizations(id) ON DELETE RESTRICT
DO $$
DECLARE
    v_org_attnum SMALLINT;
    v_ref_attnum SMALLINT;
    v_con        RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_org_attnum FROM pg_attribute
    WHERE attrelid = 'public.organization_governance_audit'::regclass AND attname = 'organization_id';
    SELECT attnum INTO v_ref_attnum FROM pg_attribute
    WHERE attrelid = 'public.organizations'::regclass AND attname = 'id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.organization_governance_audit'::regclass
      AND conname = 'org_gov_audit_org_fk';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_org_attnum]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_attnum]::smallint[]
           AND v_con.confdeltype = 'r' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.organization_governance_audit DROP CONSTRAINT org_gov_audit_org_fk;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.organization_governance_audit
            ADD CONSTRAINT org_gov_audit_org_fk
                FOREIGN KEY (organization_id)
                REFERENCES public.organizations(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- FK: org_gov_audit_member_fk -> organization_members(id) ON DELETE RESTRICT
-- Audit-loki on muuttumaton: jäsentä jolla on audit-kirjauksia ei voi poistaa suoraan DELETE-lauseella (käytetään is_active = FALSE)
DO $$
DECLARE
    v_attnum     SMALLINT;
    v_ref_attnum SMALLINT;
    v_con        RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_attnum FROM pg_attribute
    WHERE attrelid = 'public.organization_governance_audit'::regclass AND attname = 'actor_member_id';
    SELECT attnum INTO v_ref_attnum FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.organization_governance_audit'::regclass
      AND conname = 'org_gov_audit_member_fk';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_attnum]::smallint[]
           AND v_con.confdeltype = 'r' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.organization_governance_audit DROP CONSTRAINT org_gov_audit_member_fk;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.organization_governance_audit
            ADD CONSTRAINT org_gov_audit_member_fk
                FOREIGN KEY (actor_member_id)
                REFERENCES public.organization_members(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- SUOJAUS: Audit-lokin vahinkotyhjennyksen ja peukaloinnin esto
CREATE OR REPLACE FUNCTION public.prevent_governance_audit_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit-loki on muuttumaton (append-only): UPDATE-, DELETE- ja TRUNCATE-operaatiot ovat estettyjä.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_gov_audit_tampering_row ON public.organization_governance_audit;
CREATE TRIGGER trg_prevent_gov_audit_tampering_row
    BEFORE UPDATE OR DELETE ON public.organization_governance_audit
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_governance_audit_tampering();

DROP TRIGGER IF EXISTS trg_prevent_gov_audit_tampering_stmt ON public.organization_governance_audit;
CREATE TRIGGER trg_prevent_gov_audit_tampering_stmt
    BEFORE TRUNCATE ON public.organization_governance_audit
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.prevent_governance_audit_tampering();

CREATE INDEX IF NOT EXISTS idx_gov_audit_org_created
    ON public.organization_governance_audit(organization_id, created_at DESC);

-- =============================================================================
-- 1.6 OLETUSARVOJEN VARMISTUS MYÖS ENNESTÄÄN OLEMASSA OLLEILLE TAULUILLE
-- =============================================================================

ALTER TABLE public.organization_members
    ALTER COLUMN full_name SET DEFAULT '',
    ALTER COLUMN is_active SET DEFAULT TRUE,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.organization_role_assignments
    ALTER COLUMN is_active SET DEFAULT TRUE,
    ALTER COLUMN valid_from SET DEFAULT now(),
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.organization_role_credentials
    ALTER COLUMN failed_attempts SET DEFAULT 0,
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.organization_login_attempts
    ALTER COLUMN attempted_at SET DEFAULT now(),
    ALTER COLUMN is_success SET DEFAULT FALSE;

ALTER TABLE public.organization_governance_audit
    ALTER COLUMN actor_name SET DEFAULT '',
    ALTER COLUMN actor_role SET DEFAULT '',
    ALTER COLUMN action SET DEFAULT '',
    ALTER COLUMN target_type SET DEFAULT '',
    ALTER COLUMN created_at SET DEFAULT now();

-- =============================================================================
-- 2. YHTEENSOPIVA LAAJENNUS ORG_PUBLISHER_SESSIONS -TAULUUN (Korjaukset B & C)
-- =============================================================================

ALTER TABLE public.org_publisher_sessions
    ADD COLUMN IF NOT EXISTS member_id           UUID NULL,
    ADD COLUMN IF NOT EXISTS role_credential_id  UUID NULL,
    ADD COLUMN IF NOT EXISTS session_type        TEXT NOT NULL DEFAULT 'legacy_org_pin',
    ADD COLUMN IF NOT EXISTS last_used_at        TIMESTAMPTZ NULL;

UPDATE public.org_publisher_sessions
SET session_type = 'legacy_org_pin'
WHERE session_type IS NULL;

ALTER TABLE public.org_publisher_sessions
    ALTER COLUMN session_type SET DEFAULT 'legacy_org_pin',
    ALTER COLUMN session_type SET NOT NULL;

-- B. Varmistetaan session_type CHECK -rajoite sisällöllisesti
DO $$
DECLARE
    v_def TEXT;
    v_is_valid BOOLEAN := FALSE;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
    WHERE conrelid = 'public.org_publisher_sessions'::regclass
      AND contype = 'c'
      AND conname = 'chk_org_session_type';

    IF v_def IS NOT NULL THEN
        IF v_def ~ 'legacy_org_pin' AND v_def ~ 'personal_role_code' THEN
            v_is_valid := TRUE;
        ELSE
            ALTER TABLE public.org_publisher_sessions DROP CONSTRAINT chk_org_session_type;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        IF EXISTS (
            SELECT 1 FROM public.org_publisher_sessions
            WHERE session_type NOT IN ('legacy_org_pin', 'personal_role_code')
        ) THEN
            RAISE EXCEPTION 'org_publisher_sessions sisältää tuntemattomia session_type -arvoja.';
        END IF;

        ALTER TABLE public.org_publisher_sessions
            ADD CONSTRAINT chk_org_session_type CHECK (session_type IN ('legacy_org_pin', 'personal_role_code'));
    END IF;
END $$;

-- C. Yhdistelmävierasavain: (member_id, organization_id) -> organization_members(id, organization_id)
-- Sitoo istunnon ja jäsenen tietokantatasolla täysin samaan organisaatioon!
DO $$
DECLARE
    v_attnum_member SMALLINT;
    v_attnum_org    SMALLINT;
    v_ref_id        SMALLINT;
    v_ref_org       SMALLINT;
    v_con           RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_attnum_member FROM pg_attribute
    WHERE attrelid = 'public.org_publisher_sessions'::regclass AND attname = 'member_id';
    SELECT attnum INTO v_attnum_org FROM pg_attribute
    WHERE attrelid = 'public.org_publisher_sessions'::regclass AND attname = 'organization_id';
    SELECT attnum INTO v_ref_id FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'id';
    SELECT attnum INTO v_ref_org FROM pg_attribute
    WHERE attrelid = 'public.organization_members'::regclass AND attname = 'organization_id';

    -- Poistetaan mahdollinen vanha yhden sarakkeen fk_org_sessions_member
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.org_publisher_sessions'::regclass AND conname = 'fk_org_sessions_member'
    ) THEN
        ALTER TABLE public.org_publisher_sessions DROP CONSTRAINT fk_org_sessions_member;
    END IF;

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.org_publisher_sessions'::regclass
      AND conname = 'fk_org_sessions_member_org';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum_member, v_attnum_org]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_id, v_ref_org]::smallint[]
           AND v_con.confdeltype = 'c' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.org_publisher_sessions DROP CONSTRAINT fk_org_sessions_member_org;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.org_publisher_sessions
            ADD CONSTRAINT fk_org_sessions_member_org
                FOREIGN KEY (member_id, organization_id)
                REFERENCES public.organization_members(id, organization_id) ON DELETE CASCADE;
    END IF;
END $$;

-- B. Varmistetaan FK: org_publisher_sessions.role_credential_id -> organization_role_credentials(id) sisällöllisesti
DO $$
DECLARE
    v_attnum_cred   SMALLINT;
    v_ref_id        SMALLINT;
    v_con           RECORD;
    v_needs_recreate BOOLEAN := TRUE;
BEGIN
    SELECT attnum INTO v_attnum_cred FROM pg_attribute
    WHERE attrelid = 'public.org_publisher_sessions'::regclass AND attname = 'role_credential_id';
    SELECT attnum INTO v_ref_id FROM pg_attribute
    WHERE attrelid = 'public.organization_role_credentials'::regclass AND attname = 'id';

    SELECT conname, conkey, confkey, confdeltype INTO v_con
    FROM pg_constraint
    WHERE conrelid = 'public.org_publisher_sessions'::regclass
      AND conname = 'fk_org_sessions_credential';

    IF v_con.conname IS NOT NULL THEN
        IF v_con.conkey = ARRAY[v_attnum_cred]::smallint[]
           AND v_con.confkey = ARRAY[v_ref_id]::smallint[]
           AND v_con.confdeltype = 'n' THEN
            v_needs_recreate := FALSE;
        ELSE
            ALTER TABLE public.org_publisher_sessions DROP CONSTRAINT fk_org_sessions_credential;
        END IF;
    END IF;

    IF v_needs_recreate THEN
        ALTER TABLE public.org_publisher_sessions
            ADD CONSTRAINT fk_org_sessions_credential
                FOREIGN KEY (role_credential_id)
                REFERENCES public.organization_role_credentials(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_sessions_member
    ON public.org_publisher_sessions(member_id)
    WHERE member_id IS NOT NULL AND revoked_at IS NULL;

-- =============================================================================
-- 3. KÄYTTÖOIKEUDET & RLS
-- =============================================================================

REVOKE ALL ON public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_role_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_role_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_governance_audit FROM PUBLIC, anon, authenticated;

REVOKE TRUNCATE ON public.organization_governance_audit FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_role_assignments TO service_role;
GRANT ALL ON public.organization_role_credentials TO service_role;
GRANT ALL ON public.organization_login_attempts TO service_role;
GRANT ALL ON public.organization_governance_audit TO service_role;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_role_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_governance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to org members" ON public.organization_members;
CREATE POLICY "No direct access to org members" ON public.organization_members FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct access to role assignments" ON public.organization_role_assignments;
CREATE POLICY "No direct access to role assignments" ON public.organization_role_assignments FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct access to role credentials" ON public.organization_role_credentials;
CREATE POLICY "No direct access to role credentials" ON public.organization_role_credentials FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct access to login attempts" ON public.organization_login_attempts;
CREATE POLICY "No direct access to login attempts" ON public.organization_login_attempts FOR ALL USING (false);

DROP POLICY IF EXISTS "No direct access to governance audit" ON public.organization_governance_audit;
CREATE POLICY "No direct access to governance audit" ON public.organization_governance_audit FOR ALL USING (false);

-- =============================================================================
-- 4. ROOLIPOHJAINEN KIRJAUTUMINEN
-- =============================================================================
-- Henkilökohtainen valtuuskoodi sisältää 128 bittiä satunnaisuutta.
-- Tuntemattomat koodit kirjataan turvallisuuslokiin, eikä niiden perusteella
-- kasvateta minkään yksittäisen tunnetun valtuuskoodin virhelaskuria.
--
-- HUOMIO: kirjautuminen sarjallistetaan organisaatiokohtaisella transaktiolukolla.
-- Siksi myös tuntemattomien koodien suuret määrät voivat kuormittaa saman
-- organisaation kirjautumisia. Tuotantokäytössä kirjautumisrajapintaan tulee
-- asettaa pyyntömäärien rajoitus.
--
-- Tunnetun mutta virheellisesti käytetyn tai peruutetun koodin käsittely
-- tapahtuu koodikohtaisesti.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.begin_role_session(
    p_organization_id TEXT,
    p_role_code       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_code       TEXT;
    v_code_hash        TEXT;
    v_cred             RECORD;
    v_member           RECORD;
    v_session_uuid     UUID;
    v_token_hash       TEXT;
    v_session_id       UUID;
    v_org_name         TEXT;
    v_org_version      INT;
    v_active_roles     JSONB;
    v_generic_error    CONSTANT TEXT := 'Virheellinen valtuuskoodi tai organisaatio.';
    v_lock_namespace   CONSTANT INT := 1936028780; -- ASCII 'role' = 0x73656C6F
BEGIN
    -- 1. Syötevalidointi
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    IF p_role_code IS NULL OR pg_catalog.btrim(p_role_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valtuuskoodi vaaditaan.');
    END IF;

    -- 2. Koodin normalisointi
    v_clean_code := pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.btrim(p_role_code)),
        '[^A-Z0-9-]', '', 'g'
    );
    IF pg_catalog.length(v_clean_code) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    v_code_hash := pg_catalog.encode(extensions.digest(v_clean_code, 'sha256'), 'hex');

    -- 3. HIERARKIATASO 1: Organisaation transaktiolukko (Advisory lock)
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));

    -- 4. HIERARKIATASO 2: Organisaatiorivin lukitus
    SELECT name, COALESCE(publisher_code_version, 1) INTO v_org_name, v_org_version
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 5. Haetaan valtuuskoodi
    SELECT * INTO v_cred
    FROM public.organization_role_credentials
    WHERE organization_id = p_organization_id
      AND code_hash = v_code_hash
    FOR UPDATE;

    -- 6. TUNTEMATON KOODI (Korjaus D): Kirjataan lokiin, mutta ei lukita organisaatiota
    IF NOT FOUND THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'unknown_credential'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 7. KOODIKOHTAINEN LUKITUSTARKISTUS (5 virheestä lukittunut koodi)
    IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'credential_locked'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 8. PERUUTETTU KOODI
    IF v_cred.revoked_at IS NOT NULL THEN
        UPDATE public.organization_role_credentials
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
                WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
                ELSE NULL
            END
        WHERE id = v_cred.id;

        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'credential_revoked'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 9. HIERARKIATASO 3: Jäsenen aktiivisuus ja lukitus
    SELECT * INTO v_member
    FROM public.organization_members
    WHERE id = v_cred.member_id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.organization_role_credentials
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
                WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
                ELSE NULL
            END
        WHERE id = v_cred.id;

        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'member_inactive'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 10. HIERARKIATASO 4: Roolivoimassaolotarkistus ja lukitus
    SELECT jsonb_agg(jsonb_build_object('role', role_type, 'scope_item_id', scope_item_id)) INTO v_active_roles
    FROM public.organization_role_assignments
    WHERE member_id = v_member.id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
      AND valid_from <= now()
      AND (valid_until IS NULL OR valid_until > now());

    IF v_active_roles IS NULL OR jsonb_array_length(v_active_roles) = 0 THEN
        UPDATE public.organization_role_credentials
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE
                WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
                ELSE NULL
            END
        WHERE id = v_cred.id;

        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'no_active_roles'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 11. ONNISTUNUT TODENNUS
    UPDATE public.organization_role_credentials
    SET failed_attempts = 0,
        locked_until = NULL,
        last_used_at = now()
    WHERE id = v_cred.id;

    INSERT INTO public.organization_login_attempts (
        organization_id, attempted_at, is_success, failure_reason
    ) VALUES (
        p_organization_id, now(), true, NULL
    );

    -- 12. HIERARKIATASO 5: Henkilökohtainen istunto
    v_session_uuid := extensions.gen_random_uuid();
    v_token_hash   := pg_catalog.encode(extensions.digest(v_session_uuid::text, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type,
        member_id, role_credential_id, code_version, expires_at, last_used_at
    ) VALUES (
        p_organization_id, v_token_hash, 'personal_role_code',
        v_member.id, v_cred.id, v_org_version, now() + interval '8 hours', now()
    )
    RETURNING id INTO v_session_id;

    -- 13. Audit-kirjaus
    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_member.id, v_member.full_name, 'authenticated_member',
        'LOGIN', 'session', v_session_id::text,
        jsonb_build_object('active_roles', v_active_roles)
    );

    RETURN jsonb_build_object(
        'success',       true,
        'session_token', v_session_uuid,
        'session_id',    v_session_id,
        'org_id',        p_organization_id,
        'org_name',      v_org_name,
        'member_id',     v_member.id,
        'member_name',   v_member.full_name,
        'active_roles',  v_active_roles,
        'expires_at',    (now() + interval '8 hours')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_session(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_session(TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 4b. SIIVOUSFUNKTIO — Supabase Cron -ajastettava
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.organization_login_attempts
    WHERE attempted_at < now() - interval '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_login_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_login_attempts() TO service_role;

-- =============================================================================
-- 5. APUFUNKTIO: TOIMINTOKOHTAINEN ROOLIVALVOJA (Kaksoisvarmennus)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._verify_member_governance_permission(
    p_token_hash      TEXT,
    p_organization_id TEXT,
    p_action          TEXT,
    p_target_item_id  UUID DEFAULT NULL
)
RETURNS TABLE (
    out_member_id       UUID,
    out_member_name     TEXT,
    out_authorized_role TEXT,
    out_organization_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session        public.org_publisher_sessions;
    v_cred           public.organization_role_credentials;
    v_member         public.organization_members;
    v_role           public.organization_role_assignments;
    v_is_ok          BOOLEAN := FALSE;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    -- 1. HIERARKIATASO 1: Organisaation transaktiolukko (Advisory lock)
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));

    -- 2. HIERARKIATASO 2: Organisaatiorivin lukitus
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    -- Haetaan alustavasti istuntorivi jäsen- ja kooditunnisteiden selvittämiseksi
    SELECT * INTO v_session
    FROM public.org_publisher_sessions
    WHERE token_hash = p_token_hash
      AND organization_id = p_organization_id
      AND revoked_at IS NULL
      AND expires_at > now();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istunto ei ole voimassa tai organisaatiotunnus on virheellinen.';
    END IF;

    IF v_session.session_type IS DISTINCT FROM 'personal_role_code' OR v_session.member_id IS NULL THEN
        RAISE EXCEPTION 'Toiminto vaatii todennetun henkilökohtaisen roolin (organisaation yleinen julkaisukoodi ei riitä hallintoon).';
    END IF;

    IF v_session.role_credential_id IS NULL THEN
        RAISE EXCEPTION 'Henkilökohtaisella istunnolla on oltava valtuuskoodi (role_credential_id puuttuu).';
    END IF;

    -- 3. HIERARKIATASO 3: Jäsenen lukitus FOR UPDATE
    SELECT * INTO v_member
    FROM public.organization_members
    WHERE id = v_session.member_id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Henkilö ei ole enää aktiivinen tässä organisaatiossa.';
    END IF;

    -- 4. HIERARKIATASO 4: Roolin lukitus FOR UPDATE
    IF p_target_item_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.board_items
            WHERE id = p_target_item_id AND organization_id = p_organization_id
        ) THEN
            RAISE EXCEPTION 'Kohde ei kuulu tähän organisaatioon tai kohdetta ei löydy.';
        END IF;
    END IF;

    IF p_action = 'manage_tasks' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND (
              role_type IN ('board_chair', 'board_member', 'secretary')
              OR (role_type IN ('coordinator', 'lead')
                  AND scope_item_id IS NOT NULL
                  AND scope_item_id = p_target_item_id)
          )
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 WHEN 'board_member' THEN 2 ELSE 3 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'change_stage' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND (
              role_type IN ('board_chair', 'board_member', 'secretary')
              OR (role_type = 'coordinator'
                  AND scope_item_id IS NOT NULL
                  AND scope_item_id = p_target_item_id)
          )
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 ELSE 2 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'record_decision' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type IN ('board_chair', 'board_member', 'secretary')
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 ELSE 2 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'publish_wall' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type IN ('board_chair', 'board_member')
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 ELSE 2 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'manage_governance' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type = 'board_chair'
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;
    END IF;

    IF NOT v_is_ok THEN
        RAISE EXCEPTION 'Käyttöoikeus evätty toimintoon "%". Henkilöllä ei ole vaadittavaa voimassaolevaa toimivaltaa.', p_action;
    END IF;

    -- 5. HIERARKIATASO 5: Valtuuskoodin lukitus FOR UPDATE
    SELECT * INTO v_cred
    FROM public.organization_role_credentials
    WHERE id = v_session.role_credential_id
      AND organization_id = p_organization_id
      AND member_id = v_session.member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istunnon valtuuskoodi ei kuulu tähän organisaatioon tai jäseneen.';
    END IF;

    IF v_cred.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Käytetty henkilökohtainen valtuuskoodi on peruutettu.';
    END IF;

    -- 6. HIERARKIATASO 6: Istunnon lukitus FOR UPDATE ja KAKSOISVARMENNUS
    SELECT * INTO v_session
    FROM public.org_publisher_sessions
    WHERE id = v_session.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istuntoa ei enää löydy.';
    END IF;

    IF v_session.token_hash IS DISTINCT FROM p_token_hash
       OR v_session.organization_id IS DISTINCT FROM p_organization_id
       OR v_session.session_type IS DISTINCT FROM 'personal_role_code'
       OR v_session.member_id IS DISTINCT FROM v_member.id
       OR v_session.role_credential_id IS DISTINCT FROM v_cred.id
       OR v_session.revoked_at IS NOT NULL
       OR v_session.expires_at IS NULL
       OR v_session.expires_at <= now() THEN
        RAISE EXCEPTION 'Istunto ei ole enää voimassa tai sen sidokset ovat muuttuneet.';
    END IF;

    UPDATE public.org_publisher_sessions
    SET last_used_at = now()
    WHERE id = v_session.id;

    out_member_id       := v_member.id;
    out_member_name     := v_member.full_name;
    out_authorized_role := v_role.role_type;
    out_organization_id := p_organization_id;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_member_governance_permission(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 6. PROFILOINTISOVELLUKSEN HALLINTARAJAPINNAT
-- =============================================================================

-- 6.1 Uuden jäsenen lisäys
CREATE OR REPLACE FUNCTION public.create_organization_member(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_full_name       TEXT,
    p_email           TEXT DEFAULT NULL,
    p_phone           TEXT DEFAULT NULL,
    p_member_number   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_clean_name     TEXT;
    v_new_id         UUID;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_clean_name := pg_catalog.btrim(COALESCE(p_full_name, ''));
    IF pg_catalog.length(v_clean_name) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nimi on liian lyhyt.');
    END IF;

    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    INSERT INTO public.organization_members (
        organization_id, full_name, email, phone, member_number
    ) VALUES (
        p_organization_id,
        v_clean_name,
        NULLIF(pg_catalog.btrim(COALESCE(p_email, '')), ''),
        NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), ''),
        NULLIF(pg_catalog.btrim(COALESCE(p_member_number, '')), '')
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'MEMBER_CREATED', 'member', v_new_id::text, jsonb_build_object('name', v_clean_name)
    );

    RETURN jsonb_build_object('success', true, 'member_id', v_new_id);
END;
$$;

-- 6.2 Jäsenen hallittu passivointi
CREATE OR REPLACE FUNCTION public.deactivate_organization_member(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_member_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_member         RECORD;
    v_active_pj_cnt  INT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    -- Taso 3: Kohdejäsen
    SELECT * INTO v_member
    FROM public.organization_members
    WHERE id = p_member_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsentä ei löydy tästä organisaatiosta.');
    END IF;

    IF v_member.is_active IS FALSE THEN
        RETURN jsonb_build_object('success', true, 'message', 'Jäsen on jo passivoitu.');
    END IF;

    -- Taso 4: Puheenjohtajatarkistus täsmällisellä aikajaksolla
    SELECT COUNT(*) INTO v_active_pj_cnt
    FROM public.organization_role_assignments
    WHERE organization_id = p_organization_id
      AND role_type = 'board_chair'
      AND member_id = p_member_id
      AND is_active IS TRUE
      AND valid_from <= now()
      AND (valid_until IS NULL OR valid_until > now());

    IF v_active_pj_cnt > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Aktiivista puheenjohtajaa ei voi passivoida suoraan. Nimeä ensin uusi puheenjohtaja.'
        );
    END IF;

    -- Taso 4: Lukitaan kohderoolit
    PERFORM 1 FROM public.organization_role_assignments
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND is_active IS TRUE
    FOR UPDATE;

    -- Taso 5: Lukitaan valtuuskoodit
    PERFORM 1 FROM public.organization_role_credentials
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND revoked_at IS NULL
    FOR UPDATE;

    -- Taso 6: Lukitaan istunnot
    PERFORM 1 FROM public.org_publisher_sessions
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND revoked_at IS NULL
    FOR UPDATE;

    UPDATE public.organization_members
    SET is_active = FALSE, updated_at = now()
    WHERE id = p_member_id;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND is_active IS TRUE;

    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND revoked_at IS NULL;

    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE member_id = p_member_id AND organization_id = p_organization_id AND revoked_at IS NULL;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'MEMBER_DEACTIVATED', 'member', p_member_id::text,
        jsonb_build_object('member_name', v_member.full_name)
    );

    RETURN jsonb_build_object('success', true, 'deactivated_member_id', p_member_id);
END;
$$;

-- 6.3 Roolin myöntäminen
CREATE OR REPLACE FUNCTION public.assign_organization_role(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_member_id       UUID,
    p_role_type       TEXT,
    p_scope_item_id   UUID DEFAULT NULL,
    p_valid_until     TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_role_id        UUID;
    v_old_chair      RECORD;
    v_valid_roles    TEXT[] := ARRAY['board_chair', 'board_member', 'secretary', 'coordinator', 'lead'];
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    IF p_role_type IS NULL OR NOT (p_role_type = ANY(v_valid_roles)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen roolityyppi.');
    END IF;

    IF p_valid_until IS NOT NULL AND p_valid_until <= now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Roolin päättymisajan on oltava tulevaisuudessa.');
    END IF;

    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    -- Taso 3: Kohdejäsen
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE id = p_member_id AND organization_id = p_organization_id AND is_active IS TRUE
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsentä ei löydy tästä organisaatiosta tai jäsenyys ei ole aktiivinen.');
    END IF;

    IF p_scope_item_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.board_items
            WHERE id = p_scope_item_id AND organization_id = p_organization_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Tehtäväkohde ei kuulu tähän organisaatioon.');
        END IF;
    ELSIF p_role_type IN ('coordinator', 'lead') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Vastuuroolille (coordinator/lead) on annettava kohde (scope_item_id).');
    END IF;

    -- Taso 4: Puheenjohtajan vaihto ja vanhojen passivointi
    IF p_role_type = 'board_chair' THEN
        FOR v_old_chair IN
            SELECT * FROM public.organization_role_assignments
            WHERE organization_id = p_organization_id
              AND role_type = 'board_chair'
              AND is_active IS TRUE
            FOR UPDATE
        LOOP
            UPDATE public.organization_role_assignments
            SET is_active = FALSE, valid_until = now()
            WHERE id = v_old_chair.id;

            INSERT INTO public.organization_governance_audit (
                organization_id, actor_member_id, actor_name, actor_role,
                action, target_type, target_id, details
            ) VALUES (
                p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
                'ROLE_REVOKED', 'role', v_old_chair.id::text,
                jsonb_build_object(
                    'reason', 'replaced_by_new_board_chair',
                    'revoked_role', 'board_chair',
                    'member_id', v_old_chair.member_id
                )
            );
        END LOOP;
    END IF;

    INSERT INTO public.organization_role_assignments (
        organization_id, member_id, role_type, scope_item_id, valid_until, granted_by
    ) VALUES (
        p_organization_id, p_member_id, p_role_type, p_scope_item_id, p_valid_until, v_caller.out_member_name
    ) RETURNING id INTO v_role_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'ROLE_ASSIGNED', 'role', v_role_id::text,
        jsonb_build_object('role', p_role_type, 'member_id', p_member_id, 'scope', p_scope_item_id)
    );

    RETURN jsonb_build_object('success', true, 'role_assignment_id', v_role_id);
END;
$$;

-- 6.4 Valtuuskoodin generointi
CREATE OR REPLACE FUNCTION public.generate_role_credential(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_member_id       UUID,
    p_role_prefix     TEXT DEFAULT 'PJ'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_clean_pfx      TEXT;
    v_raw_code       TEXT;
    v_code_hash      TEXT;
    v_cred_id        UUID;
    v_random_hex     TEXT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    -- Taso 3: Kohdejäsen
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE id = p_member_id AND organization_id = p_organization_id AND is_active IS TRUE
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsentä ei löydy tai hän ei ole aktiivinen.');
    END IF;

    v_clean_pfx := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_role_prefix, 'PJ')));
    IF v_clean_pfx !~ '^[A-Z0-9]{2,8}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen etuliite. Sallitut merkit: A-Z ja 0-9, pituus 2-8 merkkiä.');
    END IF;

    -- Taso 5: Valtuuskoodit
    PERFORM 1 FROM public.organization_role_credentials
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND revoked_at IS NULL
    FOR UPDATE;

    -- Perutaan vanhat valtuuskoodit.
    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND revoked_at IS NULL;

    -- Perutaan myös kaikki kyseisen jäsenen vanhoihin valtuuskoodeihin
    -- sidotut istunnot. Tämä estää vanhojen istuntojen jäämisen tietokantaan
    -- näennäisesti aktiivisiksi koodin vaihdon jälkeen.
    UPDATE public.org_publisher_sessions AS s
    SET revoked_at = now()
    WHERE s.organization_id = p_organization_id
      AND s.member_id = p_member_id
      AND s.revoked_at IS NULL
      AND s.role_credential_id IN (
          SELECT c.id
          FROM public.organization_role_credentials AS c
          WHERE c.organization_id = p_organization_id
            AND c.member_id = p_member_id
            AND c.revoked_at IS NOT NULL
      );

    v_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    v_raw_code   := v_clean_pfx || '-' || v_random_hex;
    v_code_hash  := pg_catalog.encode(extensions.digest(v_raw_code, 'sha256'), 'hex');

    INSERT INTO public.organization_role_credentials (
        organization_id, member_id, code_hash
    ) VALUES (
        p_organization_id, p_member_id, v_code_hash
    ) RETURNING id INTO v_cred_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'CREDENTIAL_GENERATED', 'credential', v_cred_id::text, jsonb_build_object('member_id', p_member_id)
    );

    RETURN jsonb_build_object(
        'success',             true,
        'credential_id',       v_cred_id,
        'generated_role_code', v_raw_code
    );
END;
$$;

-- 6.5 Valtuuskoodin mitätöinti
CREATE OR REPLACE FUNCTION public.revoke_role_credential(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_credential_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_cred           RECORD;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    -- Taso 5: Kohdekoodi
    SELECT * INTO v_cred
    FROM public.organization_role_credentials
    WHERE id = p_credential_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'not_found', 'error', 'Valtuuskoodia ei löydy.');
    END IF;

    IF v_cred.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_revoked', 'message', 'Valtuuskoodi oli jo peruutettu.');
    END IF;

    -- Taso 6: Istunnot
    PERFORM 1 FROM public.org_publisher_sessions
    WHERE role_credential_id = p_credential_id
      AND revoked_at IS NULL
    FOR UPDATE;

    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE id = p_credential_id;

    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE role_credential_id = p_credential_id
      AND revoked_at IS NULL;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'CREDENTIAL_REVOKED', 'credential', p_credential_id::text, NULL
    );

    RETURN jsonb_build_object('success', true, 'status', 'revoked');
END;
$$;

-- 6.6 Roolin peruminen (Korjaus A: Viimeisen puheenjohtajan suoja)
CREATE OR REPLACE FUNCTION public.revoke_organization_role(
    p_session_token      TEXT,
    p_organization_id    TEXT,
    p_role_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_role           RECORD;
    v_remaining      INT;
    v_other_pj_cnt   INT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    -- Taso 1 & 2
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    -- Taso 4: Kohderooli
    SELECT * INTO v_role
    FROM public.organization_role_assignments
    WHERE id = p_role_assignment_id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Roolimääritystä ei löydy tai se on jo peruttu.');
    END IF;

    -- A. ESTETÄÄN AINOAN PUHEENJOHTAJAN PERUMINEN ILMAN SEURAAJAA (Korjaus A)
    IF v_role.role_type = 'board_chair' THEN
        SELECT COUNT(*) INTO v_other_pj_cnt
        FROM public.organization_role_assignments
        WHERE organization_id = p_organization_id
          AND role_type = 'board_chair'
          AND id <> p_role_assignment_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now());

        IF v_other_pj_cnt = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ainoaa voimassaolevaa puheenjohtajaroolia ei voi perua suoraan. Nimeä ensin uusi puheenjohtaja.'
            );
        END IF;
    END IF;

    -- Taso 3: Kohdejäsen
    PERFORM 1 FROM public.organization_members
    WHERE id = v_role.member_id AND organization_id = p_organization_id
    FOR UPDATE;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE id = p_role_assignment_id;

    SELECT COUNT(*) INTO v_remaining
    FROM public.organization_role_assignments
    WHERE member_id = v_role.member_id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
      AND valid_from <= now()
      AND (valid_until IS NULL OR valid_until > now());

    IF v_remaining = 0 THEN
        PERFORM 1 FROM public.organization_role_credentials
        WHERE member_id = v_role.member_id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL
        FOR UPDATE;

        PERFORM 1 FROM public.org_publisher_sessions
        WHERE member_id = v_role.member_id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL
        FOR UPDATE;

        UPDATE public.organization_role_credentials
        SET revoked_at = now()
        WHERE member_id = v_role.member_id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL;

        UPDATE public.org_publisher_sessions
        SET revoked_at = now()
        WHERE member_id = v_role.member_id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL;
    END IF;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'ROLE_REVOKED', 'role', p_role_assignment_id::text,
        jsonb_build_object('revoked_role', v_role.role_type, 'member_id', v_role.member_id)
    );

    RETURN jsonb_build_object('success', true, 'remaining_roles', v_remaining);
END;
$$;

-- =============================================================================
-- 7. KÄYTTÖOIKEUDET HALLINTARAJAPINNOILLE
-- =============================================================================

REVOKE ALL ON FUNCTION public.create_organization_member(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_organization_member(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_organization_role(TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_role_credential(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_role_credential(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_organization_role(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_organization_member(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_organization_member(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_organization_role(TEXT, TEXT, UUID, TEXT, UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_role_credential(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_role_credential(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_organization_role(TEXT, TEXT, UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 8. INTEGRAATIOHUOMIO: 071-FUNKTIOIDEN YHTEENSOPIVUUS & ARKKITEHTUURIRAJA
-- =============================================================================
-- Olemassa olevat 071-funktiot (signup_board_task, cancel_board_task_signup,
-- post_board_comment, publish_board_item_to_wall) käyttävät _verify_org_session_internal()
-- eli legacy_org_pin -istuntoa.
--
-- Tämä on tarkoituksellista siirtymävaiheen aikana:
--   - Vapaaehtoisten ilmoittautuminen ja peruutus säilyvät matalan kynnyksen toimintoina.
--   - Seinäjulkaiseminen ja peruskommentointi toimivat vanhan org-koodin kautta siirtymäajan.
--
-- Seuraava vaihe (073-migraatio):
--   - Viralliset hallintotoiminnot (päätöksen kirjaaminen, vaihesiirrot, hallinnolliset kommentit)
--     kytketään käyttämään _verify_member_governance_permission() -valvontaa.
--   - Varmistetaan, ettei rinnakkaisia RPC-funktioita jää ohittamaan henkilökohtaisia toimivaltoja.
-- =============================================================================

COMMIT;
