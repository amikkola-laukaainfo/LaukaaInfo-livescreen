-- =========================================================
-- MIGRAATIO 052: Hankasalmi-paikat ja palvelukonteksti
-- LaukaaInfo → Monialustainen palvelukonteksti (HankasalmiInfo)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa (050 & 051 jälkeen)
-- =========================================================

-- 1. Hankasalmen pääalue (Kunta / Kirkonkylä) places-tauluun
-- Valitaan selkeä kiinteä UUID Hankasalmen pääpaikalle: 77777777-7777-4777-a777-777777777777
INSERT INTO public.places (
    id,
    name,
    canonical_name,
    type,
    lat,
    lon,
    municipality,
    importance,
    verified,
    status,
    commercial_visibility
) VALUES (
    '77777777-7777-4777-a777-777777777777',
    'Hankasalmen kirkonkylä',
    'Hankasalmi kk',
    'AREA',
    62.3921,
    26.4390,
    'Hankasalmi',
    90,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- 2. Hankasalmen osa-alueet ja kylät (parent_place_id osoittaa Hankasalmi kk -pääalueeseen)
INSERT INTO public.places (
    id,
    name,
    canonical_name,
    type,
    lat,
    lon,
    municipality,
    parent_place_id,
    importance,
    verified,
    status,
    commercial_visibility
) VALUES 
    ('77777777-7777-4777-a777-777777777701', 'Hankasalmen asema', 'Hankasalmi asema', 'AREA', 62.3421, 26.4678, 'Hankasalmi', '77777777-7777-4777-a777-777777777777', 70, true, 'active', true),
    ('77777777-7777-4777-a777-777777777702', 'Niemisjärvi', 'Niemisjärvi', 'AREA', 62.3167, 26.2667, 'Hankasalmi', '77777777-7777-4777-a777-777777777777', 70, true, 'active', true),
    ('77777777-7777-4777-a777-777777777703', 'Venekoski', 'Venekoski', 'AREA', 62.4333, 26.5167, 'Hankasalmi', '77777777-7777-4777-a777-777777777777', 60, true, 'active', true),
    ('77777777-7777-4777-a777-777777777704', 'Ristimäki', 'Ristimäki', 'AREA', 62.4000, 26.3500, 'Hankasalmi', '77777777-7777-4777-a777-777777777777', 60, true, 'active', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Lisätään HankasalmiInfo service_contexts-tauluun
INSERT INTO public.service_contexts (
    id,
    name,
    default_place_id,
    feature_flags,
    branding,
    is_active
) VALUES (
    'hankasalmiinfo',
    'HankasalmiInfo',
    '77777777-7777-4777-a777-777777777777',
    '{"wall": true, "wonderin": true, "muisto": true}'::jsonb,
    '{"name": "HankasalmiInfo", "logo_url": null, "primary_color": "#1e3a8a"}'::jsonb,
    true
) ON CONFLICT (id) DO UPDATE SET
    default_place_id = EXCLUDED.default_place_id,
    branding = EXCLUDED.branding,
    is_active = EXCLUDED.is_active;

-- =========================================================
-- VARMISTUSKYSELYT:
-- =========================================================
-- SELECT id, name, default_place_id, branding FROM public.service_contexts;
-- SELECT id, name, canonical_name, municipality, parent_place_id FROM public.places WHERE municipality = 'Hankasalmi';
-- =========================================================
