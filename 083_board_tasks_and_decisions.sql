-- =============================================================================
-- 083_board_tasks_and_decisions.sql
-- LaukaaInfo – Päätöksen ja jatkotehtävien atominen kirjaus sekä tehtävähallinta
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Tavoite:
--   1. record_board_decision_with_task:
--      Atominen transaktio, joka kirjaa päätöksen (decision_summary) ja
--      valinnaisen ensimmäisen jatkotehtävän vastuuhenkilöineen yhdellä kutsulla.
--      Jos toinen epäonnistuu, koko operaatio peruuntuu (ei puolikkaita tiloja).
--   2. create_board_task:
--      Hallittu RPC lisätä uusia jatkotehtäviä olemassa olevaan asiaan milloin tahansa.
--      Tukee nimettyä vastuuhenkilöä (role_type = 'lead') tai avointa vapaaehtoishakua.
--
-- Käyttöoikeudet:
--   Vaatii todennetun personal_role_code-istunnon ja 'manage_tasks'-toimivallan
--   (puheenjohtaja, hallituksen jäsen, sihteeri tai kyseisen asian vetäjä).
--
-- Riippuvuudet:
--   - 070_toimintataulu_schema.sql (public.board_items, public.board_tasks, public.board_task_signups)
--   - 072_organization_roles_and_governance.sql (_verify_member_governance_permission)
--   - 076_board_item_lifecycle_and_archive.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. create_board_task: Tehtävän luonti olemassa olevaan asiaan
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_board_task(
    p_session_token         TEXT,
    p_item_id               UUID,
    p_name                  TEXT,
    p_time_slot             TEXT DEFAULT NULL,
    p_required_volunteers   INT DEFAULT 1,
    p_lead_name             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash     TEXT;
    v_item           RECORD;
    v_caller         RECORD;
    v_task_name      TEXT;
    v_time_slot      TEXT;
    v_lead_name      TEXT;
    v_required       INT;
    v_sort_order     INT;
    v_new_task_id    UUID;
BEGIN
    -- 1. Parametrien validointi
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Istuntotunniste puuttuu.');
    END IF;

    IF p_item_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Kohteen tunniste puuttuu.');
    END IF;

    v_task_name := pg_catalog.btrim(COALESCE(p_name, ''));
    IF pg_catalog.length(v_task_name) < 2 OR pg_catalog.length(v_task_name) > 200 THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Tehtävän nimen tulee olla 2–200 merkkiä pitkä.');
    END IF;

    v_time_slot := NULLIF(pg_catalog.btrim(p_time_slot), '');
    IF v_time_slot IS NOT NULL AND pg_catalog.length(v_time_slot) > 100 THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Aikataulun kuvaus saa olla enintään 100 merkkiä.');
    END IF;

    v_required := COALESCE(p_required_volunteers, 1);
    IF v_required < 1 OR v_required > 100 THEN
        v_required := 1;
    END IF;

    v_lead_name := NULLIF(pg_catalog.btrim(p_lead_name), '');
    IF v_lead_name IS NOT NULL AND pg_catalog.length(v_lead_name) > 100 THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Vastuuhenkilön nimi saa olla enintään 100 merkkiä.');
    END IF;

    -- 2. Kohderivin haku ja lukitus
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Asiaa ei löydy.');
    END IF;

    IF v_item.stage = 'archived' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Arkistoituun asiaan ei voi lisätä tehtäviä.');
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
        'hex'
    );

    -- 3. Valtuutustarkistus
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        v_item.organization_id,
        'manage_tasks',
        p_item_id
    );

    IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
        RAISE EXCEPTION 'Istunnolla ei ole oikeutta hallinnoida tämän asian tehtäviä.';
    END IF;

    -- 4. Lasketaan seuraava järjestysnumero
    SELECT COALESCE(pg_catalog.max(t.sort_order), 0) + 1
    INTO v_sort_order
    FROM public.board_tasks t
    WHERE t.item_id = p_item_id;

    -- 5. Tallennetaan tehtävä
    INSERT INTO public.board_tasks (
        item_id,
        organization_id,
        name,
        time_slot,
        required_volunteers,
        sort_order
    )
    VALUES (
        p_item_id,
        v_item.organization_id,
        v_task_name,
        v_time_slot,
        v_required,
        v_sort_order
    )
    RETURNING id INTO v_new_task_id;

    -- 6. Jos annettu nimetty vastuuhenkilö, liitetään vastuuhenkilöksi (role_type = 'lead')
    IF v_lead_name IS NOT NULL THEN
        INSERT INTO public.board_task_signups (
            task_id,
            item_id,
            organization_id,
            participant_name,
            role_type,
            notes
        )
        VALUES (
            v_new_task_id,
            p_item_id,
            v_item.organization_id,
            v_lead_name,
            'lead',
            'Nimetty vastuuhenkilö'
        )
        ON CONFLICT (task_id, participant_name) DO NOTHING;
    END IF;

    -- 7. Audit-kirjaus
    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details
    )
    VALUES (
        v_item.organization_id,
        v_caller.out_member_id,
        v_caller.out_member_name,
        v_caller.out_authorized_role,
        'TASK_CREATED',
        'board_task',
        v_new_task_id::TEXT,
        pg_catalog.jsonb_build_object(
            'item_id', p_item_id,
            'task_name', v_task_name,
            'time_slot', v_time_slot,
            'required', v_required,
            'lead_name', v_lead_name
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'task_id', v_new_task_id,
        'item_id', p_item_id,
        'name', v_task_name,
        'lead_name', v_lead_name
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_board_task(TEXT, UUID, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_board_task(TEXT, UUID, TEXT, TEXT, INT, TEXT) TO anon, authenticated, service_role;


-- =============================================================================
-- 2. record_board_decision_with_task: Atominen päätös + valinnainen tehtävä
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_board_decision_with_task(
    p_session_token         TEXT,
    p_item_id               UUID,
    p_decision_summary      TEXT,
    p_new_stage             TEXT DEFAULT 'decided',
    p_task_name             TEXT DEFAULT NULL,
    p_task_time_slot        TEXT DEFAULT NULL,
    p_task_required         INT DEFAULT 1,
    p_task_lead_name        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash     TEXT;
    v_item           RECORD;
    v_caller         RECORD;
    v_decision_clean TEXT;
    v_target_stage   TEXT;
    v_task_clean     TEXT;
    v_task_time      TEXT;
    v_task_lead      TEXT;
    v_task_req       INT;
    v_sort_order     INT;
    v_new_task_id    UUID := NULL;
BEGIN
    -- 1. Validointi
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Istuntotunniste puuttuu.');
    END IF;

    IF p_item_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Kohteen tunniste puuttuu.');
    END IF;

    v_decision_clean := pg_catalog.btrim(COALESCE(p_decision_summary, ''));
    IF pg_catalog.length(v_decision_clean) < 5 THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Päätöstekstin tulee olla vähintään 5 merkkiä pitkä.');
    END IF;

    v_target_stage := pg_catalog.btrim(COALESCE(p_new_stage, 'decided'));
    IF v_target_stage NOT IN ('decided', 'in_progress', 'done') THEN
        v_target_stage := 'decided';
    END IF;

    -- 2. Kohteen haku ja lukitus
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Asiaa ei löydy.');
    END IF;

    IF v_item.stage = 'archived' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Arkistoitua asiaa ei voi muokata.');
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
        'hex'
    );

    -- 3. Valtuutustarkistus
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        v_item.organization_id,
        'manage_tasks',
        p_item_id
    );

    IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
        RAISE EXCEPTION 'Istunnolla ei ole oikeutta kirjata tämän asian päätöstä.';
    END IF;

    -- 4. Päätöksen ja vaiheen päivitys
    UPDATE public.board_items
    SET stage = v_target_stage,
        decision_summary = v_decision_clean,
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_item_id;

    -- 5. Valinnainen ensimmäinen jatkotehtävä (samassa transaktiossa)
    v_task_clean := NULLIF(pg_catalog.btrim(p_task_name), '');
    IF v_task_clean IS NOT NULL AND pg_catalog.length(v_task_clean) >= 2 THEN
        v_task_time := NULLIF(pg_catalog.btrim(p_task_time_slot), '');
        v_task_lead := NULLIF(pg_catalog.btrim(p_task_lead_name), '');
        v_task_req := COALESCE(p_task_required, 1);
        IF v_task_req < 1 THEN v_task_req := 1; END IF;

        SELECT COALESCE(pg_catalog.max(t.sort_order), 0) + 1
        INTO v_sort_order
        FROM public.board_tasks t
        WHERE t.item_id = p_item_id;

        INSERT INTO public.board_tasks (
            item_id,
            organization_id,
            name,
            time_slot,
            required_volunteers,
            sort_order
        )
        VALUES (
            p_item_id,
            v_item.organization_id,
            v_task_clean,
            v_task_time,
            v_task_req,
            v_sort_order
        )
        RETURNING id INTO v_new_task_id;

        IF v_task_lead IS NOT NULL THEN
            INSERT INTO public.board_task_signups (
                task_id,
                item_id,
                organization_id,
                participant_name,
                role_type,
                notes
            )
            VALUES (
                v_new_task_id,
                p_item_id,
                v_item.organization_id,
                v_task_lead,
                'lead',
                'Nimetty vastuuhenkilö päätöksen yhteydessä'
            )
            ON CONFLICT (task_id, participant_name) DO NOTHING;
        END IF;
    END IF;

    -- 6. Audit-kirjaus
    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details
    )
    VALUES (
        v_item.organization_id,
        v_caller.out_member_id,
        v_caller.out_member_name,
        v_caller.out_authorized_role,
        'ITEM_DECIDED_WITH_TASK',
        'board_item',
        p_item_id::TEXT,
        pg_catalog.jsonb_build_object(
            'title', v_item.title,
            'old_stage', v_item.stage,
            'new_stage', v_target_stage,
            'decision_summary', v_decision_clean,
            'initial_task_id', v_new_task_id,
            'initial_task_name', v_task_clean
        )
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'item_id', p_item_id,
        'stage', v_target_stage,
        'decision_summary', v_decision_clean,
        'task_id', v_new_task_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_board_decision_with_task(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_board_decision_with_task(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT) TO anon, authenticated, service_role;

COMMIT;
