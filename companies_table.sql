-- =============================================================================
-- companies-taulu: LaukaaInfo yritysdatan varsinainen tietolähde
-- Suorita tämä Supabasen SQL Editorissa
-- =============================================================================

CREATE TABLE IF NOT EXISTS companies (
    -- Perus-identiteetti
    id              TEXT PRIMARY KEY,           -- sama kuin live_companies.json id
    name            TEXT,                       -- canonical nimi
    nimi            TEXT,                       -- suomenkielinen nimi
    status          TEXT DEFAULT 'active',

    -- CSV:stä tulevat perustiedot
    osoite          TEXT,
    puhelin         TEXT,
    email           TEXT,
    nettisivu       TEXT,
    lat             NUMERIC,
    lon             NUMERIC,
    kategoria       TEXT,
    alue_slug       TEXT,

    -- LaukaaInfo-rikastukset (esim. maksullisuus, logot jne.)
    esittely        TEXT,
    mainoslause     TEXT,
    logo_url        TEXT,
    subscription_tier INTEGER DEFAULT 1,
    some_links      JSONB DEFAULT '{}',

    -- Synkronointijäljet
    source_id       TEXT,
    source_hash     TEXT,
    source_updated_at TIMESTAMPTZ,
    last_synced_at  TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indeksit haun nopeuttamiseen
CREATE INDEX IF NOT EXISTS companies_alue_slug_idx ON companies (alue_slug);
CREATE INDEX IF NOT EXISTS companies_kategoria_idx ON companies (kategoria);
CREATE INDEX IF NOT EXISTS companies_status_idx ON companies (status);
CREATE INDEX IF NOT EXISTS companies_source_id_idx ON companies (source_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_companies_updated_at();

-- RLS & Käyttöoikeudet (Avoin luku ja kirjoitus)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_public_read" ON companies;
DROP POLICY IF EXISTS "companies_anon_write" ON companies;
DROP POLICY IF EXISTS "companies_public_all" ON companies;

CREATE POLICY "companies_public_all"
    ON companies FOR ALL
    USING (true)
    WITH CHECK (true);
