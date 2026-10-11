-- =========================================================
-- MIGRAATIO 058: post_places viite-eheys ja UUID-tyyppimuutos
-- LaukaaInfo — Julkaisijan polun auditointi (11.10.2026)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa.
--
-- Muutokset:
--   1. post_places.place_id tyypiksi UUID
--   2. FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE
--   3. Indeksi idx_post_places_place_id nopeita paikkahakuja varten
--   4. RPC publish_post_with_key päivitys:
--        - Tukee UUID-paikkatunnisteita
--        - Sisältää nimen resolvoimisen UUID:ksi fallbackina (jos UI lähettää nimen)
--   5. RPC get_context_posts päivitys:
--        - Native UUID-vertailu (pp.place_id = ANY(v_place_uuids))
-- =========================================================


-- =========================================================
-- 1. TYYPPIMUUTOS: post_places.place_id -> UUID
-- =========================================================

-- Varmistetaan ensin, että sarakkeessa ei ole virheellisiä arvoja
-- (Auditoinnin 056 mukaan taulu oli tyhjä, joten muutos on turvallinen)
DO $$
BEGIN
    -- Poistetaan mahdolliset vanhat orporivit tai tyhjät merkkijonot varmuuden vuoksi
    DELETE FROM public.post_places
    WHERE place_id IS NULL 
       OR place_id = ''
       OR place_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    -- Muutetaan sarakkeen tyyppi UUID:ksi
    ALTER TABLE public.post_places
        ALTER COLUMN place_id TYPE UUID USING place_id::uuid;

    RAISE NOTICE 'post_places.place_id muutettu UUID-tyyppiseksi onnistuneesti.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Huomio sarakemuutoksessa: %', SQLERRM;
END;
$$;


-- =========================================================
-- 2. VIITEAVAIN (FOREIGN KEY) JA INDEKSIT
-- =========================================================

-- Poistetaan mahdollinen vanha rajoite
ALTER TABLE public.post_places
    DROP CONSTRAINT IF EXISTS fk_post_places_place;

-- Lisätään viiteavain places(id) -sarakkeeseen
ALTER TABLE public.post_places
    ADD CONSTRAINT fk_post_places_place
    FOREIGN KEY (place_id)
    REFERENCES public.places(id)
    ON DELETE CASCADE;

-- Indeksit nopeita hakuja ja liitoksia varten
CREATE INDEX IF NOT EXISTS idx_post_places_place_id
    ON public.post_places(place_id);

CREATE INDEX IF NOT EXISTS idx_post_places_post_id
    ON public.post_places(post_id);

CREATE INDEX IF NOT EXISTS idx_post_themes_tag_id
    ON public.post_themes(tag_id);


-- =========================================================
-- 3. PÄIVITETTY RPC: publish_post_with_key
--    - Tallentaa paikat UUID-muodossa
--    - Älykäs fallback: Jos parametrina tulee paikan nimi,
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
    p_duration_days         INT             DEFAULT 30,
    p_pinned_until          TIMESTAMPTZ     DEFAULT NULL,
    p_places                JSONB           DEFAULT '[]'::jsonb,
    p_themes                JSONB           DEFAULT '[]'::jsonb,
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
    v_clean_key             TEXT;
    v_hash                  TEXT;
    v_cred_id               UUID;
    v_post_id               UUID;
    v_calculated_expires_at TIMESTAMPTZ;
    v_elem                  JSONB;
    v_raw_place_id          TEXT;
    v_resolved_place_uuid   UUID;
    v_tag_id                TEXT;
BEGIN
    -- 1. Avaimen normalisointi ja tarkistus
    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));

    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen julkaisuavain.');
    END IF;

    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    SELECT id INTO v_cred_id
    FROM public.organization_publish_credentials
    WHERE organization_id = p_organization_id
      AND code_hash = v_hash
      AND revoked_at IS NULL
    LIMIT 1;

    IF v_cred_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisuavain ei kelpaa tälle organisaatiolle.');
    END IF;

    UPDATE public.organization_publish_credentials
    SET last_used_at = NOW()
    WHERE id = v_cred_id;

    -- 2. Voimassaoloaika
    v_calculated_expires_at := NOW() + (COALESCE(p_duration_days, 30) || ' days')::INTERVAL;

    -- 3. Luo julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id,
        organization_id,
        title,
        content,
        type,
        visibility,
        status,
        expires_at,
        pinned_until,
        is_pinned,
        created_at,
        published_at,
        event_start_at,
        event_end_at,
        event_all_day,
        event_location_detail,
        event_registration_url,
        offer_start_at,
        offer_end_at,
        offer_terms
    ) VALUES (
        v_post_id,
        p_organization_id,
        p_title,
        p_content,
        COALESCE(p_type, 'announcement'),
        COALESCE(p_visibility, 'public'),
        COALESCE(p_status, 'published'),
        v_calculated_expires_at,
        p_pinned_until,
        (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()),
        NOW(),
        NOW(),
        CASE WHEN p_type = 'event' THEN p_event_start_at     ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_end_at       ELSE NULL END,
        CASE WHEN p_type = 'event' THEN COALESCE(p_event_all_day, FALSE) ELSE FALSE END,
        CASE WHEN p_type = 'event' THEN p_event_location_detail          ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_registration_url         ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_start_at     ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_end_at       ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_terms        ELSE NULL END
    );

    -- 4. Paikat – Tallennetaan suoraan UUID tai resolvataan nimen perusteella
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            v_raw_place_id := COALESCE(v_elem->>'place_id', v_elem->>0);
            v_resolved_place_uuid := NULL;

            IF v_raw_place_id IS NOT NULL AND v_raw_place_id <> '' THEN
                -- A: Onko jo kelvollinen UUID?
                IF v_raw_place_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                    SELECT id INTO v_resolved_place_uuid
                    FROM public.places
                    WHERE id = v_raw_place_id::uuid
                    LIMIT 1;
                ELSE
                    -- B: Fallback nimen perusteella
                    SELECT id INTO v_resolved_place_uuid
                    FROM public.places
                    WHERE name ILIKE v_raw_place_id
                       OR canonical_name ILIKE v_raw_place_id
                    LIMIT 1;
                END IF;

                -- Jos löytyi vastaava paikka places-taulusta, tallennetaan suhde
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

    -- 5. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            v_tag_id := COALESCE(v_elem->>'tag_id', v_elem->>0);
            IF v_tag_id IS NOT NULL AND v_tag_id <> '' THEN
                INSERT INTO public.post_themes (post_id, tag_id)
                VALUES (v_post_id, v_tag_id);
            END IF;
        END LOOP;
    END IF;

    -- 6. Liitteet (post_attachments)
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

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'expires_at', v_calculated_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_post_with_key TO anon, authenticated;


-- =========================================================
-- 4. PÄIVITETTY RPC: get_context_posts
--    - Hyödyntää post_places(place_id) UUID-indeksiä
-- =========================================================

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

GRANT EXECUTE ON FUNCTION public.get_context_posts TO anon, authenticated;


-- =========================================================
-- 5. TARKISTUSKYSELYT MIGRAATION JÄLKEEN:
-- =========================================================
--
-- 1. Tarkista saraketyyppi ja viiteavain:
--    SELECT column_name, data_type
--    FROM information_schema.columns
--    WHERE table_name = 'post_places' AND column_name = 'place_id';
--    -- Tulos: place_id | uuid
--
-- 2. Tarkista foreign key:
--    SELECT conname, confrelid::regclass
--    FROM pg_constraint
--    WHERE conrelid = 'public.post_places'::regclass;
--    -- Tulos: fk_post_places_place | places
