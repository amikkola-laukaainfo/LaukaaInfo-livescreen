-- =============================================================================
-- 075_precheck_and_test.sql
-- LaukaaInfo – 075-migraation (create_board_item) hyväksyntätestit
-- =============================================================================
-- TILA: VALMIS AJETTAVAKSI (v1.0.0)
--
-- Testattavat asiat:
--   1. Ei istuntotunnistetta -> hylätään
--   2. Ei organisaatiotunnusta -> hylätään
--   3. Liian lyhyt otsikko (< 3 merkkiä) -> hylätään
--   4. Kielletty aloitustila ('done' / 'archived') -> hylätään
--   5. Puheenjohtaja (board_chair, PJ-) luo asian -> ONNISTUU, saa seq_num
--   6. Hallituksen jäsen (board_member, HJ-) luo asian -> ONNISTUU, seq_num kasvaa
--   7. Sihteeri (secretary, SI-) luo asian -> ONNISTUU, seq_num kasvaa
--   8. Koordinaattori (coordinator, KO-) yrittää luoda -> HYLÄTÄÄN
--   9. Legacy org PIN -istunto yrittää luoda -> HYLÄTÄÄN
--  10. Audit-kirjaukset: ITEM_CREATED löytyy jokaiselle luodulle asialle
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_create_board_item_tests()
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
    v_test_org        TEXT;
    v_chair_token     TEXT;
    v_chair_hash      TEXT;
    v_chair_id        UUID;
    v_chair_cred_id   UUID;
    v_chair_cred_raw  TEXT;

    v_member_token    TEXT;
    v_member_hash     TEXT;
    v_member_id       UUID;
    v_member_cred_id  UUID;
    v_member_cred_raw TEXT;

    v_sec_token       TEXT;
    v_sec_hash        TEXT;
    v_sec_id          UUID;
    v_sec_cred_id     UUID;
    v_sec_cred_raw    TEXT;

    v_coord_token     TEXT;
    v_coord_hash      TEXT;
    v_coord_id        UUID;
    v_coord_cred_id   UUID;
    v_coord_cred_raw  TEXT;

    v_legacy_token    TEXT;
    v_legacy_hash     TEXT;

    v_item_id_1       UUID;
    v_item_id_2       UUID;
    v_item_id_3       UUID;
    v_seq_1           INT;
    v_seq_2           INT;
    v_seq_3           INT;

    v_result          JSONB;
BEGIN
    -- ------------------------------------------------------------------
    -- Valmistelu: Haetaan testiorganisaatio
    -- ------------------------------------------------------------------
    SELECT id INTO v_test_org FROM public.organizations LIMIT 1;
    IF v_test_org IS NULL THEN
        RAISE EXCEPTION 'Testejä ei voi ajaa: organizations-taulussa ei ole yhtään organisaatiota.';
    END IF;

    -- 1. Luodaan Puheenjohtaja (PJ-)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi PJ 075', 'pj075@esim.fi')
    RETURNING id INTO v_chair_id;

    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
    VALUES (v_test_org, v_chair_id, 'board_chair');

    v_chair_cred_raw := 'PJ-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
    VALUES (v_test_org, v_chair_id, pg_catalog.encode(extensions.digest(v_chair_cred_raw, 'sha256'), 'hex'))
    RETURNING id INTO v_chair_cred_id;

    v_chair_token := extensions.gen_random_uuid()::TEXT;
    v_chair_hash  := pg_catalog.encode(extensions.digest(v_chair_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_chair_hash, 'personal_role_code', v_chair_id, v_chair_cred_id, now() + interval '1 hour'
    );

    -- 2. Luodaan Hallituksen jäsen (HJ-)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi HJ 075', 'hj075@esim.fi')
    RETURNING id INTO v_member_id;

    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
    VALUES (v_test_org, v_member_id, 'board_member');

    v_member_cred_raw := 'HJ-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
    VALUES (v_test_org, v_member_id, pg_catalog.encode(extensions.digest(v_member_cred_raw, 'sha256'), 'hex'))
    RETURNING id INTO v_member_cred_id;

    v_member_token := extensions.gen_random_uuid()::TEXT;
    v_member_hash  := pg_catalog.encode(extensions.digest(v_member_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_member_hash, 'personal_role_code', v_member_id, v_member_cred_id, now() + interval '1 hour'
    );

    -- 3. Luodaan Sihteeri (SI-)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi SI 075', 'si075@esim.fi')
    RETURNING id INTO v_sec_id;

    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
    VALUES (v_test_org, v_sec_id, 'secretary');

    v_sec_cred_raw := 'SI-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
    VALUES (v_test_org, v_sec_id, pg_catalog.encode(extensions.digest(v_sec_cred_raw, 'sha256'), 'hex'))
    RETURNING id INTO v_sec_cred_id;

    v_sec_token := extensions.gen_random_uuid()::TEXT;
    v_sec_hash  := pg_catalog.encode(extensions.digest(v_sec_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_sec_hash, 'personal_role_code', v_sec_id, v_sec_cred_id, now() + interval '1 hour'
    );

    -- 4. Luodaan Koordinaattori (KO-)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi KO 075', 'ko075@esim.fi')
    RETURNING id INTO v_coord_id;

    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
    VALUES (v_test_org, v_coord_id, 'coordinator');

    v_coord_cred_raw := 'KO-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
    VALUES (v_test_org, v_coord_id, pg_catalog.encode(extensions.digest(v_coord_cred_raw, 'sha256'), 'hex'))
    RETURNING id INTO v_coord_cred_id;

    v_coord_token := extensions.gen_random_uuid()::TEXT;
    v_coord_hash  := pg_catalog.encode(extensions.digest(v_coord_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_coord_hash, 'personal_role_code', v_coord_id, v_coord_cred_id, now() + interval '1 hour'
    );

    -- 5. Luodaan Legacy org_pin -istunto
    v_legacy_token := extensions.gen_random_uuid()::TEXT;
    v_legacy_hash  := pg_catalog.encode(extensions.digest(v_legacy_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_legacy_hash, 'legacy_org_pin', NULL, NULL, now() + interval '1 hour'
    );

    -- ==================================================================
    -- TESTI 1: Ei istuntotunnistetta (NULL)
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(NULL, v_test_org, 'Uusi aihe ilman istuntoa');
        IF (v_result ->> 'success')::BOOLEAN IS FALSE THEN
            test_id := 1; test_name := 'Ei istuntotunnistetta';
            status  := 'HYVÄKSYTTY';
            details := 'Hylättiin odotetusti: ' || (v_result ->> 'error');
        ELSE
            test_id := 1; test_name := 'Ei istuntotunnistetta';
            status  := 'HYLÄTTY';
            details := 'Pääsi läpi ilman istuntoa: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 1; test_name := 'Ei istuntotunnistetta';
        status  := 'HYVÄKSYTTY'; details := 'Poikkeus: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 2: Ei organisaatiotunnusta
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(v_chair_token, NULL, 'Uusi aihe ilman org_id');
        IF (v_result ->> 'success')::BOOLEAN IS FALSE THEN
            test_id := 2; test_name := 'Ei organisaatiotunnusta';
            status  := 'HYVÄKSYTTY';
            details := 'Hylättiin odotetusti: ' || (v_result ->> 'error');
        ELSE
            test_id := 2; test_name := 'Ei organisaatiotunnusta';
            status  := 'HYLÄTTY';
            details := 'Pääsi läpi ilman organisaatiotunnusta: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 2; test_name := 'Ei organisaatiotunnusta';
        status  := 'HYVÄKSYTTY'; details := 'Poikkeus: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 3: Liian lyhyt otsikko (< 3 merkkiä)
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(v_chair_token, v_test_org, 'AB');
        IF (v_result ->> 'success')::BOOLEAN IS FALSE THEN
            test_id := 3; test_name := 'Liian lyhyt otsikko';
            status  := 'HYVÄKSYTTY';
            details := 'Hylättiin odotetusti: ' || (v_result ->> 'error');
        ELSE
            test_id := 3; test_name := 'Liian lyhyt otsikko';
            status  := 'HYLÄTTY';
            details := 'Liian lyhyt otsikko hyväksyttiin: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 3; test_name := 'Liian lyhyt otsikko';
        status  := 'HYVÄKSYTTY'; details := 'Poikkeus: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 4: Kielletty aloitustila ('done' / 'archived')
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(v_chair_token, v_test_org, 'Valmis aihe heti', NULL, 'done');
        IF (v_result ->> 'success')::BOOLEAN IS FALSE THEN
            test_id := 4; test_name := 'Kielletty aloitustila';
            status  := 'HYVÄKSYTTY';
            details := 'Hylättiin odotetusti: ' || (v_result ->> 'error');
        ELSE
            test_id := 4; test_name := 'Kielletty aloitustila';
            status  := 'HYLÄTTY';
            details := 'done-tilainen uusi asia hyväksyttiin: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 4; test_name := 'Kielletty aloitustila';
        status  := 'HYVÄKSYTTY'; details := 'Poikkeus: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 5: Puheenjohtaja (board_chair, PJ-) luo asian -> ONNISTUU
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(
            v_chair_token, v_test_org, 'PJ:n luoma päätösasia', 'Kattava kuvaus aiheelle', 'idea', 'Vastuuhenkilö A'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE AND (v_result ->> 'item_id') IS NOT NULL THEN
            v_item_id_1 := (v_result ->> 'item_id')::UUID;
            v_seq_1     := (v_result ->> 'seq_num')::INT;
            test_id := 5; test_name := 'Puheenjohtajan luonti (PJ-)';
            status  := 'HYVÄKSYTTY';
            details := pg_catalog.format('Luonti onnistui, item_id: %s, seq_num: %s', v_item_id_1, v_seq_1);
        ELSE
            test_id := 5; test_name := 'Puheenjohtajan luonti (PJ-)';
            status  := 'HYLÄTTY';
            details := 'Luonti epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 5; test_name := 'Puheenjohtajan luonti (PJ-)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 6: Hallituksen jäsen (board_member, HJ-) luo asian -> ONNISTUU
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(
            v_member_token, v_test_org, 'Hallituksen jäsenen aloite', 'Aloitteen kuvaus', 'discussion'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE AND (v_result ->> 'item_id') IS NOT NULL THEN
            v_item_id_2 := (v_result ->> 'item_id')::UUID;
            v_seq_2     := (v_result ->> 'seq_num')::INT;
            IF v_seq_2 > v_seq_1 THEN
                test_id := 6; test_name := 'Hallituksen jäsenen luonti (HJ-)';
                status  := 'HYVÄKSYTTY';
                details := pg_catalog.format('Luonti onnistui, item_id: %s, seq_num kasvoi: %s -> %s', v_item_id_2, v_seq_1, v_seq_2);
            ELSE
                test_id := 6; test_name := 'Hallituksen jäsenen luonti (HJ-)';
                status  := 'HYLÄTTY';
                details := pg_catalog.format('seq_num ei kasvanut: %s vs %s', v_seq_1, v_seq_2);
            END IF;
        ELSE
            test_id := 6; test_name := 'Hallituksen jäsenen luonti (HJ-)';
            status  := 'HYLÄTTY';
            details := 'Luonti epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 6; test_name := 'Hallituksen jäsenen luonti (HJ-)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 7: Sihteeri (secretary, SI-) luo asian -> ONNISTUU
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(
            v_sec_token, v_test_org, 'Sihteerin valmistelema asia', 'Kuvaus valmistelusta', 'in_progress'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE AND (v_result ->> 'item_id') IS NOT NULL THEN
            v_item_id_3 := (v_result ->> 'item_id')::UUID;
            v_seq_3     := (v_result ->> 'seq_num')::INT;
            IF v_seq_3 > v_seq_2 THEN
                test_id := 7; test_name := 'Sihteerin luonti (SI-)';
                status  := 'HYVÄKSYTTY';
                details := pg_catalog.format('Luonti onnistui, item_id: %s, seq_num kasvoi: %s -> %s', v_item_id_3, v_seq_2, v_seq_3);
            ELSE
                test_id := 7; test_name := 'Sihteerin luonti (SI-)';
                status  := 'HYLÄTTY';
                details := pg_catalog.format('seq_num ei kasvanut: %s vs %s', v_seq_2, v_seq_3);
            END IF;
        ELSE
            test_id := 7; test_name := 'Sihteerin luonti (SI-)';
            status  := 'HYLÄTTY';
            details := 'Luonti epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 7; test_name := 'Sihteerin luonti (SI-)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 8: Koordinaattori (coordinator, KO-) yrittää luoda -> HYLÄTÄÄN
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(
            v_coord_token, v_test_org, 'Luvaton koordinaattorin luonti'
        );
        test_id := 8; test_name := 'Koordinaattorin luonti hylätään';
        status  := 'HYLÄTTY';
        details := 'Koordinaattori pääsi luomaan asian: ' || v_result::TEXT;
    EXCEPTION WHEN OTHERS THEN
        test_id := 8; test_name := 'Koordinaattorin luonti hylätään';
        status  := 'HYVÄKSYTTY';
        details := 'Koordinaattori hylättiin odotetusti: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 9: Legacy org PIN -istunto yrittää luoda -> HYLÄTÄÄN
    -- ==================================================================
    BEGIN
        v_result := public.create_board_item(
            v_legacy_token, v_test_org, 'Luvaton PIN-luonti'
        );
        test_id := 9; test_name := 'Legacy PIN -istunto hylätään';
        status  := 'HYLÄTTY';
        details := 'Legacy-istunto pääsi luomaan asian: ' || v_result::TEXT;
    EXCEPTION WHEN OTHERS THEN
        test_id := 9; test_name := 'Legacy PIN -istunto hylätään';
        status  := 'HYVÄKSYTTY';
        details := 'Legacy-istunto hylättiin odotetusti: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 10: Audit-kirjaukset: ITEM_CREATED löytyy jokaiselle luodulle asialle
    -- ==================================================================
    BEGIN
        IF EXISTS (
            SELECT 1 FROM public.organization_governance_audit
            WHERE organization_id = v_test_org AND action = 'ITEM_CREATED' AND target_id = v_item_id_1::TEXT
        )
        AND EXISTS (
            SELECT 1 FROM public.organization_governance_audit
            WHERE organization_id = v_test_org AND action = 'ITEM_CREATED' AND target_id = v_item_id_2::TEXT
        )
        AND EXISTS (
            SELECT 1 FROM public.organization_governance_audit
            WHERE organization_id = v_test_org AND action = 'ITEM_CREATED' AND target_id = v_item_id_3::TEXT
        ) THEN
            test_id := 10; test_name := 'Audit-kirjaukset (ITEM_CREATED)';
            status  := 'HYVÄKSYTTY';
            details := 'Kaikki 3 luotua asiaa löytyvät täsmällisesti organization_governance_audit -taulusta.';
        ELSE
            test_id := 10; test_name := 'Audit-kirjaukset (ITEM_CREATED)';
            status  := 'HYLÄTTY';
            details := 'Osa ITEM_CREATED audit-kirjauksista puuttuu lokista.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 10; test_name := 'Audit-kirjaukset (ITEM_CREATED)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- Siivous: Poistetaan testatut kohteet ja passivoidaan jäsenet / istunnot
    DELETE FROM public.board_items WHERE id IN (v_item_id_1, v_item_id_2, v_item_id_3);

    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE organization_id = v_test_org AND token_hash IN (v_chair_hash, v_member_hash, v_sec_hash, v_coord_hash, v_legacy_hash);

    UPDATE public.organization_role_credentials
    SET revoked_at = now()
    WHERE member_id IN (v_chair_id, v_member_id, v_sec_id, v_coord_id) AND revoked_at IS NULL;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE member_id IN (v_chair_id, v_member_id, v_sec_id, v_coord_id) AND is_active IS TRUE;

    UPDATE public.organization_members
    SET is_active = FALSE
    WHERE id IN (v_chair_id, v_member_id, v_sec_id, v_coord_id);

END;
$$;

SELECT * FROM public.run_create_board_item_tests()
ORDER BY test_id;
