-- =========================================================
-- MIGRAATIO 058: post_places viite-eheys ja UUID-tyyppimuutos
-- LaukaaInfo — Julkaisijan polun auditointi (11.10.2026)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa.
-- =========================================================


-- =========================================================
-- 1. TYYPPIMUUTOS: post_places.place_id -> UUID
-- =========================================================

DO $$
BEGIN
    -- Poistetaan mahdolliset virheelliset / tyhjät rivit ennen tyyppimuutosta
    DELETE FROM public.post_places
    WHERE place_id IS NULL 
       OR place_id = ''
       OR place_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    -- Muutetaan sarakkeen tyyppi UUID:ksi
    ALTER TABLE public.post_places
        ALTER COLUMN place_id TYPE UUID USING place_id::uuid;

    RAISE NOTICE 'post_places.place_id muutettu UUID-tyyppiseksi.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Huomio tyyppimuutoksessa: %', SQLERRM;
END;
$$;


-- =========================================================
-- 2. VIITEAVAIN (FOREIGN KEY) JA INDEKSIT
-- =========================================================

-- Poistetaan mahdollinen vanha rajoite
ALTER TABLE public.post_places
    DROP CONSTRAINT IF EXISTS fk_post_places_place;

-- Lisätään viiteavain places(id) -tauluun
ALTER TABLE public.post_places
    ADD CONSTRAINT fk_post_places_place
    FOREIGN KEY (place_id)
    REFERENCES public.places(id)
    ON DELETE CASCADE;

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_post_places_place_id
    ON public.post_places(place_id);

CREATE INDEX IF NOT EXISTS idx_post_places_post_id
    ON public.post_places(post_id);

CREATE INDEX IF NOT EXISTS idx_post_themes_tag_id
    ON public.post_themes(tag_id);


-- =========================================================
-- 3. POISTETAAN VANHAT OVERLOAD-VERSIOT FUNKTIOSTA
--    (Ratkaisee virheen 42725: function name is not unique)
-- =========================================================

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
        RAISE NOTICE 'Poistettu vanha funktio: %', r.func_sig;
    END LOOP;
END;
$$;


-- =========================================================
-- 4. PÄIVITETTY RPC: publish_post_with_key
--    - Säilyttää täyden 051-parametrilistan (23 parametria)
--    - Tallentaa paikat UUID-muodossa
--    - Älykäs fallback: jos parametrina tulee nimi,
--      resolvoi sen places-taulusta UUID:ksi automaattisesti!
-- =========================================================

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
BEGIN
    -- 1. Palvelinpuolen avaintarkistus (051 mukaisesti)
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

    -- 4. Luo uusi julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id, organization_id, title, content, type, visibility, status,
        expires_at, pinned_until, is_pinned, created_at, published_at,
        event_start_at, event_end_at, event_all_day,
        event_location_detail, event_registration_url,
        offer_start_at, offer_end_at, offer_terms
    ) VALUES (
        v_post_id, p_organization_id, p_title, p_content,
        p_type, p_visibility, p_status,
        v_calculated_expires_at,
        p_pinned_until,
        (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()),
        NOW(), NOW(),
        CASE WHEN p_type = 'event' THEN p_event_start_at     ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_end_at       ELSE NULL END,
        CASE WHEN p_type = 'event' THEN COALESCE(p_event_all_day, FALSE) ELSE FALSE END,
        CASE WHEN p_type = 'event' THEN p_event_location_detail          ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_registration_url         ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_start_at     ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_end_at       ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_terms        ELSE NULL END
    );

    -- 5. Paikat – Tallennetaan UUID (suoraan tai nimiresolvauksella)
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            v_raw_place_id := COALESCE(v_elem->>'place_id', v_elem->>0);
            v_resolved_place_uuid := NULL;

            IF v_raw_place_id IS NOT NULL AND v_raw_place_id <> '' THEN
                -- Onko arvo kelvollinen UUID?
                IF v_raw_place_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                    SELECT id INTO v_resolved_place_uuid
                    FROM public.places
                    WHERE id = v_raw_place_id::uuid
                    LIMIT 1;
                ELSE
                    -- Fallback: Etsitään paikan nimen perusteella
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

    -- 6. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            v_tag_id := COALESCE(v_elem->>'tag_id', v_elem->>0);
            IF v_tag_id IS NOT NULL AND v_tag_id <> '' THEN
                INSERT INTO public.post_themes (post_id, tag_id)
                VALUES (v_post_id, v_tag_id);
            END IF;
        END LOOP;
    END IF;

    -- 7. Liitteet (post_attachments)
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

    -- 8. Legacy Media
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

    -- 9. Legacy Linkit
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


-- =========================================================
-- 5. PÄIVITETTY RPC: get_context_posts
-- =========================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'get_context_posts'
          AND pronamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_context_posts(
    p_service_id        TEXT    DEFAULT 'laukaainfo',
    p_org_id            TEXT    DEFAULT NULL,
    p_max_results       INT     DEFAULT 50
)
RETURNS TABLE (
    post_id              UUID,
    organization_id      TEXT,
    title                TEXT,
    content              TEXT,
    type                 TEXT,
    visibility           TEXT,
    status               TEXT,
    created_at           TIMESTAMPTZ,
    image_url            TEXT,
    matched_place_id     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_ctx                JSONB;
    v_place_uuids        UUID[];
BEGIN
    -- 1. Hae ratkaistu palvelukonteksti
    v_ctx := public.get_resolved_service_context(p_service_id);
    
    -- Kerätään ratkaisun UUID:t
    SELECT array_agg(value::uuid) INTO v_place_uuids
    FROM jsonb_array_elements_text(v_ctx->'resolved_place_ids');

    -- 2. Hae julkaisut LEFT JOIN -kytkennällä
    RETURN QUERY
    SELECT DISTINCT ON (p.id)
        p.id AS post_id,
        p.organization_id,
        p.title,
        p.content,
        p.type,
        p.visibility,
        p.status,
        p.created_at,
        p.image_url,
        COALESCE(pp.place_id::text, v_ctx->>'default_place_id') AS matched_place_id
    FROM public.posts p
    LEFT JOIN public.post_places pp ON pp.post_id = p.id
    WHERE
        p.status <> 'deleted' 
        AND p.status <> 'cleanup_pending'
        AND (p.visibility = 'public' OR p.visibility IS NULL)
        AND (p_org_id IS NULL OR p.organization_id = p_org_id)
        AND (
            pp.place_id = ANY(v_place_uuids)
            OR (pp.place_id IS NULL AND p_service_id = 'laukaainfo')
        )
    ORDER BY p.id, p.created_at DESC
    LIMIT p_max_results;
END;
$$;


-- =========================================================
-- 6. OIKEUDET
-- =========================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;


-- =========================================================
-- 7. TARKISTUSKYSELYT MIGRAATION JÄLKEEN:
-- =========================================================
SELECT
    (SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'post_places' AND column_name = 'place_id')
        AS post_places_place_id_type,
    (SELECT COUNT(*) FROM pg_constraint
     WHERE conrelid = 'public.post_places'::regclass AND conname = 'fk_post_places_place')
        AS foreign_key_ok;
