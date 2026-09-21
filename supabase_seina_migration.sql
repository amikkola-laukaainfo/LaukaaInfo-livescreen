-- =====================================================
-- LAUKAAINFO SEINÄ & JULKAISUKERROS MIGRAATIO (V2 - Julkaisuavaimet & RPC-suojaus)
-- Aja tämä Supabasen SQL Editorissa.
-- =====================================================

-- 0. PGCRYPTO EXTENSION (Sallii SHA256-hashauksen)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ORGANISATIONS (Organisaatiot)
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    address TEXT,
    wall_visibility TEXT DEFAULT 'public', -- 'public' | 'link'
    type TEXT DEFAULT 'company', -- 'company' | 'association' | 'municipality'
    publisher_enabled BOOLEAN DEFAULT TRUE,
    publisher_code_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS publisher_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS publisher_code_version INT DEFAULT 1;

-- 2. ORGANIZATION PUBLISH CREDENTIALS (Palvelinpuolen hash-taltiointi)
CREATE TABLE IF NOT EXISTS public.organization_publish_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, -- SHA256 hash 8-merkkisestä avaimesta (esim. K7M4-X9P2)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- 3. POSTS (Julkaisut)
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'announcement', -- 'announcement' | 'event' | 'news' | 'offer' | 'request' | 'project' | 'general'
    visibility TEXT DEFAULT 'public', -- 'public' | 'link'
    status TEXT DEFAULT 'published', -- 'draft' | 'published' | 'archived'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    pinned_until TIMESTAMPTZ,
    is_pinned BOOLEAN DEFAULT FALSE,
    target_id TEXT,
    target_type TEXT, -- 'project' | 'event' | 'route' | 'place'
    image_url TEXT -- Legacy/fallback
);

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pinned_until TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS target_type TEXT;

-- 4. POST_PLACES (Julkaisun paikat)
CREATE TABLE IF NOT EXISTS public.post_places (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    relation TEXT DEFAULT 'venue', -- 'venue' | 'area' | 'municipality'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POST_THEMES (Julkaisun teemat/tagit)
CREATE TABLE IF NOT EXISTS public.post_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POST_MEDIA (0..N kuvat & videot)
CREATE TABLE IF NOT EXISTS public.post_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL, -- 'image' | 'video'
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    title TEXT,
    alt_text TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. POST_LINKS (0..N ulkoiset & sisäiset CTA-linkit)
CREATE TABLE IF NOT EXISTS public.post_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL, -- esim. 'Lue lisää', 'Ilmoittaudu', 'Katso video', 'Siirry projektiin'
    link_type TEXT DEFAULT 'external',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_publish_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read organizations" ON public.organizations;
CREATE POLICY "Public can read organizations" ON public.organizations FOR SELECT USING (true);

-- Credentials are secret (never readable by public client)
DROP POLICY IF EXISTS "No public access to credentials" ON public.organization_publish_credentials;
CREATE POLICY "No public access to credentials" ON public.organization_publish_credentials FOR SELECT USING (false);

DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT USING (
    (status = 'published' OR status = 'APPROVED' OR status IS NULL)
    AND (expires_at IS NULL OR expires_at > NOW())
);

DROP POLICY IF EXISTS "Public read post_places" ON public.post_places;
CREATE POLICY "Public read post_places" ON public.post_places FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_themes" ON public.post_themes;
CREATE POLICY "Public read post_themes" ON public.post_themes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_media" ON public.post_media;
CREATE POLICY "Public read post_media" ON public.post_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_links" ON public.post_links;
CREATE POLICY "Public read post_links" ON public.post_links FOR SELECT USING (true);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_posts_org_id ON public.posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_posts_status_visibility ON public.posts(status, visibility);
CREATE INDEX IF NOT EXISTS idx_cred_org_hash ON public.organization_publish_credentials(organization_id, code_hash);

-- =====================================================
-- SERVER-SIDE RPC FUNCTIONS (PALVELINPUOLEN TUNNISTUS)
-- =====================================================

-- RPC 1: Aseta/Generoi organisaatiolle julkaisuavain
CREATE OR REPLACE FUNCTION public.set_organization_publish_key(
    p_organization_id TEXT,
    p_raw_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_key TEXT;
    v_hash TEXT;
BEGIN
    v_clean_key := UPPER(REGEXP_REPLACE(p_raw_key, '[^A-Z0-9]', '', 'g'));
    
    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisuavaimen tulee olla vähintään 6 merkkiä long.');
    END IF;

    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- Merkitään vanhat avaimet peruutetuksi
    UPDATE public.organization_publish_credentials
    SET revoked_at = NOW()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    -- Taltioidaan uusi hash
    INSERT INTO public.organization_publish_credentials (organization_id, code_hash)
    VALUES (p_organization_id, v_hash);

    -- Varmistetaan että organisaatio on aktiivinen
    UPDATE public.organizations
    SET publisher_enabled = TRUE, updated_at = NOW()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'organization_id', p_organization_id);
END;
$$;

-- RPC 2: Tarkista julkaisuavain ilman julkaisemista (Sivun Login Check)
CREATE OR REPLACE FUNCTION public.verify_publisher_key(
    p_organization_id TEXT,
    p_publish_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_key TEXT;
    v_hash TEXT;
    v_enabled BOOLEAN;
    v_valid BOOLEAN := FALSE;
    v_org_name TEXT;
BEGIN
    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- Tarkistetaan organisaation tila
    SELECT name, publisher_enabled INTO v_org_name, v_enabled
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        -- Fallback jos organisaatio ei ole vielä tietokannassa
        v_org_name := 'Organisaatio ' || p_organization_id;
        v_enabled := TRUE;
    END IF;

    IF v_enabled IS FALSE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaation julkaisuoikeus on estetty.');
    END IF;

    -- Tarkistetaan avaimen hash (jos kantaan ei ole vielä asetettu avaimia, sallitaan alustusvaiheessa)
    IF NOT EXISTS (SELECT 1 FROM public.organization_publish_credentials WHERE organization_id = p_organization_id AND revoked_at IS NULL) THEN
        v_valid := TRUE; -- Demo/ensimmäinen alustus
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.organization_publish_credentials
            WHERE organization_id = p_organization_id
              AND code_hash = v_hash
              AND revoked_at IS NULL
        ) INTO v_valid;
    END IF;

    IF v_valid THEN
        RETURN jsonb_build_object('valid', true, 'org_name', v_org_name, 'org_id', p_organization_id);
    ELSE
        RETURN jsonb_build_object('valid', false, 'error', 'Virheellinen julkaisuavain.');
    END IF;
END;
$$;

-- RPC 3: Turvallinen julkaiseminen avainvarmistuksella (Server-side authorization)
CREATE OR REPLACE FUNCTION public.publish_post_with_key(
    p_organization_id TEXT,
    p_publish_key TEXT,
    p_title TEXT,
    p_content TEXT DEFAULT NULL,
    p_type TEXT DEFAULT 'announcement',
    p_visibility TEXT DEFAULT 'public',
    p_status TEXT DEFAULT 'published',
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_pinned_until TIMESTAMPTZ DEFAULT NULL,
    p_places JSONB DEFAULT '[]'::jsonb,
    p_themes JSONB DEFAULT '[]'::jsonb,
    p_media JSONB DEFAULT '[]'::jsonb,
    p_links JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res JSONB;
    v_post_id UUID;
    v_elem JSONB;
BEGIN
    -- 1. Palvelinpuolen avaintarkistus
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.'));
    END IF;

    -- 2. Luodaan uusi julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id, organization_id, title, content, type, visibility, status,
        expires_at, pinned_until, is_pinned, created_at, published_at
    ) VALUES (
        v_post_id, p_organization_id, p_title, p_content, p_type, p_visibility, p_status,
        p_expires_at, p_pinned_until, (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()), NOW(), NOW()
    );

    -- 3. Paikat
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            INSERT INTO public.post_places (post_id, place_id, relation)
            VALUES (v_post_id, COALESCE(v_elem->>'place_id', v_elem->>0, 'Laukaa'), COALESCE(v_elem->>'relation', 'venue'));
        END LOOP;
    END IF;

    -- 4. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            INSERT INTO public.post_themes (post_id, tag_id)
            VALUES (v_post_id, COALESCE(v_elem->>'tag_id', v_elem->>0));
        END LOOP;
    END IF;

    -- 5. Media (Kuvat / Videot)
    IF jsonb_array_length(p_media) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_media) LOOP
            IF (v_elem->>'url') IS NOT NULL AND LENGTH(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_media (post_id, media_type, url, title)
                VALUES (v_post_id, COALESCE(v_elem->>'media_type', 'image'), v_elem->>'url', v_elem->>'title');
            END IF;
        END LOOP;
    END IF;

    -- 6. Linkit
    IF jsonb_array_length(p_links) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links) LOOP
            IF (v_elem->>'url') IS NOT NULL AND LENGTH(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_links (post_id, url, title, link_type)
                VALUES (v_post_id, v_elem->>'url', COALESCE(v_elem->>'title', 'Lue lisää'), COALESCE(v_elem->>'link_type', 'external'));
            END IF;
        END LOOP;
    END IF;

    -- Päivitetään avaimen viimeisin käyttöaika
    UPDATE public.organization_publish_credentials
    SET last_used_at = NOW()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    RETURN jsonb_build_object('success', true, 'post_id', v_post_id, 'message', 'Julkaisu luotu onnistuneesti!');
END;
$$;

-- 5. RPC: Kiinnitä tai irrota kiinnitys julkaisuavaimella
CREATE OR REPLACE FUNCTION public.pin_post_with_key(
    p_organization_id TEXT,
    p_publish_key TEXT,
    p_post_id UUID,
    p_hours INT DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cred RECORD;
    v_post_org TEXT;
    v_pinned_until TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_cred
    FROM public.organization_publish_credentials
    WHERE organization_id = p_organization_id
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiolla ei ole voimassaolevaa julkaisuavainta');
    END IF;

    IF v_cred.key_hash <> encode(digest(p_publish_key, 'sha256'), 'hex') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen julkaisuavain');
    END IF;

    SELECT organization_id INTO v_post_org FROM public.posts WHERE id = p_post_id;
    IF v_post_org IS NULL OR v_post_org <> p_organization_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisu ei kuulu tälle organisaatiolle');
    END IF;

    IF p_hours > 0 THEN
        v_pinned_until := NOW() + (p_hours || ' hours')::INTERVAL;
        -- Irrotetaan aiemmat kiinnitykset saman organisaation julkaisuilta
        UPDATE public.posts SET is_pinned = FALSE, pinned_until = NULL WHERE organization_id = p_organization_id;
        -- Kiinnitetään valittu julkaisu
        UPDATE public.posts SET is_pinned = TRUE, pinned_until = v_pinned_until WHERE id = p_post_id;
    ELSE
        UPDATE public.posts SET is_pinned = FALSE, pinned_until = NULL WHERE id = p_post_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'pinned_until', v_pinned_until, 'message', CASE WHEN p_hours > 0 THEN 'Julkaisu kiinnitetty!' ELSE 'Kiinnitys irrotettu!' END);
END;
$$;

