-- =============================================================================
-- 081_create_or_activate_organization_rpc.sql
-- LaukaaInfo – Yhdistyksen / organisaation luonti ja Toimintataulun aktivointi
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Mahdollistaa adminille tai profilointisovellukselle:
--   1. Uuden yhdistyksen luomisen suoraan Toimintatauluun (puhtaalta pöydältä)
--   2. Olemassa olevan yritysrekisterin toimijan aktivoimisen Toimintatauluun
--
-- RPC: public.create_or_activate_organization(...)
-- - SECURITY DEFINER: Ohittaa RLS-rajoitteet hallitusti
-- - Validoi id/slug-muodon (pienet kirjaimet, numerot, viivat)
-- - Validoi nimen (2-200 merkkiä)
-- - Jos id on jo olemassa: päivittää tiedot ja asettaa board_enabled = true
-- - Jos id on uusi: luo uuden rivin organizations-tauluun
-- =============================================================================

-- 1. KORJAUS: Korjataan kannassa olevat yritykset yritykseksi (mm. Mediazoo)
-- ja varmistetaan ettei yrityksille jää toimintataulu päälle.
UPDATE public.organizations
SET type = 'company',
    board_enabled = FALSE,
    accept_public_suggestions = FALSE
WHERE id IN ('mediazoo', 'company-2')
   OR lower(name) LIKE '%mediazoo%'
   OR (type = 'company' AND board_enabled IS TRUE);

-- 2. PÄIVITETTY RPC: create_or_activate_organization
-- Toimintataulu avataan automaattisesti VAIN yhdistyksille ('association').
-- Yrityksille ('company') board_enabled ja accept_public_suggestions pysyvät aina FALSE.
CREATE OR REPLACE FUNCTION public.create_or_activate_organization(
    p_organization_id           text,
    p_name                      text,
    p_type                      text DEFAULT 'association',
    p_board_enabled             boolean DEFAULT true,
    p_accept_public_suggestions boolean DEFAULT true,
    p_suggestion_guidelines     text DEFAULT NULL,
    p_session_token             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_id            text;
    v_clean_name          text;
    v_clean_type          text;
    v_final_board_enabled boolean;
    v_final_suggestions   boolean;
    v_exists              boolean := FALSE;
    v_org                 record;
BEGIN
    -- 1. Validointi: ID / slug
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Organisaatiotunnus (slug) puuttuu.');
    END IF;

    v_clean_id := pg_catalog.lower(pg_catalog.btrim(p_organization_id));

    -- Korvataan ääkköset ja erikoismerkit jos vahingossa syötetty
    v_clean_id := pg_catalog.replace(v_clean_id, 'ä', 'a');
    v_clean_id := pg_catalog.replace(v_clean_id, 'å', 'a');
    v_clean_id := pg_catalog.replace(v_clean_id, 'ö', 'o');
    v_clean_id := pg_catalog.regexp_replace(v_clean_id, '[^a-z0-9\-_]+', '-', 'g');
    v_clean_id := pg_catalog.btrim(v_clean_id, '-');

    -- Sallitaan vain pienet kirjaimet, numerot, väliviivat ja alaviivat, pituus 2-100
    IF pg_catalog.char_length(v_clean_id) < 2 OR pg_catalog.char_length(v_clean_id) > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Virheellinen tunnus. Tunnuksen tulee olla 2–100 merkkiä pitkä.'
        );
    END IF;

    -- 2. Validointi: Nimi
    IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Yhdistyksen / organisaation nimi puuttuu.');
    END IF;

    v_clean_name := pg_catalog.btrim(p_name);
    IF pg_catalog.char_length(v_clean_name) < 2 OR pg_catalog.char_length(v_clean_name) > 200 THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Nimen tulee olla 2–200 merkkiä.');
    END IF;

    -- 3. Validointi: Tyyppi
    v_clean_type := COALESCE(NULLIF(pg_catalog.lower(pg_catalog.btrim(p_type)), ''), 'association');
    IF v_clean_type NOT IN ('association', 'company') THEN
        v_clean_type := 'association';
    END IF;

    -- 4. RAJAUS: Toimintataulu on sallittu vain yhdistyksille ('association')
    -- Yrityksille toimintataulu ja ehdotuskanava ovat aina FALSE
    IF v_clean_type = 'association' THEN
        v_final_board_enabled := COALESCE(p_board_enabled, true);
        v_final_suggestions   := COALESCE(p_accept_public_suggestions, true);
    ELSE
        v_final_board_enabled := FALSE;
        v_final_suggestions   := FALSE;
    END IF;

    -- 5. Tarkistetaan onko jo olemassa
    SELECT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = v_clean_id
    ) INTO v_exists;

    IF v_exists THEN
        -- Päivitetään olemassa oleva
        UPDATE public.organizations
        SET name = v_clean_name,
            type = v_clean_type,
            board_enabled = v_final_board_enabled,
            accept_public_suggestions = v_final_suggestions,
            suggestion_guidelines = CASE 
                WHEN p_suggestion_guidelines IS NOT NULL THEN NULLIF(pg_catalog.btrim(p_suggestion_guidelines), '')
                ELSE suggestion_guidelines 
            END,
            is_active = true,
            updated_at = now()
        WHERE id = v_clean_id
        RETURNING id, name, type, board_enabled, accept_public_suggestions, suggestion_guidelines, is_active
        INTO v_org;

        RETURN pg_catalog.jsonb_build_object(
            'success', TRUE,
            'action', 'activated',
            'message', CASE 
                WHEN v_org.type = 'association' THEN 'Yhdistyksen Toimintataulu aktivoitu ja tiedot päivitetty onnistuneesti!'
                ELSE 'Yrityksen profiilitiedot päivitetty onnistuneesti (Toimintataulu ei käytössä yrityksille).'
            END,
            'organization', pg_catalog.jsonb_build_object(
                'id', v_org.id,
                'name', v_org.name,
                'type', v_org.type,
                'board_enabled', v_org.board_enabled,
                'accept_public_suggestions', v_org.accept_public_suggestions,
                'suggestion_guidelines', v_org.suggestion_guidelines,
                'is_active', v_org.is_active
            )
        );
    ELSE
        -- Lisätään uusi organisaatio
        INSERT INTO public.organizations (
            id,
            name,
            type,
            board_enabled,
            accept_public_suggestions,
            suggestion_guidelines,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            v_clean_id,
            v_clean_name,
            v_clean_type,
            v_final_board_enabled,
            v_final_suggestions,
            NULLIF(pg_catalog.btrim(p_suggestion_guidelines), ''),
            true,
            now(),
            now()
        )
        RETURNING id, name, type, board_enabled, accept_public_suggestions, suggestion_guidelines, is_active
        INTO v_org;

        RETURN pg_catalog.jsonb_build_object(
            'success', TRUE,
            'action', 'created',
            'message', CASE 
                WHEN v_org.type = 'association' THEN 'Uusi yhdistys luotu ja Toimintataulu avattu onnistuneesti!'
                ELSE 'Uusi yritys luotu onnistuneesti (Toimintataulu rajattu vain yhdistyksille).'
            END,
            'organization', pg_catalog.jsonb_build_object(
                'id', v_org.id,
                'name', v_org.name,
                'type', v_org.type,
                'board_enabled', v_org.board_enabled,
                'accept_public_suggestions', v_org.accept_public_suggestions,
                'suggestion_guidelines', v_org.suggestion_guidelines,
                'is_active', v_org.is_active
            )
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_activate_organization(
    text, text, text, boolean, boolean, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_or_activate_organization(
    text, text, text, boolean, boolean, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.create_or_activate_organization(
    text, text, text, boolean, boolean, text, text
) IS 'Luo uuden yhdistyksen/organisaation tai päivittää profiilin. Toimintataulu aktivoidaan vain yhdistyksille.';


-- 3. PÄIVITETTY RPC: get_public_organizations()
-- Palauttaa ainoastaan yhdistykset Toimintataulun julkiseen listaan / Gatewayhyn.
CREATE OR REPLACE FUNCTION public.get_public_organizations()
RETURNS TABLE (
    id text,
    name text,
    type text,
    accept_public_suggestions boolean,
    suggestion_guidelines text,
    description text,
    logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        o.id,
        o.name,
        o.type,
        o.accept_public_suggestions,
        o.suggestion_guidelines,
        o.description,
        o.logo_url
    FROM public.organizations AS o
    WHERE o.board_enabled IS TRUE
      AND o.is_active IS TRUE
      AND o.type = 'association' -- RAJAUS: vain yhdistykset Toimintataulu-valikkoon
    ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_organizations() TO anon, authenticated;


-- 4. PÄIVITETTY RPC: get_board_data(p_organization_id)
-- Estää Toimintataulun avaamisen, jos kyseessä ei ole yhdistys.
CREATE OR REPLACE FUNCTION public.get_board_data(
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_org_name      TEXT;
    v_org_type      TEXT;
    v_board_enabled BOOLEAN;
    v_items         JSONB;
BEGIN
    SELECT name, type, board_enabled
    INTO v_org_name, v_org_type, v_board_enabled
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei löydy.');
    END IF;

    -- RAJAUS: Toimintataulu avautuu vain yhdistyksille
    IF v_org_type <> 'association' OR v_board_enabled IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Toimintataulu on käytössä vain yhdistyksille ja seuroille. Yrityksille (kuten Mediazoo) Toimintataulu ei ole käytössä.'
        );
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', i.id,
            'seq', 'ASIA ' || LPAD(i.seq_num::text, 2, '0'),
            'title', i.title,
            'description', i.description,
            'stage', i.stage,
            'stage_name', CASE i.stage
                WHEN 'idea' THEN 'Uusi idea'
                WHEN 'discussion' THEN 'Keskustelussa'
                WHEN 'vote' THEN 'Äänestyksessä'
                WHEN 'decided' THEN 'Päätetty'
                WHEN 'in_progress' THEN 'Toteutuksessa'
                WHEN 'done' THEN 'Valmis'
                ELSE 'Arkistoitu'
            END,
            'lead', i.lead_name,
            'deadline', to_char(i.deadline_at, 'DD.MM.YYYY'),
            'deadline_label', COALESCE(i.deadline_label, to_char(i.deadline_at, 'DD.MM.YYYY')),
            'decision_summary', i.decision_summary,
            'is_published_to_wall', i.is_published_to_wall,
            'comments_count', (SELECT COUNT(*) FROM public.board_comments c WHERE c.item_id = i.id),
            'votes', (
                SELECT jsonb_build_object(
                    'yes', COUNT(*) FILTER (WHERE choice = 'yes'),
                    'no', COUNT(*) FILTER (WHERE choice = 'no'),
                    'cond', COUNT(*) FILTER (WHERE choice = 'cond'),
                    'total', COUNT(*)
                )
                FROM public.board_votes v
                WHERE v.item_id = i.id
            ),
            'tasks', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', t.id,
                        'name', t.name,
                        'required', t.required_volunteers,
                        'time', t.time_slot,
                        'signups', COALESCE((
                            SELECT jsonb_agg(s.participant_name ORDER BY s.created_at ASC)
                            FROM public.board_task_signups s
                            WHERE s.task_id = t.id
                        ), '[]'::jsonb)
                    ) ORDER BY t.sort_order ASC, t.created_at ASC
                )
                FROM public.board_tasks t
                WHERE t.item_id = i.id
            ), '[]'::jsonb)
        ) ORDER BY 
            CASE i.stage
                WHEN 'in_progress' THEN 1
                WHEN 'vote' THEN 2
                WHEN 'discussion' THEN 3
                WHEN 'idea' THEN 4
                WHEN 'decided' THEN 5
                ELSE 6
            END ASC,
            i.updated_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM public.board_items i
    WHERE i.organization_id = p_organization_id
      AND i.stage <> 'archived';

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'organization_type', v_org_type,
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_board_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_data(TEXT) TO anon, authenticated;

COMMIT;
