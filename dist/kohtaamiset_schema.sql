-- Laukaan Kohtaamispaikka - Supabase Schema
-- Aja tämä SQL-skripti Supabasen SQL Editorissa

-- 1. Luodaan encounters (ilmoitukset) -taulu
CREATE TABLE IF NOT EXISTS public.encounters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR NOT NULL, -- need_help, offer_service, high_value jne.
    title VARCHAR NOT NULL,
    description TEXT NOT NULL,
    price_info VARCHAR,
    location VARCHAR,
    contact_email VARCHAR NOT NULL, -- Kuka ilmoituksen jätti
    status VARCHAR DEFAULT 'active', -- active, draft, closed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '30 days')
);

-- RLS (Row Level Security) -käytännöt
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- 1. Kaikki näkevät aktiiviset ilmoitukset
CREATE POLICY "Public profiles are viewable by everyone."
ON public.encounters FOR SELECT
USING ( status = 'active' );

-- 2. Uusien ilmoitusten lisääminen (Avoin toistaiseksi, mutta vaatii contact_emailin)
-- Myöhemmin tämä voidaan lukita niin, että vain Auth-käyttäjät voivat lisätä
CREATE POLICY "Anyone can insert encounters"
ON public.encounters FOR INSERT
WITH CHECK (true);

-- 3. Vain omien ilmoitusten päivitys
-- 3. Vain omien ilmoitusten päivitys
-- Jos sidomme sähköpostit Auth.users -tauluun myöhemmin:
-- CREATE POLICY "Users can update own encounters" ON public.encounters FOR UPDATE USING (auth.email() = contact_email);

-- ==========================================
-- MODEROINTI JA ROSKAPOSTIN ESTO
-- ==========================================

-- 1. Ban-lista (Porttikielto)
CREATE TABLE IF NOT EXISTS public.banned_emails (
    email VARCHAR PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Trigger-funktio tarkistuksia varten
CREATE OR REPLACE FUNCTION check_encounter_insert()
RETURNS trigger AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    -- Tarkista onko sähköposti ban-listalla
    IF EXISTS (SELECT 1 FROM public.banned_emails WHERE email = NEW.contact_email) THEN
        RAISE EXCEPTION 'Sähköpostiosoite on estetty.';
    END IF;

    -- Tarkista onko samalla sähköpostilla lisätty ilmoitus alle 24h sisään (Rate Limit)
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

-- 3. Liitetään trigger encounters-tauluun
DROP TRIGGER IF EXISTS check_encounter_insert_trigger ON public.encounters;
CREATE TRIGGER check_encounter_insert_trigger
    BEFORE INSERT ON public.encounters
    FOR EACH ROW
    EXECUTE FUNCTION check_encounter_insert();
