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

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'members', COALESCE(v_members, '[]'::JSONB)
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

COMMIT;
