-- ============================================================
-- MIGRAATIO: Paikkojen tärkeystaso ja kaupallinen näkyvyys
-- Suoritetaan Supabase SQL Editor -käyttöliittymässä (AI Supabase)
-- Projekti: duxluwyqxvbmkkjzuzkz
-- ============================================================

-- 1. Muutetaan importance 0-100 → 1-4 tarkistuksella
--    (olemassa oleva importance-kenttä on tyyppiä INTEGER, oletusarvo 10)
--    Ensin lisätään commercial_visibility
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS commercial_visibility BOOLEAN DEFAULT false;

COMMENT ON COLUMN places.commercial_visibility IS
  'Onko tähän paikkaan kaupallisesti luontevaa liittää yrityksiä ja palveluita?';

-- 2. Päivitetään importance-kentän kommentti vastaamaan uutta asteikkoa
--    (Huom: kenttä on jo olemassa, tässä päivitetään vain dokumentaatio)
COMMENT ON COLUMN places.importance IS
  'Paikan tärkeystaso: 1=alakohde, 2=paikallinen kohde (oletus), 3=merkittävä kohde, 4=pääkohde. Vanha 0-100 asteikko normalisoitu.';

-- 3. Normalisoidaan vanhat importance-arvot (0-100) → (1-4)
--    Olemassaolevat paikat saavat arvon importance=2 oletuksena,
--    paitsi jo korkeasti pisteytetyt.
UPDATE places
SET importance = CASE
    WHEN importance >= 80 THEN 4
    WHEN importance >= 50 THEN 3
    WHEN importance >= 20 THEN 2
    ELSE 2
  END;

-- 4. Asetetaan NOT NULL + CHECK constraint uudelle arvoalueelle
--    (ajetaan sen jälkeen kun NULL-arvot on korjattu)
ALTER TABLE places
  ALTER COLUMN importance SET DEFAULT 2,
  ALTER COLUMN importance SET NOT NULL;

-- Lisätään CHECK constraint – poistetaan vanha jos se on olemassa
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_importance_check;
ALTER TABLE places
  ADD CONSTRAINT places_importance_check CHECK (importance BETWEEN 1 AND 4);

-- 5. Merkitään kaupallisesti kiinnostavat paikat (esimerkit)
--    Päivitä tätä listaa tarpeen mukaan profilointi-sovelluksen kautta
UPDATE places
SET
  importance = 3,
  commercial_visibility = true
WHERE canonical_name ILIKE ANY(ARRAY[
  '%haarlan ranta%',
  '%laukaan satama%',
  '%hitonhauta%',
  '%peurunkajärvi%',
  '%lievestuore%',
  '%laukaa%kirkkopuisto%',
  '%kuntokeskus%',
  '%uimaranta%'
])
  AND status != 'DELETED';

-- Pääkohteet (importance=4): suurimmat alueet / taajamat
UPDATE places
SET
  importance = 4,
  commercial_visibility = true
WHERE (
    canonical_name ILIKE ANY(ARRAY['laukaa', 'lievestuore', 'leppävesi', 'vihtavuori', 'vehniä', 'tiituspohja'])
    OR (type = 'AREA' AND place_level = 'REGION')
  )
  AND status != 'DELETED';

-- 6. Indeksi nopeampaa suodatusta varten
CREATE INDEX IF NOT EXISTS idx_places_importance ON places(importance);
CREATE INDEX IF NOT EXISTS idx_places_commercial_visibility ON places(commercial_visibility);

-- 7. Tarkistuskysely
SELECT
  importance,
  commercial_visibility,
  COUNT(*) as lkm
FROM places
WHERE status != 'DELETED'
GROUP BY importance, commercial_visibility
ORDER BY importance DESC, commercial_visibility DESC;
