-- ============================================================================
-- PAIKKAVERKKO (PLACE NETWORK) SCHEMA
-- Yhteinen paikkaverkosto LaukaaInfolle, LostReFoundille ja Mixonetille
-- Päivitetty 2026-09-23 Supabase-livetietokanta-auditin mukaiseksi
-- ============================================================================

CREATE TABLE IF NOT EXISTS places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id TEXT GENERATED ALWAYS AS (id::text) STORED, -- Automaattisesti johdettu id:stä tekstinä
    name TEXT NOT NULL,                                  -- Paikan nimi (esim. "Saraakallio", "Laukaa")
    canonical_name TEXT,                                 -- Normalisoitu nimi hakuun/AI-prosessointiin
    type TEXT,                                           -- Hierarkiataso tai kohdetyyppi ('REGION', 'KUNTA', 'AREA', 'LANDMARK', 'NATURE', 'SERVICE', 'BUILDING', 'ROUTE')
    place_type TEXT,                                     -- Vaihtoehtoinen/tarkentava kohdetyyppi ('ALUE', 'KOHDE', 'KUNTA')
    description TEXT,                                    -- Kuvausteksti
    lat DOUBLE PRECISION,                                -- Leveysaste
    lon DOUBLE PRECISION,                                -- Pituusaste
    municipality TEXT,                                   -- Kunta (Legacy-hakukenttä, kanoninen tieto parent_place_id-ketjusta)
    parent_place_id UUID REFERENCES places(id) ON DELETE SET NULL, -- ⭐ Maantieteellinen hierarkia
    status TEXT DEFAULT 'PUBLISHED',                     -- Tila ('PUBLISHED', 'DRAFT', 'ARCHIVED', 'DELETED')
    verified BOOLEAN DEFAULT false,                      -- Vahvistettu kohde
    importance INTEGER DEFAULT 50,                       -- Järjestyksen/suositusten painoarvo (0-100)
    tier TEXT DEFAULT 'PRIMARY',                         -- Solmutaso ('PRIMARY', 'SUB_PLACE', 'SPOT')
    show_in_main_list BOOLEAN DEFAULT true,              -- Näytetäänkö päälistauksessa
    quality_score INTEGER DEFAULT 0,                     -- Laatuskori (0-100)
    commercial_visibility BOOLEAN DEFAULT false,         -- Kaupallinen näkyvyys
    is_visibility_target BOOLEAN DEFAULT false,          -- Näkyvyyskampanjakohde
    mixonet_place_id UUID,                               -- Linkki Mixonet-verkoston solmuun
    visitor_types JSONB DEFAULT '[]'::jsonb,             -- Kohderyhmät (JSON)
    search_keywords JSONB DEFAULT '[]'::jsonb,           -- Hakusanat (JSON)
    history_text TEXT,                                   -- Historiatieto
    external_links JSONB DEFAULT '[]'::jsonb,            -- Ulkoiset linkit (JSON)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeksit nopeita hierarkia- ja aluehakuja varten
CREATE INDEX IF NOT EXISTS idx_places_parent_place_id ON places(parent_place_id);
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);
CREATE INDEX IF NOT EXISTS idx_places_canonical_name ON places(canonical_name);
CREATE INDEX IF NOT EXISTS idx_places_status ON places(status);
CREATE INDEX IF NOT EXISTS idx_places_tier ON places(tier);

-- Row Level Security (RLS)
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Salli luku kaikille" ON places;
CREATE POLICY "Salli luku kaikille" 
ON places FOR SELECT 
USING (true);

-- --------------------------------------------------------
-- Yritys-Paikka -suhteet (Context-verkosto)
-- Yhdistää yritykset paikkaverkon kohteisiin.
-- Suhteella on aina syy (context), joka kertoo MIKSI yhteys on olemassa.
-- Aluerajoja ei ole – yritys voi liittyä mihin tahansa paikkaan.
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS place_company_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL,              -- Viittaus yritysprofiiliin
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

DROP POLICY IF EXISTS "pcr_select_public" ON place_company_relations;
DROP POLICY IF EXISTS "pcr_insert_anon" ON place_company_relations;
DROP POLICY IF EXISTS "pcr_delete_anon" ON place_company_relations;

CREATE POLICY "pcr_select_public"
  ON place_company_relations FOR SELECT
  USING (true);

CREATE POLICY "pcr_insert_anon"
  ON place_company_relations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "pcr_delete_anon"
  ON place_company_relations FOR DELETE
  USING (true);
