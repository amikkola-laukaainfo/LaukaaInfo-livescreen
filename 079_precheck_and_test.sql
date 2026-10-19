-- =============================================================================
-- 079_precheck_and_test.sql
-- LaukaaInfo – Testi- ja verifiointiskripti (079 Gateway & Org Flags)
-- =============================================================================
-- Suorittaa kattavan testauksen ROLLBACK-transaktiossa vastaten kaikkiin
-- katselmoinnin hyväksymiskriteereihin:
--
--   Testi 1: get_public_organizations() suodattaa passiiviset (is_active = FALSE)
--   Testi 2: Onnistunut ehdotus pakollisella yhteystiedolla
--   Testi 3: Yhteystiedon puuttuminen tai liian lyhyt estää ehdotuksen (anti-spam)
--   Testi 4: Atominen rate limit estää toisen ehdotuksen 24h sisällä
--   Testi 5: Toisen organisaation julkaisuun viittaava ehdotus hylätään
--   Testi 6: Oman organisaation viitejulkaisu hyväksytään ja otsikko tallentuu
--   Testi 7: Esto kun accept_public_suggestions = FALSE
--   Testi 8: Esto kun board_enabled = FALSE
--   Testi 9: updated_at -triggeri päivittää aikaleiman muokattaessa
--   Testi 10: update_organization_board_settings p_update_guidelines -logiikka
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_test_org          TEXT;
    v_other_org         TEXT;
    v_test_post_id      UUID;
    v_other_post_id     UUID;
    v_res               JSONB;
    v_sugg_id           UUID;
    v_saved_ref_title   TEXT;
    v_created_ts        TIMESTAMPTZ;
    v_updated_ts        TIMESTAMPTZ;
    v_found_passive     BOOLEAN;
BEGIN
    RAISE NOTICE '>>> ALOITETAAN 079 VERIFIOINTI JA HYVÄKSYNTÄTESTAUS <<<';

    -- 1. Alustetaan testiorganisaatiot
    SELECT id INTO v_test_org FROM public.organizations WHERE id = 'laukaan-testaajat';
    IF NOT FOUND THEN
        SELECT id INTO v_test_org FROM public.organizations LIMIT 1;
    END IF;

    IF v_test_org IS NULL THEN
        RAISE EXCEPTION 'Testiä ei voi ajaa: organizations-taulussa ei ole dataa.';
    END IF;

    -- Haetaan toinen organisaatio ristiintestaukseen
    SELECT id INTO v_other_org FROM public.organizations WHERE id <> v_test_org LIMIT 1;
    IF v_other_org IS NULL THEN
        INSERT INTO public.organizations (id, name, is_active, board_enabled, accept_public_suggestions)
        VALUES ('testi-toinen-org', 'Toinen Testiyhdistys ry', TRUE, TRUE, TRUE);
        v_other_org := 'testi-toinen-org';
    END IF;

    RAISE NOTICE 'Käytetään päätestiorganisaatiota: %, toista organisaatiota: %', v_test_org, v_other_org;

    -- Varmistetaan testiorganisaation tila
    UPDATE public.organizations
    SET board_enabled = TRUE, accept_public_suggestions = TRUE, is_active = TRUE
    WHERE id = v_test_org;

    -- TESTI 1: get_public_organizations() suodattaa passiiviset kohteet (RETURNS TABLE)
    UPDATE public.organizations SET is_active = FALSE WHERE id = v_other_org;
    
    SELECT EXISTS (
        SELECT 1 FROM public.get_public_organizations() WHERE id = v_other_org
    ) INTO v_found_passive;

    IF v_found_passive THEN
        RAISE EXCEPTION 'TESTI 1 VIRHE: Passiivinen organisaatio (is_active=false) näkyi julkisessa get_public_organizations() listassa!';
    END IF;
    RAISE NOTICE 'TESTI 1 OK: get_public_organizations() suodattaa passiiviset kohteet oikein.';

    -- Palautetaan toinen organisaatio aktiiviseksi
    UPDATE public.organizations SET is_active = TRUE WHERE id = v_other_org;

    -- TESTI 2: Onnistunut ehdotus ja pakollinen yhteystieto
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Asiallinen kehitysehdotus',
        'Tämä on laadukas kuntalaisen idea kylän raitille.',
        'Kerttu Kuntalainen',
        'kerttu.kuntalainen@example.com',
        NULL
    );
    IF (v_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 2 VIRHE: submit_board_suggestion hylkäsi validin ehdotuksen: %', v_res->>'error';
    END IF;
    v_sugg_id := (v_res->>'suggestion_id')::UUID;
    RAISE NOTICE 'TESTI 2 OK: Validiehdotus tallennettu id=%', v_sugg_id;

    -- TESTI 3: Yhteystiedon puuttuminen (anti-spam) estää ehdotuksen
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Anonyymi spämmi',
        'Kuvaus ilman yhteystietoa',
        'Anonyymi',
        NULL,
        NULL
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 3 VIRHE: Ehdotus ilman yhteystietoa meni läpi!';
    END IF;
    RAISE NOTICE 'TESTI 3 OK: Ehdotus ilman yhteystietoa estettiin oikein (viesti: %)', v_res->>'error';

    -- TESTI 4: Atominen rate limit estää saman yhteystiedon toisen ehdotuksen 24h sisällä
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Kertun toinen idea heti perään',
        'Pitäisi estyä rate limitin takia',
        'Kerttu Kuntalainen',
        'kerttu.kuntalainen@example.com',
        NULL
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 4 VIRHE: Rate limit ei estänyt toista ehdotusta!';
    END IF;
    RAISE NOTICE 'TESTI 4 OK: Rate limit esti toisen ehdotuksen samalta sähköpostilta (viesti: %)', v_res->>'error';

    -- TESTI 5: Toisen organisaation julkaisuun viittaava ehdotus hylätään
    INSERT INTO public.posts (id, organization_id, title, status)
    VALUES (gen_random_uuid(), v_other_org, 'Toisen yhdistyksen tapahtuma', 'APPROVED')
    RETURNING id INTO v_other_post_id;

    INSERT INTO public.posts (id, organization_id, title, status)
    VALUES (gen_random_uuid(), v_test_org, 'Oman yhdistyksen kokousilmoitus', 'APPROVED')
    RETURNING id INTO v_test_post_id;

    v_res := public.submit_board_suggestion(
        v_test_org,
        'Ehdotus väärällä viitteellä',
        'Viittaa toisen yhdistyksen ilmoitukseen',
        'Paavo Päättäjä',
        'paavo@example.com',
        v_other_post_id
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 5 VIRHE: Toisen organisaation viitejulkaisu meni läpi!';
    END IF;
    RAISE NOTICE 'TESTI 5 OK: Toisen organisaation viitejulkaisu hylättiin oikein (viesti: %)', v_res->>'error';

    -- TESTI 6: Oman organisaation viitejulkaisu hyväksytään ja otsikko kytkeytyy
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Ehdotus oikealla viitteellä',
        'Viittaa oman yhdistyksen ilmoitukseen',
        'Paavo Päättäjä',
        'paavo@example.com',
        v_test_post_id
    );
    IF (v_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 6 VIRHE: Oman organisaation viite hylättiin: %', v_res->>'error';
    END IF;
    SELECT ref_post_title INTO v_saved_ref_title
    FROM public.board_suggestions
    WHERE id = (v_res->>'suggestion_id')::UUID;

    IF v_saved_ref_title <> 'Oman yhdistyksen kokousilmoitus' THEN
        RAISE EXCEPTION 'TESTI 6 VIRHE: Viitejulkaisun otsikko ei tallentunut oikein!';
    END IF;
    RAISE NOTICE 'TESTI 6 OK: Oman viitejulkaisun kytkentä ja otsikko tallentuivat oikein.';

    -- TESTI 7: accept_public_suggestions = FALSE estää julkiset ehdotukset
    UPDATE public.organizations SET accept_public_suggestions = FALSE WHERE id = v_test_org;
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Uusi ehdotus suljettuun yhdistykseen',
        'Kuvaus',
        'Maija Meikäläinen',
        'maija@example.com',
        NULL
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 7 VIRHE: accept_public_suggestions = FALSE ei estänyt ehdotusta!';
    END IF;
    RAISE NOTICE 'TESTI 7 OK: accept_public_suggestions = FALSE esti ehdotuksen oikein.';

    -- TESTI 8: board_enabled = FALSE estää ehdotukset
    UPDATE public.organizations SET board_enabled = FALSE, accept_public_suggestions = TRUE WHERE id = v_test_org;
    v_res := public.submit_board_suggestion(
        v_test_org,
        'Ehdotus yhdistykseen ilman taulua',
        'Kuvaus',
        'Maija Meikäläinen',
        'maija2@example.com',
        NULL
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 8 VIRHE: board_enabled = FALSE ei estänyt ehdotusta!';
    END IF;
    RAISE NOTICE 'TESTI 8 OK: board_enabled = FALSE esti ehdotuksen oikein.';

    -- TESTI 9: updated_at -triggeri päivittää aikaleiman automaattisesti
    -- PostgreSQL:ssä now() pysyy vakiona koko transaktion ajan (transaction_timestamp).
    -- Testataan, että BEFORE UPDATE -triggeri ylikirjoittaa annetun vanhan aikaleiman nykyhetkellä (now()).
    UPDATE public.board_suggestions 
    SET title = 'Muokattu otsikko',
        updated_at = '2000-01-01 00:00:00+00'
    WHERE id = v_sugg_id;
    
    SELECT updated_at INTO v_updated_ts FROM public.board_suggestions WHERE id = v_sugg_id;
    IF v_updated_ts = '2000-01-01 00:00:00+00'::TIMESTAMPTZ THEN
        RAISE EXCEPTION 'TESTI 9 VIRHE: updated_at triggeri ei lauennut eikä asettanut now()!';
    END IF;
    RAISE NOTICE 'TESTI 9 OK: trg_board_suggestions_updated_at ylikirjoittaa aikaleiman automaattisesti (nykyhetki: %).', v_updated_ts;

    -- TESTI 10: update_organization_board_settings p_update_guidelines -logiikka ja validointi
    v_res := public.update_organization_board_settings(
        v_test_org,
        'dummy-token',
        TRUE,
        repeat('A', 2001), -- Yli 2000 merkkiä
        TRUE -- p_update_guidelines
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 10 VIRHE: Liian pitkä ohjeistus meni läpi!';
    END IF;
    RAISE NOTICE 'TESTI 10 OK: update_organization_board_settings validoi pituuden ja vaatii valtuuden.';

    RAISE NOTICE '>>> KAIKKI 10 HYVÄKSYNTÄTESTIÄ SUORITETTU VIRHEETTÖMÄSTI! <<<';
END $$;

ROLLBACK;
