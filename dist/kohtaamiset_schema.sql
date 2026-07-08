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
-- Jos sidomme sähköpostit Auth.users -tauluun myöhemmin:
-- CREATE POLICY "Users can update own encounters" ON public.encounters FOR UPDATE USING (auth.email() = contact_email);
