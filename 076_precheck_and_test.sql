-- =============================================================================
-- 076_precheck_and_test.sql
-- LaukaaInfo – Testiohjelma 076-migraation automaattiseen validointiin
-- =============================================================================
-- Testaa:
--   1. Virhetilanteet (puuttuva istunto, virheellinen tila)
--   2. Puheenjohtajan tilamuutos ja ITEM_STAGE_CHANGED -auditointi
--   3. Hallituksen jäsenen päätöskirjaus ja ITEM_DECIDED -auditointi
--   4. Sihteerin valmistumiskirjaus (done) ja ITEM_COMPLETED -auditointi
--   5. Legacy PIN -arkistointiyrityksen hylkäys
--   6. Koordinaattorin arkistointiyrityksen hylkäys
--   7. Hallituksen arkistointi ja ITEM_ARCHIVED -auditointi
--   8. get_archived_board_items -hakurajapinta
--   9. get_board_data -rajapinnan arkistofilteröinti
--  10. Koordinaattorin poistoyrityksen hylkäys
--  11. Hallituksen pysyvä poisto ja ITEM_DELETED -auditointi
--
-- HUOM: Tämä skripti suoritetaan ROLLBACK-tilassa, joten se ei jätä pysyvää testidataa.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_org_id          CONSTANT TEXT := 'laukaan-yrittajat';
    v_chair_code      CONSTANT TEXT := 'PJ-TEST-076-CHAIR-001';
    v_member_code     CONSTANT TEXT := 'HJ-TEST-076-MEMBER-02';
    v_secr_code       CONSTANT TEXT := 'SI-TEST-076-SECR-003';
    v_coord_code      CONSTANT TEXT := 'KO-TEST-076-COORD-04';
    v_legacy_pin      CONSTANT TEXT := 'PIN-TEST-076-LEGACY-05';

    v_chair_member_id UUID;
    v_hj_member_id    UUID;
    v_secr_member_id  UUID;
    v_coord_member_id UUID;

    v_chair_token     TEXT;
    v_hj_token        TEXT;
    v_secr_token      TEXT;
    v_coord_token     TEXT;
    v_legacy_token    TEXT;

    v_item_id         UUID;
    v_res             JSONB;
    v_audit_count     INT;
    v_archived_count  INT;
    v_active_count    INT;
    v_tests_passed    INT := 0;
    v_total_tests     INT := 11;
BEGIN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'Aloitetaan 076-migraation automaattinen testausohjelma';
    RAISE NOTICE '=============================================================';

    -- 0. Varmistetaan testiorganisaatio
    INSERT INTO public.organizations (id, name)
    VALUES (v_org_id, 'Laukaan Yrittäjät ry (Testi 076)')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    -- Jäsenet
    INSERT INTO public.organization_members (organization_id, full_name, is_active)
    VALUES (v_org_id, 'PJ Testihenkilö 076', TRUE)
    RETURNING id INTO v_chair_member_id;

    INSERT INTO public.organization_members (organization_id, full_name, is_active)
    VALUES (v_org_id, 'HJ Testihenkilö 076', TRUE)
    RETURNING id INTO v_hj_member_id;

    INSERT INTO public.organization_members (organization_id, full_name, is_active)
    VALUES (v_org_id, 'Sihteeri Testihenkilö 076', TRUE)
    RETURNING id INTO v_secr_member_id;

    INSERT INTO public.organization_members (organization_id, full_name, is_active)
    VALUES (v_org_id, 'Koordinaattori Testihenkilö 076', TRUE)
    RETURNING id INTO v_coord_member_id;

    -- Roolit
    INSERT INTO public.organization_role_assignments (organization_id, member_id, role_type, is_active)
    VALUES
        (v_org_id, v_chair_member_id, 'board_chair', TRUE),
        (v_org_id, v_hj_member_id, 'board_member', TRUE),
        (v_org_id, v_secr_member_id, 'secretary', TRUE),
        (v_org_id, v_coord_member_id, 'coordinator', TRUE);

    -- Valtuuskoodit
    -- Huom: organization_role_credentials ei sisällä is_active-saraketta.
    -- Aktiivisuus määräytyy: revoked_at IS NULL AND (locked_until IS NULL OR locked_until <= now())
    INSERT INTO public.organization_role_credentials (organization_id, member_id, code_hash)
    VALUES
        (v_org_id, v_chair_member_id, encode(digest(v_chair_code, 'sha256'), 'hex')),
        (v_org_id, v_hj_member_id, encode(digest(v_member_code, 'sha256'), 'hex')),
        (v_org_id, v_secr_member_id, encode(digest(v_secr_code, 'sha256'), 'hex')),
        (v_org_id, v_coord_member_id, encode(digest(v_coord_code, 'sha256'), 'hex'));

    -- Istunnot
    v_res := public.begin_role_session(v_org_id, v_chair_code);
    v_chair_token := v_res->>'session_token';

    v_res := public.begin_role_session(v_org_id, v_member_code);
    v_hj_token := v_res->>'session_token';

    v_res := public.begin_role_session(v_org_id, v_secr_code);
    v_secr_token := v_res->>'session_token';

    v_res := public.begin_role_session(v_org_id, v_coord_code);
    v_coord_token := v_res->>'session_token';

    -- Legacy org publisher session
    -- Huom: julkaisuavaimet tallennetaan organization_publish_credentials-tauluun.
    -- Sarakkeet: organization_id, code_hash (ei label, ei is_active).
    -- begin_org_session normalisoi avaimen: UPPER + poistaa erikoismerkit.
    INSERT INTO public.organization_publish_credentials (organization_id, code_hash)
    VALUES (v_org_id, encode(digest(UPPER(REGEXP_REPLACE(v_legacy_pin, '[^A-Z0-9]', '', 'g')), 'sha256'), 'hex'));

    v_res := public.begin_org_session(v_org_id, v_legacy_pin);
    v_legacy_token := v_res->>'session_token';

    -- Luodaan testiasia 075-migraation funktiolla
    v_res := public.create_board_item(
        v_chair_token,
        v_org_id,
        'Elinkaaritestin otsikko 076',
        'Tämä asia testaa elinkaaren, arkistoinnin ja PDF-lokin',
        'idea',
        'Testivetäjä',
        NULL,
        'Kevät 2026'
    );
    v_item_id := (v_res->>'item_id')::UUID;
    ASSERT v_item_id IS NOT NULL, 'Testiasian luonti epäonnistui.';

    -- ---------------------------------------------------------------
    -- TESTI 1: Ei istuntotunnistetta
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(NULL, v_item_id, 'discussion');
    IF (v_res->>'success')::BOOLEAN IS FALSE THEN
        v_tests_passed := v_tests_passed + 1;
        RAISE NOTICE '[OK] Testi 1: Istunnoton kutsu hylättiin odotetusti.';
    ELSE
        RAISE EXCEPTION 'Testi 1 epäonnistui: Istunnoton kutsu hyväksyttiin virheellisesti.';
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 2: Virheellinen tila
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(v_chair_token, v_item_id, 'tuntematon_tila');
    IF (v_res->>'success')::BOOLEAN IS FALSE THEN
        v_tests_passed := v_tests_passed + 1;
        RAISE NOTICE '[OK] Testi 2: Virheellinen tila hylättiin odotetusti.';
    ELSE
        RAISE EXCEPTION 'Testi 2 epäonnistui: Virheellinen tila hyväksyttiin.';
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 3: Puheenjohtaja siirtää tilaan 'discussion'
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(v_chair_token, v_item_id, 'discussion');
    IF (v_res->>'success')::BOOLEAN IS TRUE AND (v_res->>'new_stage') = 'discussion' THEN
        SELECT COUNT(*) INTO v_audit_count
        FROM public.organization_governance_audit
        WHERE target_id = v_item_id::TEXT AND action = 'ITEM_STAGE_CHANGED';

        IF v_audit_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 3: Puheenjohtajan tilasiirtymä onnistui ja ITEM_STAGE_CHANGED auditoitu.';
        ELSE
            RAISE EXCEPTION 'Testi 3 epäonnistui: Audit-kirjaus puuttuu.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 3 epäonnistui: Tilasiirtymä epäonnistui: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 4: Hallituksen jäsen kirjaa päätöksen (stage = 'decided')
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(
        v_hj_token,
        v_item_id,
        'decided',
        'Hallitus päätti yksimielisesti hyväksyä hankinnan kokouksessa 3/2026.'
    );
    IF (v_res->>'success')::BOOLEAN IS TRUE AND (v_res->>'new_stage') = 'decided' THEN
        SELECT COUNT(*) INTO v_audit_count
        FROM public.organization_governance_audit
        WHERE target_id = v_item_id::TEXT AND action = 'ITEM_DECIDED';

        IF v_audit_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 4: Hallituksen jäsenen päätöskirjaus onnistui ja ITEM_DECIDED auditoitu.';
        ELSE
            RAISE EXCEPTION 'Testi 4 epäonnistui: ITEM_DECIDED audit-kirjaus puuttuu.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 4 epäonnistui: Päätöksen kirjaus epäonnistui: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 5: Sihteeri merkitsee asian valmiiksi (stage = 'done')
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(v_secr_token, v_item_id, 'done');
    IF (v_res->>'success')::BOOLEAN IS TRUE AND (v_res->>'new_stage') = 'done' THEN
        SELECT COUNT(*) INTO v_audit_count
        FROM public.organization_governance_audit
        WHERE target_id = v_item_id::TEXT AND action = 'ITEM_COMPLETED';

        IF v_audit_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 5: Sihteerin toimenpide (done) onnistui ja ITEM_COMPLETED auditoitu.';
        ELSE
            RAISE EXCEPTION 'Testi 5 epäonnistui: ITEM_COMPLETED audit-kirjaus puuttuu.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 5 epäonnistui: Done-tilan muutos epäonnistui: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 6: Legacy PIN ei voi arkistoida asiaa
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(v_legacy_token, v_item_id, 'archived');
    IF (v_res->>'success')::BOOLEAN IS FALSE THEN
        v_tests_passed := v_tests_passed + 1;
        RAISE NOTICE '[OK] Testi 6: Legacy PIN ei saanut arkistoida asiaa (hylättiin odotetusti).';
    ELSE
        RAISE EXCEPTION 'Testi 6 epäonnistui: Legacy PIN sai arkistoida asian.';
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 7: Koordinaattori ei voi arkistoida asiaa
    -- ---------------------------------------------------------------
    BEGIN
        v_res := public.manage_board_item(v_coord_token, v_item_id, 'archived');
        IF (v_res->>'success')::BOOLEAN IS FALSE THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 7: Koordinaattorin arkistointipyyntö hylättiin odotetusti.';
        ELSE
            RAISE EXCEPTION 'Testi 7 epäonnistui: Koordinaattori sai arkistoida asian.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_tests_passed := v_tests_passed + 1;
        RAISE NOTICE '[OK] Testi 7: Koordinaattorin arkistointi esti poikkeuksella: %', SQLERRM;
    END;

    -- ---------------------------------------------------------------
    -- TESTI 8: Puheenjohtaja arkistoi asian
    -- ---------------------------------------------------------------
    v_res := public.manage_board_item(v_chair_token, v_item_id, 'archived');
    IF (v_res->>'success')::BOOLEAN IS TRUE AND (v_res->>'new_stage') = 'archived' THEN
        SELECT COUNT(*) INTO v_audit_count
        FROM public.organization_governance_audit
        WHERE target_id = v_item_id::TEXT AND action = 'ITEM_ARCHIVED';

        IF v_audit_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 8: Puheenjohtaja arkistoi asian ja ITEM_ARCHIVED auditoitu.';
        ELSE
            RAISE EXCEPTION 'Testi 8 epäonnistui: ITEM_ARCHIVED audit-kirjaus puuttuu.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 8 epäonnistui: Arkistointi epäonnistui: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 9: get_archived_board_items palauttaa arkistoidun kohteen
    -- ---------------------------------------------------------------
    v_res := public.get_archived_board_items(v_org_id);
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        v_archived_count := pg_catalog.jsonb_array_length(v_res->'items');
        IF v_archived_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 9: get_archived_board_items löysi arkistoidun asian (kpl: %).', v_archived_count;
        ELSE
            RAISE EXCEPTION 'Testi 9 epäonnistui: Arkistoitua asiaa ei löytynyt listalta.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 9 epäonnistui: get_archived_board_items virhe: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 10: get_board_data EI palauta arkistoitua kohdetta aktiivilistalla
    -- ---------------------------------------------------------------
    v_res := public.get_board_data(v_org_id);
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        -- Tarkistetaan ettei v_item_id löydy items-listasta
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(v_res->'items') elem
            WHERE elem->>'id' = v_item_id::TEXT
        ) THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 10: get_board_data suodattaa arkistoidun kohteen pois päänäkymästä.';
        ELSE
            RAISE EXCEPTION 'Testi 10 epäonnistui: Arkistoitu kohde näkyy get_board_data -vastauksessa.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 10 epäonnistui: get_board_data virhe: %', v_res;
    END IF;

    -- ---------------------------------------------------------------
    -- TESTI 11: Poisto (delete_board_item) hallitusroolilla
    -- ---------------------------------------------------------------
    -- Yritetään ensin koordinaattorilla (pitää epäonnistua)
    BEGIN
        v_res := public.delete_board_item(v_coord_token, v_item_id);
        IF (v_res->>'success')::BOOLEAN IS TRUE THEN
            RAISE EXCEPTION 'Testi 11 epäonnistui: Koordinaattori sai poistaa asian.';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Odotettu hylkäys
    END;

    -- Poistetaan puheenjohtajalla (onnistuu ja auditoituu)
    v_res := public.delete_board_item(v_chair_token, v_item_id);
    IF (v_res->>'success')::BOOLEAN IS TRUE THEN
        SELECT COUNT(*) INTO v_audit_count
        FROM public.organization_governance_audit
        WHERE target_id = v_item_id::TEXT AND action = 'ITEM_DELETED';

        IF v_audit_count >= 1 THEN
            v_tests_passed := v_tests_passed + 1;
            RAISE NOTICE '[OK] Testi 11: delete_board_item poisti kohteen ja kirjasi ITEM_DELETED auditoinnin.';
        ELSE
            RAISE EXCEPTION 'Testi 11 epäonnistui: ITEM_DELETED audit-kirjaus puuttuu.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Testi 11 epäonnistui: Poisto puheenjohtajalla epäonnistui: %', v_res;
    END IF;

    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'Kaikki % / % testiä läpäisty hyväksytysti!', v_tests_passed, v_total_tests;
    RAISE NOTICE '=============================================================';
END;
$$;

ROLLBACK;
