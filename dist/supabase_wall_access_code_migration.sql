-- =====================================================
-- LAUKAAINFO SEINÄ: ORGANISAATION AVAUSKOODI JA NÄKYVYYS -MIGRAATIO
-- Aja tämä Supabasen SQL Editorissa.
-- =====================================================

-- 1. ORGANISAATIOT: Avauskoodin hash ja oletusnäkyvyys
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS wall_access_code_hash TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS default_post_visibility TEXT DEFAULT 'public';

-- 2. JULKAISUT: Näkyvyyskenttä ja rajoite
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_posts_visibility'
    ) THEN
        ALTER TABLE public.posts ADD CONSTRAINT check_posts_visibility CHECK (visibility IN ('public', 'code_protected', 'link', 'private'));
    END IF;
END $$;

-- 3. RLS: Julkisten postausten lukulupa (Poistaa suojatut postaukset suorilta SELECT-kyselyiltä)
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT USING (
    (status = 'published' OR status = 'APPROVED' OR status IS NULL)
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (visibility = 'public' OR visibility IS NULL)
);

-- 4. RPC: Tarkista organisaation avauskoodin tila (Käyttöliittymää varten)
CREATE OR REPLACE FUNCTION public.get_org_wall_access_status(
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_code BOOLEAN;
    v_default_vis TEXT;
BEGIN
    SELECT 
        (wall_access_code_hash IS NOT NULL),
        COALESCE(default_post_visibility, 'public')
    INTO v_has_code, v_default_vis
    FROM public.organizations
    WHERE id = p_organization_id;

    RETURN jsonb_build_object(
        'success', true,
        'has_access_code', COALESCE(v_has_code, false),
        'default_post_visibility', COALESCE(v_default_vis, 'public')
    );
END;
$$;

-- 5. RPC: Aseta tai poista organisaation avauskoodi
CREATE OR REPLACE FUNCTION public.set_organization_wall_access_code(
    p_organization_id TEXT,
    p_publish_key TEXT,
    p_access_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res JSONB;
    v_clean_code TEXT;
    v_hash TEXT;
BEGIN
    -- Varmistetaan julkaisuavain
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.'));
    END IF;

    v_clean_code := UPPER(REGEXP_REPLACE(COALESCE(p_access_code, ''), '\s+', '', 'g'));

    IF v_clean_code = '' OR p_access_code IS NULL THEN
        -- Poistetaan avauskoodi käytöstä
        UPDATE public.organizations
        SET wall_access_code_hash = NULL, updated_at = NOW()
        WHERE id = p_organization_id;

        RETURN jsonb_build_object('success', true, 'has_access_code', false, 'message', 'Avauskoodi poistettu käytöstä.');
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Avauskoodin tulee olla vähintään 4 merkkiä pitkä.');
    END IF;

    v_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

    UPDATE public.organizations
    SET wall_access_code_hash = v_hash, updated_at = NOW()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'has_access_code', true, 'message', 'Avauskoodi asetettu onnistuneesti.');
END;
$$;

-- 6. RPC: Aseta organisaation julkaisujen oletusnäkyvyys
CREATE OR REPLACE FUNCTION public.set_organization_default_visibility(
    p_organization_id TEXT,
    p_publish_key TEXT,
    p_default_visibility TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res JSONB;
BEGIN
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.'));
    END IF;

    IF p_default_visibility NOT IN ('public', 'code_protected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen näkyvyysarvo.');
    END IF;

    UPDATE public.organizations
    SET default_post_visibility = p_default_visibility, updated_at = NOW()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'default_post_visibility', p_default_visibility);
END;
$$;

-- 7. RPC: Hae suojatut julkaisut oikealla avauskoodilla (Turvallinen DB-avaus)
CREATE OR REPLACE FUNCTION public.get_protected_org_posts(
    p_organization_id TEXT,
    p_access_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_code TEXT;
    v_hash TEXT;
    v_stored_hash TEXT;
    v_posts JSONB;
BEGIN
    v_clean_code := UPPER(REGEXP_REPLACE(COALESCE(p_access_code, ''), '\s+', '', 'g'));
    v_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

    SELECT wall_access_code_hash INTO v_stored_hash
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_stored_hash IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiolla ei ole asetettu avauskoodia.');
    END IF;

    IF v_stored_hash != v_hash THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen avauskoodi.');
    END IF;

    -- Avataan suojatut julkaisut ja palautetaan vain tarvittavat kentät
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'organization_id', p.organization_id,
            'title', p.title,
            'content', p.content,
            'type', p.type,
            'visibility', p.visibility,
            'status', p.status,
            'created_at', p.created_at,
            'published_at', p.published_at,
            'expires_at', p.expires_at,
            'is_pinned', p.is_pinned,
            'target_id', p.target_id,
            'target_type', p.target_type,
            'image_url', p.image_url,
            'event_start_at', p.event_start_at,
            'event_end_at', p.event_end_at,
            'event_all_day', p.event_all_day,
            'event_location_detail', p.event_location_detail,
            'event_registration_url', p.event_registration_url,
            'offer_start_at', p.offer_start_at,
            'offer_end_at', p.offer_end_at,
            'offer_terms', p.offer_terms
        ) ORDER BY p.created_at DESC
    ), '[]'::jsonb)
    INTO v_posts
    FROM public.posts p
    WHERE p.organization_id = p_organization_id
      AND p.visibility = 'code_protected'
      AND (p.status = 'published' OR p.status = 'APPROVED' OR p.status IS NULL)
      AND (p.expires_at IS NULL OR p.expires_at > NOW());

    RETURN jsonb_build_object('success', true, 'posts', v_posts);
END;
$$;
