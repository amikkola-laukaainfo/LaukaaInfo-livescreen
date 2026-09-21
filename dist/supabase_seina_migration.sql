-- =====================================================
-- LAUKAAINFO SEINÄ & JULKAISUKERROS MIGRAATIO
-- Aja tämä Supabasen SQL Editorissa.
-- =====================================================

-- 1. ORGANISATIONS (Organisaatiot)
CREATE TABLE IF NOT EXISTS public.organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    address TEXT,
    wall_visibility TEXT DEFAULT 'public', -- 'public' | 'link'
    type TEXT DEFAULT 'company', -- 'company' | 'association' | 'municipality'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. POSTS (Julkaisut)
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

-- Suoritetaan turvalliset sarakemuutokset jos `posts`-taulu on ollut aiemmin luotu eri sarakkeilla
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

-- 3. POST_PLACES (Julkaisun liitokset paikkoihin)
CREATE TABLE IF NOT EXISTS public.post_places (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    relation TEXT DEFAULT 'venue', -- 'venue' | 'area' | 'municipality'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. POST_THEMES (Julkaisun liitokset teemoihin/tageihin)
CREATE TABLE IF NOT EXISTS public.post_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POST_MEDIA (0..N kuvat & videot)
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

-- 6. POST_LINKS (0..N ulkoiset & sisäiset CTA-linkit)
CREATE TABLE IF NOT EXISTS public.post_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL, -- esim. 'Lue lisää', 'Ilmoittaudu', 'Katso video', 'Siirry projektiin'
    link_type TEXT DEFAULT 'external', -- 'external' | 'project' | 'place' | 'event' | 'route' | 'organization'
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_links ENABLE ROW LEVEL SECURITY;

-- Organizations read policy
DROP POLICY IF EXISTS "Public can read organizations" ON public.organizations;
CREATE POLICY "Public can read organizations" ON public.organizations
    FOR SELECT USING (true);

-- Posts read policy:
-- 1. Yleiselle seinälle: visibility = 'public' AND status = 'published' AND (expires_at IS NULL OR expires_at > NOW())
-- 2. Suoralla organisaatiokyselyllä (org_id): status = 'published' AND (expires_at IS NULL OR expires_at > NOW())
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts
    FOR SELECT USING (
        (status = 'published' OR status = 'APPROVED' OR status IS NULL)
        AND (expires_at IS NULL OR expires_at > NOW())
    );

-- Post Places, Themes, Media, Links read policies
DROP POLICY IF EXISTS "Public read post_places" ON public.post_places;
CREATE POLICY "Public read post_places" ON public.post_places FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_themes" ON public.post_themes;
CREATE POLICY "Public read post_themes" ON public.post_themes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_media" ON public.post_media;
CREATE POLICY "Public read post_media" ON public.post_media FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read post_links" ON public.post_links;
CREATE POLICY "Public read post_links" ON public.post_links FOR SELECT USING (true);

-- Indexes for optimal querying
CREATE INDEX IF NOT EXISTS idx_posts_org_id ON public.posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_posts_status_visibility ON public.posts(status, visibility);
CREATE INDEX IF NOT EXISTS idx_post_places_post_id ON public.post_places(post_id);
CREATE INDEX IF NOT EXISTS idx_post_themes_post_id ON public.post_themes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON public.post_media(post_id);
CREATE INDEX IF NOT EXISTS idx_post_links_post_id ON public.post_links(post_id);
