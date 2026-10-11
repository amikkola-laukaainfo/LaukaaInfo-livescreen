-- =========================================================
-- TESTISKRIPTI: Päästä päähän -testijulkaisu
-- LaukaaInfo — Julkaisijan polun auditointi (11.10.2026)
-- =========================================================
-- Tämä skripti luo yhden testijulkaisun ja tarkistaa,
-- löytyykö se kaikista odotetuista näkyvyyspinnoista.
--
-- Testattavat pinnat:
--   A. Seinä (get_context_posts 'laukaainfo')
--   B. Paikkasivunäkymä (post_places → place_id UUID)
--   C. Teemasivunäkymä (post_themes → tag_id)
--   D. Toimijakortti (posts WHERE organization_id = ?)
--   E. Julkaisun elinkaari (expires_at ja status)
--
-- VAROITUS: Testijulkaisu poistetaan lopuksi.
--           Aja vaiheet järjestyksessä.
-- =========================================================


-- =========================================================
-- VAIHE 0: Varmista testijärjestö ja testipaikka
--
-- Vaihda nämä oman Supabase-kannan todellisiin arvoihin:
--   TEST_ORG_ID    = organisations-taulun id (tai uusi testiorganisaatio)
--   TEST_PLACE_UUID = places-taulun id (esim. Laukaan kirkonkylä)
--   TEST_TAG_ID    = tags-taulun tag_id (esim. 'lapsiperheet')
-- =========================================================

-- 0a. Hae testipaikkojen UUID:t
SELECT id, name, canonical_name, type, parent_place_id
FROM public.places
WHERE municipality = 'Laukaa'
  AND (type = 'AREA' OR place_type = 'KUNTA')
ORDER BY importance DESC NULLS LAST
LIMIT 5;

-- 0b. Hae käytettävissä olevat teematunnisteet
SELECT tag_id, name
FROM public.tags
ORDER BY tag_id
LIMIT 20;

-- 0c. Hae testiorganisaatiot
SELECT id, name, type, publisher_enabled
FROM public.organizations
ORDER BY created_at DESC
LIMIT 10;


-- =========================================================
-- VAIHE 1: Luo testiorganisaatio (jos ei ole olemassa)
-- =========================================================

INSERT INTO public.organizations (id, name, type, publisher_enabled, wall_visibility)
VALUES (
    'test-e2e-org-2026',
    'Testaajien yhdistys (e2e-testi 2026-10-11)',
    'association',
    true,
    'public'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, publisher_enabled = true;


-- =========================================================
-- VAIHE 2: Luo testijulkaisu suoraan (ilman RPC, jotta
--           voidaan kontrolloida kaikkia arvoja tarkasti)
-- =========================================================

-- Tallenna post_id muuttujaan myöhempiä vaiheita varten:
DO $$
DECLARE
    v_post_id UUID := 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2';  -- Kiinteä UUID testaukseen
    v_place_id UUID := '55555555-5555-4555-a555-555555555555'; -- Laukaan kirkonkylä UUID
    v_tag_id TEXT;
BEGIN
    -- Poistetaan aiempi testidata
    DELETE FROM public.posts WHERE id = v_post_id;

    -- Haetaan olemassa oleva teematunniste tags-taulusta
    SELECT tag_id INTO v_tag_id FROM public.tags LIMIT 1;
    IF v_tag_id IS NULL THEN
        v_tag_id := 'kulttuuri';
    END IF;

    -- Luodaan testijulkaisu
    INSERT INTO public.posts (
        id, organization_id, title, content, type,
        visibility, status, created_at, published_at,
        event_start_at, event_end_at, event_all_day,
        event_location_detail, expires_at
    ) VALUES (
        v_post_id,
        'test-e2e-org-2026',
        'E2E-testijulkaisu: Syystapahtuma 2026',
        'Tämä on päästä päähän -testijulkaisu. Löydät tämän paikkasivulta, teemasivulta, toimijakortilta ja Seinältä.',
        'event',
        'public',
        'published',
        NOW(),
        NOW(),
        NOW() + INTERVAL '7 days',
        NOW() + INTERVAL '7 days' + INTERVAL '3 hours',
        false,
        'Laukaan kirkonkylä, Yhteisötalo',
        NOW() + INTERVAL '30 days'
    );

    -- Lisätään paikkasuhde (UUID-tyyppinen)
    INSERT INTO public.post_places (post_id, place_id, relation)
    VALUES (v_post_id, v_place_id, 'venue');

    -- Lisätään teema
    INSERT INTO public.post_themes (post_id, tag_id)
    VALUES (v_post_id, v_tag_id);

    RAISE NOTICE 'Testijulkaisu luotu: %, teema: %', v_post_id, v_tag_id;
END;
$$;


-- =========================================================
-- VAIHE 3A: Tarkista – näkyykö Seinällä?
-- Odotettu tulos: 1 rivi, jossa matched_place_id = v_place_id
-- =========================================================
SELECT
    post_id,
    organization_id,
    title,
    type,
    visibility,
    status,
    matched_place_id
FROM public.get_context_posts('laukaainfo', 'test-e2e-org-2026', 50)
WHERE organization_id = 'test-e2e-org-2026';

-- Odotettu tulos: 1 rivi
-- Jos 0 riviä: get_context_posts ei löydä julkaisua →
--   tarkista fallback-logiikka (rivi 77 / 055_get_context_posts_rpc.sql)


-- =========================================================
-- VAIHE 3B: Tarkista – löytyykö paikan kautta?
-- Odotettu tulos: 1 rivi post_places-taulusta
-- =========================================================
SELECT
    pp.post_id,
    pp.place_id,
    pp.relation,
    pl.name AS place_name,
    pl.type AS place_type
FROM public.post_places pp
LEFT JOIN public.places pl ON pl.id::text = pp.place_id
WHERE pp.post_id = 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2';

-- Odotettu tulos: 1 rivi, jossa place_name on 'Laukaan kirkonkylä' (tai vastaava)
-- Jos place_name on NULL: place_id ei vastaa places.id:tä → UUID-tyyppiristiriita (V1-bugi)


-- =========================================================
-- VAIHE 3C: Tarkista – löytyykö teeman kautta?
-- odotettu tulos: 1 rivi
-- =========================================================
SELECT
    pt.post_id,
    pt.tag_id,
    t.name AS tag_name
FROM public.post_themes pt
LEFT JOIN public.tags t ON t.tag_id = pt.tag_id
WHERE pt.post_id = 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2';

-- Jos tag_name on NULL: post_themes.tag_id ei vastaa tags.tag_id:tä → P1-bugi


-- =========================================================
-- VAIHE 3D: Tarkista – löytyykö toimijakortin kyselyllä?
-- (yrityskortti.js:n loadOrgPosts() käyttää tätä kyselyä)
-- =========================================================
SELECT
    p.id,
    p.title,
    p.type,
    p.visibility,
    p.status,
    p.created_at,
    p.expires_at,
    p.event_start_at,
    COUNT(pp.id) AS place_count,
    COUNT(pt.id) AS theme_count
FROM public.posts p
LEFT JOIN public.post_places pp ON pp.post_id = p.id
LEFT JOIN public.post_themes pt ON pt.post_id = p.id
WHERE p.organization_id = 'test-e2e-org-2026'
  AND p.status NOT IN ('deleted', 'cleanup_pending')
GROUP BY p.id
ORDER BY p.created_at DESC;

-- Odotettu tulos: 1 rivi, place_count = 1, theme_count = 1


-- =========================================================
-- VAIHE 3E: Tarkista – paikkahierarkia toimii?
-- Kunta → Taajama → Kohde periytyminen
-- =========================================================
SELECT place_id
FROM public.get_place_tree_ids('55555555-5555-4555-a555-555555555555')
LIMIT 30;

-- Odotettu tulos: Laukaan UUID + kaikki lapsipaikat
-- Jos vain 1 rivi: rekursiivinen CTE ei löydä lapsipaikkoja →
--   tarkista parent_place_id-linkit places-taulussa


-- =========================================================
-- VAIHE 3F: Kokonaistesti — löytyykö julkaisu kaikista pinnoista?
-- =========================================================
SELECT
    'Seinä (get_context_posts)' AS pinta,
    CASE WHEN EXISTS (
        SELECT 1 FROM public.get_context_posts('laukaainfo', 'test-e2e-org-2026', 10)
        WHERE organization_id = 'test-e2e-org-2026'
    ) THEN '✅ LÖYTYY' ELSE '❌ EI LÖYDY' END AS tulos

UNION ALL

SELECT
    'Paikkayhteys (post_places → places)',
    CASE WHEN EXISTS (
        SELECT 1 FROM public.post_places pp
        JOIN public.places pl ON pl.id::text = pp.place_id
        WHERE pp.post_id = 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2'
    ) THEN '✅ UUID TÄSMÄÄ' ELSE '❌ UUID EI TÄSMÄÄ (V1-bugi)' END

UNION ALL

SELECT
    'Teemayhteys (post_themes → tags)',
    CASE WHEN EXISTS (
        SELECT 1 FROM public.post_themes pt
        JOIN public.tags t ON t.tag_id = pt.tag_id
        WHERE pt.post_id = 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2'
    ) THEN '✅ TAG LÖYTYY' ELSE '⚠️ TAG EI LÖYDY TAKSONOMIASTÂ (P1-bugi)' END

UNION ALL

SELECT
    'Toimijakortti (posts WHERE organization_id)',
    CASE WHEN EXISTS (
        SELECT 1 FROM public.posts
        WHERE organization_id = 'test-e2e-org-2026'
          AND status NOT IN ('deleted','cleanup_pending')
    ) THEN '✅ LÖYTYY' ELSE '❌ EI LÖYDY' END

UNION ALL

SELECT
    'Paikkahierarkia (get_place_tree_ids)',
    CASE WHEN (
        SELECT COUNT(*) FROM public.get_place_tree_ids('55555555-5555-4555-a555-555555555555')
    ) > 1 THEN '✅ HIERARKIA TOIMII' ELSE '⚠️ VAIN JUURISOLMU (tarkista parent_place_id)' END;


-- =========================================================
-- VAIHE 4: SIIVOUS — Poista testijulkaisu
-- =========================================================

-- Poista vain kun testit on suoritettu ja dokumentoitu!
-- ON DELETE CASCADE poistaa post_places ja post_themes automaattisesti.

-- DELETE FROM public.posts WHERE id = 'eeeeeeee-e2e0-4e2e-ae2e-e2e2e2e2e2e2';
-- DELETE FROM public.organizations WHERE id = 'test-e2e-org-2026';

-- Kommentoi yllä oleva pois kun olet valmis siivomaan.
-- =========================================================
