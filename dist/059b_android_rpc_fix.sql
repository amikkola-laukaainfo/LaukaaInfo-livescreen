-- =============================================================================
-- 059b_android_rpc_fix.sql
-- Korjaa get_protected_org_posts ja get_org_posts_with_key:
--   - verify_publisher_key palauttaa JSONB, ei compositetyypin → käytetään ->>/::boolean
--   - resolve_publisher_key palauttaa JSONB → sama
-- =============================================================================

CREATE OR REPLACE FUNCTION get_protected_org_posts(
    p_organization_id TEXT,
    p_access_code     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result     JSONB;
    v_valid      BOOLEAN;
    v_posts      JSONB;
    v_now        TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Tarkista avain (verify_publisher_key palauttaa JSONB)
    v_result := verify_publisher_key(p_organization_id, p_access_code);
    v_valid  := (v_result->>'valid')::BOOLEAN;

    IF NOT COALESCE(v_valid, FALSE) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Virheellinen tai vanhentunut käyttöoikeuskoodi.'
        );
    END IF;

    -- 2. Hae organisaation julkaisut
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

-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_org_posts_with_key(
    p_publish_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_resolved   JSONB;
    v_valid      BOOLEAN;
    v_org_id     TEXT;
    v_posts      JSONB;
    v_now        TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Ratkaise avain (resolve_publisher_key palauttaa JSONB)
    v_resolved := resolve_publisher_key(p_publish_key);
    v_valid    := (v_resolved->>'valid')::BOOLEAN;
    v_org_id   := v_resolved->>'org_id';

    IF NOT COALESCE(v_valid, FALSE) OR v_org_id IS NULL THEN
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
    WHERE p.organization_id = v_org_id
      AND p.status NOT IN ('deleted');

    RETURN COALESCE(v_posts, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION get_org_posts_with_key(TEXT) TO anon, authenticated;

DO $$ BEGIN
    RAISE NOTICE 'OK: get_protected_org_posts ja get_org_posts_with_key korjattu';
END $$;
