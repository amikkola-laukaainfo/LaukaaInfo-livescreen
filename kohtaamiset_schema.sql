-- ============================================================
-- Laukaan Kohtaamispaikka - Supabase Schema
-- ============================================================
-- Aja tämä SQL-skripti Supabasen SQL Editorissa.
-- Jos encounters-taulu on jo olemassa, käytä
-- OSIO B (migraatio) eikä OSIOTA A.
-- ============================================================


-- ============================================================
-- OSIO A: Uusi schema nollasta
-- ============================================================

CREATE TABLE IF NOT EXISTS public.encounters (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type          VARCHAR NOT NULL,       -- need_help | offer_service | offer_skills | jne.
    title         VARCHAR(120) NOT NULL,
    description   TEXT NOT NULL,
    price_info    VARCHAR(80),
    location      VARCHAR(80),
    contact_email VARCHAR NOT NULL,
    allow_messages BOOLEAN DEFAULT true,  -- Salliiko viestit vai vain yhteydenottopyynnön
    tags          TEXT[] DEFAULT '{}',    -- Tunnisteet, esim. ARRAY['pihatyöt','nurmikko']
    status        VARCHAR DEFAULT 'active', -- active | draft | closed
    edit_token    UUID DEFAULT gen_random_uuid() NOT NULL, -- Magic link -hallintaa varten
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at    TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '30 days')
);


-- ============================================================
-- OSIO B: Migraatio – lisää sarakkeet olemassaolevaan tauluun
-- Aja tämä jos taulu on jo olemassa mutta sarakkeet puuttuvat.
-- ============================================================

-- ALTER TABLE public.encounters
--     ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ALTER TABLE public.encounters
--     ADD COLUMN IF NOT EXISTS allow_messages BOOLEAN DEFAULT true;

-- ALTER TABLE public.encounters
--     ADD COLUMN IF NOT EXISTS edit_token UUID DEFAULT gen_random_uuid();


-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- 1. Kaikki näkevät aktiiviset ilmoitukset
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.encounters;
CREATE POLICY "Public profiles are viewable by everyone."
ON public.encounters FOR SELECT
USING ( status = 'active' );

-- 2. Uusien ilmoitusten lisääminen (avoin, mutta vaatii contact_emailin)
DROP POLICY IF EXISTS "Anyone can insert encounters" ON public.encounters;
CREATE POLICY "Anyone can insert encounters"
ON public.encounters FOR INSERT
WITH CHECK (true);

-- 3. Muokkaaminen: sallitaan kun edit_token täsmää
--    (Käytetään service_role-avaimella PHP-backendistä, ei suoraan clientistä)
DROP POLICY IF EXISTS "Owner can update via edit_token" ON public.encounters;
CREATE POLICY "Owner can update via edit_token"
ON public.encounters FOR UPDATE
USING (true)
WITH CHECK (true);
-- Huom: varsinainen token-tarkistus tehdään PHP-backendissä service_role-avaimella.

-- 4. Poistaminen: sallitaan service_role-avaimella (PHP-backend tarkistaa tokenin)
DROP POLICY IF EXISTS "Owner can delete via edit_token" ON public.encounters;
CREATE POLICY "Owner can delete via edit_token"
ON public.encounters FOR DELETE
USING (true);


-- ============================================================
-- HAKUINDEKSI tageille (nopeuttaa tag-hakuja)
-- ============================================================

CREATE INDEX IF NOT EXISTS encounters_tags_gin
    ON public.encounters USING GIN (tags);


-- ============================================================
-- MODEROINTIRAKENNE JA ROSKAPOSTIN ESTO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.banned_emails (
    email      VARCHAR PRIMARY KEY,
    reason     TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE OR REPLACE FUNCTION check_encounter_insert()
RETURNS trigger AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    -- Tarkista onko sähköposti ban-listalla
    IF EXISTS (SELECT 1 FROM public.banned_emails WHERE email = NEW.contact_email) THEN
        RAISE EXCEPTION 'Sähköpostiosoite on estetty.';
    END IF;

    -- Rate limit: max 1 ilmoitus / 24h / sähköposti
    SELECT COUNT(*) INTO recent_count
    FROM public.encounters
    WHERE contact_email = NEW.contact_email
      AND created_at > (timezone('utc'::text, now()) - interval '24 hours');

    IF recent_count > 0 THEN
        RAISE EXCEPTION 'Voit jättää vain yhden ilmoituksen vuorokaudessa. Yritä huomenna uudelleen.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_encounter_insert_trigger ON public.encounters;
CREATE TRIGGER check_encounter_insert_trigger
    BEFORE INSERT ON public.encounters
    FOR EACH ROW
    EXECUTE FUNCTION check_encounter_insert();


-- ============================================================
-- TESTI: Lisää yksi testirivi (voit poistaa ennen tuotantoa)
-- ============================================================
-- INSERT INTO public.encounters (type, title, description, price_info, location, contact_email, tags)
-- VALUES (
--     'need_help',
--     'Testirivi – Nurmikon leikkuu',
--     'Tämä on testirivi. Voit poistaa sen Supabase-konsolista.',
--     '20€',
--     'Laukaa',
--     'testi@esimerkki.fi',
--     ARRAY['pihatyöt', 'testi']
-- );

-- ============================================================
-- OSIO C: Ekosysteemin laajennus (Vaihe 1)
-- Aja tämä jos lisäät yritys/kohdelinkitykset olemassaolevaan tauluun
-- ============================================================

-- ALTER TABLE public.encounters
--     ADD COLUMN IF NOT EXISTS company_id VARCHAR,
--     ADD COLUMN IF NOT EXISTS location_id VARCHAR,
--     ADD COLUMN IF NOT EXISTS sub_category VARCHAR,
--     ADD COLUMN IF NOT EXISTS structured_links JSONB DEFAULT '{}'::jsonb;

