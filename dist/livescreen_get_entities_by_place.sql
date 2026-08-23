-- ============================================================
-- LIVESCREEN: get_entities_by_place RPC-funktio
-- Aja tämä Mixonetin Supabase SQL Editorissa (btwerbixrydfalqrpnmg)
-- ============================================================
--
-- Tämä funktio korvaa yksinkertaisen "WHERE place_id = X" -haun
-- relevanssipohjaisella paikkayhteyssuhdehaulla.
--
-- Kutsutaan LaukaaInfosta:
--   mixonetClient.rpc('get_entities_by_place', {
--     target_place_id: 'vihtavuori-uuid',
--     min_weight: 0
--   })
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_entities_by_place(
    target_place_id TEXT,
    min_weight       INTEGER DEFAULT 0
)
RETURNS TABLE (
    relation_type TEXT,
    source_type   TEXT,
    source_id     TEXT,
    weight        INTEGER,
    metadata      JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        er.relation_type,
        er.source_type,
        er.source_id::TEXT,
        -- Relevanssipaino suhdtyypin mukaan
        CASE er.relation_type
            WHEN 'LOCATED_AT'   THEN 100
            WHEN 'OPERATES_IN'  THEN 90
            WHEN 'RELATES_TO'   THEN 80
            WHEN 'SERVICE_AREA' THEN 40
            ELSE 50
        END AS weight,
        er.metadata
    FROM entity_relations er
    WHERE
        er.target_type = 'PLACE'
        AND er.target_id = target_place_id
        AND (
            -- Sovella min_weight-suodatus
            CASE er.relation_type
                WHEN 'LOCATED_AT'   THEN 100
                WHEN 'OPERATES_IN'  THEN 90
                WHEN 'RELATES_TO'   THEN 80
                WHEN 'SERVICE_AREA' THEN 40
                ELSE 50
            END
        ) >= min_weight
    ORDER BY
        weight DESC,
        er.created_at DESC;
END;
$$;

-- Annetaan anon-roolille oikeus kutsua tätä
GRANT EXECUTE ON FUNCTION public.get_entities_by_place TO anon;
GRANT EXECUTE ON FUNCTION public.get_entities_by_place TO authenticated;

-- ============================================================
-- Testaa SQL Editorissa:
-- SELECT * FROM get_entities_by_place('VIHTAVUORI-PLACE-UUID-TÄHÄN');
-- SELECT * FROM get_entities_by_place('VIHTAVUORI-PLACE-UUID-TÄHÄN', 80);  -- vain korkeat painot
-- ============================================================
