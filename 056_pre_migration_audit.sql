-- =========================================================
-- AUDITOINTI 056: Pre-migraatiotarkistus ennen post_places-korjausta
-- LaukaaInfo — Julkaisijan polun auditointi (11.10.2026)
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa ENNEN migraatiota.
-- Tulokset kertovat, mitä on siivottava ennen UUID-tyyppimuutosta.
--
-- Kyselyn järjestys:
--   1. post_places-rivien tyyppianalyysi
--   2. Orvot viitteet (place_id ei löydy places-taulusta)
--   3. Julkaisut ilman paikkaa
--   4. Julkaisut ilman teemaa
--   5. organization_id-yhteensopivuus (mikä muoto on käytössä)
--   6. post_themes-tunnisteiden vastaavuus tags-tauluun
--   7. post_media vs post_attachments päällekkäisyys
-- =========================================================


-- =========================================================
-- 1. post_places: place_id -arvojen tyyppianalyysi
--    Tavoite: Selvittää kuinka monta riviä on UUID-muotoisia,
--             kuinka monta on nimiä ja kuinka monta on tyhjiä.
-- =========================================================
WITH counts AS (
    SELECT
        CASE
            WHEN place_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN 'VALID_UUID_FORMAT'
            WHEN place_id IS NULL OR place_id = ''
                THEN 'EMPTY'
            WHEN length(place_id) < 36
                THEN 'SHORT_STRING_OR_NAME'
            ELSE
                'LONG_NON_UUID'
        END AS id_type,
        place_id
    FROM public.post_places
),
agg AS (
    SELECT
        id_type,
        COUNT(*)         AS row_count,
        array_agg(DISTINCT place_id ORDER BY place_id) AS all_examples
    FROM counts
    GROUP BY id_type
)
SELECT
    id_type,
    row_count,
    -- Näytetään enintään 10 esimerkkiä jokaisesta tyypistä
    all_examples[1:10] AS examples
FROM agg
ORDER BY row_count DESC;



-- =========================================================
-- 2. Orvot viitteet: post_places.place_id ei löydy places-taulusta
--    Näitä ei voi muuntaa suoraan UUID-tyyppiin.
--    Tulos: ORPHAN_OR_NAME_STRING = siivousta tarvitaan
-- =========================================================
SELECT
    pp.place_id,
    COUNT(*) AS post_count,
    CASE
        WHEN pl.id IS NOT NULL THEN 'VALID_UUID_FOUND'
        ELSE 'ORPHAN_OR_NAME_STRING'
    END AS status
FROM public.post_places pp
LEFT JOIN public.places pl ON pl.id::text = pp.place_id
GROUP BY pp.place_id, pl.id
ORDER BY status DESC, post_count DESC;


-- =========================================================
-- 3. Julkaisut ilman paikkamerkintää
--    Nämä näkyvät vain fallback-logiikan kautta (kaikki laukaainfo-seinät).
--    Harkitse: pitäisikö lisätä default_place_id vai pitää fallback?
-- =========================================================
SELECT
    p.id AS post_id,
    p.organization_id,
    p.title,
    p.type,
    p.visibility,
    p.status,
    p.created_at,
    p.expires_at
FROM public.posts p
LEFT JOIN public.post_places pp ON pp.post_id = p.id
WHERE pp.post_id IS NULL
  AND p.status NOT IN ('deleted', 'cleanup_pending')
ORDER BY p.created_at DESC
LIMIT 50;


-- =========================================================
-- 4. Julkaisut ilman teemamerkintää
--    Nämä eivät näy millään teemasivulla.
-- =========================================================
SELECT
    p.id AS post_id,
    p.organization_id,
    p.title,
    p.type,
    p.created_at
FROM public.posts p
LEFT JOIN public.post_themes pt ON pt.post_id = p.id
WHERE pt.post_id IS NULL
  AND p.status NOT IN ('deleted', 'cleanup_pending')
ORDER BY p.created_at DESC
LIMIT 50;


-- =========================================================
-- 5. organization_id-arvojen muotoanalyysi posts-taulussa
--    Tavoite: Selvittää onko organization_id "company-123" vai "123" vai UUID.
--    Tulos ohjaa loadOrgPosts()-funktion rawId-logiikan tarkistuksen.
-- =========================================================
WITH fmt AS (
    SELECT
        CASE
            WHEN organization_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN 'UUID_FORMAT'
            WHEN organization_id LIKE 'company-%'
                THEN 'COMPANY_PREFIX'
            WHEN organization_id ~ '^\d+$'
                THEN 'NUMERIC_ID'
            WHEN organization_id IS NULL
                THEN 'NULL'
            ELSE
                'OTHER_TEXT'
        END AS id_format,
        organization_id
    FROM public.posts
),
agg AS (
    SELECT
        id_format,
        COUNT(*)                                            AS post_count,
        array_agg(DISTINCT organization_id ORDER BY organization_id) AS all_samples
    FROM fmt
    GROUP BY id_format
)
SELECT
    id_format,
    post_count,
    all_samples[1:10] AS samples
FROM agg
ORDER BY post_count DESC;



-- =========================================================
-- 6. post_themes: tag_id-vastaavuudet tags-tauluun
--    Jos tags-taulua ei ole, muuta 'tags' oikeaksi taulunimeksi.
--    Tulos: ORPHAN = kirjoitusvirhe tai taksonomia puuttuu
-- =========================================================
SELECT
    pt.tag_id,
    COUNT(*) AS usage_count,
    CASE
        WHEN t.tag_id IS NOT NULL THEN 'VALID_TAG'
        ELSE 'ORPHAN_TAG_ID'
    END AS status
FROM public.post_themes pt
LEFT JOIN public.tags t ON t.tag_id = pt.tag_id
GROUP BY pt.tag_id, t.tag_id
ORDER BY status DESC, usage_count DESC;


-- =========================================================
-- 7. post_media vs post_attachments: päällekkäinen data
--    Tavoite: Selvittää käytetäänkö molempia tauluja vai vain toista.
--    Jos kummassakin on dataa samalle post_id:lle, dualismi on ongelma.
-- =========================================================
SELECT
    p.id AS post_id,
    p.organization_id,
    p.title,
    COUNT(DISTINCT pm.id) AS post_media_count,
    COUNT(DISTINCT pa.id) AS post_attachments_count
FROM public.posts p
LEFT JOIN public.post_media pm ON pm.post_id = p.id
LEFT JOIN public.post_attachments pa ON pa.post_id = p.id
WHERE (pm.id IS NOT NULL OR pa.id IS NOT NULL)
GROUP BY p.id, p.organization_id, p.title
HAVING COUNT(DISTINCT pm.id) > 0 AND COUNT(DISTINCT pa.id) > 0
ORDER BY p.created_at DESC;


-- =========================================================
-- YHTEENVETO: Aja lopuksi tämä – nopea nykytilan tiivistelmä
-- =========================================================
SELECT
    (SELECT COUNT(*) FROM public.posts WHERE status NOT IN ('deleted','cleanup_pending'))
        AS julkaisuja_yhteensa,
    (SELECT COUNT(*) FROM public.post_places)
        AS post_places_riveja,
    (SELECT COUNT(*) FROM public.post_places pp
     LEFT JOIN public.places pl ON pl.id::text = pp.place_id
     WHERE pl.id IS NULL)
        AS orvot_paikkaviitteet,
    (SELECT COUNT(DISTINCT p.id) FROM public.posts p
     LEFT JOIN public.post_places pp ON pp.post_id = p.id
     WHERE pp.post_id IS NULL AND p.status NOT IN ('deleted','cleanup_pending'))
        AS julkaisuja_ilman_paikkaa,
    (SELECT COUNT(DISTINCT p.id) FROM public.posts p
     LEFT JOIN public.post_themes pt ON pt.post_id = p.id
     WHERE pt.post_id IS NULL AND p.status NOT IN ('deleted','cleanup_pending'))
        AS julkaisuja_ilman_teemaa,
    (SELECT COUNT(*) FROM public.organizations)
        AS organisaatioita,
    (SELECT COUNT(*) FROM public.service_contexts WHERE is_active = true)
        AS aktiivisia_palvelukonteksteja;
