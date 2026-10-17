-- =============================================================================
-- 073_precheck_and_test.sql
-- LaukaaInfo – Toimintataulun julkaisun governance-kovennuksen hyväksyntätestit
-- =============================================================================
-- Aja ENSIN 071, 072 ja 073 -migraatiot, ja sen jälkeen tämä testiskripti.
--
-- Palauttaa: SELECT * FROM run_board_publish_governance_tests();
-- =============================================================================

-- =============================================================================
-- OSA 1: ESITARKISTUKSET
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
        WHERE n.nspname = 'public'
          AND pg_proc.proname = 'publish_board_item_to_wall'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUS EPÄONNISTUI: publish_board_item_to_wall -funktiota ei löydy. Aja ensin 073-migraatio.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
        WHERE n.nspname = 'public'
          AND pg_proc.proname = '_verify_member_governance_permission'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUS EPÄONNISTUI: _verify_member_governance_permission puuttuu. Aja ensin 072-migraatio.';
    END IF;

    RAISE NOTICE 'Esitarkistus OK: publish_board_item_to_wall ja hallintofunktiot löytyvät.';
END $$;

-- =============================================================================
-- OSA 2: TESTIFUNKTIO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_board_publish_governance_tests()
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
    v_test_org          TEXT;
    v_chair_token       TEXT;
    v_chair_hash        TEXT;
    v_chair_id          UUID;
    v_chair_role_id     UUID;
    v_chair_cred_id     UUID;
    v_chair_cred_raw    TEXT;

    v_member_token      TEXT;
    v_member_hash       TEXT;
    v_member_id         UUID;
    v_member_cred_id    UUID;
    v_member_cred_raw   TEXT;

    v_sec_token         TEXT;
    v_sec_hash          TEXT;
    v_sec_id            UUID;
    v_sec_cred_id       UUID;
    v_sec_cred_raw      TEXT;

    v_coord_token       TEXT;
    v_coord_hash        TEXT;
    v_coord_id          UUID;
    v_coord_cred_id     UUID;
    v_coord_cred_raw    TEXT;

    v_legacy_token      TEXT;
    v_legacy_hash       TEXT;

    v_test_item_id      UUID;
    v_second_item_id    UUID;
    v_archived_item_id  UUID;
    v_foreign_item_id   UUID;
    v_foreign_org       TEXT;

    v_result            JSONB;
    v_err_msg           TEXT;
    v_post_id           UUID;
    v_conflict_post_id  UUID;
BEGIN
    -- ------------------------------------------------------------------
    -- Valmistelu: Haetaan testiorganisaatio tai luodaan se
    -- ------------------------------------------------------------------
    SELECT id INTO v_test_org FROM public.organizations LIMIT 1;
    IF v_test_org IS NULL THEN
        RAISE EXCEPTION 'Testejä ei voi ajaa: organizations-taulussa ei ole yhtään organisaatiota.';
    END IF;

    -- Luodaan testiä varten tarvittaessa toinen organisaatio vierastarkistuksiin
    SELECT id INTO v_foreign_org FROM public.organizations WHERE id <> v_test_org LIMIT 1;

    -- 1. Luodaan PJ (board_chair)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi PJ Julkaisu', 'pj.julkaisu@esim.fi')
    RETURNING id INTO v_chair_id;

    UPDATE public.organization_role_assignments
    SET is_active = FALSE, valid_until = now()
    WHERE organization_id = v_test_org AND role_type = 'board_chair' AND is_active IS TRUE;

    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type)
    VALUES (v_test_org, v_chair_id, 'board_chair')
    RETURNING id INTO v_chair_role_id;

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

    -- 2. Luodaan Hallituksen jäsen (board_member)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi Jäsen Hallitus', 'jasen.hallitus@esim.fi')
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

    -- 2b. Luodaan Sihteeri (secretary - oikeus julkaista seinälle manage_content)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi Sihteeri', 'sihteeri@esim.fi')
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

    -- 3. Luodaan Koordinaattori (coordinator - ei oikeutta julkaista seinälle)
    INSERT INTO public.organization_members (organization_id, full_name, email)
    VALUES (v_test_org, 'Testi Koordinaattori', 'koord@esim.fi')
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

    -- 4. Luodaan Legacy org_pin -istunto
    v_legacy_token := extensions.gen_random_uuid()::TEXT;
    v_legacy_hash  := pg_catalog.encode(extensions.digest(v_legacy_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_legacy_hash, 'legacy_org_pin', NULL, NULL, now() + interval '1 hour'
    );

    -- 5. Luodaan testikohteet board_items -tauluun
    INSERT INTO public.board_items (organization_id, title, description, stage)
    VALUES (v_test_org, 'Testitehtävä 1 Julkaisuun', 'Kuvaus tehtävälle', 'in_progress')
    RETURNING id INTO v_test_item_id;

    INSERT INTO public.board_items (organization_id, title, description, stage)
    VALUES (v_test_org, 'Testitehtävä 2 Toinen kohde', 'Kuvaus tehtävälle', 'in_progress')
    RETURNING id INTO v_second_item_id;

    INSERT INTO public.board_items (organization_id, title, description, stage)
    VALUES (v_test_org, 'Arkistoitu Tehtävä', 'Tämä on arkistoitu', 'archived')
    RETURNING id INTO v_archived_item_id;

    -- ==================================================================
    -- TESTI 1: Ei istuntotunnistetta (NULL / tyhjä)
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            NULL, v_test_item_id, 'Otsikko', 'Sisältöä riittävästi'
        );
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
        status  := 'HYVÄKSYTTY'; details := 'Poikkeus heitetty: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 2: Vain legacy_org_pin -istunto hylätään
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_legacy_token, v_test_item_id, 'Otsikko', 'Sisältöä riittävästi julkaisuun'
        );
        test_id := 2; test_name := 'Vain legacy_org_pin -istunto';
        status  := 'HYLÄTTY';
        details := 'Legacy-istunto pääsi läpi: ' || v_result::TEXT;
    EXCEPTION WHEN OTHERS THEN
        test_id := 2; test_name := 'Vain legacy_org_pin -istunto';
        status  := 'HYVÄKSYTTY';
        details := 'Legacy-istunto hylättiin governance-tarkistuksessa: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 3: Voimassa oleva board_chair -istunto -> Julkaisu onnistuu
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_chair_token, v_test_item_id, 'Virallinen Talkoopäivä', 'Tervetuloa talkoisiin Laukaalle!'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND (v_result ->> 'action') = 'published'
           AND (v_result ->> 'wall_post_id') IS NOT NULL THEN
            v_post_id := (v_result ->> 'wall_post_id')::UUID;
            test_id := 3; test_name := 'Voimassa oleva board_chair -istunto';
            status  := 'HYVÄKSYTTY';
            details := format('Julkaisu onnistui, luotu post_id: %s', v_post_id);
        ELSE
            test_id := 3; test_name := 'Voimassa oleva board_chair -istunto';
            status  := 'HYLÄTTY';
            details := 'Julkaisu epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 3; test_name := 'Voimassa oleva board_chair -istunto';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 4: Voimassa oleva board_member -istunto -> Julkaisun päivitys onnistuu
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_member_token, v_test_item_id, 'Päivitetty Talkoopäivä', 'Päivitetty sisältö talkoisiin!'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND (v_result ->> 'action') = 'updated' THEN
            test_id := 4; test_name := 'Voimassa oleva board_member -istunto';
            status  := 'HYVÄKSYTTY';
            details := 'Uudelleenjulkaisu ja sisällön päivitys onnistui hallituksen jäseneltä.';
        ELSE
            test_id := 4; test_name := 'Voimassa oleva board_member -istunto';
            status  := 'HYLÄTTY';
            details := 'Päivitys epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 4; test_name := 'Voimassa oleva board_member -istunto';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 5: Voimassa oleva secretary -istunto (manage_content) -> Julkaisu onnistuu
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_sec_token, v_test_item_id, 'Sihteerin Tiedote', 'Sihteerin julkaisema tiedote Seinälle'
        );
        IF (v_result ->> 'success')::BOOLEAN IS TRUE
           AND (v_result ->> 'action') = 'updated' THEN
            test_id := 5; test_name := 'Voimassa oleva secretary -istunto';
            status  := 'HYVÄKSYTTY';
            details := 'Sihteerin valtuutus toimi ja julkaisun päivitys onnistui manage_content-toimivallalla.';
        ELSE
            test_id := 5; test_name := 'Voimassa oleva secretary -istunto';
            status  := 'HYLÄTTY';
            details := 'Sihteerin julkaisu epäonnistui: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 5; test_name := 'Voimassa oleva secretary -istunto';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 6: coordinator- tai lead-rooli -> Julkaisu hylätään
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_coord_token, v_test_item_id, 'Luvaton julkaisu', 'Sisältöä koordinaattorilta'
        );
        test_id := 6; test_name := 'coordinator-rooli hylätään';
        status  := 'HYLÄTTY';
        details := 'Koordinaattori pääsi julkaisemaan Seinälle: ' || v_result::TEXT;
    EXCEPTION WHEN OTHERS THEN
        test_id := 6; test_name := 'coordinator-rooli hylätään';
        status  := 'HYVÄKSYTTY';
        details := 'Koordinaattori hylättiin odotetusti: ' || SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 7: Suljettu tai arkistoitu kohde hylätään oikeustarkistuksen jälkeen
    -- ==================================================================
    BEGIN
        v_result := public.publish_board_item_to_wall(
            v_chair_token, v_archived_item_id, 'Arkistoidun julkaisu', 'Tätä ei pitäisi voida julkaista'
        );
        IF (v_result ->> 'success')::BOOLEAN IS FALSE
           AND (v_result ->> 'error') LIKE '%Suljettua, arkistoitua%' THEN
            test_id := 7; test_name := 'Arkistoitu kohde hylätään';
            status  := 'HYVÄKSYTTY';
            details := 'Hylättiin oikein tilatarkistuksessa: ' || (v_result ->> 'error');
        ELSE
            test_id := 7; test_name := 'Arkistoitu kohde hylätään';
            status  := 'HYLÄTTY';
            details := 'Arkistoitu kohde pääsi läpi tai virhe oli väärä: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 7; test_name := 'Arkistoitu kohde hylätään';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 8: Postaus viittaa toiseen kohteeseen -> hylätään force_relinkilläkin
    -- ==================================================================
    BEGIN
        -- Luodaan erillinen postaus, jonka target_id osoittaa toiseen kohteeseen (v_test_item_id)
        INSERT INTO public.posts (
            organization_id, title, content, type, status, visibility, target_id, target_type
        ) VALUES (
            v_test_org, 'Ristiriitainen postaus', 'Sisältöä', 'event', 'published', 'public',
            v_test_item_id::TEXT, 'board_item'
        ) RETURNING id INTO v_conflict_post_id;

        -- Asetetaan v_second_item viittaamaan tähän postaukseen (yksilöllinen 1:1 -viite)
        UPDATE public.board_items SET wall_post_id = v_conflict_post_id WHERE id = v_second_item_id;

        v_result := public.publish_board_item_to_wall(
            v_chair_token, v_second_item_id, 'Ristiriitainen Otsikko', 'Sisältöä toiselle kohteelle',
            'event', TRUE -- vaikka force_relink = true, eri target_id täytyy estää!
        );

        IF (v_result ->> 'success')::BOOLEAN IS FALSE
           AND (v_result ->> 'error') LIKE '%Ristiriitainen julkaisuviite%' THEN
            test_id := 8; test_name := 'Postaus viittaa toiseen kohteeseen';
            status  := 'HYVÄKSYTTY';
            details := 'Ristiriitainen viite hylättiin myös p_force_relink=true tilassa.';
        ELSE
            test_id := 8; test_name := 'Postaus viittaa toiseen kohteeseen';
            status  := 'HYLÄTTY';
            details := 'Ristiriitainen viite hyväksyttiin virheellisesti: ' || v_result::TEXT;
        END IF;

        -- Palautetaan second_item ennalleen ja poistetaan konfliktipostaus
        UPDATE public.board_items SET wall_post_id = NULL WHERE id = v_second_item_id;
        DELETE FROM public.posts WHERE id = v_conflict_post_id;
    EXCEPTION WHEN OTHERS THEN
        test_id := 8; test_name := 'Postaus viittaa toiseen kohteeseen';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 9: Puutteellinen viite vaatii force_relink=true ja palautuu sillä
    -- ==================================================================
    BEGIN
        -- Asetetaan target_id väliaikaisesti NULLiksi
        UPDATE public.posts SET target_id = NULL WHERE id = v_post_id;

        -- a) Ilman force_relinkiä täytyy tulla requires_force_relink = true
        v_result := public.publish_board_item_to_wall(
            v_chair_token, v_test_item_id, 'Puutteellinen viite', 'Sisältöä talkoisiin', 'event', FALSE
        );

        IF (v_result ->> 'success')::BOOLEAN IS FALSE
           AND (v_result ->> 'requires_force_relink')::BOOLEAN IS TRUE THEN

            -- b) Kun p_force_relink = TRUE, palautus onnistuu
            v_result := public.publish_board_item_to_wall(
                v_chair_token, v_test_item_id, 'Palautettu viite', 'Sisältöä talkoisiin', 'event', TRUE
            );

            IF (v_result ->> 'success')::BOOLEAN IS TRUE
               AND (v_result ->> 'action') = 'republished' THEN
                test_id := 9; test_name := 'Puutteellisen viitteen relink';
                status  := 'HYVÄKSYTTY';
                details := 'Ilman pakotusta vaati relinkiä; pakotettuna palautui ja päivitti target_id:n.';
            ELSE
                test_id := 9; test_name := 'Puutteellisen viitteen relink';
                status  := 'HYLÄTTY';
                details := 'Pakotettu relink epäonnistui: ' || v_result::TEXT;
            END IF;
        ELSE
            test_id := 9; test_name := 'Puutteellisen viitteen relink';
            status  := 'HYLÄTTY';
            details := 'Ilman pakotusta ei vaadittu relinkiä: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 9; test_name := 'Puutteellisen viitteen relink';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 10: Viitattu postaus on poistettu kannasta
    -- ==================================================================
    BEGIN
        -- Poistetaan postaus kannasta
        DELETE FROM public.posts WHERE id = v_post_id;

        -- Ilman pakotusta: hylkäys ja requires_force_relink = true
        v_result := public.publish_board_item_to_wall(
            v_chair_token, v_test_item_id, 'Poistetun korvaus', 'Uutta sisältöä', 'event', FALSE
        );

        IF (v_result ->> 'success')::BOOLEAN IS FALSE
           AND (v_result ->> 'requires_force_relink')::BOOLEAN IS TRUE THEN

            -- Pakotettuna: luodaan uusi postaus
            v_result := public.publish_board_item_to_wall(
                v_chair_token, v_test_item_id, 'Uusi korvaava postaus', 'Uutta sisältöä', 'event', TRUE
            );

            IF (v_result ->> 'success')::BOOLEAN IS TRUE
               AND (v_result ->> 'action') = 'published' THEN
                test_id := 10; test_name := 'Poistetun postauksen korvaus';
                status  := 'HYVÄKSYTTY';
                details := 'Poistettu viite vaati force_relinkin ja loi uuden postauksen onnistuneesti.';
            ELSE
                test_id := 10; test_name := 'Poistetun postauksen korvaus';
                status  := 'HYLÄTTY';
                details := 'Uuden luonti force_relinkillä epäonnistui: ' || v_result::TEXT;
            END IF;
        ELSE
            test_id := 10; test_name := 'Poistetun postauksen korvaus';
            status  := 'HYLÄTTY';
            details := 'Poistettu postaus ei vaatinut relinkiä: ' || v_result::TEXT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 10; test_name := 'Poistetun postauksen korvaus';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- ==================================================================
    -- TESTI 11: Audit-kirjaukset löytyvät governance-lokista
    -- ==================================================================
    BEGIN
        IF EXISTS (
            SELECT 1 FROM public.organization_governance_audit
            WHERE organization_id = v_test_org AND action = 'ITEM_PUBLISHED'
        )
        AND EXISTS (
            SELECT 1 FROM public.organization_governance_audit
            WHERE organization_id = v_test_org AND action = 'ITEM_REPUBLISHED'
        ) THEN
            test_id := 11; test_name := 'Audit-kirjaukset (ITEM_PUBLISHED + ITEM_REPUBLISHED)';
            status  := 'HYVÄKSYTTY';
            details := 'Kumpikin julkaisun audit-toiminto löytyy organization_governance_audit -taulusta.';
        ELSE
            test_id := 11; test_name := 'Audit-kirjaukset (ITEM_PUBLISHED + ITEM_REPUBLISHED)';
            status  := 'HYLÄTTY';
            details := 'Osa audit-kirjauksista puuttuu lokista.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        test_id := 11; test_name := 'Audit-kirjaukset (ITEM_PUBLISHED + ITEM_REPUBLISHED)';
        status  := 'HYLÄTTY'; details := SQLERRM;
    END;
    RETURN NEXT;

    -- Siivous: Poistetaan testikohteet ja passivoidaan jäsenet / istunnot
    -- (audit-loki käyttää ON DELETE RESTRICT jäsentunnisteille)
    DELETE FROM public.board_items WHERE id IN (v_test_item_id, v_second_item_id, v_archived_item_id);

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

-- =============================================================================
-- OSA 3: AJA TESTIT
-- =============================================================================

SELECT * FROM public.run_board_publish_governance_tests()
ORDER BY test_id;
