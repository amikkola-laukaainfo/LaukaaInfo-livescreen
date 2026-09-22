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
    image_url TEXT, -- Legacy/fallback
    -- Tapahtuman dynaamiset kentät
    event_start_at TIMESTAMPTZ,
    event_end_at TIMESTAMPTZ,
    event_all_day BOOLEAN DEFAULT FALSE,
    event_location_detail TEXT,
    event_registration_url TEXT,
    -- Tarjouksen dynaamiset kentät
    offer_start_at TIMESTAMPTZ,
    offer_end_at TIMESTAMPTZ,
    offer_terms TEXT
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
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cleanup_attempts INT DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cleanup_last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cleanup_error TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_start_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_end_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_all_day BOOLEAN DEFAULT FALSE;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_location_detail TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_registration_url TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS offer_start_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS offer_end_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS offer_terms TEXT;

-- 4. POST_ATTACHMENTS (Keskitetty liiterekisteri: kuvat, PDF:t, YouTube-videot)
CREATE TABLE IF NOT EXISTS public.post_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'image' | 'pdf' | 'youtube'
    provider TEXT NOT NULL, -- 'imagekit' | 'supabase' | 'youtube'
    storage_path TEXT, -- PDF: publication-files/{post_id}/{attachment_id}.pdf
    imagekit_file_id TEXT, -- Kuva: ImageKit tiedostotunniste poistoa varten
    youtube_video_id TEXT, -- YouTube: Puhdas ID esim. ABC123
    url TEXT NOT NULL,
    file_name TEXT, -- Alkuperäinen tiedostonimi esim. Jasenkirje-2026.pdf
    mime_type TEXT,
    file_size BIGINT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POST_PLACES (Julkaisun paikat)
CREATE TABLE IF NOT EXISTS public.post_places (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    relation TEXT DEFAULT 'venue', -- 'venue' | 'area' | 'municipality'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POST_THEMES (Julkaisun teemat/tagit)
CREATE TABLE IF NOT EXISTS public.post_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. POST_MEDIA (Legacy/fallback media)
CREATE TABLE IF NOT EXISTS public.post_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    title TEXT,
    alt_text TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. POST_LINKS (CTA-linkit)
CREATE TABLE IF NOT EXISTS public.post_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
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
ALTER TABLE public.post_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read organizations" ON public.organizations;
CREATE POLICY "Public can read organizations" ON public.organizations FOR SELECT USING (true);

-- Credentials are secret
DROP POLICY IF EXISTS "No public access to credentials" ON public.organization_publish_credentials;
CREATE POLICY "No public access to credentials" ON public.organization_publish_credentials FOR SELECT USING (false);

DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT USING (
    (status = 'published' OR status = 'APPROVED' OR status IS NULL)
    AND (expires_at IS NULL OR expires_at > NOW())
);

DROP POLICY IF EXISTS "Public read post_attachments" ON public.post_attachments;
CREATE POLICY "Public read post_attachments" ON public.post_attachments FOR SELECT USING (true);

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
    p_links JSONB DEFAULT '[]'::jsonb,
    p_duration_days INT DEFAULT 30,
    p_attachments JSONB DEFAULT '[]'::jsonb,
    -- Tapahtumakentät
    p_event_start_at TIMESTAMPTZ DEFAULT NULL,
    p_event_end_at TIMESTAMPTZ DEFAULT NULL,
    p_event_all_day BOOLEAN DEFAULT FALSE,
    p_event_location_detail TEXT DEFAULT NULL,
    p_event_registration_url TEXT DEFAULT NULL,
    -- Tarjouskentät
    p_offer_start_at TIMESTAMPTZ DEFAULT NULL,
    p_offer_end_at TIMESTAMPTZ DEFAULT NULL,
    p_offer_terms TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res JSONB;
    v_post_id UUID;
    v_elem JSONB;
    v_duration INT;
    v_calculated_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Palvelinpuolen avaintarkistus
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.'));
    END IF;

    -- 2. Tyyppikohtainen validointi
    IF p_type = 'event' AND p_event_start_at IS NOT NULL AND p_event_end_at IS NOT NULL AND p_event_end_at < p_event_start_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tapahtuman päättymisaika ei voi olla ennen alkamisaikaa.');
    END IF;

    IF p_type = 'offer' AND p_offer_start_at IS NOT NULL AND p_offer_end_at IS NOT NULL AND p_offer_end_at < p_offer_start_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tarjouksen päättymispäivä ei voi olla ennen alkamispäivää.');
    END IF;

    -- 3. Lasketaan palvelinpuolen expires_at keston perusteella
    v_duration := COALESCE(p_duration_days, 30);
    IF v_duration NOT IN (7, 14, 30) THEN
        v_duration := 30;
    END IF;
    
    v_calculated_expires_at := COALESCE(p_expires_at, NOW() + (v_duration || ' days')::INTERVAL);

    -- 4. Luodaan uusi julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id, organization_id, title, content, type, visibility, status,
        expires_at, pinned_until, is_pinned, created_at, published_at,
        event_start_at, event_end_at, event_all_day, event_location_detail, event_registration_url,
        offer_start_at, offer_end_at, offer_terms
    ) VALUES (
        v_post_id, p_organization_id, p_title, p_content, p_type, p_visibility, p_status,
        v_calculated_expires_at, p_pinned_until, (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()), NOW(), NOW(),
        CASE WHEN p_type = 'event' THEN p_event_start_at ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_end_at ELSE NULL END,
        CASE WHEN p_type = 'event' THEN COALESCE(p_event_all_day, FALSE) ELSE FALSE END,
        CASE WHEN p_type = 'event' THEN p_event_location_detail ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_registration_url ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_start_at ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_end_at ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_terms ELSE NULL END
    );

    -- 4. Paikat
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            INSERT INTO public.post_places (post_id, place_id, relation)
            VALUES (v_post_id, COALESCE(v_elem->>'place_id', v_elem->>0, 'Laukaa'), COALESCE(v_elem->>'relation', 'venue'));
        END LOOP;
    END IF;

    -- 5. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            INSERT INTO public.post_themes (post_id, tag_id)
            VALUES (v_post_id, COALESCE(v_elem->>'tag_id', v_elem->>0));
        END LOOP;
    END IF;

    -- 6. Liitteet (post_attachments: Kuva, PDF, YouTube)
    IF jsonb_array_length(p_attachments) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
            INSERT INTO public.post_attachments (
                post_id, type, provider, storage_path, imagekit_file_id, youtube_video_id, url, file_name, mime_type, file_size, sort_order
            ) VALUES (
                v_post_id,
                COALESCE(v_elem->>'type', 'image'),
                COALESCE(v_elem->>'provider', 'imagekit'),
                v_elem->>'storage_path',
                v_elem->>'imagekit_file_id',
                v_elem->>'youtube_video_id',
                COALESCE(v_elem->>'url', ''),
                v_elem->>'file_name',
                v_elem->>'mime_type',
                (v_elem->>'file_size')::BIGINT,
                COALESCE((v_elem->>'sort_order')::INT, 0)
            );
        END LOOP;
    END IF;

    -- 7. Legacy Media (Kuvat / Videot)
    IF jsonb_array_length(p_media) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_media) LOOP
            IF (v_elem->>'url') IS NOT NULL AND LENGTH(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_media (post_id, media_type, url, title)
                VALUES (v_post_id, COALESCE(v_elem->>'media_type', 'image'), v_elem->>'url', v_elem->>'title');
            END IF;
        END LOOP;
    END IF;

    -- 8. Linkit
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

    RETURN jsonb_build_object('success', true, 'post_id', v_post_id, 'expires_at', v_calculated_expires_at, 'message', 'Julkaisu luotu onnistuneesti!');
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
    v_clean_key TEXT;
    v_hash TEXT;
    v_cred RECORD;
    v_post_org TEXT;
    v_pinned_until TIMESTAMPTZ;
BEGIN
    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    SELECT * INTO v_cred
    FROM public.organization_publish_credentials
    WHERE organization_id = p_organization_id
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiolla ei ole voimassaolevaa julkaisuavainta');
    END IF;

    IF v_cred.code_hash <> v_hash THEN
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

-- 6. RPC: Tunnista organisaatio pelkän julkaisuavaimen perusteella
CREATE OR REPLACE FUNCTION public.resolve_publisher_key(
    p_publish_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_key TEXT;
    v_hash TEXT;
    v_cred RECORD;
    v_org RECORD;
BEGIN
    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Syötä vähintään 6-merkkinen julkaisuavain.');
    END IF;

    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    SELECT * INTO v_cred
    FROM public.organization_publish_credentials
    WHERE code_hash = v_hash
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Virheellinen tai vanhentunut julkaisuavain.');
    END IF;

    -- Tarkistetaan organisaatio
    SELECT id, name, publisher_enabled INTO v_org
    FROM public.organizations
    WHERE id = v_cred.organization_id;

    IF v_org.publisher_enabled IS FALSE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaation julkaisuoikeus on estetty.');
    END IF;

    -- Päivitetään käyttöaika
    UPDATE public.organization_publish_credentials
    SET last_used_at = NOW()
    WHERE id = v_cred.id;

    RETURN jsonb_build_object(
        'valid', true,
        'org_id', v_cred.organization_id,
        'org_name', COALESCE(v_org.name, v_cred.organization_id)
    );
END;
$$;

-- 7. RPC: Poista julkaisu avaimella (Merkitään poistoon, käynnistää siivouksen)
CREATE OR REPLACE FUNCTION public.delete_post_with_key(
    p_organization_id TEXT,
    p_publish_key TEXT,
    p_post_id UUID
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

    IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id AND organization_id = p_organization_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisua ei löytynyt tai se ei kuulu organisaatiollesi.');
    END IF;

    -- Merkitään julkaisu cleanup_pending-tilaan välittömästi (piilotetaan seinältä)
    UPDATE public.posts
    SET status = 'cleanup_pending', updated_at = NOW()
    WHERE id = p_post_id AND organization_id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'message', 'Julkaisu merkitty poistettavaksi.');
END;
$$;

-- 8. RPC: Siivousrutiini (Merkitsee vanhentuneet julkaisut cleanup_pending-tilaan)
CREATE OR REPLACE FUNCTION public.mark_expired_posts_pending()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.posts
    SET status = 'cleanup_pending', updated_at = NOW()
    WHERE expires_at <= NOW() AND status = 'published';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 9. RPC: Hae siivousta odottavat julkaisut ja niiden liitteet
CREATE OR REPLACE FUNCTION public.get_pending_cleanup_posts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res JSONB;
BEGIN
    -- Varmistetaan että vanhentuneet on merkitty
    PERFORM public.mark_expired_posts_pending();

    SELECT jsonb_agg(
        jsonb_build_object(
            'post_id', p.id,
            'cleanup_attempts', p.cleanup_attempts,
            'attachments', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', a.id,
                        'type', a.type,
                        'provider', a.provider,
                        'storage_path', a.storage_path,
                        'imagekit_file_id', a.imagekit_file_id,
                        'youtube_video_id', a.youtube_video_id,
                        'url', a.url
                    )
                ), '[]'::jsonb)
                FROM public.post_attachments a
                WHERE a.post_id = p.id
            )
        )
    ) INTO v_res
    FROM public.posts p
    WHERE p.status = 'cleanup_pending';

    RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- 10. RPC: Viimeistele julkaisun poisto (Kun fyysiset tiedostot on siivottu)
CREATE OR REPLACE FUNCTION public.finalize_post_deletion(
    p_post_id UUID,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_msg TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_success THEN
        -- ON DELETE CASCADE poistaa automaattisesti post_attachments rivit
        DELETE FROM public.posts WHERE id = p_post_id;
        RETURN jsonb_build_object('success', true, 'post_id', p_post_id, 'message', 'Julkaisu ja sen liitteet poistettu.');
    ELSE
        UPDATE public.posts
        SET cleanup_attempts = cleanup_attempts + 1,
            cleanup_last_attempt_at = NOW(),
            cleanup_error = p_error_msg
        WHERE id = p_post_id;
        RETURN jsonb_build_object('success', false, 'post_id', p_post_id, 'error', p_error_msg);
    END IF;
END;
$$;


