-- =============================================================================
-- 082_board_items_decision_level.sql
-- LaukaaInfo – Päätöstasot A/B/C toimintataululle
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Tämä migraatio tuo päätös- ja toimintataululle päätöstasot (A/B/C):
--   - survey:  A — Suuntaa-antava kysely (Kartoittaa mielipiteitä, ei sido)
--   - choice:  B — Ryhmän yhteinen valinta (Sovitaan käytännön asioista, oletus)
--   - formal:  C — Dokumentoitava päätös (Hankinta, sääntöasia, virallinen ratkaisu)
--
-- Taso erottaa asian käsittelytavan sen etenemisvaiheesta (stage).
-- Nykyinen stage-logiikka (idea, discussion, vote, decided, in_progress, done, archived)
-- säilyy täysin ennallaan ja 100 % taaksepäin yhteensopivana.
--
-- Riippuvuudet:
--   - 070_toimintataulu_schema.sql
--   - 075_board_item_lifecycle.sql
--   - 076_board_item_lifecycle_and_archive.sql
--   - 081_create_or_activate_organization_rpc.sql
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Lisätään decision_level -sarake ja eheysrajoite
-- -----------------------------------------------------------------------------
ALTER TABLE public.board_items
    ADD COLUMN IF NOT EXISTS decision_level TEXT NOT NULL DEFAULT 'choice';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.board_items'::regclass
          AND conname = 'board_items_decision_level_check'
    ) THEN
        ALTER TABLE public.board_items
            ADD CONSTRAINT board_items_decision_level_check
            CHECK (decision_level IN ('survey', 'choice', 'formal'));
    END IF;
END $$;

COMMENT ON COLUMN public.board_items.decision_level IS
$$Asian päätöstaso / käsittelyluonne:
  - survey: A — Suuntaa-antava kysely (ei sido)
  - choice: B — Ryhmän yhteinen valinta (vapaamuotoinen yhteinen sopimus)
  - formal: C — Dokumentoitava päätös (määrämuotoinen ratkaisu, hankinta tms.)$$;

-- -----------------------------------------------------------------------------
-- 2. Päivitetään create_board_item tukemaan valinnaista p_decision_level -arvoa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_board_item(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_title           TEXT,
    p_description     TEXT DEFAULT NULL,
    p_stage           TEXT DEFAULT 'idea',
    p_lead_name       TEXT DEFAULT NULL,
    p_deadline_at     TIMESTAMPTZ DEFAULT NULL,
    p_deadline_label  TEXT DEFAULT NULL,
    p_decision_level  TEXT DEFAULT 'choice'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_new_id         UUID;
    v_seq            INT;
    v_title          TEXT;
    v_description    TEXT;
    v_lead_name      TEXT;
    v_deadline_label TEXT;
    v_stage          TEXT;
    v_decision_level TEXT;
BEGIN
    ------------------------------------------------------------------
    -- 1. Pakollisten tunnisteiden validointi
    ------------------------------------------------------------------
    IF p_organization_id IS NULL
       OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    IF p_session_token IS NULL
       OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Henkilökohtainen rooli-istunto puuttuu.'
        );
    END IF;

    ------------------------------------------------------------------
    -- 2. Kenttien validointi
    ------------------------------------------------------------------
    v_title := pg_catalog.btrim(COALESCE(p_title, ''));

    IF pg_catalog.length(v_title) < 3
       OR pg_catalog.length(v_title) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Otsikon pituuden tulee olla 3–255 merkkiä.'
        );
    END IF;

    v_description := NULLIF(pg_catalog.btrim(p_description), '');
    IF v_description IS NOT NULL AND pg_catalog.length(v_description) > 10000 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kuvaus saa olla enintään 10 000 merkkiä.'
        );
    END IF;

    v_lead_name := NULLIF(pg_catalog.btrim(p_lead_name), '');
    IF v_lead_name IS NOT NULL AND pg_catalog.length(v_lead_name) > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Vastuuhenkilön nimi saa olla enintään 100 merkkiä.'
        );
    END IF;

    v_deadline_label := NULLIF(pg_catalog.btrim(p_deadline_label), '');
    IF v_deadline_label IS NOT NULL AND pg_catalog.length(v_deadline_label) > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Määräajan kuvauksen pituus saa olla enintään 100 merkkiä.'
        );
    END IF;

    ------------------------------------------------------------------
    -- 3. Vaiheen ja päätöstason validointi
    ------------------------------------------------------------------
    v_stage := pg_catalog.btrim(COALESCE(p_stage, 'idea'));
    IF v_stage NOT IN ('idea', 'discussion', 'in_progress') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Uusi asia voidaan luoda vain vaiheisiin: idea, discussion tai in_progress.'
        );
    END IF;

    v_decision_level := pg_catalog.btrim(COALESCE(p_decision_level, 'choice'));
    IF v_decision_level NOT IN ('survey', 'choice', 'formal') THEN
        v_decision_level := 'choice';
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(
            pg_catalog.btrim(p_session_token),
            'sha256'
        ),
        'hex'
    );

    ------------------------------------------------------------------
    -- 4. Valtuutus ja lukitus
    ------------------------------------------------------------------
    SELECT *
    INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        p_organization_id,
        'manage_tasks',
        NULL::UUID
    );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Istunnolla ei ole oikeutta luoda toimintatauluasiaa.';
    END IF;

    IF v_caller.out_member_id IS NULL
       OR v_caller.out_organization_id
            IS DISTINCT FROM p_organization_id THEN
        RAISE EXCEPTION
            'Rooli-istunnon organisaatiotiedot eivät täsmää.';
    END IF;

    ------------------------------------------------------------------
    -- 5. Organisaatiokohtainen järjestysnumero
    ------------------------------------------------------------------
    SELECT COALESCE(pg_catalog.max(bi.seq_num), 0) + 1
    INTO v_seq
    FROM public.board_items AS bi
    WHERE bi.organization_id = p_organization_id;

    ------------------------------------------------------------------
    -- 6. Uuden asian tallennus päätöstasoineen
    ------------------------------------------------------------------
    INSERT INTO public.board_items (
        organization_id,
        seq_num,
        title,
        description,
        stage,
        lead_name,
        deadline_at,
        deadline_label,
        decision_level,
        created_by_name
    )
    VALUES (
        p_organization_id,
        v_seq,
        v_title,
        v_description,
        v_stage,
        v_lead_name,
        p_deadline_at,
        v_deadline_label,
        v_decision_level,
        pg_catalog.format(
            '%s (%s)',
            v_caller.out_member_name,
            v_caller.out_authorized_role
        )
    )
    RETURNING id INTO v_new_id;

    ------------------------------------------------------------------
    -- 7. Auditointi
    ------------------------------------------------------------------
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
        p_organization_id,
        v_caller.out_member_id,
        v_caller.out_member_name,
        v_caller.out_authorized_role,
        'ITEM_CREATED',
        'board_item',
        v_new_id::TEXT,
        pg_catalog.jsonb_build_object(
            'title', v_title,
            'stage', v_stage,
            'decision_level', v_decision_level,
            'seq_num', v_seq
        )
    );

    ------------------------------------------------------------------
    -- 8. Onnistumisvastaus
    ------------------------------------------------------------------
    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'item_id', v_new_id,
        'seq_num', v_seq,
        'stage', v_stage,
        'decision_level', v_decision_level
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_board_item(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_board_item(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Päivitetään get_board_data palauttamaan decision_level ja sen selite
-- -----------------------------------------------------------------------------
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
            'decision_level', COALESCE(i.decision_level, 'choice'),
            'decision_level_name', CASE COALESCE(i.decision_level, 'choice')
                WHEN 'survey' THEN 'Suuntaa-antava kysely'
                WHEN 'formal' THEN 'Dokumentoitava päätös'
                ELSE 'Ryhmän yhteinen valinta'
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

-- -----------------------------------------------------------------------------
-- 4. Päivitetään get_archived_board_items palauttamaan decision_level
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_archived_board_items(
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_org_name TEXT;
    v_items    JSONB;
BEGIN
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    SELECT name INTO v_org_name
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiota ei löydy.'
        );
    END IF;

    SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', i.id,
            'seq', 'ASIA ' || pg_catalog.lpad(i.seq_num::TEXT, 2, '0'),
            'seq_num', i.seq_num,
            'title', i.title,
            'description', i.description,
            'stage', i.stage,
            'stage_name', 'Arkistoitu',
            'decision_level', COALESCE(i.decision_level, 'choice'),
            'decision_level_name', CASE COALESCE(i.decision_level, 'choice')
                WHEN 'survey' THEN 'Suuntaa-antava kysely'
                WHEN 'formal' THEN 'Dokumentoitava päätös'
                ELSE 'Ryhmän yhteinen valinta'
            END,
            'lead', i.lead_name,
            'deadline', pg_catalog.to_char(i.deadline_at, 'DD.MM.YYYY'),
            'deadline_label', COALESCE(i.deadline_label, pg_catalog.to_char(i.deadline_at, 'DD.MM.YYYY')),
            'decision_summary', i.decision_summary,
            'is_published_to_wall', i.is_published_to_wall,
            'created_at', i.created_at,
            'updated_at', i.updated_at,
            'comments_count', (SELECT pg_catalog.count(*) FROM public.board_comments c WHERE c.item_id = i.id),
            'votes', (
                SELECT pg_catalog.jsonb_build_object(
                    'yes', pg_catalog.count(*) FILTER (WHERE choice = 'yes'),
                    'no', pg_catalog.count(*) FILTER (WHERE choice = 'no'),
                    'cond', pg_catalog.count(*) FILTER (WHERE choice = 'cond'),
                    'total', pg_catalog.count(*)
                )
                FROM public.board_votes v
                WHERE v.item_id = i.id
            ),
            'tasks', COALESCE((
                SELECT pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'id', t.id,
                        'name', t.name,
                        'required', t.required_volunteers,
                        'time', t.time_slot,
                        'signups', COALESCE((
                            SELECT pg_catalog.jsonb_agg(s.participant_name ORDER BY s.created_at ASC)
                            FROM public.board_task_signups s
                            WHERE s.task_id = t.id
                        ), '[]'::jsonb)
                    ) ORDER BY t.sort_order ASC, t.created_at ASC
                )
                FROM public.board_tasks t
                WHERE t.item_id = i.id
            ), '[]'::jsonb)
        ) ORDER BY i.seq_num DESC, i.updated_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM public.board_items i
    WHERE i.organization_id = p_organization_id
      AND i.stage = 'archived';

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'items', v_items
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_archived_board_items(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_archived_board_items(TEXT) TO anon, authenticated, service_role;

COMMIT;
