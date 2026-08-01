-- --------------------------------------------------------
-- Paikkaverkko (Place Network) Schema
-- Tämä taulu toimii yhteisenä nimittäjänä LaukaaInfolle ja LostReFoundille
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS places (
    place_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,                  -- Paikan nimi (esim. "Saraakallio")
    canonical_name TEXT,                 -- Normalisoitu nimi AI/hakua varten (esim. "Saraakallio", "Peurunka")
    type TEXT,                           -- Vakioitu tyyppi (esim. 'NATURE', 'LANDMARK', 'SERVICE', 'EVENT_LOCATION', 'BUILDING', 'AREA', 'ROUTE')
    description TEXT,                    -- Lyhyt kuvaus paikasta
    lat DOUBLE PRECISION,                -- Leveysaste (Valinnainen, geometry myöhemmin)
    lon DOUBLE PRECISION,                -- Pituusaste (Valinnainen)
    municipality TEXT,                   -- Kunnan nimi
    municipality_id TEXT,                -- Kunnan tunniste (esim. 'laukaa', 'jyvaskyla')
    parent_place_id UUID REFERENCES places(place_id), -- Hierarkia (esim. Saraakallio -> Laukaa)
    status TEXT DEFAULT 'ACTIVE',        -- Tila (esim. 'ACTIVE', 'PENDING', 'CLOSED')
    verified BOOLEAN DEFAULT false,      -- Onko paikka luotettava/vahvistettu
    importance INTEGER DEFAULT 0,        -- Järjestyksen/suositusten painoarvo (0-100)
    created_by TEXT,                     -- Kuka loi (UUID tai "SYSTEM")
    source TEXT,                         -- Tietolähde (esim. "OSM", "Käyttäjä")
    source_id TEXT,                      -- Alkuperäisen lähteen ID (esim. "node/12345678")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksit nopeita hakuja varten
CREATE INDEX IF NOT EXISTS idx_places_municipality ON places(municipality);
CREATE INDEX IF NOT EXISTS idx_places_municipality_id ON places(municipality_id);
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);
CREATE INDEX IF NOT EXISTS idx_places_canonical_name ON places(canonical_name);
CREATE INDEX IF NOT EXISTS idx_places_source_id ON places(source, source_id);

-- RLS (Row Level Security) -säännöt
-- Oletuksena kaikki voivat lukea (jos Supabasen RLS on päällä)
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salli luku kaikille" 
ON places FOR SELECT 
USING (true);

-- Kirjoitusoikeudet riippuvat projektin Supabase-authista, 
-- mutta aluksi voidaan pitää avoimena ylläpitäjille tai API-avaimella.

-- --------------------------------------------------------
-- Yritys-Paikka -suhteet (Context-verkosto)
-- Yhdistää LaukaaInfo-yritykset paikkaverkon kohteisiin.
-- Suhteella on aina syy (context), joka kertoo MIKSI yhteys on olemassa.
-- Aluerajoja ei ole – yritys voi liittyä mihin tahansa paikkaan.
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS place_company_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id UUID NOT NULL REFERENCES places(place_id) ON DELETE CASCADE,
    company_id TEXT NOT NULL,              -- Viittaus LaukaaInfo-profiiliin (esim. "company-123")
    company_name TEXT NOT NULL,            -- Denormalisoitu nimi nopeaa hakua varten
    context TEXT NOT NULL,                 -- Yhteyden syy (esim. "Tapahtumakuvaus", "Toimipiste", "Palvelualue")
    confidence INTEGER DEFAULT 50,         -- AI:n arvio todennäköisyydestä (0-100)
    source TEXT DEFAULT 'AI_SUGGESTION',   -- Mistä yhteys tuli ('AI_SUGGESTION', 'MANUAL', 'IMPORT')
    verified BOOLEAN DEFAULT false,        -- Onko ihminen vahvistanut yhteyden
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_pcr_place_id ON place_company_relations(place_id);
CREATE INDEX IF NOT EXISTS idx_pcr_company_id ON place_company_relations(company_id);

-- RLS
ALTER TABLE place_company_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcr_select_public"
  ON place_company_relations FOR SELECT
  USING (true);

CREATE POLICY "pcr_insert_anon"
  ON place_company_relations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "pcr_delete_anon"
  ON place_company_relations FOR DELETE
  USING (true);
