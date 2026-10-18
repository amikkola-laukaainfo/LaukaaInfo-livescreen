-- =============================================================================
-- 077_precheck_and_test.sql
-- LaukaaInfo – 077-migraation esitarkistus-, toiminnallisuus- ja rollback-testit
-- =============================================================================
-- TILA: VALMIS AJETTAVAKSI (v1.0.0)
--
-- Suorittaa:
--   1. Rakennetarkistukset (taulut, indeksit, funktiot)
--   2. Autentikointi- ja valtuutustestit (estää ei-adminit)
--   3. Atomisen tuonnin ja päivityksen testit
--   4. Eristystestit (väärä organisaatio / duplikaatti-ID)
--   5. Auditointitestit (actor_member_id = NULL, actor_role = 'admin')
--
-- HUOMIO: Testilohko päättyy ROLLBACK-komentoon, joten kantaan ei jää testidataa!
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VAIHE 1: Esitarkistukset (pysyvät objektit)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_missing TEXT := '';
BEGIN
    -- Taulut
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
        v_missing := v_missing || ' organizations';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_members') THEN
        v_missing := v_missing || ' organization_members';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_governance_audit') THEN
        v_missing := v_missing || ' organization_governance_audit';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        v_missing := v_missing || ' user_roles';
    END IF;

    -- Funktiot
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = '_verify_system_admin_internal'
    ) THEN
        v_missing := v_missing || ' _verify_system_admin_internal';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'admin_get_organization_members'
    ) THEN
        v_missing := v_missing || ' admin_get_organization_members';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'admin_import_organization_members_batch'
    ) THEN
        v_missing := v_missing || ' admin_import_organization_members_batch';
    END IF;

    IF v_missing <> '' THEN
        RAISE EXCEPTION 'ESITARKISTUS EPÄONNISTUI: Seuraavat 077-migraation objektit puuttuvat:%', v_missing;
    END IF;

    RAISE NOTICE '>>> ESITARKISTUS OK: Kaikki 077-migraation taulut ja funktiot löytyvät.';
END $$;

-- -----------------------------------------------------------------------------
-- VAIHE 2: Toiminnallisuus- ja rollback-testit
-- -----------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
    v_test_org_id       TEXT := 'test-org-077-' || substr(gen_random_uuid()::text, 1, 8);
    v_other_org_id      TEXT := 'test-org-other-' || substr(gen_random_uuid()::text, 1, 8);
    v_test_admin_id     UUID := gen_random_uuid();
    v_test_user_id      UUID := gen_random_uuid();

    v_existing_member_id UUID;
    v_other_member_id    UUID;
    v_result             JSONB;
    v_audit_record       RECORD;
    v_error_caught       BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE 'Aloitetaan 077-migraation toiminnallisuustestit...';

    -- 1. Valmistellaan testidata
    INSERT INTO public.organizations (id, name) VALUES
        (v_test_org_id, '077 Testijärjestö'),
        (v_other_org_id, '077 Toinen Järjestö');

    -- Lisätään olemassa oleva jäsen testijärjestöön
    INSERT INTO public.organization_members (
        organization_id, full_name, email, phone, member_number
    ) VALUES (
        v_test_org_id, 'Alkuperäinen Jäsen', 'alkup@testi.fi', '0401111111', 'J-001'
    ) RETURNING id INTO v_existing_member_id;

    -- Lisätään jäsen toiseen järjestöön (ristikkäistesti)
    INSERT INTO public.organization_members (
        organization_id, full_name, email, phone, member_number
    ) VALUES (
        v_other_org_id, 'Toisen Yhdistyksen Jäsen', 'toinen@testi.fi', '0402222222', 'T-999'
    ) RETURNING id INTO v_other_member_id;

    -- Luodaan testikäyttäjät auth.users-tauluun FK-rajoitteen täyttämiseksi
    -- (kaikki testitapahtumat perutaan lopussa olevalla ROLLBACKilla)
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_test_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin-077@testi.fi', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ), (
        v_test_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'user-077@testi.fi', '', now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    );

    -- Määritetään testikäyttäjien roolit
    -- v_test_admin_id -> admin
    -- v_test_user_id -> ei admin
    INSERT INTO public.user_roles (user_id, role) VALUES
        (v_test_admin_id, 'admin'),
        (v_test_user_id, 'user');

    -- -------------------------------------------------------------------------
    -- TESTI 1: Kutsu ilman admin-roolia (tavallinen käyttäjä) estetään
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_user_id::text)::text, true);

    v_error_caught := FALSE;
    BEGIN
        PERFORM public.admin_get_organization_members(v_test_org_id);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'TESTI 1 EPÄONNISTUI: Tavallinen käyttäjä sai kutsuttua admin_get_organization_members -funktiota!';
    END IF;
    RAISE NOTICE 'Testi 1 OK: Ei-admin -käyttäjän pääsy estettiin onnistuneesti.';

    -- -------------------------------------------------------------------------
    -- TESTI 2: Admin-oikeudella lukurajapinta palauttaa jäsenet
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_admin_id::text, 'email', 'admin@testi.fi')::text, true);

    v_result := public.admin_get_organization_members(v_test_org_id);

    IF v_result ->> 'success' <> 'true' OR jsonb_array_length(v_result -> 'members') <> 1 THEN
        RAISE EXCEPTION 'TESTI 2 EPÄONNISTUI: admin_get_organization_members palautti virheellisen tuloksen: %', v_result;
    END IF;
    RAISE NOTICE 'Testi 2 OK: Admin pystyi lukemaan organisaation jäsenet ilman yhdistyksen koodia.';

    -- -------------------------------------------------------------------------
    -- TESTI 3: Atominen tuonti (1 lisäys + 1 päivitys)
    -- -------------------------------------------------------------------------
    v_result := public.admin_import_organization_members_batch(
        v_test_org_id,
        -- Inserts: 1 uusi jäsen
        jsonb_build_array(
            jsonb_build_object(
                'full_name', 'Uusi Tuotu Jäsen',
                'email', 'uusi@testi.fi',
                'phone', '0503333333',
                'member_number', 'J-002'
            )
        ),
        -- Updates: Päivitetään olemassa olevan sähköposti ja puhelin
        jsonb_build_array(
            jsonb_build_object(
                'id', v_existing_member_id,
                'email', 'paivitetty@testi.fi',
                'phone', '0409999999'
            )
        )
    );

    IF v_result ->> 'success' <> 'true'
       OR (v_result ->> 'inserted_count')::int <> 1
       OR (v_result ->> 'updated_count')::int <> 1 THEN
        RAISE EXCEPTION 'TESTI 3 EPÄONNISTUI: Erätuonti palautti odottamattoman tuloksen: %', v_result;
    END IF;

    -- Varmistetaan että päivitys meni läpi kantaan
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE id = v_existing_member_id
          AND email = 'paivitetty@testi.fi'
          AND phone = '0409999999'
          AND full_name = 'Alkuperäinen Jäsen' -- Nimi säilyi
    ) THEN
        RAISE EXCEPTION 'TESTI 3 EPÄONNISTUI: Jäsenen tiedot eivät päivittyneet oikein kantaan.';
    END IF;
    RAISE NOTICE 'Testi 3 OK: Atominen lisäys ja UUID-kohdistettu päivitys suoritettu onnistuneesti.';

    -- -------------------------------------------------------------------------
    -- TESTI 4: Toisen organisaation jäsenen päivitysyritys hylätään
    -- -------------------------------------------------------------------------
    v_error_caught := FALSE;
    BEGIN
        PERFORM public.admin_import_organization_members_batch(
            v_test_org_id,
            '[]'::jsonb,
            jsonb_build_array(
                jsonb_build_object(
                    'id', v_other_member_id, -- Kuuluu v_other_org_id:hen!
                    'email', 'hakkeroitu@testi.fi'
                )
            )
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'TESTI 4 EPÄONNISTUI: Toisen organisaation jäsenen päivitys meni luvattomasti läpi!';
    END IF;
    RAISE NOTICE 'Testi 4 OK: Eristys toimii — toisen organisaation jäsenen päivitys estettiin.';

    -- -------------------------------------------------------------------------
    -- TESTI 5: Duplikaatti-ID samassa erässä estetään
    -- -------------------------------------------------------------------------
    v_error_caught := FALSE;
    BEGIN
        PERFORM public.admin_import_organization_members_batch(
            v_test_org_id,
            '[]'::jsonb,
            jsonb_build_array(
                jsonb_build_object('id', v_existing_member_id, 'phone', '111'),
                jsonb_build_object('id', v_existing_member_id, 'phone', '222')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'TESTI 5 EPÄONNISTUI: Duplikaatti-ID erässä ei aiheuttanut poikkeusta!';
    END IF;
    RAISE NOTICE 'Testi 5 OK: Erän sisäiset duplikaattipäivitykset estettiin.';

    -- -------------------------------------------------------------------------
    -- TESTI 6: Auditointimerkintä varmistettu
    -- -------------------------------------------------------------------------
    SELECT * INTO v_audit_record
    FROM public.organization_governance_audit
    WHERE organization_id = v_test_org_id
      AND action = 'ADMIN_BATCH_MEMBER_IMPORT'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_audit_record.id IS NULL THEN
        RAISE EXCEPTION 'TESTI 6 EPÄONNISTUI: Auditointimerkintää ei löytynyt!';
    END IF;

    IF v_audit_record.actor_member_id IS NOT NULL THEN
        RAISE EXCEPTION 'TESTI 6 EPÄONNISTUI: Admin-auditoinnissa actor_member_id ei ollut NULL!';
    END IF;

    IF v_audit_record.actor_role <> 'admin' THEN
        RAISE EXCEPTION 'TESTI 6 EPÄONNISTUI: actor_role ei ollut "admin"!';
    END IF;

    RAISE NOTICE 'Testi 6 OK: Auditointirivi tallennettu oikeilla kentillä (actor_member_id = NULL, role = admin).';

    RAISE NOTICE '>>> KAIKKI 077-TESTIT MENIVÄT ONNISTUNEESTI LÄPI! <<<';
END $$;

-- Peruutetaan testitapahtumat jotta kanta pysyy puhtaana
ROLLBACK;
