-- =============================================================================
-- 059_android_posts_fix.sql
-- LaukaaInfo – Android UUSIPROJEKTI -yhteensopivuusmigraatio
-- =============================================================================
-- Muutokset:
--   1. Lisätään posts-tauluun puuttuvat Android WallPostInsert-kentät:
--      - is_shorts  (Shorts-video-lippu)
--      - publish_at (aikataulutusaika, eri kuin published_at)
--      - org_name   (organisaation näyttönimi julkaisun yhteydessä)
--   2. Luodaan get_protected_org_posts(p_organization_id, p_access_code)
--      → Android fetchProtectedOrgPosts() käyttää tätä
--   3. Luodaan get_org_posts_with_key(p_publish_key)
--      → OrgPostsManagerSheet / julkaisun hallinta
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- OSA 1: Puuttuvat sarakkeet posts-tauluun
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_shorts   BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publish_at  TIMESTAMPTZ    NULL,
  ADD COLUMN IF NOT EXISTS org_name    TEXT           NULL;

COMMENT ON COLUMN posts.is_shorts  IS 'TRUE jos julkaisu on YouTube Shorts -video';
COMMENT ON COLUMN posts.publish_at IS 'Aikataulutettu julkaisuaika (null = julkaistaan heti). Android WallPostInsert.publish_at.';
COMMENT ON COLUMN posts.org_name   IS 'Organisaation näyttönimi julkaisun yhteydessä (Android WallPostInsert.org_name).';

-- ─────────────────────────────────────────────────────────────────────────────
-- OSA 2: get_protected_org_posts
-- Android: SupabaseService.fetchProtectedOrgPosts(organizationId, accessCode)
-- Odottaa: { success: Boolean, posts: List<WallPost> }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_protected_org_posts(
    p_organization_id TEXT,
    p_access_code     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_valid      BOOLEAN;
    v_posts      JSONB;
    v_now        TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Tarkista avain
    SELECT (verify_publisher_key(p_organization_id, p_access_code)).valid
    INTO v_valid;

    IF NOT v_valid THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Virheellinen tai vanhentunut käyttöoikeuskoodi.'
        );
    END IF;

    -- 2. Hae organisaation julkaisut
    SELECT jsonb_agg(
        jsonb_build_object(
            'id',                   p.id,
            'organization_id',      p.organization_id,
            'business_id',          p.business_id,
            'place_id',             p.place_id,
            'title',                p.title,
            'description',          p.description,
            'content',              p.content,
            'image_url',            p.image_url,
            'website_url',          p.website_url,
            'facebook_url',         p.facebook_url,
            'instagram_url',        p.instagram_url,
            'youtube_url',          p.youtube_url,
            'video_id',             p.video_id,
            'is_shorts',            p.is_shorts,
            'type',                 p.type,
            'visibility',           p.visibility,
            'status',               p.status,
            'publish_at',           p.publish_at,
            'published_at',         p.published_at,
            'expires_at',           p.expires_at,
            'is_pinned',            p.is_pinned,
            'publisher_name',       p.publisher_name,
            'org_name',             p.org_name,
            'publisher_logo',       p.publisher_logo,
            'contact_email',        p.contact_email,
            'contact_phone',        p.contact_phone,
            'show_contact',         p.show_contact,
            'created_at',           p.created_at,
            'event_start_at',       p.event_start_at,
            'event_end_at',         p.event_end_at,
            'event_all_day',        p.event_all_day,
            'event_location_detail',p.event_location_detail,
            'event_registration_url',p.event_registration_url,
            'offer_start_at',       p.offer_start_at,
            'offer_end_at',         p.offer_end_at,
            'offer_terms',          p.offer_terms
        )
        ORDER BY COALESCE(p.published_at, p.created_at) DESC
    )
    INTO v_posts
    FROM posts p
    WHERE p.organization_id = p_organization_id
      AND p.status NOT IN ('deleted', 'cleanup_pending')
      AND (p.expires_at IS NULL OR p.expires_at > v_now);

    RETURN jsonb_build_object(
        'success', TRUE,
        'posts',   COALESCE(v_posts, '[]'::JSONB)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_protected_org_posts(TEXT, TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- OSA 3: get_org_posts_with_key
-- Käytetään julkaisupisteen hallinnassa (OrgPostsManagerSheet / julkaise.html)
-- Palauttaa suoran taulukon julkaisuista (ei wrapperia)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_org_posts_with_key(
    p_publish_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resolved   RECORD;
    v_posts      JSONB;
    v_now        TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Ratkaise avain → org_id
    SELECT * INTO v_resolved FROM resolve_publisher_key(p_publish_key);

    IF NOT v_resolved.valid THEN
        RETURN jsonb_build_object(
            'error', 'Virheellinen tai vanhentunut julkaisuavain.'
        );
    END IF;

    -- 2. Hae organisaation kaikki ei-poistetut julkaisut
    SELECT jsonb_agg(
        jsonb_build_object(
            'id',                    p.id,
            'organization_id',       p.organization_id,
            'business_id',           p.business_id,
            'place_id',              p.place_id,
            'title',                 p.title,
            'description',           p.description,
            'content',               p.content,
            'image_url',             p.image_url,
            'website_url',           p.website_url,
            'facebook_url',          p.facebook_url,
            'instagram_url',         p.instagram_url,
            'youtube_url',           p.youtube_url,
            'video_id',              p.video_id,
            'is_shorts',             p.is_shorts,
            'type',                  p.type,
            'visibility',            p.visibility,
            'status',                p.status,
            'publish_at',            p.publish_at,
            'published_at',          p.published_at,
            'expires_at',            p.expires_at,
            'is_pinned',             p.is_pinned,
            'publisher_name',        p.publisher_name,
            'org_name',              p.org_name,
            'publisher_logo',        p.publisher_logo,
            'contact_email',         p.contact_email,
            'contact_phone',         p.contact_phone,
            'show_contact',          p.show_contact,
            'created_at',            p.created_at,
            'event_start_at',        p.event_start_at,
            'event_end_at',          p.event_end_at,
            'event_all_day',         p.event_all_day,
            'event_location_detail', p.event_location_detail,
            'event_registration_url',p.event_registration_url,
            'offer_start_at',        p.offer_start_at,
            'offer_end_at',          p.offer_end_at,
            'offer_terms',           p.offer_terms
        )
        ORDER BY COALESCE(p.published_at, p.created_at) DESC
    )
    INTO v_posts
    FROM posts p
    WHERE p.organization_id = v_resolved.org_id
      AND p.status NOT IN ('deleted');

    RETURN COALESCE(v_posts, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION get_org_posts_with_key(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tarkistus: uudet sarakkeet näkyvissä
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'posts'
              AND column_name IN ('is_shorts', 'publish_at', 'org_name')) = 3,
        'posts-tauluun ei lisätty kaikkia sarakkeita!';
    RAISE NOTICE 'OK: is_shorts, publish_at, org_name lisätty posts-tauluun';
    RAISE NOTICE 'OK: get_protected_org_posts() ja get_org_posts_with_key() luotu';
END;
$$;
