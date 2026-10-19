-- =============================================================================
-- 081_test_create_or_activate_organization.sql
-- Testataan create_or_activate_organization RPC:n toiminta ja Toimintataulun
-- rajaus vain yhdistyksille ('association')
-- =============================================================================

DO $$
DECLARE
    v_res      jsonb;
    v_board    jsonb;
    v_test_ry  text := 'test-automaatti-ry';
    v_test_oy  text := 'test-mediazoo-oy';
BEGIN
    -- Siivotaan mahdollinen aiempi testidata
    DELETE FROM public.organizations WHERE id IN (v_test_ry, v_test_oy);

    -- TESTI 1: Uuden yhdistyksen luonti (board_enabled = TRUE)
    v_res := public.create_or_activate_organization(
        p_organization_id => v_test_ry,
        p_name => 'Testi Automaatti Ry',
        p_type => 'association',
        p_board_enabled => true,
        p_accept_public_suggestions => true,
        p_suggestion_guidelines => 'Tervetuloa jättämään ideoita!'
    );

    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 1 VIRHE: Uuden yhdistyksen luonti epäonnistui: %', v_res;
    END IF;

    IF (v_res->>'action') <> 'created' THEN
        RAISE EXCEPTION 'TESTI 1 VIRHE: Odotettiin action=created, saatiin: %', v_res->>'action';
    END IF;

    IF (v_res->'organization'->>'board_enabled')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 1 VIRHE: Yhdistykselle board_enabled pitää olla TRUE!';
    END IF;

    -- TESTI 2: Yrityksen luonti / määrittely (board_enabled = FALSE, accept_public_suggestions = FALSE)
    v_res := public.create_or_activate_organization(
        p_organization_id => v_test_oy,
        p_name => 'Testi Yritys Oy',
        p_type => 'company',
        p_board_enabled => true, -- pyydetään true, mutta logiikan pitää pakottaa false yritykselle
        p_accept_public_suggestions => true
    );

    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 2 VIRHE: Yrityksen luonti epäonnistui: %', v_res;
    END IF;

    IF (v_res->'organization'->>'type') <> 'company' THEN
        RAISE EXCEPTION 'TESTI 2 VIRHE: Tyyppi ei ollut company: %', v_res;
    END IF;

    IF (v_res->'organization'->>'board_enabled')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TESTI 2 VIRHE: Yritykselle Toimintataulu ei saa olla käytössä (board_enabled pitää olla FALSE)!';
    END IF;

    -- TESTI 3: get_board_data yritykselle (pitää epäonnistua ja palauttaa virheilmoitus)
    v_board := public.get_board_data(v_test_oy);
    IF (v_board->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TESTI 3 VIRHE: Yrityksen ei pitäisi voida avata toimintataulua!';
    END IF;

    -- TESTI 4: get_board_data yhdistykselle (pitää onnistua)
    v_board := public.get_board_data(v_test_ry);
    IF (v_board->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 4 VIRHE: Yhdistyksen toimintataulun avaaminen epäonnistui: %', v_board;
    END IF;

    -- TESTI 5: get_public_organizations ei saa palauttaa yritystä
    IF EXISTS (
        SELECT 1 FROM public.get_public_organizations() WHERE id = v_test_oy
    ) THEN
        RAISE EXCEPTION 'TESTI 5 VIRHE: Yritys näkyi Toimintataulun julkisessa listassa!';
    END IF;

    -- TESTI 6: Virheellinen slug (liian lyhyt)
    v_res := public.create_or_activate_organization(
        p_organization_id => 'x',
        p_name => 'Liian Lyhyt Slug Ry'
    );

    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TESTI 6 VIRHE: Virheellisen slug-tunnuksen olisi pitänyt epäonnistua!';
    END IF;

    -- Siivotaan testi
    DELETE FROM public.organizations WHERE id IN (v_test_ry, v_test_oy);

    RAISE NOTICE '✅ KAIKKI TESTIT (081) LÄPÄISTY ONNISTUNEESTI! Toimintataulu on rajattu vain yhdistyksille.';
END;
$$;
