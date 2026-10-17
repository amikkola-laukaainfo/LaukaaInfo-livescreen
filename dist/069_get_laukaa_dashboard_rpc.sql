-- =========================================================
-- MIGRAATIO 069: get_laukaa_dashboard RPC
-- LaukaaInfo & LaukaaLive: Yhteinen tilannekuva- ja koontirajapinta
-- =========================================================
-- Kuvaus:
--   Muodostaa hierarkkisen koontinäkymän (tilannekuva, metriikat,
--   nostot ja aluekortit) joko koko Laukaan kunnan tasolla (p_place_id IS NULL)
--   tai valitun alueen / kohteen tasolla (p_place_id = UUID).
--
-- Tietoturva & eheys:
--   - STABLE SECURITY DEFINER, SET search_path = ''
--   - Nouseva ja laskeva rekursio syklien estolla (CYCLE)
--   - Kuntarajan tarkistus: hyväksyy vain Laukaan juurisolmuun kuuluvat aktiiviset solmut
--   - Toistaa kannan julkiset RLS-ehdot (posts, memories, encounters, companies, routes)
-- =========================================================

DROP FUNCTION IF EXISTS public.get_laukaa_dashboard(UUID);

CREATE OR REPLACE FUNCTION public.get_laukaa_dashboard(p_place_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
CALLED ON NULL INPUT
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    -- Laukaan kunnan kiinteä juuri-UUID tietokannassa
    c_laukaa_root_uuid CONSTANT UUID := '6736a5e5-20e5-4f45-828a-bbbeab57caba'::UUID;
    
    v_target_place_id UUID;
    v_target_name TEXT;
    v_target_type TEXT;
    v_target_parent_id UUID;
    v_target_scope TEXT;
    
    v_place_ids UUID[];
    v_place_id_texts TEXT[];
    
    v_upcoming_events_count INT := 0;
    v_recent_memories_count INT := 0;
    v_total_memories_count INT := 0;
    v_active_encounters_count INT := 0;
    v_places_count INT := 0;
    v_services_count INT := 0;
    v_routes_count INT := 0;
    
    v_events_list JSONB := '[]'::jsonb;
    v_memories_list JSONB := '[]'::jsonb;
    v_encounters_list JSONB := '[]'::jsonb;
    v_sub_areas JSONB := '[]'::jsonb;
BEGIN
    -- 1. KUNTARAJAN JA HIERARKIAPUUN AUKOTON VALIDATION (SYKLIEN ESTOLLA)
    IF p_place_id IS NOT NULL AND p_place_id <> c_laukaa_root_uuid THEN
        -- Tarkistetaan nousevalla rekursiolla, että paikka kuuluu Laukaan aktiiviseen puuhun
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_place_id, status
            FROM public.places
            WHERE id = p_place_id
              AND LOWER(status) IN ('active', 'published')
            
            UNION ALL
            
            SELECT parent.id, parent.parent_place_id, parent.status
            FROM public.places parent
            JOIN ancestors child ON child.parent_place_id = parent.id
            WHERE LOWER(parent.status) IN ('active', 'published')
        )
        CYCLE id SET is_cycle USING path
        SELECT id INTO v_target_place_id
        FROM ancestors
        WHERE id = c_laukaa_root_uuid AND NOT is_cycle;

        -- Jos polku ei johtanut Laukaan juurisolmuun, hylätään kutsu välittömästi (esim. Hankasalmi)
        IF v_target_place_id IS NULL THEN
            RETURN NULL;
        END IF;

        v_target_place_id := p_place_id;
    ELSE
        v_target_place_id := c_laukaa_root_uuid;
    END IF;

    -- Haetaan kohdepaikan metatiedot
    SELECT name, type, parent_place_id 
    INTO v_target_name, v_target_type, v_target_parent_id
    FROM public.places 
    WHERE id = v_target_place_id
      AND LOWER(status) IN ('active', 'published');

    -- Jos paikka itse ei ole aktiivinen, hylätään kutsu
    IF v_target_name IS NULL THEN
        RETURN NULL;
    END IF;

    -- Määritetään tason tyyppi (scope)
    IF v_target_place_id = c_laukaa_root_uuid THEN
        v_target_scope := 'municipality';
    ELSIF v_target_parent_id = c_laukaa_root_uuid OR v_target_type = 'AREA' THEN
        v_target_scope := 'area';
    ELSE
        v_target_scope := 'place';
    END IF;

    -- 2. Kerätään valitun paikan koko aktiivinen alipuu (syklien estolla)
    WITH RECURSIVE active_tree AS (
        SELECT id
        FROM public.places
        WHERE id = v_target_place_id
          AND LOWER(status) IN ('active', 'published')
        
        UNION ALL
        
        SELECT child.id
        FROM public.places child
        JOIN active_tree parent ON child.parent_place_id = parent.id
        WHERE LOWER(child.status) IN ('active', 'published')
    )
    CYCLE id SET is_cycle USING path
    SELECT 
        array_agg(id),
        array_agg(id::text)
    INTO v_place_ids, v_place_id_texts
    FROM active_tree
    WHERE NOT is_cycle;

    -- Jos alipuu jää tyhjäksi, poistutaan turvallisesti
    IF v_place_ids IS NULL OR array_length(v_place_ids, 1) = 0 THEN
        RETURN NULL;
    END IF;

    -- 3. TAPAHTUMAT (posts)
    -- Vastaa täsmällisesti kannan julkista RLS-ehtoa ("Public read posts")
    WITH TargetPosts AS (
        SELECT DISTINCT p.id, p.title, p.description, p.image_url, 
               p.event_start_at, p.event_end_at, p.publisher_name, p.created_at
        FROM public.posts p
        LEFT JOIN public.post_places pp ON pp.post_id = p.id
        WHERE p.type = 'event'
          AND (LOWER(p.status) IN ('published', 'approved') OR p.status IS NULL)
          AND (p.expires_at IS NULL OR p.expires_at > NOW())
          AND (LOWER(p.visibility) = 'public' OR p.visibility IS NULL)
          AND p.event_start_at IS NOT NULL
          AND COALESCE(p.event_end_at, p.event_start_at) >= NOW()
          AND (
              pp.place_id = ANY(v_place_ids)
              OR (p.place_id IS NOT NULL AND p.place_id = ANY(v_place_id_texts))
          )
    )
    SELECT 
        COUNT(*),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'title', title,
                'description', description,
                'image_url', image_url,
                'event_start_at', event_start_at,
                'event_end_at', event_end_at,
                'time_context', CASE 
                    WHEN event_start_at <= NOW() AND (event_end_at IS NULL OR event_end_at >= NOW()) THEN 'Käynnissä nyt'
                    WHEN (event_start_at)::DATE = CURRENT_DATE THEN 'Tänään'
                    WHEN (event_start_at)::DATE = CURRENT_DATE + INTERVAL '1 day' THEN 'Huomenna'
                    ELSE 'Tulossa'
                END,
                'publisher_name', publisher_name
            ) ORDER BY event_start_at ASC NULLS LAST, id ASC
        ) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO v_upcoming_events_count, v_events_list
    FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY event_start_at ASC NULLS LAST, id ASC) as rn
        FROM TargetPosts
    ) tp;

    -- 4. MUISTOT & HAVAINNOT (memories)
    WITH TargetMemories AS (
        SELECT DISTINCT m.id, m.title, m.description, m.created_at, m.place_id
        FROM public.memories m
        WHERE (LOWER(m.visibility) = 'public' OR m.visibility IS NULL)
          AND m.created_at <= NOW()
          AND (m.place_id::text = ANY(v_place_id_texts))
    )
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE created_at >= (NOW() - INTERVAL '30 days')),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'title', title,
                'description', description,
                'created_at', created_at,
                'place_id', place_id
            ) ORDER BY created_at DESC NULLS LAST, id ASC
        ) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO v_total_memories_count, v_recent_memories_count, v_memories_list
    FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC NULLS LAST, id ASC) as rn
        FROM TargetMemories
    ) tm;

    -- 5. KOHTAAMISET & ILMOITUKSET (encounters)
    -- Vastaa täsmällisesti kannan julkista RLS-ehtoa ("encounters_select_policy")
    WITH TargetEncounters AS (
        SELECT DISTINCT e.id, e.title, e.type, e.sub_category, e.created_at, e.location
        FROM public.encounters e
        WHERE LOWER(e.status) = 'active'
          AND (LOWER(e.visibility) = 'public' OR e.visibility IS NULL)
          AND e.created_at <= NOW()
          AND (e.expires_at IS NULL OR e.expires_at > NOW())
          AND (
              e.place_id = ANY(v_place_ids)
              OR (e.location_id IS NOT NULL AND e.location_id = ANY(v_place_id_texts))
          )
    )
    SELECT 
        COUNT(*),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'title', title,
                'type', type,
                'sub_category', sub_category,
                'created_at', created_at,
                'location', location
            ) ORDER BY created_at DESC NULLS LAST, id ASC
        ) FILTER (WHERE rn <= 5), '[]'::jsonb)
    INTO v_active_encounters_count, v_encounters_list
    FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC NULLS LAST, id ASC) as rn
        FROM TargetEncounters
    ) te;

    -- 6. PAIKAT, PALVELUT JA REITIT
    -- Paikat: Koko alipuu. Jos ollaan kunnan tasolla, jätetään kunnan abstrakti juurisolmu pois.
    SELECT COUNT(*) INTO v_places_count
    FROM public.places
    WHERE id = ANY(v_place_ids) 
      AND (v_target_scope <> 'municipality' OR id <> c_laukaa_root_uuid)
      AND LOWER(status) IN ('active', 'published');

    -- Palvelut: Vain aktiiviset yritykset
    SELECT COUNT(DISTINCT pcr.company_id) INTO v_services_count
    FROM public.place_company_relations pcr
    JOIN public.companies c ON c.id = pcr.company_id
    WHERE pcr.place_id = ANY(v_place_ids)
      AND LOWER(c.status) = 'active';

    -- Reitit: Julkiset reitit
    SELECT COUNT(DISTINCT r.id) INTO v_routes_count
    FROM public.routes r
    LEFT JOIN public.route_places rp ON rp.route_id = r.id
    WHERE LOWER(r.visibility) = 'public'
      AND (r.access_type = 'PUBLIC' OR r.access_type IS NULL)
      AND (rp.place_id = ANY(v_place_ids) OR r.place_id = ANY(v_place_ids));

    -- 7. ALUEKORTIT (vain kunnan tasolla)
    IF v_target_scope = 'municipality' THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'name', a.name,
                'places_count', sub_calc.places_cnt,
                'events_count', sub_calc.events_cnt
            ) ORDER BY a.name ASC, a.id ASC
        ), '[]'::jsonb) INTO v_sub_areas
        FROM public.places a
        CROSS JOIN LATERAL (
            WITH RECURSIVE area_tree AS (
                SELECT id, id::text AS id_text
                FROM public.places
                WHERE id = a.id
                  AND LOWER(status) IN ('active', 'published')
                
                UNION ALL
                
                SELECT child.id, child.id::text
                FROM public.places child
                JOIN area_tree parent ON child.parent_place_id = parent.id
                WHERE LOWER(child.status) IN ('active', 'published')
            )
            CYCLE id SET is_cycle USING path
            SELECT 
                (
                    SELECT COUNT(*) 
                    FROM area_tree
                    WHERE NOT is_cycle
                ) AS places_cnt,
                (
                    SELECT COUNT(DISTINCT p.id)
                    FROM public.posts p
                    LEFT JOIN public.post_places pp ON pp.post_id = p.id
                    WHERE p.type = 'event'
                      AND (LOWER(p.status) IN ('published', 'approved') OR p.status IS NULL)
                      AND (p.expires_at IS NULL OR p.expires_at > NOW())
                      AND (LOWER(p.visibility) = 'public' OR p.visibility IS NULL)
                      AND p.event_start_at IS NOT NULL
                      AND COALESCE(p.event_end_at, p.event_start_at) >= NOW()
                      AND (
                          pp.place_id IN (SELECT id FROM area_tree WHERE NOT is_cycle)
                          OR (p.place_id IS NOT NULL AND p.place_id IN (SELECT id_text FROM area_tree WHERE NOT is_cycle))
                      )
                ) AS events_cnt
        ) sub_calc
        WHERE a.parent_place_id = c_laukaa_root_uuid 
          AND LOWER(a.status) IN ('active', 'published');
    END IF;

    -- 8. Kootaan vastaus
    RETURN jsonb_build_object(
        'context', jsonb_build_object(
            'scope', v_target_scope,
            'place_id', v_target_place_id,
            'place_name', v_target_name,
            'parent_place_id', v_target_parent_id
        ),
        'counts', jsonb_build_object(
            'upcoming_events', v_upcoming_events_count,
            'recent_memories', v_recent_memories_count,
            'total_memories', v_total_memories_count,
            'active_encounters', v_active_encounters_count,
            'places', v_places_count,
            'services', v_services_count,
            'routes', v_routes_count
        ),
        'pulse', jsonb_build_object(
            'events', v_events_list,
            'memories', v_memories_list,
            'encounters', v_encounters_list
        ),
        'sub_areas', v_sub_areas
    );
END;
$$;

-- Vain lukuoikeudet julkisille ja todennetuille rooleille
GRANT EXECUTE ON FUNCTION public.get_laukaa_dashboard(UUID) TO anon, authenticated, service_role;

-- =========================================================
-- TARKISTUS- JA TESTIKYSELYT:
-- =========================================================
-- 1. Koko Laukaa:
-- SELECT public.get_laukaa_dashboard(NULL);
--
-- 2. Vihtavuori (taajama lapsikohteineen):
-- SELECT public.get_laukaa_dashboard('33333333-3333-4333-a333-333333333333');
--
-- 3. Vieraskunta (Hankasalmi -> odotettu tulos NULL):
-- SELECT public.get_laukaa_dashboard('910ce8f3-7b76-4276-ac17-7f7238224f00');
-- =========================================================
