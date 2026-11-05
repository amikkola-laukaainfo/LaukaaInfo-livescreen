-- =========================================================
-- MIGRAATIO 053: Alueet-kartan ja seutukohteiden paikkatieto (places)
-- LaukaaInfo -> Seudullinen paikkaverkosto (Keski-Suomi & seutu)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa
-- =========================================================

-- =========================================================
-- 1. HANKASALMEN ELÄMYS- JA MATKAILUKOHTEET
-- =========================================================

-- 1.1 Häkärinteet (Laskettelukeskus & elämysalue)
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
) VALUES (
    '77777777-7777-4777-a777-777777777710',
    'Häkärinteet',
    'Häkärinteet Häkä',
    'LANDMARK',
    62.3270,
    26.4150,
    'Hankasalmi',
    '77777777-7777-4777-a777-777777777777',
    85,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon;

-- 1.2 Revontuli Resort (Lomakeskus, sauna & golf)
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
) VALUES (
    '77777777-7777-4777-a777-777777777711',
    'Revontuli Resort',
    'Revontuli Resort Lomakeskus Revontuli',
    'LANDMARK',
    62.3480,
    26.4350,
    'Hankasalmi',
    '77777777-7777-4777-a777-777777777777',
    85,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon;

-- 1.3 Hankasalmen museokylä
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
) VALUES (
    '77777777-7777-4777-a777-777777777712',
    'Hankasalmen museokylä',
    'Hankasalmen museokylä',
    'LANDMARK',
    62.3870,
    26.4280,
    'Hankasalmi',
    '77777777-7777-4777-a777-777777777777',
    75,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;


-- =========================================================
-- 2. LAUKAAN VETOVOIMAKOHTEET
-- =========================================================

-- 2.1 Kylpylähotelli Peurunka
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
) VALUES (
    'b04ed934-e927-42f9-9b40-1d7112a315f9',
    'Kylpylähotelli Peurunka',
    'Peurunka Kylpylähotelli Peurunka',
    'LANDMARK',
    62.4350,
    25.8520,
    'Laukaa',
    '55555555-5555-4555-a555-555555555555',
    95,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    importance = EXCLUDED.importance;

-- 2.2 Saraakallion kalliomaalaukset
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
) VALUES (
    '55555555-5555-4555-a555-555555555510',
    'Saraakallion kalliomaalaukset',
    'Saraakallio kalliomaalaukset',
    'LANDMARK',
    62.4850,
    25.9890,
    'Laukaa',
    '55555555-5555-4555-a555-555555555555',
    90,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- 2.3 Kuusaankoski & Kanava
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
) VALUES (
    '55555555-5555-4555-a555-555555555511',
    'Kuusaankoski & Kanava',
    'Kuusaankoski Kanava',
    'LANDMARK',
    62.4630,
    25.9380,
    'Laukaa',
    '55555555-5555-4555-a555-555555555555',
    90,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;


-- =========================================================
-- 3. JYVÄSKYLÄN SEUTUKOHTEET
-- =========================================================

-- 3.1 Jyväskylän keskusta (Pääalue)
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
    '88888888-8888-4888-a888-888888888800',
    'Jyväskylän keskusta',
    'Jyväskylä keskusta',
    'AREA',
    62.2426,
    25.7473,
    'Jyväskylä',
    90,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- 3.2 Kankaan alue & Tourujoki
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
) VALUES (
    '88888888-8888-4888-a888-888888888801',
    'Kankaan alue & Tourujoki',
    'Kangas Tourujoki Kankaan tehdas',
    'AREA',
    62.2470,
    25.7580,
    'Jyväskylä',
    '88888888-8888-4888-a888-888888888800',
    85,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- 3.3 Harju & Vesilinnan näkötorni
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
) VALUES (
    '88888888-8888-4888-a888-888888888802',
    'Harju & Vesilinnan näkötorni',
    'Harju Vesilinna Harjun portaat',
    'LANDMARK',
    62.2440,
    25.7420,
    'Jyväskylä',
    '88888888-8888-4888-a888-888888888800',
    80,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- 3.4 Lutakon satama & Rantaraitti
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
) VALUES (
    '88888888-8888-4888-a888-888888888803',
    'Lutakon satama & Rantaraitti',
    'Lutakko satama Jyväsjärvi',
    'LANDMARK',
    62.2380,
    25.7530,
    'Jyväskylä',
    '88888888-8888-4888-a888-888888888800',
    80,
    true,
    'active',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

-- =========================================================
-- TARKISTUSKYSELY:
-- =========================================================
-- SELECT id, name, canonical_name, type, municipality, lat, lon FROM public.places WHERE id IN (
--   '77777777-7777-4777-a777-777777777710',
--   '77777777-7777-4777-a777-777777777711',
--   '77777777-7777-4777-a777-777777777712',
--   'b04ed934-e927-42f9-9b40-1d7112a315f9',
--   '55555555-5555-4555-a555-555555555510',
--   '55555555-5555-4555-a555-555555555511',
--   '88888888-8888-4888-a888-888888888801',
--   '88888888-8888-4888-a888-888888888802',
--   '88888888-8888-4888-a888-888888888803'
-- );

