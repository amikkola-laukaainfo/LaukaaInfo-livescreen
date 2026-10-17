-- =============================================================================
-- 074_organization_governance_read_api.sql
-- LaukaaInfo – Organisaation hallinnon lukurajapinta (jäsenet, roolit, koodit)
-- =============================================================================
-- TILA: VALMIS AJETTAVAKSI (v1.0.0)
--
-- Tavoite:
--   Koska 072-migraatiossa organization_members-, role_assignments- ja
--   role_credentials -tauluissa on RLS-suojaus (FOR ALL USING false),
--   tarvitaan SECURITY DEFINER -lukurajapinta, jolla valtuutettu hallinto
--   (manage_governance -toimivalta, eli board_chair) voi ladata jäsenlistan,
--   aktiiviset roolit, koodien tilat sekä audit-tapahtumat turvallisesti.
--
-- Palauttaa JSONB-objektin:
--   - members: jäsenet, aktiiviset roolit, valtuuskoodin tila
--   - scope_items: avoimet tehtäväkohteet (scope_item_id -valintaan)
--   - recent_audit: tuoreimmat audit-kirjaukset
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_organization_governance_data(
    p_session_token   TEXT,
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_members        JSONB;
    v_items          JSONB;
    v_audit          JSONB;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istuntotunniste vaaditaan.');
    END IF;

    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_token_hash := pg_catalog.encode(
        extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex'
    );

    -- 1. Tarkistetaan organisaation ja kutsujan hallinto-oikeus (manage_governance: vain board_chair)
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash, p_organization_id, 'manage_governance'
    );

    -- 2. Haetaan jäsenet, heidän roolinsa ja valtuuskoodien tila
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', m.id,
            'full_name', m.full_name,
            'email', m.email,
            'phone', m.phone,
            'member_number', m.member_number,
            'is_active', m.is_active,
            'created_at', m.created_at,
            'roles', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', r.id,
                        'role_type', r.role_type,
                        'scope_item_id', r.scope_item_id,
                        'scope_item_title', (
                            SELECT bi.title FROM public.board_items bi WHERE bi.id = r.scope_item_id
                        ),
                        'is_active', r.is_active,
                        'valid_from', r.valid_from,
                        'valid_until', r.valid_until
                    )
                )
                FROM public.organization_role_assignments r
                WHERE r.member_id = m.id
                  AND r.organization_id = p_organization_id
                  AND r.is_active IS TRUE
                  AND r.valid_from <= now()
                  AND (r.valid_until IS NULL OR r.valid_until > now())
            ), '[]'::JSONB),
            'credential', (
                SELECT jsonb_build_object(
                    'id', c.id,
                    'is_active', (c.revoked_at IS NULL AND (c.locked_until IS NULL OR c.locked_until <= now())),
                    'is_locked', (c.locked_until IS NOT NULL AND c.locked_until > now()),
                    'is_revoked', (c.revoked_at IS NOT NULL),
                    'failed_attempts', c.failed_attempts,
                    'last_used_at', c.last_used_at,
                    'revoked_at', c.revoked_at
                )
                FROM public.organization_role_credentials c
                WHERE c.member_id = m.id
                  AND c.organization_id = p_organization_id
                  AND c.revoked_at IS NULL
                ORDER BY c.created_at DESC
                LIMIT 1
            )
        ) ORDER BY m.is_active DESC, m.full_name ASC
    ) INTO v_members
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id;

    -- 3. Haetaan kohteet joita voidaan käyttää scope_item_id -valinnassa (coordinator/lead)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', bi.id,
            'title', bi.title,
            'stage', bi.stage
        ) ORDER BY bi.created_at DESC
    ) INTO v_items
    FROM public.board_items bi
    WHERE bi.organization_id = p_organization_id
      AND (bi.stage IS NULL OR bi.stage NOT IN ('done', 'archived'));

    -- 4. Haetaan 20 tuoreinta audit-kirjausta
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', oga.id,
            'action', oga.action,
            'actor_name', oga.actor_name,
            'actor_role', oga.actor_role,
            'target_type', oga.target_type,
            'target_id', oga.target_id,
            'details', oga.details,
            'created_at', oga.created_at
        ) ORDER BY oga.created_at DESC
    ) INTO v_audit
    FROM (
        SELECT * FROM public.organization_governance_audit
        WHERE organization_id = p_organization_id
        ORDER BY created_at DESC
        LIMIT 20
    ) oga;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'caller', jsonb_build_object(
            'member_id', v_caller.out_member_id,
            'member_name', v_caller.out_member_name,
            'role', v_caller.out_authorized_role
        ),
        'members', COALESCE(v_members, '[]'::JSONB),
        'scope_items', COALESCE(v_items, '[]'::JSONB),
        'recent_audit', COALESCE(v_audit, '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_governance_data(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_governance_data(TEXT, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_organization_governance_data(TEXT, TEXT) IS
$$Palauttaa organisaation hallintodatan (jäsenet, aktiiviset roolit, valtuuskoodien tilat, scope-kohteet ja audit-lokin).
Vaatii manage_governance-toimivallan (puheenjohtajan henkilökohtainen rooli-istunto).
v1.0.0 — 074-migraatio$$;

COMMIT;
