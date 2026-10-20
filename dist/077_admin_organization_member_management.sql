-- =============================================================================
-- 077_admin_organization_member_management.sql
-- LaukaaInfo – Järjestelmänvalvojan (admin) jäsenhallinta- ja erätuontirajapinnat
-- =============================================================================
-- TILA: VALMIS AJETTAVAKSI (v1.0.0)
--
-- Tavoite:
--   Mahdollistaa järjestelmänvalvojan (admin) jäsenrekisterin hallinta ilman
--   yhdistyskohtaisia puheenjohtajan valtuuskoodeja.
--
-- Sisältää kaksi SECURITY DEFINER -rajapintaa:
--   1. public.admin_get_organization_members(p_organization_id TEXT)
--      - Palauttaa valitun organisaation nykyiset jäsenet, aktiiviset roolit ja koodit.
--   2. public.admin_import_organization_members_batch(p_organization_id TEXT, p_inserts JSONB, p_updates JSONB)
--      - Lisää uudet jäsenet ja päivittää olemassa olevat jäsenet UUID-avaimella yhtenä atomisena eränä.
--      - Ei koskaan poista tai passivoi puuttuvia jäseniä.
--      - Kirjaa toimenpiteen organization_governance_audit -tauluun (actor_member_id = NULL, actor_role = 'admin').
--
-- Turvallisuusperiaatteet:
--   - Admin-oikeus tarkistetaan auth.uid() -> public.user_roles (role = 'admin').
--   - search_path on lukittu (SET search_path = '').
--   - Transaktiolukot (advisory lock + FOR UPDATE) estävät rinnakkaiset tuonnit.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. APUFUNKTIO: Admin-valtuutuksen tarkistus
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._verify_system_admin_internal()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Käyttöoikeus evätty: Istunto vaaditaan.';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = v_user_id
          AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Käyttöoikeus evätty: Toiminto vaatii järjestelmänvalvojan (admin) oikeudet.';
    END IF;

    RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_system_admin_internal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_system_admin_internal() TO authenticated, service_role;

COMMENT ON FUNCTION public._verify_system_admin_internal() IS
$$Tarkistaa että kutsujalla on aktiivinen Supabase auth -istunto ja public.user_roles -taulussa role = 'admin'.$$;

-- -----------------------------------------------------------------------------
-- 2. RAJAPINTA: admin_get_organization_members
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_organization_members(
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_members  JSONB;
    v_items    JSONB;
    v_audit    JSONB;
BEGIN
    -- 1. Tarkistetaan syöte
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    -- 2. Varmistetaan admin-oikeus
    v_admin_id := public._verify_system_admin_internal();

    -- 3. Varmistetaan että organisaatio on olemassa
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei löydy.');
    END IF;

    -- 4. Haetaan jäsenet, heidän aktiiviset roolinsa ja valtuuskoodien tila
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'organization_id', m.organization_id,
            'full_name', m.full_name,
            'email', m.email,
            'phone', m.phone,
            'member_number', m.member_number,
            'is_active', m.is_active,
            'created_at', m.created_at,
            'updated_at', m.updated_at,
            'roles', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', r.id,
                        'role_type', r.role_type,
                        'scope_item_id', r.scope_item_id,
                        'scope_item_title', (
                            SELECT bi.title FROM public.board_items bi WHERE bi.id = r.scope_item_id
                        ),
                        'is_active', r.is_active,
                        'valid_from', r.valid_from,
                        'valid_until', r.valid_until
                    )
                )
                FROM public.organization_role_assignments r
                WHERE r.member_id = m.id
                  AND r.organization_id = p_organization_id
                  AND r.is_active IS TRUE
                  AND r.valid_from <= now()
                  AND (r.valid_until IS NULL OR r.valid_until > now())
            ), '[]'::JSONB),
            'credential', (
                SELECT jsonb_build_object(
                    'id', c.id,
                    'is_active', (c.revoked_at IS NULL AND (c.locked_until IS NULL OR c.locked_until <= now())),
                    'is_locked', (c.locked_until IS NOT NULL AND c.locked_until > now()),
                    'is_revoked', (c.revoked_at IS NOT NULL),
                    'failed_attempts', c.failed_attempts,
                    'last_used_at', c.last_used_at,
                    'revoked_at', c.revoked_at
                )
                FROM public.organization_role_credentials c
                WHERE c.member_id = m.id
                  AND c.organization_id = p_organization_id
                  AND c.revoked_at IS NULL
                ORDER BY c.created_at DESC
                LIMIT 1
            )
        ) ORDER BY m.is_active DESC, m.full_name ASC
    ) INTO v_members
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id;

    -- 5. Haetaan kohteet joita voidaan käyttää scope_item_id -valinnassa (coordinator/lead)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', bi.id,
            'title', bi.title,
            'stage', bi.stage
        ) ORDER BY bi.created_at DESC
    ) INTO v_items
    FROM public.board_items bi
    WHERE bi.organization_id = p_organization_id
      AND (bi.stage IS NULL OR bi.stage NOT IN ('done', 'archived'));

    -- 6. Haetaan 20 tuoreinta audit-kirjausta
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', oga.id,
            'action', oga.action,
            'actor_name', oga.actor_name,
            'actor_role', oga.actor_role,
            'target_type', oga.target_type,
            'target_id', oga.target_id,
            'details', oga.details,
            'created_at', oga.created_at
        ) ORDER BY oga.created_at DESC
    ) INTO v_audit
    FROM (
        SELECT id, action, actor_name, actor_role, target_type, target_id, details, created_at
        FROM public.organization_governance_audit
        WHERE organization_id = p_organization_id
        ORDER BY created_at DESC
        LIMIT 20
    ) oga;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'members', COALESCE(v_members, '[]'::JSONB),
        'scope_items', COALESCE(v_items, '[]'::JSONB),
        'recent_audit', COALESCE(v_audit, '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_organization_members(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_organization_members(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_get_organization_members(TEXT) IS
$$Palauttaa valitun organisaation jäsenrekisterin järjestelmänvalvojalle. Vaatii user_roles admin -roolin.$$;

-- -----------------------------------------------------------------------------
-- 3. RAJAPINTA: admin_import_organization_members_batch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_import_organization_members_batch(
    p_organization_id TEXT,
    p_inserts         JSONB DEFAULT '[]'::JSONB,
    p_updates         JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_namespace   CONSTANT INT := 1936028780;
    v_batch_limit      CONSTANT INT := 500;

    v_admin_id         UUID;
    v_admin_email      TEXT;

    v_inserts_len      INT := 0;
    v_updates_len      INT := 0;
    v_total_len        INT := 0;

    v_idx              INT;
    v_elem             JSONB;

    -- Uusien jäsenten validointi
    v_full_name        TEXT;
    v_email            TEXT;
    v_phone            TEXT;
    v_member_number    TEXT;

    -- Päivitysten validointi
    v_update_id        UUID;
    v_existing_member  RECORD;
    v_updated_ids      UUID[] := ARRAY[]::UUID[];

    -- Suorituslaskurit
    v_inserted_count   INT := 0;
    v_updated_count    INT := 0;
    v_inserted_ids     UUID[] := ARRAY[]::UUID[];
BEGIN
    -- ------------------------------------------------------------------
    -- 0. ALUSTAVA SYÖTEVALIDOINTI
    -- ------------------------------------------------------------------
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    IF p_inserts IS NOT NULL AND jsonb_typeof(p_inserts) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_inserts on oltava JSON-taulukko.');
    END IF;

    IF p_updates IS NOT NULL AND jsonb_typeof(p_updates) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_updates on oltava JSON-taulukko.');
    END IF;

    IF p_inserts IS NOT NULL THEN
        v_inserts_len := jsonb_array_length(p_inserts);
    END IF;

    IF p_updates IS NOT NULL THEN
        v_updates_len := jsonb_array_length(p_updates);
    END IF;

    v_total_len := v_inserts_len + v_updates_len;

    IF v_total_len > v_batch_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Erä on liian suuri: %s riviä (enimmäismäärä %s).', v_total_len, v_batch_limit)
        );
    END IF;

    -- ------------------------------------------------------------------
    -- 1. VALTUUTUSTARKISTUS
    -- ------------------------------------------------------------------
    v_admin_id := public._verify_system_admin_internal();
    v_admin_email := COALESCE(auth.jwt() ->> 'email', 'admin:' || v_admin_id::TEXT);

    -- Tyhjä erä (ei lisättävää eikä päivitettävää)
    IF v_total_len = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'inserted_count', 0,
            'updated_count', 0,
            'message', 'Ei toimenpiteitä: molemmat syötetaulukot olivat tyhjiä.'
        );
    END IF;

    -- ------------------------------------------------------------------
    -- 2. TRANSAKTIOLUKITUS (Advisory lock + Organisaatiorivin lukitus)
    -- ------------------------------------------------------------------
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));

    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei löydy.');
    END IF;

    -- ------------------------------------------------------------------
    -- 3. VAIHE 1: SYÖTTEIDEN ENNAKKOVALIDOINTI (kaikki tai ei mitään)
    -- ------------------------------------------------------------------

    -- 3a. Tarkistetaan lisäysrivit
    IF v_inserts_len > 0 THEN
        FOR v_idx IN 0 .. v_inserts_len - 1 LOOP
            v_elem := p_inserts -> v_idx;

            IF jsonb_typeof(v_elem) <> 'object' THEN
                RAISE EXCEPTION 'Lisäysrivi %: alkion on oltava JSON-objekti.', v_idx + 1;
            END IF;

            v_full_name := pg_catalog.btrim(COALESCE(v_elem ->> 'full_name', ''));
            IF pg_catalog.length(v_full_name) < 2 THEN
                RAISE EXCEPTION 'Lisäysrivi %: koko nimi puuttuu tai on alle 2 merkkiä.', v_idx + 1;
            END IF;
            IF pg_catalog.length(v_full_name) > 200 THEN
                RAISE EXCEPTION 'Lisäysrivi %: koko nimi on yli 200 merkkiä.', v_idx + 1;
            END IF;

            v_email := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'email', '')), '');
            IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
                RAISE EXCEPTION 'Lisäysrivi %: virheellinen sähköpostiosoite "%".', v_idx + 1, v_email;
            END IF;

            v_phone := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'phone', '')), '');
            IF v_phone IS NOT NULL AND pg_catalog.length(v_phone) > 30 THEN
                RAISE EXCEPTION 'Lisäysrivi %: puhelinnumero ylittää 30 merkkiä.', v_idx + 1;
            END IF;

            v_member_number := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'member_number', '')), '');
            IF v_member_number IS NOT NULL AND pg_catalog.length(v_member_number) > 50 THEN
                RAISE EXCEPTION 'Lisäysrivi %: jäsennumero ylittää 50 merkkiä.', v_idx + 1;
            END IF;
        END LOOP;
    END IF;

    -- 3b. Tarkistetaan päivitysrivit
    IF v_updates_len > 0 THEN
        FOR v_idx IN 0 .. v_updates_len - 1 LOOP
            v_elem := p_updates -> v_idx;

            IF jsonb_typeof(v_elem) <> 'object' THEN
                RAISE EXCEPTION 'Päivitysrivi %: alkion on oltava JSON-objekti.', v_idx + 1;
            END IF;

            -- id on ehdottoman pakollinen UUID
            BEGIN
                v_update_id := (v_elem ->> 'id')::UUID;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Päivitysrivi %: jäsenen id puuttuu tai ei ole kelvollinen UUID.', v_idx + 1;
            END;

            -- Duplikaattitarkistus erän sisällä
            IF v_update_id = ANY(v_updated_ids) THEN
                RAISE EXCEPTION 'Päivitysrivi %: jäsen % esiintyy useasti samassa päivityserässä.', v_idx + 1, v_update_id;
            END IF;
            v_updated_ids := v_updated_ids || v_update_id;

            -- Varmistetaan että jäsen kuuluu tähän organisaatioon
            SELECT id, organization_id, full_name, email, phone, member_number
            INTO v_existing_member
            FROM public.organization_members
            WHERE id = v_update_id AND organization_id = p_organization_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Päivitysrivi %: jäsentä % ei löydy tai se ei kuulu organisaatioon %.',
                    v_idx + 1, v_update_id, p_organization_id;
            END IF;

            -- Nimen validointi jos annettu
            IF v_elem ? 'full_name' THEN
                v_full_name := pg_catalog.btrim(COALESCE(v_elem ->> 'full_name', ''));
                IF pg_catalog.length(v_full_name) < 2 THEN
                    RAISE EXCEPTION 'Päivitysrivi %: koko nimi on alle 2 merkkiä.', v_idx + 1;
                END IF;
                IF pg_catalog.length(v_full_name) > 200 THEN
                    RAISE EXCEPTION 'Päivitysrivi %: koko nimi on yli 200 merkkiä.', v_idx + 1;
                END IF;
            END IF;

            -- Sähköpostin validointi jos annettu
            IF v_elem ? 'email' THEN
                v_email := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'email', '')), '');
                IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
                    RAISE EXCEPTION 'Päivitysrivi %: virheellinen sähköpostiosoite "%".', v_idx + 1, v_email;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- ------------------------------------------------------------------
    -- 4. VAIHE 2: KIRJOITUKSET (Atominen suoritus)
    -- ------------------------------------------------------------------

    -- 4a. Lisäykset
    IF v_inserts_len > 0 THEN
        FOR v_idx IN 0 .. v_inserts_len - 1 LOOP
            v_elem := p_inserts -> v_idx;

            v_full_name     := pg_catalog.btrim(v_elem ->> 'full_name');
            v_email         := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'email', '')), '');
            v_phone         := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'phone', '')), '');
            v_member_number := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'member_number', '')), '');

            INSERT INTO public.organization_members (
                organization_id, full_name, email, phone, member_number, is_active, created_at, updated_at
            ) VALUES (
                p_organization_id, v_full_name, v_email, v_phone, v_member_number, TRUE, now(), now()
            ) RETURNING id INTO v_update_id;

            v_inserted_ids := v_inserted_ids || v_update_id;
            v_inserted_count := v_inserted_count + 1;
        END LOOP;
    END IF;

    -- 4b. Päivitykset (vain nimenomaisesti määritellyt kentät päivitetään)
    IF v_updates_len > 0 THEN
        FOR v_idx IN 0 .. v_updates_len - 1 LOOP
            v_elem := p_updates -> v_idx;
            v_update_id := (v_elem ->> 'id')::UUID;

            UPDATE public.organization_members
            SET full_name     = CASE WHEN v_elem ? 'full_name' THEN pg_catalog.btrim(v_elem ->> 'full_name') ELSE full_name END,
                email         = CASE WHEN v_elem ? 'email' THEN NULLIF(pg_catalog.btrim(v_elem ->> 'email'), '') ELSE email END,
                phone         = CASE WHEN v_elem ? 'phone' THEN NULLIF(pg_catalog.btrim(v_elem ->> 'phone'), '') ELSE phone END,
                member_number = CASE WHEN v_elem ? 'member_number' THEN NULLIF(pg_catalog.btrim(v_elem ->> 'member_number'), '') ELSE member_number END,
                updated_at    = now()
            WHERE id = v_update_id AND organization_id = p_organization_id;

            v_updated_count := v_updated_count + 1;
        END LOOP;
    END IF;

    -- ------------------------------------------------------------------
    -- 5. AUDITOINTI: Yksi keskitetty muuttumaton merkintä erästä
    -- ------------------------------------------------------------------
    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        p_organization_id,
        NULL,  -- Järjestelmänvalvojalla ei ole yhdistyskohtaista jäsen-UUID:tä
        v_admin_email,
        'admin',
        'ADMIN_BATCH_MEMBER_IMPORT',
        'organization',
        p_organization_id,
        jsonb_build_object(
            'inserted_count', v_inserted_count,
            'updated_count',  v_updated_count,
            'admin_user_id',  v_admin_id,
            'inserted_ids',   (SELECT jsonb_agg(iid) FROM unnest(v_inserted_ids) AS iid),
            'updated_ids',    (SELECT jsonb_agg(uid) FROM unnest(v_updated_ids) AS uid)
        ),
        now()
    );

    -- ------------------------------------------------------------------
    -- 6. PALAUTUS
    -- ------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',        true,
        'organization_id', p_organization_id,
        'inserted_count', v_inserted_count,
        'updated_count',  v_updated_count,
        'total_processed', v_inserted_count + v_updated_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_organization_members_batch(TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_organization_members_batch(TEXT, JSONB, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_import_organization_members_batch(TEXT, JSONB, JSONB) IS
$$Tuo ja päivittää organisaation jäseniä järjestelmänvalvojan oikeuksin. Vaatii user_roles admin -roolin.$$;

-- -----------------------------------------------------------------------------
-- 4. RAJAPINTA: admin_generate_role_credential
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_generate_role_credential(
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
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_clean_pfx      TEXT;
    v_raw_code       TEXT;
    v_code_hash      TEXT;
    v_cred_id        UUID;
    v_random_hex     TEXT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

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

    -- Perutaan vanhat valtuuskoodit
    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND revoked_at IS NULL;

    -- Perutaan vanhat istunnot
    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE organization_id = p_organization_id
      AND member_id = p_member_id
      AND revoked_at IS NULL;

    -- Luodaan 8-merkkinen heksakoodi (4 tavua heksana = 8 merkkiä, muoto: PREFIX-XXXX-XXXX, esim. PJ-8A7B-6C5D)
    v_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(4), 'hex'));
    v_raw_code   := v_clean_pfx || '-' || pg_catalog.substr(v_random_hex, 1, 4) || '-' || pg_catalog.substr(v_random_hex, 5, 4);
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
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'CREDENTIAL_GENERATED', 'credential', v_cred_id::text,
        jsonb_build_object('member_id', p_member_id, 'prefix', v_clean_pfx)
    );

    RETURN jsonb_build_object(
        'success',             true,
        'credential_id',       v_cred_id,
        'generated_role_code', v_raw_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_generate_role_credential(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generate_role_credential(TEXT, UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_generate_role_credential(TEXT, UUID, TEXT) IS
$$Luo jäsenelle uuden henkilökohtaisen valtuuskoodin järjestelmänvalvojan oikeuksin.$$;

-- -----------------------------------------------------------------------------
-- 5. RAJAPINTA: admin_revoke_role_credential
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_role_credential(
    p_organization_id TEXT,
    p_credential_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_cred           RECORD;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

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
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'CREDENTIAL_REVOKED', 'credential', p_credential_id::text, NULL
    );

    RETURN jsonb_build_object('success', true, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_role_credential(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role_credential(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_revoke_role_credential(TEXT, UUID) IS
$$Mitätöi jäsenen valtuuskoodin järjestelmänvalvojan oikeuksin.$$;

-- -----------------------------------------------------------------------------
-- 6. RAJAPINTA: admin_create_organization_member
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_organization_member(
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
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_clean_name     TEXT;
    v_new_id         UUID;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_clean_name := pg_catalog.btrim(COALESCE(p_full_name, ''));
    IF pg_catalog.length(v_clean_name) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nimi on liian lyhyt.');
    END IF;

    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    INSERT INTO public.organization_members (
        organization_id, full_name, email, phone, member_number, is_active
    ) VALUES (
        p_organization_id,
        v_clean_name,
        NULLIF(pg_catalog.btrim(p_email), ''),
        NULLIF(pg_catalog.btrim(p_phone), ''),
        NULLIF(pg_catalog.btrim(p_member_number), ''),
        TRUE
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'MEMBER_CREATED', 'member', v_new_id::text, jsonb_build_object('full_name', v_clean_name)
    );

    RETURN jsonb_build_object('success', true, 'member_id', v_new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_organization_member(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_organization_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. RAJAPINTA: admin_deactivate_organization_member
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_deactivate_organization_member(
    p_organization_id TEXT,
    p_member_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    UPDATE public.organization_members
    SET is_active = FALSE, updated_at = now()
    WHERE id = p_member_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsentä ei löydy.');
    END IF;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE
    WHERE member_id = p_member_id AND organization_id = p_organization_id;

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
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'MEMBER_DEACTIVATED', 'member', p_member_id::text, NULL
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_deactivate_organization_member(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_organization_member(TEXT, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. RAJAPINTA: admin_assign_organization_role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_organization_role(
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
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_new_role_id    UUID;
    v_lock_namespace CONSTANT INT := 1936028780;
    v_valid_roles    TEXT[] := ARRAY['board_chair', 'board_member', 'secretary', 'coordinator', 'lead'];
BEGIN
    IF p_role_type IS NULL OR NOT (p_role_type = ANY(v_valid_roles)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen roolityyppi.');
    END IF;

    IF p_valid_until IS NOT NULL AND p_valid_until <= now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Roolin päättymisajan on oltava tulevaisuudessa.');
    END IF;

    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE id = p_member_id AND organization_id = p_organization_id AND is_active IS TRUE
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Aktiivista jäsentä ei löydy.');
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

    IF p_role_type = 'board_chair' THEN
        UPDATE public.organization_role_assignments
        SET is_active = FALSE, valid_until = now()
        WHERE organization_id = p_organization_id AND role_type = 'board_chair' AND is_active IS TRUE;
    END IF;

    INSERT INTO public.organization_role_assignments (
        organization_id, member_id, role_type, scope_item_id, valid_until, granted_by
    ) VALUES (
        p_organization_id, p_member_id, p_role_type, p_scope_item_id, p_valid_until, COALESCE(v_admin_email, 'admin')
    ) RETURNING id INTO v_new_role_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'ROLE_ASSIGNED', 'role', v_new_role_id::text,
        jsonb_build_object('role', p_role_type, 'member_id', p_member_id, 'scope', p_scope_item_id)
    );

    RETURN jsonb_build_object('success', true, 'role_assignment_id', v_new_role_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_organization_role(TEXT, UUID, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_organization_role(TEXT, UUID, TEXT, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. RAJAPINTA: admin_revoke_organization_role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_organization_role(
    p_organization_id    TEXT,
    p_role_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE id = p_role_assignment_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Roolimääritystä ei löydy tai se on jo peruttu.');
    END IF;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'ROLE_REVOKED', 'role', p_role_assignment_id::text, NULL
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_organization_role(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_organization_role(TEXT, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. RAJAPINTA: generate_role_credential (puheenjohtajan generointi 8-heksakoodilla)
-- -----------------------------------------------------------------------------
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

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

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

    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = p_member_id
      AND organization_id = p_organization_id
      AND revoked_at IS NULL;

    UPDATE public.org_publisher_sessions AS s
    SET revoked_at = now()
    WHERE s.organization_id = p_organization_id
      AND s.member_id = p_member_id
      AND s.revoked_at IS NULL;

    -- 8-merkkinen selkeä heksakoodi (muoto: PREFIX-XXXX-XXXX, esim. PJ-8A7B-6C5D)
    v_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(4), 'hex'));
    v_raw_code   := v_clean_pfx || '-' || pg_catalog.substr(v_random_hex, 1, 4) || '-' || pg_catalog.substr(v_random_hex, 5, 4);
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
        'CREDENTIAL_GENERATED', 'credential', v_cred_id::text, jsonb_build_object('member_id', p_member_id, 'prefix', v_clean_pfx)
    );

    RETURN jsonb_build_object(
        'success',             true,
        'credential_id',       v_cred_id,
        'generated_role_code', v_raw_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_role_credential(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_role_credential(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. RAJAPINTA: begin_role_session (joustava väliviivojen ja muotoilujen tunnistus)
-- -----------------------------------------------------------------------------
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
    v_lock_namespace   CONSTANT INT := 1936028780;
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
    IF pg_catalog.length(v_clean_code) < 8 THEN
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    v_code_hash := pg_catalog.encode(extensions.digest(v_clean_code, 'sha256'), 'hex');

    -- 3. Transaktiolukot
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));

    SELECT name, COALESCE(publisher_code_version, 1) INTO v_org_name, v_org_version
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    -- 4. Haetaan valtuuskoodi (ensisijaisesti suoralla hashilla)
    SELECT * INTO v_cred
    FROM public.organization_role_credentials
    WHERE organization_id = p_organization_id
      AND code_hash = v_code_hash
    FOR UPDATE;

    -- Jos ei suoraa osumaa, kokeillaan vaihtoehtoisia väliviivamuotoja (esim. PREFIX-XXXX-XXXX vs PREFIX-XXXXXXXX)
    IF NOT FOUND THEN
        DECLARE
            v_no_dash TEXT := pg_catalog.replace(v_clean_code, '-', '');
            v_alt1    TEXT;
            v_alt2    TEXT;
        BEGIN
            IF pg_catalog.length(v_no_dash) >= 10 AND pg_catalog.length(v_no_dash) <= 12 THEN
                -- Muoto 1: PREFIX-XXXX-XXXX (esim. PJ-8A7B-6C5D)
                v_alt1 := pg_catalog.substr(v_no_dash, 1, pg_catalog.length(v_no_dash) - 8)
                          || '-' || pg_catalog.substr(v_no_dash, pg_catalog.length(v_no_dash) - 7, 4)
                          || '-' || pg_catalog.substr(v_no_dash, pg_catalog.length(v_no_dash) - 3, 4);

                SELECT * INTO v_cred
                FROM public.organization_role_credentials
                WHERE organization_id = p_organization_id
                  AND code_hash = pg_catalog.encode(extensions.digest(v_alt1, 'sha256'), 'hex')
                FOR UPDATE;

                -- Muoto 2: PREFIX-XXXXXXXX (esim. PJ-8A7B6C5D)
                IF NOT FOUND THEN
                    v_alt2 := pg_catalog.substr(v_no_dash, 1, pg_catalog.length(v_no_dash) - 8)
                              || '-' || pg_catalog.substr(v_no_dash, pg_catalog.length(v_no_dash) - 7, 8);

                    SELECT * INTO v_cred
                    FROM public.organization_role_credentials
                    WHERE organization_id = p_organization_id
                      AND code_hash = pg_catalog.encode(extensions.digest(v_alt2, 'sha256'), 'hex')
                    FOR UPDATE;
                END IF;
            END IF;
        END;
    END IF;

    IF NOT FOUND THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'unknown_credential'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    IF v_cred.locked_until IS NOT NULL AND v_cred.locked_until > now() THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'credential_locked'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    IF v_cred.revoked_at IS NOT NULL THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'revoked_credential'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    SELECT * INTO v_member
    FROM public.organization_members
    WHERE id = v_cred.member_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND OR v_member.is_active IS NOT TRUE THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'inactive_member'
        );
        RETURN jsonb_build_object('success', false, 'error', v_generic_error);
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'role_type', r.role_type,
            'scope_item_id', r.scope_item_id
        )
    ), '[]'::jsonb) INTO v_active_roles
    FROM public.organization_role_assignments r
    WHERE r.member_id = v_member.id
      AND r.organization_id = p_organization_id
      AND r.is_active IS TRUE
      AND r.valid_from <= now()
      AND (r.valid_until IS NULL OR r.valid_until > now());

    IF jsonb_array_length(v_active_roles) = 0 THEN
        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'no_active_roles'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Jäsenellä ei ole voimassaolevia rooleja.');
    END IF;

    UPDATE public.organization_role_credentials
    SET failed_attempts = 0,
        locked_until = NULL,
        last_used_at = now()
    WHERE id = v_cred.id;

    v_session_uuid := extensions.gen_random_uuid();
    v_token_hash   := pg_catalog.encode(extensions.digest(v_session_uuid::text, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id,
        session_type,
        token_hash,
        role_credential_id,
        member_id,
        expires_at
    ) VALUES (
        p_organization_id,
        'personal_role_code',
        v_token_hash,
        v_cred.id,
        v_member.id,
        now() + INTERVAL '24 hours'
    ) RETURNING id INTO v_session_id;

    INSERT INTO public.organization_login_attempts (
        organization_id, attempted_at, is_success, failure_reason
    ) VALUES (
        p_organization_id, now(), true, NULL
    );

    RETURN jsonb_build_object(
        'success',           true,
        'session_token',     v_session_uuid::text,
        'expires_at',        now() + INTERVAL '24 hours',
        'organization_id',   p_organization_id,
        'organization_name', v_org_name,
        'member_name',       v_member.full_name,
        'member_id',         v_member.id,
        'active_roles',      v_active_roles
    );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_session(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_session(TEXT, TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12. RAJAPINTA: admin_batch_generate_credentials (ylläpitäjän erägenerointi & vienti)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_batch_generate_credentials(
    p_organization_id TEXT,
    p_only_missing    BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id       UUID;
    v_admin_email    TEXT;
    v_lock_namespace CONSTANT INT := 1936028780;
    v_member         RECORD;
    v_prefix         TEXT;
    v_random_hex     TEXT;
    v_raw_code       TEXT;
    v_code_hash      TEXT;
    v_cred_id        UUID;
    v_results        JSONB := '[]'::JSONB;
    v_count          INT := 0;
BEGIN
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_admin_id := public._verify_system_admin_internal();
    SELECT email INTO v_admin_email FROM auth.users WHERE id = v_admin_id;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    FOR v_member IN
        SELECT m.id, m.full_name, m.email, m.phone, m.member_number,
               COALESCE((
                   SELECT r.role_type FROM public.organization_role_assignments r
                   WHERE r.member_id = m.id AND r.organization_id = p_organization_id AND r.is_active IS TRUE
                   ORDER BY CASE r.role_type
                       WHEN 'board_chair' THEN 1
                       WHEN 'secretary' THEN 2
                       WHEN 'board_member' THEN 3
                       WHEN 'coordinator' THEN 4
                       WHEN 'lead' THEN 5
                       ELSE 6 END
                   LIMIT 1
               ), 'member') AS highest_role,
               EXISTS (
                   SELECT 1 FROM public.organization_role_credentials c
                   WHERE c.member_id = m.id AND c.organization_id = p_organization_id
                     AND c.revoked_at IS NULL
                     AND (c.locked_until IS NULL OR c.locked_until <= now())
               ) AS has_active_cred
        FROM public.organization_members m
        WHERE m.organization_id = p_organization_id
          AND m.is_active IS TRUE
        ORDER BY m.full_name ASC
    LOOP
        IF p_only_missing AND v_member.has_active_cred THEN
            CONTINUE;
        END IF;

        v_prefix := CASE v_member.highest_role
            WHEN 'board_chair' THEN 'PJ'
            WHEN 'secretary' THEN 'SI'
            WHEN 'coordinator' THEN 'KO'
            WHEN 'lead' THEN 'VT'
            WHEN 'board_member' THEN 'HJ'
            ELSE 'HJ'
        END;

        UPDATE public.organization_role_credentials
        SET revoked_at = now()
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL;

        UPDATE public.org_publisher_sessions
        SET revoked_at = now()
        WHERE organization_id = p_organization_id
          AND member_id = v_member.id
          AND revoked_at IS NULL;

        v_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(4), 'hex'));
        v_raw_code   := v_prefix || '-' || pg_catalog.substr(v_random_hex, 1, 4) || '-' || pg_catalog.substr(v_random_hex, 5, 4);
        v_code_hash  := pg_catalog.encode(extensions.digest(v_raw_code, 'sha256'), 'hex');

        INSERT INTO public.organization_role_credentials (
            organization_id, member_id, code_hash
        ) VALUES (
            p_organization_id, v_member.id, v_code_hash
        ) RETURNING id INTO v_cred_id;

        v_results := v_results || jsonb_build_object(
            'member_id', v_member.id,
            'full_name', v_member.full_name,
            'email', v_member.email,
            'phone', v_member.phone,
            'member_number', v_member.member_number,
            'role_type', v_member.highest_role,
            'role_title', CASE v_member.highest_role
                WHEN 'board_chair' THEN 'Puheenjohtaja'
                WHEN 'secretary' THEN 'Sihteeri'
                WHEN 'board_member' THEN 'Hallituksen jäsen'
                WHEN 'coordinator' THEN 'Koordinaattori'
                WHEN 'lead' THEN 'Vetäjä'
                ELSE 'Jäsen'
            END,
            'role_code', v_raw_code
        );

        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, NULL, COALESCE(v_admin_email, 'Järjestelmänvalvoja'), 'admin',
        'BATCH_CREDENTIALS_GENERATED', 'organization', p_organization_id,
        jsonb_build_object('count', v_count, 'only_missing', p_only_missing)
    );

    RETURN jsonb_build_object(
        'success', true,
        'count', v_count,
        'items', v_results
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_batch_generate_credentials(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_batch_generate_credentials(TEXT, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_batch_generate_credentials(TEXT, BOOLEAN) IS
$$Generoi kerralla valtuuskoodit organisaation jäsenille ja palauttaa ne selväkielisinä vientiä varten.$$;

-- -----------------------------------------------------------------------------
-- 13. RAJAPINTA: batch_generate_credentials (puheenjohtajan erägenerointi & vienti)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batch_generate_credentials(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_only_missing    BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_lock_namespace CONSTANT INT := 1936028780;
    v_member         RECORD;
    v_prefix         TEXT;
    v_random_hex     TEXT;
    v_raw_code       TEXT;
    v_code_hash      TEXT;
    v_cred_id        UUID;
    v_results        JSONB := '[]'::JSONB;
    v_count          INT := 0;
BEGIN
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(v_token_hash, p_organization_id, 'manage_governance');

    FOR v_member IN
        SELECT m.id, m.full_name, m.email, m.phone, m.member_number,
               COALESCE((
                   SELECT r.role_type FROM public.organization_role_assignments r
                   WHERE r.member_id = m.id AND r.organization_id = p_organization_id AND r.is_active IS TRUE
                   ORDER BY CASE r.role_type
                       WHEN 'board_chair' THEN 1
                       WHEN 'secretary' THEN 2
                       WHEN 'board_member' THEN 3
                       WHEN 'coordinator' THEN 4
                       WHEN 'lead' THEN 5
                       ELSE 6 END
                   LIMIT 1
               ), 'member') AS highest_role,
               EXISTS (
                   SELECT 1 FROM public.organization_role_credentials c
                   WHERE c.member_id = m.id AND c.organization_id = p_organization_id
                     AND c.revoked_at IS NULL
                     AND (c.locked_until IS NULL OR c.locked_until <= now())
               ) AS has_active_cred
        FROM public.organization_members m
        WHERE m.organization_id = p_organization_id
          AND m.is_active IS TRUE
        ORDER BY m.full_name ASC
    LOOP
        IF p_only_missing AND v_member.has_active_cred THEN
            CONTINUE;
        END IF;

        v_prefix := CASE v_member.highest_role
            WHEN 'board_chair' THEN 'PJ'
            WHEN 'secretary' THEN 'SI'
            WHEN 'coordinator' THEN 'KO'
            WHEN 'lead' THEN 'VT'
            WHEN 'board_member' THEN 'HJ'
            ELSE 'HJ'
        END;

        UPDATE public.organization_role_credentials
        SET revoked_at = now()
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND revoked_at IS NULL;

        UPDATE public.org_publisher_sessions
        SET revoked_at = now()
        WHERE organization_id = p_organization_id
          AND member_id = v_member.id
          AND revoked_at IS NULL;

        v_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(4), 'hex'));
        v_raw_code   := v_prefix || '-' || pg_catalog.substr(v_random_hex, 1, 4) || '-' || pg_catalog.substr(v_random_hex, 5, 4);
        v_code_hash  := pg_catalog.encode(extensions.digest(v_raw_code, 'sha256'), 'hex');

        INSERT INTO public.organization_role_credentials (
            organization_id, member_id, code_hash
        ) VALUES (
            p_organization_id, v_member.id, v_code_hash
        ) RETURNING id INTO v_cred_id;

        v_results := v_results || jsonb_build_object(
            'member_id', v_member.id,
            'full_name', v_member.full_name,
            'email', v_member.email,
            'phone', v_member.phone,
            'member_number', v_member.member_number,
            'role_type', v_member.highest_role,
            'role_title', CASE v_member.highest_role
                WHEN 'board_chair' THEN 'Puheenjohtaja'
                WHEN 'secretary' THEN 'Sihteeri'
                WHEN 'board_member' THEN 'Hallituksen jäsen'
                WHEN 'coordinator' THEN 'Koordinaattori'
                WHEN 'lead' THEN 'Vetäjä'
                ELSE 'Jäsen'
            END,
            'role_code', v_raw_code
        );

        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'BATCH_CREDENTIALS_GENERATED', 'organization', p_organization_id,
        jsonb_build_object('count', v_count, 'only_missing', p_only_missing)
    );

    RETURN jsonb_build_object(
        'success', true,
        'count', v_count,
        'items', v_results
    );
END;
$$;

REVOKE ALL ON FUNCTION public.batch_generate_credentials(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_generate_credentials(TEXT, TEXT, BOOLEAN) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.batch_generate_credentials(TEXT, TEXT, BOOLEAN) IS
$$Generoi kerralla valtuuskoodit organisaation jäsenille puheenjohtajan toimesta ja palauttaa ne vientiä varten.$$;

-- -----------------------------------------------------------------------------
-- 14. RAJAPINTA: rotate_my_role_credential (jäsenen oman valtuuskoodin turvallinen vaihto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotate_my_role_credential(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_current_code    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash        TEXT;
    v_session           RECORD;
    v_member            RECORD;
    v_cred              RECORD;
    v_clean_code        TEXT;
    v_raw_input_hash    TEXT;
    v_clean_hash        TEXT;
    v_dash_hash_3part   TEXT;
    v_dash_hash_2part   TEXT;
    v_prefix            TEXT;
    v_suffix            TEXT;
    v_matches           BOOLEAN := FALSE;
    v_new_random_hex    TEXT;
    v_new_raw_code      TEXT;
    v_new_code_hash     TEXT;
    v_new_cred_id       UUID;
    v_highest_role      TEXT;
BEGIN
    -- 1. Perussyötteiden validointi
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istuntotunnus puuttuu.');
    END IF;
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus puuttuu.');
    END IF;
    IF p_current_code IS NULL OR pg_catalog.btrim(p_current_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nykyinen valtuuskoodi vaaditaan koodin vaihtamiseksi.');
    END IF;

    -- 2. Etsitään voimassaoleva istunto
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    SELECT s.* INTO v_session
    FROM public.org_publisher_sessions s
    WHERE s.token_hash = v_token_hash
      AND s.organization_id = p_organization_id
      AND s.expires_at > now()
      AND s.revoked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND OR v_session.member_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istunto ei ole voimassa. Kirjaudu sisään uudelleen.');
    END IF;

    -- 3. Haetaan jäsen ja varmistetaan aktiivisuus
    SELECT m.* INTO v_member
    FROM public.organization_members m
    WHERE m.id = v_session.member_id
      AND m.organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND OR v_member.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsen ei ole aktiivinen.');
    END IF;

    -- 4. Haetaan jäsenen nykyinen voimassaoleva valtuuskoodi
    SELECT c.* INTO v_cred
    FROM public.organization_role_credentials c
    WHERE c.member_id = v_member.id
      AND c.organization_id = p_organization_id
      AND c.revoked_at IS NULL
      AND (c.locked_until IS NULL OR c.locked_until <= now())
    ORDER BY c.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Jäsenellä ei ole aktiivista valtuuskoodia.');
    END IF;

    -- 5. Tarkistetaan annettu nykyinen koodi (joustava muotoilun tunnistus kuten begin_role_session)
    v_raw_input_hash := pg_catalog.encode(extensions.digest(p_current_code, 'sha256'), 'hex');
    v_clean_code := pg_catalog.upper(pg_catalog.btrim(p_current_code));
    v_clean_code := pg_catalog.regexp_replace(v_clean_code, '[^A-Z0-9]', '', 'g');
    v_clean_hash := pg_catalog.encode(extensions.digest(v_clean_code, 'sha256'), 'hex');

    IF v_cred.code_hash = v_raw_input_hash OR v_cred.code_hash = v_clean_hash THEN
        v_matches := TRUE;
    ELSE
        IF pg_catalog.length(v_clean_code) = 10 THEN
            v_prefix := pg_catalog.substr(v_clean_code, 1, 2);
            v_suffix := pg_catalog.substr(v_clean_code, 3, 8);
            v_dash_hash_3part := pg_catalog.encode(
                extensions.digest(v_prefix || '-' || pg_catalog.substr(v_suffix, 1, 4) || '-' || pg_catalog.substr(v_suffix, 5, 4), 'sha256'),
                'hex'
            );
            v_dash_hash_2part := pg_catalog.encode(
                extensions.digest(v_prefix || '-' || v_suffix, 'sha256'),
                'hex'
            );
            IF v_cred.code_hash = v_dash_hash_3part OR v_cred.code_hash = v_dash_hash_2part THEN
                v_matches := TRUE;
            END IF;
        END IF;
    END IF;

    IF NOT v_matches THEN
        -- Kasvatetaan epäonnistuneita yrityksiä
        UPDATE public.organization_role_credentials
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + INTERVAL '15 minutes' ELSE NULL END
        WHERE id = v_cred.id;

        INSERT INTO public.organization_login_attempts (
            organization_id, attempted_at, is_success, failure_reason
        ) VALUES (
            p_organization_id, now(), false, 'rotate_invalid_current_code'
        );

        RETURN jsonb_build_object('success', false, 'error', 'Nykyinen valtuuskoodi on virheellinen.');
    END IF;

    -- 6. Selvitetään jäsenen korkein rooli prefiksiä varten
    SELECT COALESCE((
        SELECT r.role_type FROM public.organization_role_assignments r
        WHERE r.member_id = v_member.id AND r.organization_id = p_organization_id AND r.is_active IS TRUE
        ORDER BY CASE r.role_type
            WHEN 'board_chair' THEN 1
            WHEN 'secretary' THEN 2
            WHEN 'board_member' THEN 3
            WHEN 'coordinator' THEN 4
            WHEN 'lead' THEN 5
            ELSE 6 END
        LIMIT 1
    ), 'member') INTO v_highest_role;

    v_prefix := CASE v_highest_role
        WHEN 'board_chair' THEN 'PJ'
        WHEN 'secretary' THEN 'SI'
        WHEN 'coordinator' THEN 'KO'
        WHEN 'lead' THEN 'VT'
        WHEN 'board_member' THEN 'HJ'
        ELSE 'HJ'
    END;

    -- 7. Mitätöidään vanha valtuuskoodi
    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = v_member.id
      AND organization_id = p_organization_id
      AND revoked_at IS NULL;

    -- 8. Generoidaan uusi 8-heksakoodi PREFIX-XXXX-XXXX
    v_new_random_hex := pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(4), 'hex'));
    v_new_raw_code   := v_prefix || '-' || pg_catalog.substr(v_new_random_hex, 1, 4) || '-' || pg_catalog.substr(v_new_random_hex, 5, 4);
    v_new_code_hash  := pg_catalog.encode(extensions.digest(v_new_raw_code, 'sha256'), 'hex');

    INSERT INTO public.organization_role_credentials (
        organization_id, member_id, code_hash
    ) VALUES (
        p_organization_id, v_member.id, v_new_code_hash
    ) RETURNING id INTO v_new_cred_id;

    -- 9. Päivitetään nykyinen istunto osoittamaan uuteen credentialiin
    UPDATE public.org_publisher_sessions
    SET role_credential_id = v_new_cred_id
    WHERE id = v_session.id;

    -- 10. Audit-loki
    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id, v_member.id, v_member.full_name, v_highest_role,
        'CREDENTIAL_SELF_ROTATED', 'organization_member', v_member.id::text,
        jsonb_build_object('prefix', v_prefix)
    );

    RETURN jsonb_build_object(
        'success',       true,
        'new_role_code', v_new_raw_code,
        'member_name',   v_member.full_name,
        'role_title',    CASE v_highest_role
            WHEN 'board_chair' THEN 'Puheenjohtaja'
            WHEN 'secretary' THEN 'Sihteeri'
            WHEN 'board_member' THEN 'Hallituksen jäsen'
            WHEN 'coordinator' THEN 'Koordinaattori'
            WHEN 'lead' THEN 'Vetäjä'
            ELSE 'Jäsen'
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_my_role_credential(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_my_role_credential(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.rotate_my_role_credential(TEXT, TEXT, TEXT) IS
$$Mahdollistaa jäsenen oman valtuuskoodin turvallisen vaihtamisen todentamalla nykyisen koodin.$$;

COMMIT;

