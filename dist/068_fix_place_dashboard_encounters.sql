-- =============================================================================
-- Migration: 068_fix_place_dashboard_encounters.sql
-- Kuvaus:
-- 1. Korjaa get_place_dashboard RPC-funktion ilmoitushaku:
--    - Korjaa sarakkeet (e.title, e.image_url, e.publisher_name, e.price_info jne. e.name sijaan)
--    - Sallii haun UUID:n (place_id, location_id), slugin tai paikan nimen perusteella
-- 2. Backfill: Päivittää aiemmin jätetyt orvot ilmoitukset, joiden place_id oli jäänyt tyhjäksi,
--    mutta joiden sijaintiteksti (location) täsmää rekisteröityyn paikkaan (esim. "Haarlan ranta").
-- =============================================================================

-- 1. Backfill olemassa oleville ilmoituksille, joilta puuttuu place_id linkitys
UPDATE public.encounters e
SET 
    place_id = p.id,
    location_id = COALESCE(e.location_id, p.id::text)
FROM public.places p
WHERE (e.place_id IS NULL)
  AND (
      (p.name IS NOT NULL AND TRIM(p.name) <> '' AND e.location ILIKE '%' || TRIM(p.name) || '%')
      OR (p.place_id IS NOT NULL AND TRIM(p.place_id) <> '' AND e.location_id = p.place_id)
      OR (p.canonical_name IS NOT NULL AND TRIM(p.canonical_name) <> '' AND e.location ILIKE '%' || TRIM(p.canonical_name) || '%')
  );

-- 2. Päivitetään get_place_dashboard RPC
CREATE OR REPLACE FUNCTION get_place_dashboard(p_place_id_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_place_uuid UUID;
    v_place JSONB;
    v_parent_place JSONB := NULL;
    v_media JSONB := '[]'::jsonb;
    v_hero_media JSONB := '[]'::jsonb;
    v_other_media JSONB := '[]'::jsonb;
    v_root_place_uuid UUID;
    v_events_count INT;
    v_routes_count INT;
    v_services_count INT;
    v_observations_count INT;
    v_mixonet_count INT;
    v_encounters_count INT;
    v_subplaces_count INT;
    v_now_items JSONB;
    v_now_context TEXT;
    v_nearby JSONB;
    v_themes JSONB;
    v_observations JSONB;
    v_memories_count INT;
    v_encounters JSONB;
    v_events_list JSONB;
    v_has_content BOOLEAN;
    v_result JSONB;
BEGIN
    -- Muunnetaan teksti-id UUID:ksi
    BEGIN
        v_place_uuid := p_place_id_text::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        SELECT id INTO v_place_uuid
        FROM places
        WHERE place_id = p_place_id_text OR id::text = p_place_id_text
        LIMIT 1;
    END;

    IF v_place_uuid IS NULL THEN
        RETURN NULL;
    END IF;

    -- 1. Hae paikan perustiedot
    SELECT row_to_json(p)::jsonb INTO v_place 
    FROM places p 
    WHERE p.id = v_place_uuid 
    LIMIT 1;

    -- 1b. Hae vanhempi paikka jos olemassa
    IF (v_place->>'parent_place_id') IS NOT NULL THEN
        SELECT row_to_json(p)::jsonb INTO v_parent_place 
        FROM places p 
        WHERE p.id::text = (v_place->>'parent_place_id')::text
        LIMIT 1;
    END IF;

    DECLARE
        v_has_explicit_hero BOOLEAN;
    BEGIN
        SELECT EXISTS (
            SELECT 1 FROM place_media 
            WHERE place_id::text = v_place_uuid::text AND is_active = true AND usage = 'HERO'
        ) INTO v_has_explicit_hero;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', pm.id,
                'media_type', pm.media_type,
                'usage', CASE 
                            WHEN pm.usage IS NOT NULL THEN pm.usage
                            WHEN pm.media_type = 'IMAGE' AND NOT v_has_explicit_hero AND pm.rn = 1 THEN 'HERO'
                            WHEN pm.media_type = 'IMAGE' THEN 'GALLERY'
                            ELSE pm.usage 
                         END,
                'imagekit_path', pm.imagekit_path,
                'youtube_id', pm.youtube_id,
                'title', pm.title,
                'description', pm.description
            )
        ), '[]'::jsonb) INTO v_media
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY media_type ORDER BY sort_order ASC, created_at DESC) as rn
            FROM place_media
            WHERE place_id::text = v_place_uuid::text 
              AND is_active = true 
            ORDER BY sort_order ASC, created_at DESC
        ) pm;

        IF NOT v_media @> '[{"usage": "HERO"}]'::jsonb THEN
            IF (v_place->>'parent_place_id') IS NOT NULL THEN
                SELECT COALESCE(jsonb_agg(row_to_json(pm)), '[]'::jsonb) INTO v_hero_media
                FROM (
                    SELECT id, media_type, usage, imagekit_path, youtube_id, title, description
                    FROM place_media
                    WHERE place_id::text = (v_place->>'parent_place_id')::text 
                      AND is_active = true 
                      AND usage = 'HERO'
                    ORDER BY sort_order ASC, created_at DESC
                ) pm;
            END IF;

            IF jsonb_array_length(v_hero_media) = 0 THEN
                SELECT id INTO v_root_place_uuid FROM places WHERE parent_place_id IS NULL AND status = 'active' LIMIT 1;
                
                IF v_root_place_uuid IS NOT NULL AND v_root_place_uuid != v_place_uuid THEN
                    SELECT COALESCE(jsonb_agg(row_to_json(pm)), '[]'::jsonb) INTO v_hero_media
                    FROM (
                        SELECT id, media_type, usage, imagekit_path, youtube_id, title, description
                        FROM place_media
                        WHERE place_id::text = v_root_place_uuid::text 
                          AND is_active = true 
                          AND usage = 'HERO'
                        ORDER BY sort_order ASC, created_at DESC
                    ) pm;
                END IF;
            END IF;

            v_media := v_hero_media || v_media;
        END IF;
    END;

    -- 2. Laske alipaikat
    SELECT count(*) INTO v_subplaces_count 
    FROM places 
    WHERE parent_place_id::text = v_place_uuid::text AND status = 'active';

    -- 3. Laske yritykset / palvelut
    SELECT count(*) INTO v_services_count 
    FROM place_company_relations 
    WHERE place_id::text = v_place_uuid::text;

    -- 4. Laske muut sisällöt
    SELECT 
        COUNT(*) FILTER (WHERE c.type = 'EVENT'),
        COUNT(*) FILTER (WHERE c.type = 'ROUTE'),
        COUNT(*) FILTER (WHERE c.type IN ('MEMORY', 'OBSERVATION')),
        COUNT(*) FILTER (WHERE c.type = 'ENCOUNTER')
    INTO 
        v_events_count, v_routes_count, v_observations_count, v_mixonet_count
    FROM place_relations pr
    JOIN contents c ON pr.entity_id = c.id::text
    WHERE pr.place_id::text = v_place_uuid::text 
      AND c.status = 'active';

    -- 5. Hae "Nyt tässä" -nostot
    WITH NowItems AS (
        SELECT 
            c.id, c.type, c.name, c.metadata,
            (c.metadata->>'startDate')::TIMESTAMPTZ as start_time,
            (c.metadata->>'endDate')::TIMESTAMPTZ as end_time,
            CASE 
                WHEN (c.metadata->>'startDate')::TIMESTAMPTZ <= NOW() AND (c.metadata->>'endDate')::TIMESTAMPTZ >= NOW() THEN 1
                WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE THEN 2
                WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE + INTERVAL '1 day' THEN 3
                ELSE 4
            END as time_priority,
            CASE 
                WHEN (c.metadata->>'startDate')::TIMESTAMPTZ <= NOW() AND (c.metadata->>'endDate')::TIMESTAMPTZ >= NOW() THEN 'Käynnissä nyt'
                WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE THEN 'Tänään'
                WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE + INTERVAL '1 day' THEN 'Huomenna'
                ELSE 'Tulossa'
            END as time_context
        FROM place_relations pr
        JOIN contents c ON pr.entity_id = c.id::text
        WHERE pr.place_id::text = v_place_uuid::text 
          AND c.type IN ('EVENT', 'ANNOUNCEMENT', 'OFFER')
          AND c.status = 'active'
          AND (
              ((c.metadata->>'endDate')::TIMESTAMPTZ >= NOW())
              OR (c.metadata->>'startDate' IS NULL)
          )
        ORDER BY time_priority ASC, start_time ASC, c.created_at DESC
        LIMIT 3
    )
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id, 'type', type, 'name', name, 
                'time_context', time_context, 'metadata', metadata
            )
        ), '[]'::jsonb),
        MAX(time_context) 
    INTO v_now_items, v_now_context
    FROM NowItems;

    v_has_content := jsonb_array_length(v_now_items) > 0;
    IF NOT v_has_content THEN
        v_now_context := 'Ei ajankohtaista';
    END IF;

    DECLARE
        v_lat FLOAT := (v_place->>'lat')::FLOAT;
        v_lon FLOAT := (v_place->>'lon')::FLOAT;
    BEGIN
        IF (v_place->>'parent_place_id') IS NOT NULL THEN
            SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_nearby
            FROM (
                SELECT * FROM places 
                WHERE parent_place_id::text = (v_place->>'parent_place_id')::text 
                  AND id::text != v_place_uuid::text 
                  AND status = 'active'
                  AND v_lat IS NOT NULL AND v_lon IS NOT NULL 
                  AND lat IS NOT NULL AND lon IS NOT NULL 
                  AND (POWER(lat - v_lat, 2) + POWER((lon - v_lon) * COS(RADIANS(v_lat)), 2)) < 0.04
                ORDER BY 
                  POWER(lat - v_lat, 2) + POWER((lon - v_lon) * COS(RADIANS(v_lat)), 2) ASC, 
                  name ASC
                LIMIT 5
            ) p;
        ELSE
            SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_nearby
            FROM (
                SELECT * FROM places 
                WHERE id::text != v_place_uuid::text 
                  AND (parent_place_id IS NULL OR parent_place_id::text != v_place_uuid::text)
                  AND status = 'active'
                  AND v_lat IS NOT NULL AND v_lon IS NOT NULL 
                  AND lat IS NOT NULL AND lon IS NOT NULL 
                  AND (POWER(lat - v_lat, 2) + POWER((lon - v_lon) * COS(RADIANS(v_lat)), 2)) < 0.04
                ORDER BY 
                  POWER(lat - v_lat, 2) + POWER((lon - v_lon) * COS(RADIANS(v_lat)), 2) ASC, 
                  name ASC
                LIMIT 5
            ) p;
        END IF;
    END;

    -- Teemat
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_themes
    FROM (
        SELECT DISTINCT t.id, t.name, t.category, t.color_code
        FROM tags t
        WHERE t.id IN (
            SELECT pmt.tag_id 
            FROM place_media_tags pmt
            JOIN place_media pm ON pmt.media_id::text = pm.id::text 
            WHERE pm.place_id::text = v_place_uuid::text
            
            UNION
            
            SELECT atp.tag_id
            FROM actor_theme_places atp
            WHERE atp.place_id::text = (v_place->>'place_id')::text
               OR atp.place_id::text = v_place_uuid::text
        )
        ORDER BY t.name ASC
    ) t;

    -- Havainnot
    SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::jsonb) INTO v_observations
    FROM (
        SELECT m.id, m.title, m.description, m.year, m.created_at
        FROM memories m
        WHERE (
            m.place_id::text = (SELECT place_id::text FROM places WHERE id::text = v_place_uuid::text LIMIT 1)
            OR m.place_id::text = v_place_uuid::text
        )
          AND (m.visibility IS NULL OR m.visibility = 'PUBLIC')
        ORDER BY m.created_at DESC
        LIMIT 5
    ) m;

    SELECT COUNT(*) INTO v_memories_count
    FROM memories m
    WHERE (
        m.place_id::text = (SELECT place_id::text FROM places WHERE id::text = v_place_uuid::text LIMIT 1)
        OR m.place_id::text = v_place_uuid::text
    )
      AND (m.visibility IS NULL OR m.visibility = 'PUBLIC');

    -- Ilmoitukset (encounters)
    BEGIN
        DECLARE
            v_enc_obs JSONB := '[]'::jsonb;
            v_enc_count BIGINT := 0;
        BEGIN
            SELECT COALESCE(jsonb_agg(row_to_json(e)), '[]'::jsonb) INTO v_enc_obs
            FROM (
                SELECT 
                    e.id, 
                    e.type, 
                    e.sub_category,
                    e.title, 
                    e.description, 
                    e.created_at,
                    COALESCE(e.allow_messages, true) AS allow_messages,
                    e.location,
                    e.price_info,
                    e.publisher_name,
                    e.publisher_type,
                    e.image_url,
                    COALESCE(e.visibility, 'public') AS visibility
                FROM encounters e
                WHERE (
                    e.place_id = v_place_uuid
                    OR e.location_id = v_place_uuid::text
                    OR (v_place->>'place_id' IS NOT NULL AND e.location_id = (v_place->>'place_id'))
                    OR (v_place->>'name' IS NOT NULL AND TRIM(v_place->>'name') <> '' AND e.location ILIKE '%' || TRIM(v_place->>'name') || '%')
                )
                  AND e.status = 'active'
                  AND (e.visibility = 'public' OR e.visibility IS NULL)
                  AND (e.expires_at IS NULL OR e.expires_at > now())
                ORDER BY e.created_at DESC
                LIMIT 5
            ) e;

            SELECT COUNT(*) INTO v_enc_count
            FROM encounters e
            WHERE (
                e.place_id = v_place_uuid
                OR e.location_id = v_place_uuid::text
                OR (v_place->>'place_id' IS NOT NULL AND e.location_id = (v_place->>'place_id'))
                OR (v_place->>'name' IS NOT NULL AND TRIM(v_place->>'name') <> '' AND e.location ILIKE '%' || TRIM(v_place->>'name') || '%')
            )
              AND e.status = 'active'
              AND (e.visibility = 'public' OR e.visibility IS NULL)
              AND (e.expires_at IS NULL OR e.expires_at > now());

            v_encounters := v_enc_obs;
            v_encounters_count := v_enc_count;
        END;
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;

    -- Tapahtumat
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'description', c.description,
            'start_date', c.metadata->>'startDate',
            'end_date', c.metadata->>'endDate',
            'time_context',
                CASE 
                    WHEN (c.metadata->>'startDate')::TIMESTAMPTZ <= NOW() AND (c.metadata->>'endDate')::TIMESTAMPTZ >= NOW() THEN 'Käynnissä nyt'
                    WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE THEN 'Tänään'
                    WHEN (c.metadata->>'startDate')::DATE = CURRENT_DATE + INTERVAL '1 day' THEN 'Huomenna'
                    ELSE 'Tulossa'
                END
        )
    ), '[]'::jsonb) INTO v_events_list
    FROM place_relations pr
    JOIN contents c ON pr.entity_id = c.id::text
    WHERE pr.place_id::text = v_place_uuid::text 
      AND c.type = 'EVENT'
      AND c.status = 'active'
      AND (
          ((c.metadata->>'endDate')::TIMESTAMPTZ >= NOW())
          OR (c.metadata->>'startDate' IS NULL)
      )
    ORDER BY (c.metadata->>'startDate')::TIMESTAMPTZ ASC
    LIMIT 5;

    DECLARE
        v_place_contents JSONB := '[]'::jsonb;
    BEGIN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'description', c.description,
                'type', c.type,
                'created_at', c.created_at,
                'metadata', c.metadata
            )
        ), '[]'::jsonb) INTO v_place_contents
        FROM place_relations pr
        JOIN contents c ON pr.entity_id = c.id::text
        WHERE pr.place_id::text = v_place_uuid::text
          AND c.status = 'active'
        ORDER BY c.created_at DESC
        LIMIT 10;

        v_result := jsonb_build_object(
            'place', v_place,
            'parent_place', v_parent_place,
            'media', v_media,
            'counts', jsonb_build_object(
                'events', COALESCE(v_events_count, 0),
                'routes', COALESCE(v_routes_count, 0),
                'services', COALESCE(v_services_count, 0),
                'observations', COALESCE(v_observations_count + v_memories_count, 0),
                'mixonet', COALESCE(v_mixonet_count, 0),
                'places', COALESCE(v_subplaces_count, 0),
                'encounters', COALESCE(v_encounters_count, 0)
            ),
            'now', jsonb_build_object(
                'has_content', v_has_content,
                'context', v_now_context,
                'items', v_now_items
            ),
            'nearby', v_nearby,
            'themes', v_themes,
            'observations', v_observations,
            'encounters', COALESCE(v_encounters, '[]'::jsonb),
            'events_list', COALESCE(v_events_list, '[]'::jsonb),
            'place_contents', COALESCE(v_place_contents, '[]'::jsonb)
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_result := jsonb_build_object(
                'place', v_place,
                'parent_place', v_parent_place,
                'media', v_media,
                'counts', jsonb_build_object('events', 0, 'routes', 0, 'services', 0, 'observations', 0, 'mixonet', 0, 'places', 0, 'encounters', 0),
                'now', jsonb_build_object('has_content', false, 'context', 'Ei ilmoitettuja tapahtumia', 'items', '[]'::jsonb),
                'nearby', '[]'::jsonb,
                'themes', '[]'::jsonb,
                'observations', '[]'::jsonb,
                'encounters', '[]'::jsonb,
                'events_list', '[]'::jsonb,
                'place_contents', '[]'::jsonb
            );
    END;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_place_dashboard(TEXT) TO anon, authenticated, service_role;
