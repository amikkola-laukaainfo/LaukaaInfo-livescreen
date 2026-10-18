-- =============================================================================
-- 078_board_suggestions_channel.sql
-- LaukaaInfo – Kuntalaisten ja jäsenten ehdotuskanava sekä hallituksen käsittelyjono
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Tavoite:
--   1. Kuntalaiset ja yhdistyksen jäsenet voivat jättää ideoita ja kehitysehdotuksia
--      matalalla kynnyksellä ilman salasanaa tai valtuuskoodia (submit_board_suggestion).
--   2. Ehdotukset ohjataan erilliseen käsittelyjonoon (board_suggestions), jotta ne
--      eivät sekoitu suoraan viralliseen päätös- ja toimeenpanolistaan (board_items).
--   3. Yhdistyksen hallitus (puheenjohtaja, hallituksen jäsenet, sihteeri) tai
--      järjestelmänvalvoja (admin) voi:
--      a) Tarkastella saapuneita ehdotuksia (get_board_suggestions).
--      b) Siirtää ehdotuksen asialistalle aktiiviseksi asiaksi (promote_board_suggestion_to_item).
--      c) Hylätä ehdotuksen perusteluineen (reject_board_suggestion).
--
-- Turvallisuusperiaatteet:
--   - RLS on päällä board_suggestions-taulussa; kaikki operaatiot kulkevat
--     SECURITY DEFINER -funktioiden kautta.
--   - Hakeminen ja käsittely vaativat joko voimassaolevan hallitusrooli-istunnon
--     ('manage_tasks') tai luotetun järjestelmänvalvojan identiteetin (user_roles.role = 'admin').
--   - Transaktiolukot (advisory lock) estävät rinnakkaisuuskilpajuoksut ja
--     seq_num -numeron kaksoiskappaleet board_items-taulussa.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TAULU: board_suggestions (Ehdotusjono)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_suggestions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    description          TEXT,
    author_name          TEXT NOT NULL DEFAULT 'Kuntalainen / Jäsen',
    author_contact       TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'rejected', 'archived')),
    promoted_item_id     UUID REFERENCES public.board_items(id) ON DELETE SET NULL,
    admin_notes          TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indeksit nopeaan suodatukseen ja listaukseen
CREATE INDEX IF NOT EXISTS idx_board_suggestions_org_status
    ON public.board_suggestions (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_suggestions_promoted_item
    ON public.board_suggestions (promoted_item_id)
    WHERE promoted_item_id IS NOT NULL;

-- RLS: Suljetaan suora selainkirjoitus ja -luku (false), toiminnot vain RPC:iden kautta
ALTER TABLE public.board_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'board_suggestions' AND policyname = 'board_suggestions_protect_direct'
    ) THEN
        CREATE POLICY board_suggestions_protect_direct ON public.board_suggestions
            FOR ALL USING (false);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. JULKINEN RPC: submit_board_suggestion
-- Matala kynnys: Kuka tahansa voi jättää idean organisaatiolle ilman koodia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_board_suggestion(
    p_organization_id TEXT,
    p_title           TEXT,
    p_description     TEXT DEFAULT NULL,
    p_author_name     TEXT DEFAULT NULL,
    p_author_contact  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_title          TEXT;
    v_description    TEXT;
    v_author_name    TEXT;
    v_author_contact TEXT;
    v_suggestion_id  UUID;
BEGIN
    -- Validointi: Organisaatio
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiota ei löydy.'
        );
    END IF;

    -- Validointi: Otsikko
    v_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF pg_catalog.length(v_title) < 3 OR pg_catalog.length(v_title) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Otsikon pituuden tulee olla 3–255 merkkiä.'
        );
    END IF;

    -- Validointi: Kuvaus
    v_description := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');
    IF v_description IS NOT NULL AND pg_catalog.length(v_description) > 10000 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kuvaus saa olla enintään 10 000 merkkiä.'
        );
    END IF;

    -- Nimi ja yhteystieto
    v_author_name := COALESCE(NULLIF(pg_catalog.btrim(p_author_name), ''), 'Kuntalainen / Jäsen');
    IF pg_catalog.length(v_author_name) > 100 THEN
        v_author_name := pg_catalog.substr(v_author_name, 1, 100);
    END IF;

    v_author_contact := NULLIF(pg_catalog.btrim(p_author_contact), '');
    IF v_author_contact IS NOT NULL AND pg_catalog.length(v_author_contact) > 150 THEN
        v_author_contact := pg_catalog.substr(v_author_contact, 1, 150);
    END IF;

    INSERT INTO public.board_suggestions (
        organization_id,
        title,
        description,
        author_name,
        author_contact,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        v_title,
        v_description,
        v_author_name,
        v_author_contact,
        'pending',
        now(),
        now()
    ) RETURNING id INTO v_suggestion_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'suggestion_id', v_suggestion_id,
        'message', 'Ehdotus vastaanotettu onnistuneesti! Hallitus käsittelee sen pian.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. HALLINNON RPC: get_board_suggestions
-- Listaa organisaation saapuneet ehdotukset hallitukselle tai adminille.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_board_suggestions(
    p_organization_id TEXT,
    p_session_token   TEXT DEFAULT NULL,
    p_status          TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash TEXT;
    v_is_admin   BOOLEAN := FALSE;
    v_caller     RECORD;
    v_status     TEXT;
    v_items      JSONB;
BEGIN
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    v_status := COALESCE(NULLIF(pg_catalog.btrim(p_status), ''), 'pending');

    -- 1. Tarkistetaan onko kutsuja järjestelmänvalvoja (auth.uid() -> user_roles)
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        ) INTO v_is_admin;
    END IF;

    -- 2. Jos ei järjestelmänvalvoja, tarkistetaan henkilökohtainen hallitusrooli
    IF NOT v_is_admin THEN
        IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty: Toiminto vaatii todennetun hallitusroolin tai järjestelmänvalvojan oikeudet.'
            );
        END IF;

        v_token_hash := pg_catalog.encode(
            extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
            'hex'
        );

        SELECT * INTO v_caller
        FROM public._verify_member_governance_permission(
            v_token_hash,
            p_organization_id,
            'manage_tasks',
            NULL::UUID
        );

        IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty: Istunnolla ei ole hallitusvaltuutusta.'
            );
        END IF;
    END IF;

    -- 3. Haetaan ehdotukset
    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', s.id,
                'organization_id', s.organization_id,
                'title', s.title,
                'description', s.description,
                'author_name', s.author_name,
                'author_contact', s.author_contact,
                'status', s.status,
                'promoted_item_id', s.promoted_item_id,
                'admin_notes', s.admin_notes,
                'created_at', s.created_at,
                'updated_at', s.updated_at
            ) ORDER BY s.created_at DESC
        ),
        '[]'::JSONB
    ) INTO v_items
    FROM public.board_suggestions AS s
    WHERE s.organization_id = p_organization_id
      AND (v_status = 'all' OR s.status = v_status);

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'organization_id', p_organization_id,
        'status_filter', v_status,
        'suggestions', v_items
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. HALLINNON RPC: promote_board_suggestion_to_item
-- Siirtää ehdotuksen käsittelyjonosta viralliseksi board_items -kohteeksi.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_board_suggestion_to_item(
    p_suggestion_id   UUID,
    p_session_token   TEXT DEFAULT NULL,
    p_stage           TEXT DEFAULT 'discussion',
    p_lead_name       TEXT DEFAULT NULL,
    p_deadline_at     TIMESTAMPTZ DEFAULT NULL,
    p_deadline_label  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sug               public.board_suggestions%ROWTYPE;
    v_org_id            TEXT;
    v_token_hash        TEXT;
    v_is_admin          BOOLEAN := FALSE;
    v_caller            RECORD;
    v_actor_member_id   UUID := NULL;
    v_actor_name        TEXT := 'Järjestelmänvalvoja';
    v_actor_role        TEXT := 'admin';
    v_new_item_id       UUID;
    v_seq               INT;
    v_stage             TEXT;
    v_lead_name         TEXT;
    v_deadline_label    TEXT;
    v_lock_namespace    INT := 1936028780;
BEGIN
    IF p_suggestion_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotustunniste (ID) puuttuu.'
        );
    END IF;

    -- Haetaan aluksi ehdotuksen organisaatio ilman lukkoa
    SELECT s.organization_id INTO v_org_id
    FROM public.board_suggestions AS s
    WHERE s.id = p_suggestion_id;

    IF v_org_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotusta ei löydy.'
        );
    END IF;

    -- Organisaatiokohtainen advisory-lukko samanaikaisten muutosten ja seq_num-ristiriitojen estoon
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(v_org_id));

    -- Tarkistetaan oikeudet: Admin tai hallitusrooli
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        ) INTO v_is_admin;
        IF v_is_admin THEN
            SELECT email INTO v_actor_name FROM auth.users WHERE id = auth.uid();
            v_actor_name := COALESCE(v_actor_name, 'Admin');
        END IF;
    END IF;

    IF NOT v_is_admin THEN
        IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Toiminto vaatii todennetun hallitusroolin tai järjestelmänvalvojan oikeudet.'
            );
        END IF;

        v_token_hash := pg_catalog.encode(
            extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
            'hex'
        );

        SELECT * INTO v_caller
        FROM public._verify_member_governance_permission(
            v_token_hash,
            v_org_id,
            'manage_tasks',
            NULL::UUID
        );

        IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty: Istunnolla ei ole oikeutta nostaa ehdotusta asialistalle.'
            );
        END IF;

        v_actor_member_id := v_caller.out_member_id;
        v_actor_name := v_caller.out_member_name;
        v_actor_role := v_caller.out_authorized_role;
    END IF;

    -- Lukitaan ehdotusrivi
    SELECT * INTO v_sug
    FROM public.board_suggestions
    WHERE id = p_suggestion_id
    FOR UPDATE;

    IF v_sug.status <> 'pending' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotus on jo käsitelty (tila: ' || v_sug.status || ').'
        );
    END IF;

    -- Validointi vaiheelle
    v_stage := COALESCE(p_stage, 'discussion');
    IF NOT (v_stage = ANY(ARRAY['idea', 'discussion', 'in_progress']::TEXT[])) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Aloitusvaiheeksi sallitaan vain: idea, discussion tai in_progress.'
        );
    END IF;

    v_lead_name := NULLIF(pg_catalog.btrim(p_lead_name), '');
    v_deadline_label := NULLIF(pg_catalog.btrim(p_deadline_label), '');

    -- Seuraava seq_num
    SELECT COALESCE(pg_catalog.max(seq_num), 0) + 1
    INTO v_seq
    FROM public.board_items
    WHERE organization_id = v_org_id;

    -- Luodaan virallinen board_item
    INSERT INTO public.board_items (
        organization_id,
        seq_num,
        title,
        description,
        stage,
        lead_name,
        deadline_at,
        deadline_label,
        created_by_name,
        is_published_to_wall,
        created_at,
        updated_at
    ) VALUES (
        v_org_id,
        v_seq,
        v_sug.title,
        v_sug.description,
        v_stage,
        v_lead_name,
        p_deadline_at,
        v_deadline_label,
        v_sug.author_name,
        FALSE,
        now(),
        now()
    ) RETURNING id INTO v_new_item_id;

    -- Päivitetään ehdotus hyväksytyksi
    UPDATE public.board_suggestions
    SET status = 'accepted',
        promoted_item_id = v_new_item_id,
        updated_at = now()
    WHERE id = p_suggestion_id;

    -- Audit-merkintä
    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_org_id,
        v_actor_member_id,
        v_actor_name,
        v_actor_role,
        'SUGGESTION_PROMOTED',
        'board_item',
        v_new_item_id::TEXT,
        pg_catalog.jsonb_build_object(
            'suggestion_id', p_suggestion_id,
            'seq_num', v_seq,
            'title', v_sug.title,
            'author_name', v_sug.author_name,
            'stage', v_stage
        ),
        now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'suggestion_id', p_suggestion_id,
        'item_id', v_new_item_id,
        'seq_num', v_seq,
        'stage', v_stage,
        'message', 'Ehdotus siirretty onnistuneesti toimintataulun asialistalle!'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. HALLINNON RPC: reject_board_suggestion
-- Merkitsee ehdotuksen hylätyksi perusteluineen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_board_suggestion(
    p_suggestion_id UUID,
    p_session_token TEXT DEFAULT NULL,
    p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sug             public.board_suggestions%ROWTYPE;
    v_org_id          TEXT;
    v_token_hash      TEXT;
    v_is_admin        BOOLEAN := FALSE;
    v_caller          RECORD;
    v_actor_member_id UUID := NULL;
    v_actor_name      TEXT := 'Järjestelmänvalvoja';
    v_actor_role      TEXT := 'admin';
    v_reason          TEXT;
    v_lock_namespace  INT := 1936028780;
BEGIN
    IF p_suggestion_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotustunniste (ID) puuttuu.'
        );
    END IF;

    SELECT s.organization_id INTO v_org_id
    FROM public.board_suggestions AS s
    WHERE s.id = p_suggestion_id;

    IF v_org_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotusta ei löydy.'
        );
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(v_org_id));

    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        ) INTO v_is_admin;
        IF v_is_admin THEN
            SELECT email INTO v_actor_name FROM auth.users WHERE id = auth.uid();
            v_actor_name := COALESCE(v_actor_name, 'Admin');
        END IF;
    END IF;

    IF NOT v_is_admin THEN
        IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Toiminto vaatii todennetun hallitusroolin tai järjestelmänvalvojan oikeudet.'
            );
        END IF;

        v_token_hash := pg_catalog.encode(
            extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
            'hex'
        );

        SELECT * INTO v_caller
        FROM public._verify_member_governance_permission(
            v_token_hash,
            v_org_id,
            'manage_tasks',
            NULL::UUID
        );

        IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty: Istunnolla ei ole oikeutta hylätä ehdotusta.'
            );
        END IF;

        v_actor_member_id := v_caller.out_member_id;
        v_actor_name := v_caller.out_member_name;
        v_actor_role := v_caller.out_authorized_role;
    END IF;

    SELECT * INTO v_sug
    FROM public.board_suggestions
    WHERE id = p_suggestion_id
    FOR UPDATE;

    IF v_sug.status <> 'pending' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Ehdotus on jo käsitelty (tila: ' || v_sug.status || ').'
        );
    END IF;

    v_reason := NULLIF(pg_catalog.btrim(p_reason), '');

    UPDATE public.board_suggestions
    SET status = 'rejected',
        admin_notes = v_reason,
        updated_at = now()
    WHERE id = p_suggestion_id;

    -- Audit-merkintä
    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details,
        created_at
    ) VALUES (
        v_org_id,
        v_actor_member_id,
        v_actor_name,
        v_actor_role,
        'SUGGESTION_REJECTED',
        'board_suggestion',
        p_suggestion_id::TEXT,
        pg_catalog.jsonb_build_object(
            'title', v_sug.title,
            'reason', v_reason
        ),
        now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'suggestion_id', p_suggestion_id,
        'message', 'Ehdotus merkitty hylätyksi.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. KÄYTTÖOIKEUDET (GRANTS)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_board_suggestion(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_board_suggestion(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_board_suggestions(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_suggestions(TEXT, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.promote_board_suggestion_to_item(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_board_suggestion_to_item(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reject_board_suggestion(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_board_suggestion(UUID, TEXT, TEXT) TO anon, authenticated;

COMMIT;
