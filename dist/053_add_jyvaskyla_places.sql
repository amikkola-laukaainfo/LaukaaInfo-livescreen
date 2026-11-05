-- =========================================================
-- MIGRAATIO 053: Jyväskylän seutukohteet places-tauluun
-- LaukaaInfo -> Seudullinen paikkaverkosto
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa
-- =========================================================

-- 1. Jyväskylän pääalue (Kunta / Keskusta)
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
    'Jyväskylä',
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

-- 2. Jyväskylän elämys- ja kulttuurikohteet
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
    ('88888888-8888-4888-a888-888888888801', 'Kangas & Tourujoki', 'Kangas Tourujoki', 'AREA', 62.2470, 25.7580, 'Jyväskylä', '88888888-8888-4888-a888-888888888800', 85, true, 'active', true),
    ('88888888-8888-4888-a888-888888888802', 'Harju & Vesilinna', 'Harju Vesilinna', 'AREA', 62.2440, 25.7420, 'Jyväskylä', '88888888-8888-4888-a888-888888888800', 75, true, 'active', true),
    ('88888888-8888-4888-a888-888888888803', 'Lutakon satama', 'Lutakko satama', 'AREA', 62.2380, 25.7530, 'Jyväskylä', '88888888-8888-4888-a888-888888888800', 75, true, 'active', true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    canonical_name = EXCLUDED.canonical_name,
    municipality = EXCLUDED.municipality;

