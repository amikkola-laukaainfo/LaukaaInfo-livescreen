-- =========================================================
-- MIGRAATIO 055: get_context_posts RPC -funktio (Vanhojen julkaisujen fallback)
-- LaukaaInfo → Monialustainen palvelukonteksti (Vaihe 3)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa
-- =========================================================

DROP FUNCTION IF EXISTS public.get_context_posts(text, text, integer);

CREATE OR REPLACE FUNCTION public.get_context_posts(
    p_service_id   TEXT    DEFAULT 'laukaainfo',
    p_org_id       TEXT    DEFAULT NULL,
    p_max_results  INTEGER DEFAULT 100
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
    v_ctx JSONB;
    v_place_uuids UUID[];
    v_place_match_strings TEXT[];
BEGIN
    -- 1. Hae ratkaistu palvelukonteksti 054-funktiolla
    v_ctx := public.get_resolved_service_context(p_service_id);
    
    -- Kerätään ratkaisun UUID:t
    SELECT array_agg(value::uuid) INTO v_place_uuids
    FROM jsonb_array_elements_text(v_ctx->'resolved_place_ids');

    -- 2. Kerätään sekä UUID:t että paikkojen nimitunnisteet
    SELECT array_agg(DISTINCT match_val) INTO v_place_match_strings
    FROM (
        SELECT pl.id::text AS match_val FROM public.places pl WHERE pl.id = ANY(v_place_uuids)
        UNION
        SELECT pl.name AS match_val FROM public.places pl WHERE pl.id = ANY(v_place_uuids) AND pl.name IS NOT NULL
        UNION
        SELECT pl.canonical_name AS match_val FROM public.places pl WHERE pl.id = ANY(v_place_uuids) AND pl.canonical_name IS NOT NULL
    ) sub;

    -- 3. Hae julkaisut LEFT JOIN -kytkennällä
    -- Jos julkaisulla on tietoinen paikkamerkintä post_places-taulussa -> rajataan sen mukaan.
    -- Jos paikkamerkintää ei ole vielä luotu (vanha data) -> näytetään oletuspalvelussa (laukaainfo).
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
        COALESCE(pp.place_id, v_ctx->>'default_place_id') AS matched_place_id
    FROM public.posts p
    LEFT JOIN public.post_places pp ON pp.post_id = p.id
    WHERE
        p.status <> 'deleted' 
        AND p.status <> 'cleanup_pending'
        AND (p.visibility = 'public' OR p.visibility IS NULL)
        AND (p_org_id IS NULL OR p.organization_id = p_org_id)
        AND (
            pp.place_id = ANY(v_place_match_strings)
            OR (pp.place_id IS NULL AND p_service_id = 'laukaainfo')
        )
    ORDER BY p.id, p.created_at DESC
    LIMIT p_max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_context_posts TO anon, authenticated;

-- =========================================================
-- VARMISTUSKYSELYT:
-- =========================================================
-- SELECT * FROM public.get_context_posts('laukaainfo');
-- SELECT * FROM public.get_context_posts('hankasalmiinfo');
-- =========================================================
