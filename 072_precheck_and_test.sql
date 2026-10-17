-- =============================================================================
-- 072_precheck_and_test.sql
-- LaukaaInfo – Roolimallin ja migraation 072 (v0.9.2) tarkistus- ja hyväksyntätestit
-- =============================================================================
-- Tarkoitus: Aja nämä kyselyt Supabase SQL Editorissa ennen ja jälkeen 072-migraation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- OSA 1: ESITARKASTUKSET ENNEN 072-MIGRAATION AJOA
-- -----------------------------------------------------------------------------

-- 1. Tarkista pgcrypto-laajennuksen saatavuus
SELECT 
    extensions.digest('test', 'sha256') AS digest_test,
    extensions.gen_random_bytes(16) AS random_bytes_test;

-- 2. Tarkista organisaatioiden nykytila
SELECT id, name, wall_visibility, publisher_enabled, publisher_code_version
FROM public.organizations
ORDER BY id;

-- 3. Tarkista board_items-taulun yhdistelmäavain (id, organization_id)
SELECT c.conname, c.contype, 
       ARRAY(SELECT a.attname FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS columns
FROM pg_constraint c
WHERE c.conrelid = 'public.board_items'::regclass
  AND c.contype IN ('u', 'p');


-- -----------------------------------------------------------------------------
-- OSA 2: RAKENNETARKISTUKSET 072 v0.9.2 -MIGRAATION JÄLKEEN
-- -----------------------------------------------------------------------------

-- 4. Tarkista yhdistelmäavaimet (id, organization_id)
SELECT c.conname, c.conrelid::regclass AS table_name,
       ARRAY(SELECT a.attname FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS key_columns
FROM pg_constraint c
WHERE c.conname IN ('uq_board_items_id_org', 'uq_org_members_id_org', 'uq_role_creds_code_hash');

-- 5. Tarkista vierasavainten poistosäännöt ja yhdistelmäviitteet (c = CASCADE, r = RESTRICT, n = SET NULL)
SELECT 
    c.conname, 
    c.conrelid::regclass AS source_table, 
    c.confrelid::regclass AS target_table,
    c.confdeltype,
    ARRAY(SELECT a.attname FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS source_cols,
    ARRAY(SELECT a.attname FROM unnest(c.confkey) k JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k) AS target_cols
FROM pg_constraint c
WHERE c.conname IN (
    'fk_role_member_org',
    'fk_role_scope_item_org',
    'fk_cred_member_org',
    'org_gov_audit_org_fk',
    'org_gov_audit_member_fk',
    'fk_org_sessions_member_org',
    'fk_org_sessions_credential'
);

-- 6. Tarkista puheenjohtajan osittainen yksikäsitteisyysindeksi
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE indexname = 'uq_org_one_active_board_chair';

-- 7. Tarkista audit-lokin TRUNCATE-, UPDATE- ja DELETE-triggerit
SELECT tgname, relname, proname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname IN ('trg_prevent_gov_audit_tampering_row', 'trg_prevent_gov_audit_tampering_stmt');


-- -----------------------------------------------------------------------------
-- OSA 3: KOHDENNETTU HYVÄKSYMISTESTIPAKETTI (v0.9.2)
-- -----------------------------------------------------------------------------
-- Tulostaa selkeän tulostaulukon (Results) Supabase SQL Editoriin.
-- Jokainen testi suoritetaan omassa alitransaktiossaan, joka kumoaa testidatan
-- automaattisesti ilman että kantaan jää testidataa tai rikotaan audit-lokia.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_governance_acceptance_tests()
RETURNS TABLE (
    test_id   INT,
    test_name TEXT,
    status    TEXT,
    details   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- Test 1
    v_token      TEXT;
    v_token_hash TEXT;
    v_err_caught BOOLEAN;

    -- Test 3
    v_t3_org     TEXT := 'test_org_pj_guard';
    v_t3_member  UUID;
    v_t3_role    UUID;
    v_t3_cred    UUID;
    v_t3_res     JSONB;

    -- Test 4
    v_t4_org     TEXT := 'test_org_pj_switch';
    v_t4_chair1  UUID;
    v_t4_chair2  UUID;
    v_t4_role1   UUID;
    v_t4_cred1   UUID;
    v_t4_res     JSONB;
    v_t4_cnt     INT;
    v_t4_user    UUID;

    -- Test 5
    v_t5_org     TEXT := 'test_org_legacy_pin';
    v_t5_token   TEXT := 'legacy_pin_session_token_123';
    v_t5_hash    TEXT;
    v_t5_msg     TEXT;

    -- Test 6
    v_t6_org     TEXT := 'test_org_cred_rotation';
    v_t6_member  UUID;
    v_t6_role    UUID;
    v_t6_cred1   UUID;
    v_t6_old_tok TEXT := 'old_session_token_to_be_revoked';
    v_t6_old_hsh TEXT;
    v_t6_res     JSONB;
    v_t6_revoked BOOLEAN;
BEGIN
    -- -------------------------------------------------------------------------
    -- TESTI 1: Yhdistysten rajat (Cross-org suojaus)
    -- -------------------------------------------------------------------------
    BEGIN
        v_token := extensions.gen_random_uuid()::text;
        v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');
        v_err_caught := FALSE;
        BEGIN
            PERFORM * FROM public._verify_member_governance_permission(v_token_hash, 'olematon_org_b', 'manage_governance');
        EXCEPTION WHEN others THEN
            v_err_caught := TRUE;
        END;

        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'Ristikkäinen organisaatiotarkistus läpäisi virheellisesti!';
        END IF;

        RAISE EXCEPTION 'TEST_OK:Cross-org -raja pitää (tuntematon istunto hylätään).';
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 1; test_name := 'Cross-org suojaus'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 1; test_name := 'Cross-org suojaus'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    -- -------------------------------------------------------------------------
    -- TESTI 2: Audit-lokin TRUNCATE-esto
    -- -------------------------------------------------------------------------
    BEGIN
        v_err_caught := FALSE;
        BEGIN
            TRUNCATE TABLE public.organization_governance_audit;
        EXCEPTION WHEN others THEN
            v_err_caught := TRUE;
        END;

        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'Audit-taulun TRUNCATE onnistui vahingossa!';
        END IF;

        RAISE EXCEPTION 'TEST_OK:Audit-taulun TRUNCATE on asianmukaisesti estetty triggerillä.';
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 2; test_name := 'Audit-lokin TRUNCATE-esto'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 2; test_name := 'Audit-lokin TRUNCATE-esto'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    -- -------------------------------------------------------------------------
    -- TESTI 3: Viimeisen puheenjohtajan perumissuoja (Korjaus A)
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO public.organizations (id, name, wall_visibility, publisher_enabled)
        VALUES (v_t3_org, 'Testiyhdistys PJ Guard', 'members', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.organization_members (organization_id, full_name, is_active)
        VALUES (v_t3_org, 'Alkuperäinen Puheenjohtaja', true)
        RETURNING id INTO v_t3_member;

        INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type, is_active)
        VALUES (v_t3_org, v_t3_member, 'board_chair', true)
        RETURNING id INTO v_t3_role;

        INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
        VALUES (v_t3_org, v_t3_member, pg_catalog.encode(extensions.digest('t3_code', 'sha256'), 'hex'))
        RETURNING id INTO v_t3_cred;

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
        ) VALUES (
            v_t3_org, pg_catalog.encode(extensions.digest('t3_token', 'sha256'), 'hex'), 'personal_role_code', v_t3_member, v_t3_cred, now() + INTERVAL '1 hour'
        );

        v_t3_res := public.revoke_organization_role('t3_token', v_t3_org, v_t3_role);

        IF (v_t3_res->>'success')::boolean IS FALSE AND (v_t3_res->>'error') ~ 'Ainoaa voimassaolevaa puheenjohtajaroolia ei voi perua suoraan' THEN
            RAISE EXCEPTION 'TEST_OK:Ainoan puheenjohtajan peruminen estettiin onnistuneesti.';
        ELSE
            RAISE EXCEPTION 'Puheenjohtajan perumissuoja ei toiminut odotetusti! Tulos: %', v_t3_res;
        END IF;
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 3; test_name := 'Viimeisen pj:n perumissuoja'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 3; test_name := 'Viimeisen pj:n perumissuoja'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    -- -------------------------------------------------------------------------
    -- TESTI 4: Puheenjohtajan vaihdon toiminta (Succession)
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO public.organizations (id, name, wall_visibility, publisher_enabled)
        VALUES (v_t4_org, 'Testiyhdistys PJ Switch', 'members', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.organization_members (organization_id, full_name, is_active)
        VALUES (v_t4_org, 'Vanha Puheenjohtaja', true)
        RETURNING id INTO v_t4_chair1;

        INSERT INTO public.organization_members (organization_id, full_name, is_active)
        VALUES (v_t4_org, 'Uusi Puheenjohtaja', true)
        RETURNING id INTO v_t4_chair2;

        INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type, is_active)
        VALUES (v_t4_org, v_t4_chair1, 'board_chair', true)
        RETURNING id INTO v_t4_role1;

        INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
        VALUES (v_t4_org, v_t4_chair1, pg_catalog.encode(extensions.digest('t4_code', 'sha256'), 'hex'))
        RETURNING id INTO v_t4_cred1;

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
        ) VALUES (
            v_t4_org, pg_catalog.encode(extensions.digest('t4_token', 'sha256'), 'hex'), 'personal_role_code', v_t4_chair1, v_t4_cred1, now() + INTERVAL '1 hour'
        );

        v_t4_res := public.assign_organization_role('t4_token', v_t4_org, v_t4_chair2, 'board_chair');

        IF (v_t4_res->>'success')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'Uuden puheenjohtajan nimeäminen epäonnistui! Virhe: %', v_t4_res;
        END IF;

        SELECT COUNT(*), member_id INTO v_t4_cnt, v_t4_user
        FROM public.organization_role_assignments
        WHERE organization_id = v_t4_org
          AND role_type = 'board_chair'
          AND is_active IS TRUE
        GROUP BY member_id;

        IF v_t4_cnt = 1 AND v_t4_user = v_t4_chair2 THEN
            RAISE EXCEPTION 'TEST_OK:Uusi pj astui voimaan ja vanha pj passivoitui automaattisesti.';
        ELSE
            RAISE EXCEPTION 'Puheenjohtajan vaihdon tila virheellinen! Lkm: %, Jäsen: %', v_t4_cnt, v_t4_user;
        END IF;
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 4; test_name := 'Puheenjohtajan vaihto'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 4; test_name := 'Puheenjohtajan vaihto'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    -- -------------------------------------------------------------------------
    -- TESTI 5: Vanhan julkaisukoodin ja henkilökohtaisen roolikoodin erottelu
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO public.organizations (id, name, wall_visibility, publisher_enabled)
        VALUES (v_t5_org, 'Testiyhdistys Legacy Pin', 'members', true)
        ON CONFLICT (id) DO NOTHING;

        v_t5_hash := pg_catalog.encode(extensions.digest(v_t5_token, 'sha256'), 'hex');

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
        ) VALUES (
            v_t5_org, v_t5_hash, 'legacy_org_pin', NULL, NULL, now() + INTERVAL '1 hour'
        );

        v_err_caught := FALSE;
        BEGIN
            PERFORM * FROM public._verify_member_governance_permission(v_t5_hash, v_t5_org, 'manage_governance');
        EXCEPTION WHEN others THEN
            v_err_caught := TRUE;
            v_t5_msg := SQLERRM;
        END;

        IF v_err_caught AND v_t5_msg ~ 'organisaation yleinen julkaisukoodi ei riitä hallintoon' THEN
            RAISE EXCEPTION 'TEST_OK:Vanha julkaisukoodi (legacy_org_pin) hylättiin hallintotoimista.';
        ELSE
            RAISE EXCEPTION 'Vanhan julkaisukoodin esto ei lauennut odotetusti! Virhe: %', v_t5_msg;
        END IF;
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 5; test_name := 'Julkaisukoodin erottelu'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 5; test_name := 'Julkaisukoodin erottelu'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    -- -------------------------------------------------------------------------
    -- TESTI 6: Valtuuskoodin uusiminen ja vanhan istunnon mitätöinti
    -- -------------------------------------------------------------------------
    BEGIN
        INSERT INTO public.organizations (id, name, wall_visibility, publisher_enabled)
        VALUES (v_t6_org, 'Testiyhdistys Cred Rotation', 'members', true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.organization_members (organization_id, full_name, is_active)
        VALUES (v_t6_org, 'Puheenjohtaja Uusija', true)
        RETURNING id INTO v_t6_member;

        INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type, is_active)
        VALUES (v_t6_org, v_t6_member, 'board_chair', true)
        RETURNING id INTO v_t6_role;

        INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
        VALUES (v_t6_org, v_t6_member, pg_catalog.encode(extensions.digest('t6_code1', 'sha256'), 'hex'))
        RETURNING id INTO v_t6_cred1;

        v_t6_old_hsh := pg_catalog.encode(extensions.digest(v_t6_old_tok, 'sha256'), 'hex');

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
        ) VALUES (
            v_t6_org, v_t6_old_hsh, 'personal_role_code', v_t6_member, v_t6_cred1, now() + INTERVAL '1 hour'
        );

        v_t6_res := public.generate_role_credential(v_t6_old_tok, v_t6_org, v_t6_member, 'PJ');

        IF (v_t6_res->>'success')::boolean IS NOT TRUE THEN
            RAISE EXCEPTION 'Koodin uusinta epäonnistui! Virhe: %', v_t6_res;
        END IF;

        SELECT (revoked_at IS NOT NULL) INTO v_t6_revoked
        FROM public.org_publisher_sessions
        WHERE token_hash = v_t6_old_hsh;

        IF v_t6_revoked IS NOT TRUE THEN
            RAISE EXCEPTION 'Vanhaa istuntoa ei oltu merkitty peruutetuksi!';
        END IF;

        v_err_caught := FALSE;
        BEGIN
            PERFORM * FROM public._verify_member_governance_permission(v_t6_old_hsh, v_t6_org, 'manage_governance');
        EXCEPTION WHEN others THEN
            v_err_caught := TRUE;
        END;

        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'Vanha istunto pääsi läpi koodin uusimisen jälkeen!';
        ELSE
            RAISE EXCEPTION 'TEST_OK:Koodin uusiminen mitätöi vanhat istunnot välittömästi.';
        END IF;
    EXCEPTION WHEN others THEN
        IF SQLERRM ~ '^TEST_OK:' THEN
            test_id := 6; test_name := 'Valtuuskoodin uusiminen'; status := 'HYVÄKSYTTY'; details := substr(SQLERRM, 9);
        ELSE
            test_id := 6; test_name := 'Valtuuskoodin uusiminen'; status := 'EPÄONNISTUI'; details := SQLERRM;
        END IF;
        RETURN NEXT;
    END;

    RETURN;
END;
$$;

-- Suoritetaan testit ja näytetään tulokset suoraan Supabasen Results-taulukossa:
SELECT * FROM public.run_governance_acceptance_tests();

-- Siivotaan testifunktio ajon jälkeen:
DROP FUNCTION IF EXISTS public.run_governance_acceptance_tests();



