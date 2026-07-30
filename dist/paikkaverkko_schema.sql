-- --------------------------------------------------------
-- Paikkaverkko (Place Network) Schema
-- Tämä taulu toimii yhteisenä nimittäjänä LaukaaInfolle ja LostReFoundille
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS places (
    place_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,                  -- Paikan nimi (esim. "Saraakallio")
    type TEXT,                           -- Paikan tyyppi (esim. "nähtävyys", "uimaranta", "laavu")
    description TEXT,                    -- Lyhyt kuvaus paikasta
    lat DOUBLE PRECISION NOT NULL,       -- Leveysaste
    lon DOUBLE PRECISION NOT NULL,       -- Pituusaste
    municipality TEXT,                   -- Kunta (esim. "Laukaa")
    source TEXT,                         -- Tietolähde (esim. "OSM", "Käyttäjä")
    source_id TEXT,                      -- Alkuperäisen lähteen ID (esim. OSM node id)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksit nopeita hakuja varten
CREATE INDEX IF NOT EXISTS idx_places_municipality ON places(municipality);
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);

-- RLS (Row Level Security) -säännöt
-- Oletuksena kaikki voivat lukea (jos Supabasen RLS on päällä)
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salli luku kaikille" 
ON places FOR SELECT 
USING (true);

-- Kirjoitusoikeudet riippuvat projektin Supabase-authista, 
-- mutta aluksi voidaan pitää avoimena ylläpitäjille tai API-avaimelle.
