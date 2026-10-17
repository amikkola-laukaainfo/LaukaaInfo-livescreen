-- =============================================================================
-- 072_1_member_batch_import.sql
-- LaukaaInfo – Jäsenten erätuonti (täydentää 072-migraatiota)
-- =============================================================================
-- TILA: VALMIS HYVÄKSYNTÄTESTATTAVAKSI (v1.0.0)
--
-- Tavoite:
--   Lisää `import_organization_members_batch`-funktio, joka tuo jäseniä
--   JSON-eränä yhden atomisen transaktion sisällä.
--
-- Arkkitehtuurilinjaukset (peritään 072-migraatiosta):
--   1. Sama lukitusjärjestys kuin create_organization_member:
--        Advisory xact lock (namespace 1936028780)
--        → organizations FOR UPDATE
--        → _verify_member_governance_permission('manage_governance')
--   2. Kaikki rivit validoidaan ennen yhtään kirjoitusta.
--      Yhdenkin virheellisen rivin tapauksessa RAISE EXCEPTION → automaattinen rollback.
--   3. Enintään yksi board_chair per erä.
--      Jos erässä on board_chair, vanha pj passivoidaan samoin kuin
--      assign_organization_role-funktiossa.
--   4. Valtuuskoodeja ei luoda automaattisesti — se on erillinen toiminto
--      (generate_role_credential).
--   5. Yksi BATCH_MEMBER_IMPORT-kirjaus koko erästä + yksi MEMBER_CREATED
--      per luotu jäsen audit-lokiin.
--
-- Syöte-JSON-skeema (p_members-taulukko, yksi alkio per jäsen):
--   [
--     {
--       "full_name":     "Nimimerkki",            -- pakollinen, min 2 merkkiä
--       "email":         "osoite@esim.fi",         -- valinnainen
--       "phone":         "+358 40 123 4567",        -- valinnainen
--       "member_number": "2024-001",               -- valinnainen
--       "role_type":     "board_member",            -- valinnainen; jos annettu,
--                                                  --   sallitut arvot ks. chk_org_role_type
--       "scope_item_id": "uuid-merkkijono"         -- valinnainen; pakollinen jos
--                                                  --   role_type = coordinator tai lead
--     }
--   ]
--
-- Palauttaa:
--   { "success": true,  "imported_count": N, "member_ids": ["uuid", ...] }
--   { "success": false, "error": "kuvaava viesti" }       -- ei kirjoituksia tehty
--
-- Rajat:
--   - Max 200 jäsentä per erä (BATCH_SIZE_LIMIT).
--   - Tyhjä erä ([]) on sallittu (palautetaan success: true, imported_count: 0),
--     mutta käyttöoikeus tarkistetaan silti ennen palautusta.
--   - Jokaisen alkion on oltava JSON-objekti; muut tyypit (taulukko, luku, jne.) hylätään.
--   - Tuntemattomat kentät hyväksytään hiljaisesti (ei ole vikalistaa).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ERÄTUONTIFUNKTIO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_organization_members_batch(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_members         JSONB        -- JSON-taulukko, ks. skeema yllä
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- Vakiot
    v_lock_namespace  CONSTANT INT  := 1936028780;
    v_batch_limit     CONSTANT INT  := 200;
    v_valid_roles     CONSTANT TEXT[] :=
        ARRAY['board_chair', 'board_member', 'secretary', 'coordinator', 'lead'];

    -- Istunto & kutsuja
    v_token_hash      TEXT;
    v_caller          RECORD;

    -- Validointitila
    v_total           INT;
    v_chair_count     INT := 0;
    v_idx             INT;
    v_elem            JSONB;

    -- Kenttämuuttujat per rivi
    v_full_name       TEXT;
    v_email           TEXT;
    v_phone           TEXT;
    v_member_number   TEXT;
    v_role_type       TEXT;
    v_scope_item_id   UUID;

    -- Kirjoitusvaihe
    v_new_member_id   UUID;
    v_member_ids      UUID[] := ARRAY[]::UUID[];
    v_role_id         UUID;
    v_old_chair       RECORD;
    v_chair_member_id UUID;   -- uuden board_chair-jäsenen id
    v_chair_elem_idx  INT;    -- ao. elementin indeksi (debug/audit)
BEGIN
    -- ------------------------------------------------------------------
    -- 0. SYÖTEVALIDOINTI (ennen lukitusta — nopea hylkäys)
    -- ------------------------------------------------------------------
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istuntotunnus vaaditaan.');
    END IF;

    IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_members on oltava JSON-taulukko.');
    END IF;

    v_total := jsonb_array_length(p_members);

    -- Koko tarkistus ilman lukkoja — nopea hylkäys ennen transaktio-overhead'ia.
    -- Tyhjää erää EI palauteta vielä tässä: käyttöoikeus tarkistetaan ensin.
    IF v_total > v_batch_limit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Erä on liian suuri: %s jäsentä (enimmäismäärä %s).', v_total, v_batch_limit)
        );
    END IF;

    -- ------------------------------------------------------------------
    -- 1. HIERARKIATASO 1 & 2: Advisory-lukko + organisaatiorivin lukitus
    -- ------------------------------------------------------------------
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    -- ------------------------------------------------------------------
    -- 2. HIERARKIATASO 3–6: Istunnon, jäsenen, roolin ja valtuuskoodin varmennus
    -- ------------------------------------------------------------------
    v_token_hash := pg_catalog.encode(extensions.digest(p_session_token, 'sha256'), 'hex');

    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash, p_organization_id, 'manage_governance'
    );
    -- Jos varmennus epäonnistuu, _verify_member_governance_permission heittää
    -- EXCEPTION → koko transaktio peruuntuu automaattisesti.

    -- Tyhjä erä — käyttöoikeus on nyt tarkistettu, palautetaan no-op.
    IF v_total = 0 THEN
        RETURN jsonb_build_object('success', true, 'imported_count', 0, 'member_ids', '[]'::JSONB);
    END IF;

    -- ------------------------------------------------------------------
    -- 3. VAIHE 1: VALIDOINTI — kaikki rivit tarkistetaan ennen kirjoituksia
    -- ------------------------------------------------------------------
    v_chair_count    := 0;
    v_chair_elem_idx := -1;

    FOR v_idx IN 0 .. v_total - 1 LOOP
        v_elem := p_members -> v_idx;

        -- Jokaisen alkion on oltava JSON-objekti
        IF jsonb_typeof(v_elem) <> 'object' THEN
            RAISE EXCEPTION 'Rivi %: alkion on oltava JSON-objekti (tyyppi oli "%").',
                v_idx + 1, jsonb_typeof(v_elem);
        END IF;

        -- full_name
        v_full_name := pg_catalog.btrim(COALESCE(v_elem ->> 'full_name', ''));
        IF pg_catalog.length(v_full_name) < 2 THEN
            RAISE EXCEPTION 'Rivi %: full_name puuttuu tai on alle 2 merkkiä pitkä.',
                v_idx + 1;
        END IF;
        IF pg_catalog.length(v_full_name) > 200 THEN
            RAISE EXCEPTION 'Rivi %: full_name on yli 200 merkkiä pitkä.',
                v_idx + 1;
        END IF;

        -- email (valinnainen, mutta jos annettu ei-tyhjänä → muotovalvonta)
        v_email := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'email', '')), '');
        IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RAISE EXCEPTION 'Rivi %: email-osoite "%" ei ole kelvollinen.',
                v_idx + 1, v_email;
        END IF;

        -- phone (valinnainen, max 30 merkkiä)
        v_phone := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'phone', '')), '');
        IF v_phone IS NOT NULL AND pg_catalog.length(v_phone) > 30 THEN
            RAISE EXCEPTION 'Rivi %: phone on yli 30 merkkiä pitkä.',
                v_idx + 1;
        END IF;

        -- member_number (valinnainen, max 50 merkkiä)
        v_member_number := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'member_number', '')), '');
        IF v_member_number IS NOT NULL AND pg_catalog.length(v_member_number) > 50 THEN
            RAISE EXCEPTION 'Rivi %: member_number on yli 50 merkkiä pitkä.',
                v_idx + 1;
        END IF;

        -- role_type (valinnainen)
        v_role_type := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'role_type', '')), '');
        IF v_role_type IS NOT NULL THEN
            IF NOT (v_role_type = ANY(v_valid_roles)) THEN
                RAISE EXCEPTION 'Rivi %: tuntematon role_type "%". Sallitut: board_chair, board_member, secretary, coordinator, lead.',
                    v_idx + 1, v_role_type;
            END IF;

            -- scope_item_id — pakollinen coordinator/lead-rooleille
            v_scope_item_id := NULL;
            IF v_elem ? 'scope_item_id' AND (v_elem ->> 'scope_item_id') IS NOT NULL
               AND pg_catalog.btrim(v_elem ->> 'scope_item_id') <> '' THEN
                BEGIN
                    v_scope_item_id := (v_elem ->> 'scope_item_id')::UUID;
                EXCEPTION WHEN invalid_text_representation THEN
                    RAISE EXCEPTION 'Rivi %: scope_item_id "%" ei ole kelvollinen UUID.',
                        v_idx + 1, v_elem ->> 'scope_item_id';
                END;

                -- Varmistetaan, että scope_item kuuluu tähän organisaatioon
                IF NOT EXISTS (
                    SELECT 1 FROM public.board_items
                    WHERE id = v_scope_item_id AND organization_id = p_organization_id
                ) THEN
                    RAISE EXCEPTION 'Rivi %: scope_item_id "%" ei kuulu tähän organisaatioon.',
                        v_idx + 1, v_scope_item_id;
                END IF;
            END IF;

            IF v_role_type IN ('coordinator', 'lead') AND v_scope_item_id IS NULL THEN
                RAISE EXCEPTION 'Rivi %: rooli "%" vaatii scope_item_id-kentän.',
                    v_idx + 1, v_role_type;
            END IF;

            -- Enintään yksi board_chair koko erässä
            IF v_role_type = 'board_chair' THEN
                v_chair_count := v_chair_count + 1;
                v_chair_elem_idx := v_idx + 1;
                IF v_chair_count > 1 THEN
                    RAISE EXCEPTION 'Erässä voi olla enintään yksi board_chair-rooli. Toinen löytyi riviltä %.', v_idx + 1;
                END IF;
            END IF;
        END IF;

    END LOOP; -- validointisilmukka päättyy

    -- ------------------------------------------------------------------
    -- 4. VAIHE 2: KIRJOITUKSET — kaikki tai ei mitään
    -- ------------------------------------------------------------------

    -- 4a. Jos erässä on board_chair, passivoidaan nykyinen pj ensin
    --     (sama logiikka kuin assign_organization_role)
    IF v_chair_count = 1 THEN
        FOR v_old_chair IN
            SELECT * FROM public.organization_role_assignments
            WHERE organization_id = p_organization_id
              AND role_type = 'board_chair'
              AND is_active IS TRUE
            FOR UPDATE
        LOOP
            UPDATE public.organization_role_assignments
            SET is_active = FALSE, valid_until = now()
            WHERE id = v_old_chair.id;

            INSERT INTO public.organization_governance_audit (
                organization_id, actor_member_id, actor_name, actor_role,
                action, target_type, target_id, details
            ) VALUES (
                p_organization_id,
                v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
                'ROLE_REVOKED', 'role', v_old_chair.id::TEXT,
                jsonb_build_object(
                    'reason',        'replaced_by_new_board_chair_via_batch_import',
                    'revoked_role',  'board_chair',
                    'member_id',     v_old_chair.member_id,
                    'batch_context', true
                )
            );
        END LOOP;
    END IF;

    -- 4b. Jäsenten lisäys ja roolimääritys
    FOR v_idx IN 0 .. v_total - 1 LOOP
        v_elem := p_members -> v_idx;

        v_full_name     := pg_catalog.btrim(v_elem ->> 'full_name');
        v_email         := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'email',         '')), '');
        v_phone         := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'phone',         '')), '');
        v_member_number := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'member_number', '')), '');
        v_role_type     := NULLIF(pg_catalog.btrim(COALESCE(v_elem ->> 'role_type',     '')), '');

        v_scope_item_id := NULL;
        IF v_role_type IS NOT NULL
           AND v_elem ? 'scope_item_id'
           AND (v_elem ->> 'scope_item_id') IS NOT NULL
           AND pg_catalog.btrim(v_elem ->> 'scope_item_id') <> '' THEN
            v_scope_item_id := (v_elem ->> 'scope_item_id')::UUID;
        END IF;

        -- Lisätään jäsen
        INSERT INTO public.organization_members (
            organization_id, full_name, email, phone, member_number
        ) VALUES (
            p_organization_id,
            v_full_name,
            v_email,
            v_phone,
            v_member_number
        ) RETURNING id INTO v_new_member_id;

        v_member_ids := v_member_ids || v_new_member_id;

        -- Audit: yksittäinen jäsenluonti
        INSERT INTO public.organization_governance_audit (
            organization_id, actor_member_id, actor_name, actor_role,
            action, target_type, target_id, details
        ) VALUES (
            p_organization_id,
            v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
            'MEMBER_CREATED', 'member', v_new_member_id::TEXT,
            jsonb_build_object(
                'name',          v_full_name,
                'batch_import',  true,
                'batch_index',   v_idx + 1
            )
        );

        -- Roolimääritys (jos annettu)
        IF v_role_type IS NOT NULL THEN
            INSERT INTO public.organization_role_assignments (
                organization_id, member_id, role_type, scope_item_id, granted_by
            ) VALUES (
                p_organization_id,
                v_new_member_id,
                v_role_type,
                v_scope_item_id,
                v_caller.out_member_name
            ) RETURNING id INTO v_role_id;

            INSERT INTO public.organization_governance_audit (
                organization_id, actor_member_id, actor_name, actor_role,
                action, target_type, target_id, details
            ) VALUES (
                p_organization_id,
                v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
                'ROLE_ASSIGNED', 'role', v_role_id::TEXT,
                jsonb_build_object(
                    'role',         v_role_type,
                    'member_id',    v_new_member_id,
                    'scope',        v_scope_item_id,
                    'batch_import', true
                )
            );

            IF v_role_type = 'board_chair' THEN
                v_chair_member_id := v_new_member_id;
            END IF;
        END IF;

    END LOOP; -- kirjoitussilmukka päättyy

    -- 4c. Eräyhteenveto-auditointikirjaus
    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        p_organization_id,
        v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'BATCH_MEMBER_IMPORT', 'batch', NULL,
        jsonb_build_object(
            'imported_count',  v_total,
            'new_board_chair', v_chair_member_id,
            'member_ids',      (SELECT jsonb_agg(mid) FROM unnest(v_member_ids) AS mid)
        )
    );

    -- ------------------------------------------------------------------
    -- 5. PALAUTUSARVO
    -- ------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',        true,
        'imported_count', v_total,
        'member_ids',     (SELECT jsonb_agg(mid) FROM unnest(v_member_ids) AS mid)
    );

END;
$$;

-- =============================================================================
-- 2. KÄYTTÖOIKEUDET
-- =============================================================================

REVOKE ALL ON FUNCTION public.import_organization_members_batch(TEXT, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.import_organization_members_batch(TEXT, TEXT, JSONB)
    TO anon, authenticated, service_role;

-- =============================================================================
-- 3. KOMMENTTI
-- =============================================================================

COMMENT ON FUNCTION public.import_organization_members_batch(TEXT, TEXT, JSONB) IS
$$Tuo jäseniä JSON-eränä (max 200) yhden atomisen transaktion sisällä.
Vaatii voimassaolevan personal_role_code-istunnon, jonka haltijalla on
board_chair-rooli (manage_governance-toimivalta).
Valtuuskoodeja ei luoda automaattisesti — käytä generate_role_credential erikseen.
Palauttaa { success, imported_count, member_ids } tai heittää poikkeuksen (rollback).$$;

COMMIT;
