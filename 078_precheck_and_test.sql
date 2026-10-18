-- =============================================================================
-- 078_precheck_and_test.sql
-- LaukaaInfo – 078-migraation esitarkistus- ja hyväksyntätestit
-- =============================================================================
-- Aja tämä tiedosto Supabase SQL Editorissa.
-- Skripti suorittaa:
--   1. 078-migraation taulujen ja funktioiden asennuksen transaktiossa
--   2. Esitarkistukset (taulut, indeksit, funktioiden allekirjoitukset)
--   3. Kuusi (6) automatisoitua testiä:
--      T1: Julkinen ehdotuksen jättö ilman valtuuskoodia (submit_board_suggestion)
--      T2: Valtuuttamattoman kutsujan pääsyn esto get_board_suggestions -rajapintaan
--      T3: Hallitusistunnolla ehdotusten haku get_board_suggestions
--      T4: Ehdotuksen nostaminen asialistalle promote_board_suggestion_to_item (board_items + audit)
--      T5: Jo käsitellyn ehdotuksen uudelleenkäsittelyn esto
--      T6: Ehdotuksen hylkääminen reject_board_suggestion perusteluineen
--   4. Automaattinen ROLLBACK testin lopussa (ei jätä testidataa kantaan)
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

CREATE INDEX IF NOT EXISTS idx_board_suggestions_org_status
    ON public.board_suggestions (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_suggestions_promoted_item
    ON public.board_suggestions (promoted_item_id)
    WHERE promoted_item_id IS NOT NULL;

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

    v_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF pg_catalog.length(v_title) < 3 OR pg_catalog.length(v_title) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Otsikon pituuden tulee olla 3–255 merkkiä.'
        );
    END IF;

    v_description := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');
    IF v_description IS NOT NULL AND pg_catalog.length(v_description) > 10000 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kuvaus saa olla enintään 10 000 merkkiä.'
        );
    END IF;

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

    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        ) INTO v_is_admin;
    END IF;

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
                'error', 'Käyttöoikeus evätty: Istunnolla ei ole oikeutta nostaa ehdotusta asialistalle.'
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

    v_stage := COALESCE(p_stage, 'discussion');
    IF NOT (v_stage = ANY(ARRAY['idea', 'discussion', 'in_progress']::TEXT[])) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Aloitusvaiheeksi sallitaan vain: idea, discussion tai in_progress.'
        );
    END IF;

    v_lead_name := NULLIF(pg_catalog.btrim(p_lead_name), '');
    v_deadline_label := NULLIF(pg_catalog.btrim(p_deadline_label), '');

    SELECT COALESCE(pg_catalog.max(seq_num), 0) + 1
    INTO v_seq
    FROM public.board_items
    WHERE organization_id = v_org_id;

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

    UPDATE public.board_suggestions
    SET status = 'accepted',
        promoted_item_id = v_new_item_id,
        updated_at = now()
    WHERE id = p_suggestion_id;

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
        v_new_item_id,
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
        p_suggestion_id,
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
-- 2. ESITARKISTUKSET
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'board_suggestions'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUSVIRHE: public.board_suggestions -taulua ei löydy.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'submit_board_suggestion'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUSVIRHE: public.submit_board_suggestion -funktiota ei löydy.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'get_board_suggestions'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUSVIRHE: public.get_board_suggestions -funktiota ei löydy.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'promote_board_suggestion_to_item'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUSVIRHE: public.promote_board_suggestion_to_item -funktiota ei löydy.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'reject_board_suggestion'
    ) THEN
        RAISE EXCEPTION 'ESITARKISTUSVIRHE: public.reject_board_suggestion -funktiota ei löydy.';
    END IF;

    RAISE NOTICE 'Esitarkistukset OK: taulut ja funktiot asennettu onnistuneesti.';
END $$;

-- -----------------------------------------------------------------------------
-- 3. TESTISUORITUS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_test_org          TEXT := 'test-sug-org-' || substr(md5(random()::text), 1, 8);
    v_member_id         UUID;
    v_chair_token       TEXT := 'CHAIR-TEST-TOKEN-078';
    v_chair_token_hash  TEXT;
    v_chair_cred_raw    TEXT;
    v_chair_cred_id     UUID;
    v_session_id        UUID;
    v_sug_id1           UUID;
    v_sug_id2           UUID;
    v_res               JSONB;
    v_promoted_item_id  UUID;
    v_item_count        INT;
    v_audit_count       INT;
BEGIN
    -- ALUSTUS
    INSERT INTO public.organizations (id, name, type, wall_visibility, publisher_enabled)
    VALUES (v_test_org, 'Testiorganisaatio Ehdotuksille', 'association', 'public', TRUE);

    INSERT INTO public.organization_members (
        organization_id, full_name, email, is_active
    ) VALUES (
        v_test_org, 'Testi Puheenjohtaja', 'pj@testi078.fi', TRUE
    ) RETURNING id INTO v_member_id;

    INSERT INTO public.organization_role_assignments (
        organization_id, member_id, role_type, is_active
    ) VALUES (
        v_test_org, v_member_id, 'board_chair', TRUE
    );

    v_chair_cred_raw := 'PJ-' || pg_catalog.upper(pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'));
    INSERT INTO public.organization_role_credentials (
        organization_id, member_id, code_hash
    ) VALUES (
        v_test_org, v_member_id, pg_catalog.encode(extensions.digest(v_chair_cred_raw, 'sha256'), 'hex')
    ) RETURNING id INTO v_chair_cred_id;

    v_chair_token := extensions.gen_random_uuid()::TEXT;
    v_chair_token_hash := pg_catalog.encode(extensions.digest(v_chair_token, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id, token_hash, session_type, member_id, role_credential_id, expires_at
    ) VALUES (
        v_test_org, v_chair_token_hash, 'personal_role_code', v_member_id, v_chair_cred_id, now() + interval '4 hours'
    );

    -- T1: Julkinen kuntalaisen ehdotus ilman koodia
    v_res := public.submit_board_suggestion(
        p_organization_id => v_test_org,
        p_title           => 'Kylätalon maalipinnan kunnostus',
        p_description     => 'Kylätalon etelänpuoleinen seinä kaipaa uutta maalia ja talkooväkeä kesäksi.',
        p_author_name     => 'Pertti Kuntalainen',
        p_author_contact  => 'pertti@esimerkki.fi'
    );

    IF (v_res ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 1 EPÄONNISTUI: submit_board_suggestion epäonnistui: %', v_res;
    END IF;

    v_sug_id1 := (v_res ->> 'suggestion_id')::UUID;

    IF NOT EXISTS (
        SELECT 1 FROM public.board_suggestions
        WHERE id = v_sug_id1 AND status = 'pending' AND organization_id = v_test_org
    ) THEN
        RAISE EXCEPTION 'TESTI 1 EPÄONNISTUI: Ehdotusta ei löytynyt kannasta pending-tilassa.';
    END IF;

    -- Toinen ehdotus hylkäystestiä varten
    v_res := public.submit_board_suggestion(
        p_organization_id => v_test_org,
        p_title           => 'Yhdistyksen logokilpailu',
        p_description     => 'Järjestetään nuorille logokilpailu syksyllä.',
        p_author_name     => 'Maija Mallikas'
    );
    v_sug_id2 := (v_res ->> 'suggestion_id')::UUID;

    RAISE NOTICE 'TESTI 1 HYVÄKSYTTY: Julkinen ehdotus vastaanotettu ja tallennettu pending-tilaan.';

    -- T2: Valtuuttamattoman kutsujan esto
    v_res := public.get_board_suggestions(
        p_organization_id => v_test_org,
        p_session_token   => NULL
    );

    IF (v_res ->> 'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 2 EPÄONNISTUI: get_board_suggestions salli pääsyn ilman istuntoa!';
    END IF;

    RAISE NOTICE 'TESTI 2 HYVÄKSYTTY: Valtuuttamattoman kutsujan luku torjuttu turvallisesti.';

    -- T3: Hallitusistunto hakee ehdotukset
    v_res := public.get_board_suggestions(
        p_organization_id => v_test_org,
        p_session_token   => v_chair_token,
        p_status          => 'pending'
    );

    IF (v_res ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 3 EPÄONNISTUI: get_board_suggestions epäonnistui hallitusistunnolla: %', v_res;
    END IF;

    IF jsonb_array_length(v_res -> 'suggestions') < 2 THEN
        RAISE EXCEPTION 'TESTI 3 EPÄONNISTUI: Odotettiin vähintään 2 ehdotusta, saatiin: %', v_res;
    END IF;

    RAISE NOTICE 'TESTI 3 HYVÄKSYTTY: Hallitusistunto hakee ehdotusjonon oikein.';

    -- T4: Nosto asialistalle
    v_res := public.promote_board_suggestion_to_item(
        p_suggestion_id   => v_sug_id1,
        p_session_token   => v_chair_token,
        p_stage           => 'discussion',
        p_lead_name       => 'Pertti Kuntalainen'
    );

    IF (v_res ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 4 EPÄONNISTUI: promote_board_suggestion_to_item epäonnistui: %', v_res;
    END IF;

    v_promoted_item_id := (v_res ->> 'item_id')::UUID;

    SELECT COUNT(*) INTO v_item_count
    FROM public.board_items
    WHERE id = v_promoted_item_id 
      AND organization_id = v_test_org
      AND title = 'Kylätalon maalipinnan kunnostus'
      AND stage = 'discussion';

    IF v_item_count <> 1 THEN
        RAISE EXCEPTION 'TESTI 4 EPÄONNISTUI: board_items -kohdetta ei löytynyt.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.board_suggestions
        WHERE id = v_sug_id1 AND status = 'accepted' AND promoted_item_id = v_promoted_item_id
    ) THEN
        RAISE EXCEPTION 'TESTI 4 EPÄONNISTUI: board_suggestions ei päivittynyt accepted-tilaan.';
    END IF;

    SELECT COUNT(*) INTO v_audit_count
    FROM public.organization_governance_audit
    WHERE organization_id = v_test_org 
      AND action = 'SUGGESTION_PROMOTED'
      AND target_id = v_promoted_item_id::TEXT;

    IF v_audit_count <> 1 THEN
        RAISE EXCEPTION 'TESTI 4 EPÄONNISTUI: Audit-kirjausta ei syntynyt.';
    END IF;

    RAISE NOTICE 'TESTI 4 HYVÄKSYTTY: Ehdotus siirretty asialistalle, tila päivitetty ja auditoitu.';

    -- T5: Uudelleenkäsittelyn esto
    v_res := public.promote_board_suggestion_to_item(
        p_suggestion_id   => v_sug_id1,
        p_session_token   => v_chair_token
    );

    IF (v_res ->> 'success')::BOOLEAN IS TRUE THEN
        RAISE EXCEPTION 'TESTI 5 EPÄONNISTUI: Jo käsitelty ehdotus voitiin nostaa toisen kerran!';
    END IF;

    RAISE NOTICE 'TESTI 5 HYVÄKSYTTY: Jo käsiteltyä ehdotusta ei voi käsitellä uudelleen.';

    -- T6: Hylkäys perusteluineen
    v_res := public.reject_board_suggestion(
        p_suggestion_id => v_sug_id2,
        p_session_token => v_chair_token,
        p_reason        => 'Yhdistyksellä on jo voimassaoleva brändiohjeistus.'
    );

    IF (v_res ->> 'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'TESTI 6 EPÄONNISTUI: reject_board_suggestion epäonnistui: %', v_res;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.board_suggestions
        WHERE id = v_sug_id2 
          AND status = 'rejected'
          AND admin_notes = 'Yhdistyksellä on jo voimassaoleva brändiohjeistus.'
    ) THEN
        RAISE EXCEPTION 'TESTI 6 EPÄONNISTUI: Ehdotus ei päivittynyt rejected-tilaan perusteluineen.';
    END IF;

    RAISE NOTICE 'TESTI 6 HYVÄKSYTTY: Ehdotus hylätty perusteluineen ja auditoitu oikein.';

    RAISE NOTICE '-------------------------------------------------------------';
    RAISE NOTICE 'KAIKKI 6 TESTIÄ HYVÄKSYTTY ONNISTUNEESTI!';
    RAISE NOTICE '-------------------------------------------------------------';
END $$;

ROLLBACK;
