-- =============================================================================
-- 076_board_item_lifecycle_and_archive.sql
-- LaukaaInfo – Päätös- ja toimintataulun elinkaari, arkistointi ja päätösloki
-- =============================================================================
-- TILA: VALMIS HYVÄKSYNTÄTESTATTAVAKSI (v1.0.0)
--
-- Edellyttää aiempia migraatioita:
--   070_toimintataulu_schema.sql
--   072_organization_roles_and_governance.sql
--   073_board_task_governance.sql
--   075_board_item_lifecycle.sql
--
-- Sisältää:
--   1. manage_board_item: Päivitetty tukemaan sekä henkilökohtaista rooli-istuntoa
--      että legacy-istuntoa, päätöskirjauksen tallennusta, valmiiksi merkitsemistä
--      ja arkistointia audit-lokituksella (ITEM_ARCHIVED, ITEM_DECIDED, ITEM_STAGE_CHANGED).
--   2. get_archived_board_items: RPC arkistoitujen asioiden hakuun.
--   3. delete_board_item: Turvallinen hallituksen poistorajapinta virheellisille
--      kohteille (vaatii puheenjohtajan, hallituksen jäsenen tai sihteerin roolin).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. manage_board_item (Elinkaarisiirtymät, päätöksen kirjaus, arkistointi)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.manage_board_item(
    p_session_token    TEXT,
    p_item_id          UUID,
    p_stage            TEXT,
    p_decision_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash        TEXT;
    v_item              RECORD;
    v_caller            RECORD;
    v_session_personal  RECORD;
    v_session_legacy    public.org_publisher_sessions;
    v_is_personal       BOOLEAN := FALSE;
    v_new_stage         TEXT;
    v_decision_clean    TEXT;
    v_audit_action      TEXT;
    v_audit_details     JSONB;
BEGIN
    ------------------------------------------------------------------
    -- 1. Parametrien validointi
    ------------------------------------------------------------------
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Istuntotunniste puuttuu.'
        );
    END IF;

    IF p_item_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kohteen tunniste puuttuu.'
        );
    END IF;

    v_new_stage := pg_catalog.btrim(COALESCE(p_stage, ''));
    IF v_new_stage NOT IN ('idea', 'discussion', 'vote', 'decided', 'in_progress', 'done', 'archived') THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Virheellinen tila: sallitut tilat ovat idea, discussion, vote, decided, in_progress, done, archived.'
        );
    END IF;

    v_decision_clean := pg_catalog.btrim(COALESCE(p_decision_summary, ''));

    ------------------------------------------------------------------
    -- 2. Kohderivin haku ja lukitus
    ------------------------------------------------------------------
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kohdetta ei löydy.'
        );
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(
            pg_catalog.btrim(p_session_token),
            'sha256'
        ),
        'hex'
    );

    ------------------------------------------------------------------
    -- 3. Tunnistustyypin selvitys (Personal role vs Legacy session)
    ------------------------------------------------------------------
    SELECT * INTO v_session_personal
    FROM public.org_publisher_sessions
    WHERE token_hash = v_token_hash
      AND organization_id = v_item.organization_id
      AND session_type = 'personal_role_code'
      AND revoked_at IS NULL
      AND expires_at > pg_catalog.clock_timestamp();

    IF FOUND THEN
        v_is_personal := TRUE;
    END IF;

    ------------------------------------------------------------------
    -- 4. Valtuutuksen tarkistus
    ------------------------------------------------------------------
    IF v_is_personal THEN
        -- Henkilökohtainen rooli: tarkistetaan toimivalta
        -- Päätöksen kirjaus ja arkistointi vaativat hallitustason (PJ, HJ, SI)
        IF v_new_stage IN ('decided', 'archived') OR (v_decision_clean <> '' AND v_new_stage = 'decided') THEN
            SELECT * INTO v_caller
            FROM public._verify_member_governance_permission(
                v_token_hash,
                v_item.organization_id,
                'record_decision',
                p_item_id
            );
        ELSE
            SELECT * INTO v_caller
            FROM public._verify_member_governance_permission(
                v_token_hash,
                v_item.organization_id,
                'change_stage',
                p_item_id
            );
        END IF;

        IF v_caller.out_member_id IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty. Rooli-istunnolla ei ole vaadittavaa toimivaltaa.'
            );
        END IF;
    ELSE
        -- Legacy-istunto fallback (yleinen PIN)
        -- Arkistointi on hallinnollinen toimenpide, jota ei sallita yleisellä PIN-koodilla
        IF v_new_stage = 'archived' THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Asian arkistointi vaatii henkilökohtaisen hallitusroolin (puheenjohtaja, hallituksen jäsen tai sihteeri).'
            );
        END IF;

        v_session_legacy := public._verify_org_session_internal(v_token_hash, v_item.organization_id);
        IF v_session_legacy IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Istunto ei ole voimassa tai käyttöoikeus puuttuu.'
            );
        END IF;
    END IF;

    ------------------------------------------------------------------
    -- 5. Tilamuutoksen ja päätöstekstin tallennus
    ------------------------------------------------------------------
    UPDATE public.board_items
    SET stage = v_new_stage,
        decision_summary = CASE
            WHEN v_decision_clean <> '' THEN v_decision_clean
            ELSE decision_summary
        END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_item_id;

    ------------------------------------------------------------------
    -- 6. Audit-loki henkilökohtaisille istunnoille
    ------------------------------------------------------------------
    IF v_is_personal THEN
        IF v_new_stage = 'archived' THEN
            v_audit_action := 'ITEM_ARCHIVED';
        ELSIF v_new_stage = 'decided' THEN
            v_audit_action := 'ITEM_DECIDED';
        ELSIF v_new_stage = 'done' THEN
            v_audit_action := 'ITEM_COMPLETED';
        ELSE
            v_audit_action := 'ITEM_STAGE_CHANGED';
        END IF;

        v_audit_details := pg_catalog.jsonb_build_object(
            'seq_num', v_item.seq_num,
            'title', v_item.title,
            'old_stage', v_item.stage,
            'new_stage', v_new_stage,
            'decision_summary', CASE WHEN v_decision_clean <> '' THEN v_decision_clean ELSE v_item.decision_summary END
        );

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
            v_audit_action,
            'board_item',
            p_item_id::TEXT,
            v_audit_details
        );
    END IF;

    ------------------------------------------------------------------
    -- 7. Vastaus
    ------------------------------------------------------------------
    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'item_id', p_item_id,
        'old_stage', v_item.stage,
        'new_stage', v_new_stage,
        'decision_summary', CASE WHEN v_decision_clean <> '' THEN v_decision_clean ELSE v_item.decision_summary END
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_board_item(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_board_item(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.manage_board_item(TEXT, UUID, TEXT, TEXT) IS
$$Päivittää toimintataulun asian tilaa ja päätöskirjausta.
Tukee henkilökohtaista rooli-istuntoa (audit-lokilla) ja legacy-istuntoa.
Arkistointi ('archived') ja päätöksen kirjaus ('decided') vaativat todennetun hallitusroolin.
v1.0.0 — 076-migraatio$$;


-- =============================================================================
-- 2. get_archived_board_items (Arkistoitujen asioiden haku)
-- =============================================================================
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
    ), '[]'::jsonb) INTO v_items
    FROM public.board_items i
    WHERE i.organization_id = p_organization_id
      AND i.stage = 'archived';

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'items', v_items,
        'count', pg_catalog.jsonb_array_length(v_items)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_archived_board_items(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_archived_board_items(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_archived_board_items(TEXT) IS
$$Palauttaa organisaation arkistoidut toimintataulun asiat päätöksineen ja äänestystuloksineen.
v1.0.0 — 076-migraatio$$;


-- =============================================================================
-- 3. delete_board_item (Kohteen pysyvä poisto hallitusvaltuudella)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.delete_board_item(
    p_session_token TEXT,
    p_item_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash TEXT;
    v_item       RECORD;
    v_caller     RECORD;
BEGIN
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Henkilökohtainen rooli-istunto puuttuu.'
        );
    END IF;

    IF p_item_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kohteen tunniste puuttuu.'
        );
    END IF;

    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Poistettavaa kohdetta ei löydy.'
        );
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(
            pg_catalog.btrim(p_session_token),
            'sha256'
        ),
        'hex'
    );

    -- Vaatii henkilökohtaisen hallitusroolin (record_decision: board_chair, board_member, secretary)
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        v_item.organization_id,
        'record_decision',
        p_item_id
    );

    IF v_caller.out_member_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Käyttöoikeus evätty. Asian poistaminen vaatii puheenjohtajan, hallituksen jäsenen tai sihteerin roolin.'
        );
    END IF;

    -- Kirjataan audit-tapahtuma ennen poistoa
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
        'ITEM_DELETED',
        'board_item',
        p_item_id::TEXT,
        pg_catalog.jsonb_build_object(
            'seq_num', v_item.seq_num,
            'title', v_item.title,
            'stage', v_item.stage
        )
    );

    -- Poistetaan kohde (viite-eheyden CASCADE poistaa automaattisesti kommentit, äänet ja tehtävät)
    DELETE FROM public.board_items
    WHERE id = p_item_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'deleted_item_id', p_item_id,
        'title', v_item.title
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_board_item(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_board_item(TEXT, UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_board_item(TEXT, UUID) IS
$$Poistaa toimintataulun asian ja sen kytkökset pysyvästi.
Vaatii voimassaolevan henkilökohtaisen rooli-istunnon (board_chair, board_member tai secretary).
Kirjaa automaattisesti ITEM_DELETED-tapahtuman hallinnon audit-lokiin.
v1.0.0 — 076-migraatio$$;

COMMIT;
