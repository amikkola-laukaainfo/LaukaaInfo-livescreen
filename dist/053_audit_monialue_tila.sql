-- =========================================================
-- AUDITOINTISKRIPTI 053: Monialueisuuden ja migraatioiden tilanteen tarkistus
-- LaukaaInfo -> Monialustainen palvelukonteksti
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa
-- (duxluwyqxvbmkkjzuzkz.supabase.co)
-- =========================================================

-- 1. Tarkista service_contexts-taulu ja sen rivit
SELECT 
    id, 
    name, 
    default_place_id, 
    feature_flags, 
    branding, 
    is_active, 
    created_at
FROM public.service_contexts;

-- 2. Tarkista Hankasalmen ja Laukaan paikkahierarkia
SELECT 
    id, 
    name, 
    canonical_name, 
    type, 
    municipality, 
    parent_place_id
FROM public.places
WHERE municipality IN ('Laukaa', 'Hankasalmi')
ORDER BY municipality, parent_place_id NULLS FIRST, name;

-- 3. Tarkista publish_post_with_key()-funktion nykyinen määritelmä
-- (varmistetaan ettei ole kovakoodattua 'Laukaa'-fallbackia)
SELECT 
    routine_name, 
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'publish_post_with_key';

-- 4. Tarkista post_places-taulun place_id-arvojen tyypit ja mahdolliset orvot/tekstiarvot
SELECT 
    post_places.place_id,
    COUNT(*) as post_count,
    CASE 
        WHEN places.id IS NOT NULL THEN 'VALID_UUID_FOUND'
        ELSE 'ORPHAN_OR_NAME_STRING'
    END as status
FROM public.post_places
LEFT JOIN public.places ON places.id::text = post_places.place_id
GROUP BY post_places.place_id, places.id;

-- 5. Tarkista service_contexts RLS-politiikat
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual
FROM pg_policies
WHERE tablename = 'service_contexts';
