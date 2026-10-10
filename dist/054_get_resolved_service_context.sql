-- =========================================================
-- MIGRAATIO 054: ContextResolver SQL RPC -funktion toteutus
-- LaukaaInfo → Monialustainen palvelukonteksti (Vaihe 2)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa (050–052 jälkeen)
-- =========================================================

-- 1. Lisätään content_scope -kenttä service_contexts-tauluun jos puuttuu
ALTER TABLE public.service_contexts
ADD COLUMN IF NOT EXISTS content_scope JSONB NOT NULL DEFAULT '{"mode": "TREE"}'::jsonb;

-- Päivitetään laukaainfo ja hankasalmiinfo content_scope -määritykset
UPDATE public.service_contexts
SET content_scope = jsonb_build_object(
    'mode', 'TREE',
    'root_place_id', default_place_id,
    'included_place_ids', '[]'::jsonb,
    'excluded_place_ids', '[]'::jsonb
)
WHERE content_scope IS NULL OR content_scope = '{"mode": "TREE"}'::jsonb;

-- 2. Paikkahierarkian rekursiivinen apufunktio (get_place_tree_ids)
CREATE OR REPLACE FUNCTION public.get_place_tree_ids(p_root_place_id UUID)
RETURNS TABLE (place_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    WITH RECURSIVE place_tree AS (
        -- Juuripaikan haku
        SELECT id
        FROM public.places
        WHERE id = p_root_place_id

        UNION

        -- Rekursiivinen laskeutuminen lapsipaikkoihin
        SELECT child.id
        FROM public.places child
        JOIN place_tree parent ON child.parent_place_id = parent.id
        WHERE child.status <> 'deleted' OR child.status IS NULL
    )
    SELECT id FROM place_tree;
$$;

GRANT EXECUTE ON FUNCTION public.get_place_tree_ids TO anon, authenticated;

-- 3. Keskitetty ContextResolver RPC -funktio (get_resolved_service_context)
CREATE OR REPLACE FUNCTION public.get_resolved_service_context(p_service_id TEXT DEFAULT 'laukaainfo')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_ctx RECORD;
    v_mode TEXT;
    v_root_place_id UUID;
    v_resolved_place_ids UUID[];
    v_result JSONB;
BEGIN
    -- 1. Hae palvelukonteksti (fallback 'laukaainfo' jos ei löydy)
    SELECT * INTO v_ctx
    FROM public.service_contexts
    WHERE id = p_service_id AND is_active = true;

    IF v_ctx.id IS NULL THEN
        SELECT * INTO v_ctx
        FROM public.service_contexts
        WHERE id = 'laukaainfo' AND is_active = true;
    END IF;

    -- 2. Määritä mode ja root_place_id
    v_mode := COALESCE(v_ctx.content_scope->>'mode', 'TREE');
    v_root_place_id := COALESCE((v_ctx.content_scope->>'root_place_id')::uuid, v_ctx.default_place_id);

    -- 3. Ratkaise paikat suoritustilan mukaan
    IF v_mode = 'TREE' THEN
        SELECT array_agg(place_id) INTO v_resolved_place_ids
        FROM public.get_place_tree_ids(v_root_place_id);

    ELSIF v_mode = 'SELECTED' THEN
        SELECT array_agg(value::uuid) INTO v_resolved_place_ids
        FROM jsonb_array_elements_text(COALESCE(v_ctx.content_scope->'included_place_ids', '[]'::jsonb));

    ELSE -- 'SINGLE' tai muu
        v_resolved_place_ids := ARRAY[v_root_place_id];
    END IF;

    -- Varmista ettei resolved_place_ids ole NULL
    IF v_resolved_place_ids IS NULL THEN
        v_resolved_place_ids := ARRAY[v_root_place_id];
    END IF;

    -- 4. Kokoa tulos-JSON
    v_result := jsonb_build_object(
        'id', v_ctx.id,
        'name', v_ctx.name,
        'default_place_id', v_ctx.default_place_id,
        'content_scope', v_ctx.content_scope,
        'resolved_place_ids', to_jsonb(v_resolved_place_ids),
        'branding', v_ctx.branding,
        'feature_flags', v_ctx.feature_flags,
        'is_active', v_ctx.is_active
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resolved_service_context TO anon, authenticated;

-- =========================================================
-- VARMISTUSKYSELY:
-- =========================================================
-- SELECT public.get_resolved_service_context('laukaainfo');
-- SELECT public.get_resolved_service_context('hankasalmiinfo');
-- =========================================================
