-- =============================================================================
-- 072_1_precheck_and_test.sql
-- LaukaaInfo – Erätuontimigraation esitarkistukset ja hyväksyntätestit
-- =============================================================================
-- Aja ENSIN 072-migraatio, sitten 072_1-migraatio,
-- ja vasta sen jälkeen tämä testiskripti.
--
-- Kaikki testit ajetaan yksittäisissä alitransaktioissa (SAVEPOINT / ROLLBACK TO)
-- jotta testidata ei jää kantaan, mutta funktio itsessään säilyy.
--
-- Palauttaa: SELECT * FROM run_batch_import_tests();
-- =============================================================================

-- =============================================================================
-- OSA 1: ESITARKISTUKSET — funktio olemassa ja oikeuksia on
-- =============================================================================

-- Tarkista, että funktio löytyy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
        WHERE n.nspname = 'public'
          AND pg_proc.proname = 'import_organization_members_batch'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUS EPÄONNISTUI: import_organization_members_batch-funktiota ei löydy. Aja ensin 072_1-migraatio.';
    END IF;
    RAISE NOTICE 'Esitarkistus OK: import_organization_members_batch löytyy.';
END $$;

-- Tarkista, että 072-migraation riippuvuudet ovat olemassa
DO $$
DECLARE
    v_missing TEXT := '';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_members')
        THEN v_missing := v_missing || ' organization_members'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_role_assignments')
        THEN v_missing := v_missing || ' organization_role_assignments'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_governance_audit')
        THEN v_missing := v_missing || ' organization_governance_audit'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = '_verify_member_governance_permission')
        THEN v_missing := v_missing || ' _verify_member_governance_permission'; END IF;

    IF v_missing <> '' THEN
        RAISE EXCEPTION 'ESITARKISTUS EPÄONNISTUI: Puuttuvat kohteet: %. Aja ensin 072-migraatio.', v_missing;
    END IF;
    RAISE NOTICE 'Esitarkistus OK: kaikki riippuvuudet löytyvät.';
END $$;

-- =============================================================================
-- OSA 2: TESTIFUNKTIO (palautetaan tauluna Supabase SQL-editorille)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_batch_import_tests()
RETURNS TABLE (
    test_id     INT,
    test_name   TEXT,
    status      TEXT,
    details     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_test_org       TEXT;
    v_chair_token    TEXT;
    v_chair_hash     TEXT;
    v_chair_id       UUID;
    v_chair_role_id  UUID;
    v_chair_cred_id  UUID;
    v_chair_cred_raw TEXT;

    v_result         JSONB;
    v_count_before   INT;
    v_count_after    INT;
    v_audit_count    INT;
    v_err_msg        TEXT;

    -- Testien 11 & 12 paikalliset muuttujat ulkoisessa DECLARE-lohkossa
    v_expired_token  TEXT;
    v_expired_hash   TEXT;
    v_legacy_token   TEXT;
    v_legacy_hash    TEXT;
BEGIN
    -- ------------------------------------------------------------------
    -- Testiympäristön valmistelu
    -- ------------------------------------------------------------------
    SELECT id INTO v_test_org FROM public.organizations LIMIT 1;
    IF v_test_org IS NULL THEN
        RAISE EXCEPTION 'Testejä ei voi ajaa: organizations-taulussa ei ole yhtään riviä.';
    END IF;

    BEGIN
        INSERT INTO public.organization_members (organization_id, full_name)
        VALUES (v_test_org, 'Testi PJ Erä')
        RETURNING id INTO v_chair_id;

        -- Passivoidaan mahdolliset aiemmista testiajosta jääneet aktiiviset board_chair-rivit
        -- ennen uuden lisäystä (uq_org_one_active_board_chair -rajoite)
        UPDATE public.organization_role_assignments
        SET is_active = FALSE, valid_until = now()
        WHERE organization_id = v_test_org
          AND role_type = 'board_chair'
          AND is_active IS TRUE;

        INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
        VALUES (v_test_org, v_chair_id, 'board_chair')
        RETURNING id INTO v_chair_role_id;

        v_chair_cred_raw := 'PJ-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
        INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
        VALUES (v_test_org, v_chair_id,
                pg_catalog.encode(extensions.digest(v_chair_cred_raw, 'sha256'), 'hex'))
        RETURNING id INTO v_chair_cred_id;

        v_chair_token := extensions.gen_random_uuid()::TEXT;
        v_chair_hash  := pg_catalog.encode(extensions.digest(v_chair_token, 'sha256'), 'hex');

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type,
            member_id, role_credential_id, expires_at
        ) VALUES (
            v_test_org, v_chair_hash, 'personal_role_code',
            v_chair_id, v_chair_cred_id, now() + interval '1 hour'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Testiympäristön valmistelu epäonnistui: %', SQLERRM;
    END;

    -- ==================================================================
    -- TESTI 1: Tyhjä erä (no-op) — käyttöoikeus tarkistetaan silti
    -- ==================================================================
    BEGIN
        v_result := public.import_organization_members_batch(
            v_chair_token, v_test_org, '[]'::JSONB
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND (v_result ->> 'imported_count')::INT = 0 THEN
            test_id := 1; test_name := 'Tyhjä erä (no-op)';
            status  := 'HYVÄKSYTTY';
            details := 'Tyhjä erä palautti success=true, imported_count=0.';
        ELSE
            test_id := 1; test_name := 'Tyhjä erä (no-op)';
            status  := 'HYLÄTTY';
            details := 'Odottamaton tulos: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 1; test_name := 'Tyhjä erä (no-op)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 2: Normaali erä — 3 jäsentä ilman rooleja
    -- ==================================================================
    BEGIN
        SELECT COUNT(*) INTO v_count_before FROM public.organization_members
        WHERE organization_id = v_test_org;

        v_result := public.import_organization_members_batch(
            v_chair_token, v_test_org,
            '[
                {"full_name": "Testi Jäsen Yksi"},
                {"full_name": "Testi Jäsen Kaksi", "email": "kaksi@esim.fi"},
                {"full_name": "Testi Jäsen Kolme", "member_number": "2024-099"}
            ]'::JSONB
        );

        SELECT COUNT(*) INTO v_count_after FROM public.organization_members
        WHERE organization_id = v_test_org;

        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND (v_result ->> 'imported_count')::INT = 3
           AND v_count_after = v_count_before + 3 THEN
            test_id := 2; test_name := 'Normaali erä (3 jäsentä, ei rooleja)';
            status  := 'HYVÄKSYTTY';
            details := format('Tuotiin 3 jäsentä. Ennen: %s, jälkeen: %s.', v_count_before, v_count_after);
        ELSE
            test_id := 2; test_name := 'Normaali erä (3 jäsentä, ei rooleja)';
            status  := 'HYLÄTTY';
            details := format('Tulos: %s (ennen: %s, jälkeen: %s)', v_result::TEXT, v_count_before, v_count_after);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 2; test_name := 'Normaali erä (3 jäsentä, ei rooleja)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 3: Audit-kirjaukset (BATCH_MEMBER_IMPORT + MEMBER_CREATED)
    -- ==================================================================
    BEGIN
        v_result := public.import_organization_members_batch(
            v_chair_token, v_test_org,
            '[{"full_name": "AuditTesti"}]'::JSONB
        );

        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND EXISTS (
               SELECT 1 FROM public.organization_governance_audit
               WHERE organization_id = v_test_org AND action = 'BATCH_MEMBER_IMPORT'
           )
           AND EXISTS (
               SELECT 1 FROM public.organization_governance_audit oga
               WHERE oga.organization_id = v_test_org
                 AND oga.action = 'MEMBER_CREATED'
                 AND oga.details ->> 'batch_import' = 'true'
           ) THEN
            test_id := 3; test_name := 'Audit-kirjaukset (BATCH_MEMBER_IMPORT + MEMBER_CREATED)';
            status  := 'HYVÄKSYTTY';
            details := 'BATCH_MEMBER_IMPORT ja MEMBER_CREATED löytyvät audit-lokista.';
        ELSE
            test_id := 3; test_name := 'Audit-kirjaukset (BATCH_MEMBER_IMPORT + MEMBER_CREATED)';
            status  := 'HYLÄTTY';
            details := 'Audit-kirjaukset puuttuvat. Tulos: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 3; test_name := 'Audit-kirjaukset (BATCH_MEMBER_IMPORT + MEMBER_CREATED)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 4: Atominen rollback — yksi virheriivi kumoaa koko erän
    -- ==================================================================
    BEGIN
        SELECT COUNT(*) INTO v_count_before FROM public.organization_members
        WHERE organization_id = v_test_org;

        BEGIN
            v_result := public.import_organization_members_batch(
                v_chair_token, v_test_org,
                '[{"full_name": "Kelvollinen Jäsen"}, {"full_name": "X"}]'::JSONB
            );
            -- Päästiin tänne → testi epäonnistui
            test_id := 4; test_name := 'Atominen rollback (virheellinen rivi)';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            v_err_msg := SQLERRM;
            SELECT COUNT(*) INTO v_count_after FROM public.organization_members
            WHERE organization_id = v_test_org;

            IF v_count_after = v_count_before THEN
                test_id := 4; test_name := 'Atominen rollback (virheellinen rivi)';
                status  := 'HYVÄKSYTTY';
                details := format('Rollback toimi (ennen: %s, jälkeen: %s). Virhe: %s',
                                  v_count_before, v_count_after, v_err_msg);
            ELSE
                test_id := 4; test_name := 'Atominen rollback (virheellinen rivi)';
                status  := 'HYLÄTTY';
                details := format('Osittainen tallennus! Ennen: %s, jälkeen: %s.',
                                  v_count_before, v_count_after);
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 4; test_name := 'Atominen rollback (virheellinen rivi)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 5: Virheellinen email-osoite hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                v_chair_token, v_test_org,
                '[{"full_name": "EmailTesti", "email": "ei-kelvollinen"}]'::JSONB
            );
            test_id := 5; test_name := 'Virheellinen email hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 5; test_name := 'Virheellinen email hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Virheellinen email hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 5; test_name := 'Virheellinen email hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 6: Kaksi board_chair-roolia samassa erässä hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                v_chair_token, v_test_org,
                '[{"full_name": "PJ Yksi", "role_type": "board_chair"},
                  {"full_name": "PJ Kaksi", "role_type": "board_chair"}]'::JSONB
            );
            test_id := 6; test_name := 'Kaksi board_chair samassa erässä hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 6; test_name := 'Kaksi board_chair samassa erässä hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Kaksoispuheenjohtaja hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 6; test_name := 'Kaksi board_chair samassa erässä hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 7: Puheenjohtajan vaihto erässä passivoi vanhan pj:n
    -- ==================================================================
    BEGIN
        SELECT COUNT(*) INTO v_count_before
        FROM public.organization_role_assignments
        WHERE organization_id = v_test_org
          AND role_type = 'board_chair'
          AND is_active IS TRUE;

        v_result := public.import_organization_members_batch(
            v_chair_token, v_test_org,
            '[{"full_name": "Uusi PJ Erätuonti", "role_type": "board_chair"},
              {"full_name": "Tavallinen Jäsen Erätuonti"}]'::JSONB
        );

        SELECT COUNT(*) INTO v_count_after
        FROM public.organization_role_assignments
        WHERE organization_id = v_test_org
          AND role_type = 'board_chair'
          AND is_active IS TRUE;

        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND v_count_after = 1 THEN
            test_id := 7; test_name := 'Puheenjohtajan vaihto erässä (vanhan pj passivointi)';
            status  := 'HYVÄKSYTTY';
            details := format('Vanhat pj:t passivoitu. Aktiivisia board_chair-rivejä jälkeen: %s.', v_count_after);
        ELSE
            test_id := 7; test_name := 'Puheenjohtajan vaihto erässä (vanhan pj passivointi)';
            status  := 'HYLÄTTY';
            details := format('Aktiivisia board_chair-rivejä: %s (odotettiin 1). Tulos: %s',
                              v_count_after, v_result::TEXT);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 7; test_name := 'Puheenjohtajan vaihto erässä (vanhan pj passivointi)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 8: coordinator ilman scope_item_id hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                v_chair_token, v_test_org,
                '[{"full_name": "KoordIlmanKohdetta", "role_type": "coordinator"}]'::JSONB
            );
            test_id := 8; test_name := 'coordinator ilman scope_item_id hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 8; test_name := 'coordinator ilman scope_item_id hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Koordinaattori ilman kohdetta hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 8; test_name := 'coordinator ilman scope_item_id hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 9: Virheellinen istunto hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                'vaara-istunto-token-XXXXXX', v_test_org,
                '[{"full_name": "Testi Jäsen"}]'::JSONB
            );
            test_id := 9; test_name := 'Virheellinen istunto hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 9; test_name := 'Virheellinen istunto hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Tuntematon istunto hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 9; test_name := 'Virheellinen istunto hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 10: Eräkoon raja (201 > 200 hylätään ennen lukkoja)
    -- ==================================================================
    BEGIN
        v_result := public.import_organization_members_batch(
            v_chair_token, v_test_org,
            (SELECT jsonb_agg(jsonb_build_object('full_name', 'Jäsen ' || g))
             FROM generate_series(1, 201) g)
        );

        IF (v_result ->> 'success')::BOOLEAN IS FALSE
           AND v_result ->> 'error' ILIKE '%liian suuri%' THEN
            test_id := 10; test_name := 'Eräkoon raja (201 > 200 hylätään ennen lukkoja)';
            status  := 'HYVÄKSYTTY';
            details := 'Liian suuri erä hylättiin: ' || (v_result ->> 'error');
        ELSE
            test_id := 10; test_name := 'Eräkoon raja (201 > 200 hylätään ennen lukkoja)';
            status  := 'HYLÄTTY';
            details := 'Odottamaton tulos: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 10; test_name := 'Eräkoon raja (201 > 200 hylätään ennen lukkoja)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 11: Vanhentunut istunto hylätään
    -- ==================================================================
    BEGIN
        v_expired_token := extensions.gen_random_uuid()::TEXT;
        v_expired_hash  := pg_catalog.encode(extensions.digest(v_expired_token, 'sha256'), 'hex');

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type,
            member_id, role_credential_id, expires_at
        ) VALUES (
            v_test_org, v_expired_hash, 'personal_role_code',
            v_chair_id, v_chair_cred_id,
            now() - interval '1 second'
        );

        BEGIN
            v_result := public.import_organization_members_batch(
                v_expired_token, v_test_org,
                '[{"full_name": "Testi Vanhentunut"}]'::JSONB
            );
            test_id := 11; test_name := 'Vanhentunut istunto hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 11; test_name := 'Vanhentunut istunto hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Vanhentunut istunto hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 11; test_name := 'Vanhentunut istunto hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 12: Legacy-julkaisukoodi (session_type=legacy_org_pin) hylätään
    -- ==================================================================
    BEGIN
        v_legacy_token := extensions.gen_random_uuid()::TEXT;
        v_legacy_hash  := pg_catalog.encode(extensions.digest(v_legacy_token, 'sha256'), 'hex');

        INSERT INTO public.org_publisher_sessions (
            organization_id, token_hash, session_type, expires_at
        ) VALUES (
            v_test_org, v_legacy_hash, 'legacy_org_pin', now() + interval '1 hour'
        );

        BEGIN
            v_result := public.import_organization_members_batch(
                v_legacy_token, v_test_org,
                '[{"full_name": "Testi Legacy"}]'::JSONB
            );
            test_id := 12; test_name := 'Legacy-julkaisukoodi hylätään hallintotoimesta';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 12; test_name := 'Legacy-julkaisukoodi hylätään hallintotoimesta';
            status  := 'HYVÄKSYTTY';
            details := 'Legacy-istunto hylättiin hallintotoimesta: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 12; test_name := 'Legacy-julkaisukoodi hylätään hallintotoimesta';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 13: Ei-objekti-alkio taulukossa hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                v_chair_token, v_test_org,
                '[{"full_name": "Kelvollinen"}, "pelkka-merkkijono"]'::JSONB
            );
            test_id := 13; test_name := 'Ei-objekti-alkio taulukossa hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 13; test_name := 'Ei-objekti-alkio taulukossa hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Ei-objekti-alkio hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 13; test_name := 'Ei-objekti-alkio taulukossa hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 14: Tyhjä erä ilman valtuutusta hylätään
    -- ==================================================================
    BEGIN
        BEGIN
            v_result := public.import_organization_members_batch(
                'tuntematon-istunto-xyz-TESTI14', v_test_org,
                '[]'::JSONB
            );
            test_id := 14; test_name := 'Tyhjä erä ilman valtuutusta hylätään';
            status  := 'HYLÄTTY';
            details := 'Odotettiin poikkeusta, mutta tulos: ' || v_result::TEXT;
        EXCEPTION WHEN OTHERS THEN
            test_id := 14; test_name := 'Tyhjä erä ilman valtuutusta hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Tyhjä erä tuntemattomalla istunnolla hylättiin: ' || SQLERRM;
        END;
    EXCEPTION WHEN OTHERS THEN
        test_id := 14; test_name := 'Tyhjä erä ilman valtuutusta hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ------------------------------------------------------------------
    -- Siivotaan testiympäristö
    -- Ei voi DELETE:llä — audit-loki ON DELETE RESTRICT. Passivoidaan.
    -- ------------------------------------------------------------------
    UPDATE public.organization_members
    SET is_active = FALSE
    WHERE id = v_chair_id AND organization_id = v_test_org;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE member_id = v_chair_id AND organization_id = v_test_org AND is_active IS TRUE;

    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id = v_chair_id AND organization_id = v_test_org AND revoked_at IS NULL;

    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE member_id = v_chair_id AND organization_id = v_test_org AND revoked_at IS NULL;

END;
$$;

-- =============================================================================
-- OSA 3: AJA TESTIT
-- =============================================================================

SELECT * FROM public.run_batch_import_tests()
ORDER BY test_id;
