-- =========================================================
-- MIGRAATIO 059: Julkaisun kuvan ja paikan Android-yhteensopivuus
-- LaukaaInfo & LaukaaLive UUSIPROJEKTI (Android)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa.
-- =========================================================

-- 1. PÄIVITETÄÄN RPC: publish_post_with_key
-- Asettaa ensisijaisen liitekuvan suoraan posts.image_url -kenttään,
-- kuvauksen posts.description -kenttään ja paikan posts.place_id -kenttään,
-- jotta Android-sovelluksen WallPost näyttää kuvan ja tekstin välittömästi.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'publish_post_with_key'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_post_with_key(
    p_organization_id       TEXT,
    p_publish_key           TEXT,
    p_title                 TEXT,
    p_content               TEXT            DEFAULT NULL,
    p_type                  TEXT            DEFAULT 'announcement',
    p_visibility            TEXT            DEFAULT 'public',
    p_status                TEXT            DEFAULT 'published',
    p_expires_at            TIMESTAMPTZ     DEFAULT NULL,
    p_pinned_until          TIMESTAMPTZ     DEFAULT NULL,
    p_places                JSONB           DEFAULT '[]'::jsonb,
    p_themes                JSONB           DEFAULT '[]'::jsonb,
    p_media                 JSONB           DEFAULT '[]'::jsonb,
    p_links                 JSONB           DEFAULT '[]'::jsonb,
    p_duration_days         INT             DEFAULT 30,
    p_attachments           JSONB           DEFAULT '[]'::jsonb,
    p_event_start_at        TIMESTAMPTZ     DEFAULT NULL,
    p_event_end_at          TIMESTAMPTZ     DEFAULT NULL,
    p_event_all_day         BOOLEAN         DEFAULT FALSE,
    p_event_location_detail TEXT            DEFAULT NULL,
    p_event_registration_url TEXT           DEFAULT NULL,
    p_offer_start_at        TIMESTAMPTZ     DEFAULT NULL,
    p_offer_end_at          TIMESTAMPTZ     DEFAULT NULL,
    p_offer_terms           TEXT            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res             JSONB;
    v_post_id                UUID;
    v_elem                   JSONB;
    v_duration               INT;
    v_calculated_expires_at  TIMESTAMPTZ;
    v_raw_place_id           TEXT;
    v_resolved_place_uuid    UUID;
    v_tag_id                 TEXT;
    v_primary_image_url      TEXT;
    v_primary_place_str      TEXT;
BEGIN
    -- 1. Palvelinpuolen avaintarkistus
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.')
        );
    END IF;

    -- 2. Tyyppikohtainen validointi
    IF p_type = 'event'
       AND p_event_start_at IS NOT NULL
       AND p_event_end_at IS NOT NULL
       AND p_event_end_at < p_event_start_at
    THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Tapahtuman päättymisaika ei voi olla ennen alkamisaikaa.');
    END IF;

    IF p_type = 'offer'
       AND p_offer_start_at IS NOT NULL
       AND p_offer_end_at IS NOT NULL
       AND p_offer_end_at < p_offer_start_at
    THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Tarjouksen päättymispäivä ei voi olla ennen alkamispäivää.');
    END IF;

    -- 3. Voimassaoloaika
    v_duration := COALESCE(p_duration_days, 30);
    IF v_duration NOT IN (7, 14, 30) THEN
        v_duration := 30;
    END IF;
    v_calculated_expires_at := COALESCE(
        p_expires_at,
        NOW() + (v_duration || ' days')::INTERVAL
    );

    -- 4. Selvitetään ensisijainen kuva Android- ja legacy-yhteensopivuudeksi
    v_primary_image_url := NULL;
    IF jsonb_array_length(p_attachments) > 0 THEN
        SELECT elem->>'url' INTO v_primary_image_url
        FROM jsonb_array_elements(p_attachments) elem
        WHERE elem->>'type' = 'image' AND elem->>'url' IS NOT NULL AND length(elem->>'url') > 5
        LIMIT 1;
    END IF;

    IF v_primary_image_url IS NULL AND jsonb_array_length(p_media) > 0 THEN
        SELECT elem->>'url' INTO v_primary_image_url
        FROM jsonb_array_elements(p_media) elem
        WHERE (elem->>'media_type' = 'image' OR elem->>'type' = 'image') AND elem->>'url' IS NOT NULL AND length(elem->>'url') > 5
        LIMIT 1;
    END IF;

    -- Selvitetään ensisijainen paikkamerkintä posts.place_id -kenttään (Androidin suoraan hakuun)
    v_primary_place_str := NULL;
    IF jsonb_array_length(p_places) > 0 THEN
        v_primary_place_str := COALESCE(p_places->0->>'place_id', p_places->0->>0);
    END IF;

    -- 5. Luo uusi julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id, organization_id, title, content, description, type, visibility, status,
        expires_at, pinned_until, is_pinned, created_at, published_at,
        image_url, place_id,
        event_start_at, event_end_at, event_all_day,
        event_location_detail, event_registration_url,
        offer_start_at, offer_end_at, offer_terms
    ) VALUES (
        v_post_id, p_organization_id, p_title, p_content, p_content,
        p_type, p_visibility, p_status,
        v_calculated_expires_at,
        p_pinned_until,
        (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()),
        NOW(), NOW(),
        v_primary_image_url, v_primary_place_str,
        CASE WHEN p_type = 'event' THEN p_event_start_at     ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_end_at       ELSE NULL END,
        CASE WHEN p_type = 'event' THEN COALESCE(p_event_all_day, FALSE) ELSE FALSE END,
        CASE WHEN p_type = 'event' THEN p_event_location_detail          ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_registration_url         ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_start_at     ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_end_at       ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_terms        ELSE NULL END
    );

    -- 6. Paikat – Tallennetaan UUID (suoraan tai nimiresolvauksella)
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            v_raw_place_id := COALESCE(v_elem->>'place_id', v_elem->>0);
            v_resolved_place_uuid := NULL;

            IF v_raw_place_id IS NOT NULL AND v_raw_place_id <> '' THEN
                IF v_raw_place_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                    SELECT id INTO v_resolved_place_uuid
                    FROM public.places
                    WHERE id = v_raw_place_id::uuid
                    LIMIT 1;
                ELSE
                    SELECT id INTO v_resolved_place_uuid
                    FROM public.places
                    WHERE name ILIKE v_raw_place_id
                       OR canonical_name ILIKE v_raw_place_id
                    LIMIT 1;
                END IF;

                IF v_resolved_place_uuid IS NOT NULL THEN
                    INSERT INTO public.post_places (post_id, place_id, relation)
                    VALUES (
                        v_post_id,
                        v_resolved_place_uuid,
                        COALESCE(v_elem->>'relation', 'venue')
                    )
                    ON CONFLICT DO NOTHING;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 7. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            v_tag_id := COALESCE(v_elem->>'tag_id', v_elem->>0);
            IF v_tag_id IS NOT NULL AND v_tag_id <> '' THEN
                INSERT INTO public.post_themes (post_id, tag_id)
                VALUES (v_post_id, v_tag_id);
            END IF;
        END LOOP;
    END IF;

    -- 8. Liitteet (post_attachments)
    IF jsonb_array_length(p_attachments) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
            INSERT INTO public.post_attachments (
                post_id, type, provider, storage_path, imagekit_file_id,
                youtube_video_id, url, file_name, mime_type, file_size, sort_order
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

    -- 9. Legacy Media
    IF jsonb_array_length(p_media) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_media) LOOP
            IF (v_elem->>'url') IS NOT NULL AND length(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_media (post_id, media_type, url, title)
                VALUES (
                    v_post_id,
                    COALESCE(v_elem->>'media_type', 'image'),
                    v_elem->>'url',
                    v_elem->>'title'
                );
            END IF;
        END LOOP;
    END IF;

    -- 10. Legacy Linkit
    IF jsonb_array_length(p_links) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links) LOOP
            IF (v_elem->>'url') IS NOT NULL AND length(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_links (post_id, url, title, link_type)
                VALUES (
                    v_post_id,
                    v_elem->>'url',
                    COALESCE(v_elem->>'title', 'Lisätietoja'),
                    COALESCE(v_elem->>'link_type', 'external')
                );
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'expires_at', v_calculated_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_post_with_key TO anon, authenticated;

-- =========================================================
-- 2. PÄIVITETÄÄN OLEMASSA OLEVAT JULKAISUT (TAAKSEPÄINSYNKRONOINTI)
-- =========================================================

-- Synkronoidaan kuva post_attachments -> posts.image_url
UPDATE public.posts p
SET image_url = sub.url
FROM (
    SELECT DISTINCT ON (post_id) post_id, url
    FROM public.post_attachments
    WHERE type = 'image' AND url IS NOT NULL AND length(url) > 5
    ORDER BY post_id, sort_order ASC
) sub
WHERE p.id = sub.post_id AND (p.image_url IS NULL OR p.image_url = '');

-- Synkronoidaan kuva post_media -> posts.image_url (jos post_attachments ei tuottanut kuvaa)
UPDATE public.posts p
SET image_url = sub.url
FROM (
    SELECT DISTINCT ON (post_id) post_id, url
    FROM public.post_media
    WHERE media_type = 'image' AND url IS NOT NULL AND length(url) > 5
    ORDER BY post_id
) sub
WHERE p.id = sub.post_id AND (p.image_url IS NULL OR p.image_url = '');

-- Synkronoidaan content -> description jos description puuttuu
UPDATE public.posts p
SET description = p.content
WHERE (p.description IS NULL OR p.description = '') AND p.content IS NOT NULL;
