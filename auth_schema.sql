-- ============================================================
-- LaukaaInfo Kohtaamiset – Auth & RBAC Schema
-- Aja tämä Supabase SQL Editorissa (Settings > SQL Editor)
-- ============================================================

-- ----------------------------------------
-- 1. PROFILES (laajennus auth.users-tauluun)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: luo profiili automaattisesti kun uusi käyttäjä rekisteröityy
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------
-- 2. ROLES (roolit)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,       -- 'verified_user', 'company_admin', 'moderator'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lisää vakioroolit
INSERT INTO roles (name, description) VALUES
    ('verified_user',  'Vahvistettu käyttäjä – voi jättää ilmoituksia kirjautuneena'),
    ('company_admin',  'Yrityksen ylläpitäjä – voi jättää ilmoituksia yrityksen nimissä'),
    ('moderator',      'Moderaattori – voi muokata ja poistaa kaikkia ilmoituksia')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------
-- 3. USER_ROLES (käyttäjä <-> rooli -kytkentä)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    target_id TEXT DEFAULT NULL,     -- company_id (company_admin) tai NULL (yleinen rooli)
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id, target_id)
);

-- ----------------------------------------
-- 4. ENCOUNTERS – varmista sarakkeet
-- ----------------------------------------
ALTER TABLE encounters
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS company_id TEXT,
    ADD COLUMN IF NOT EXISTS location_id TEXT,
    ADD COLUMN IF NOT EXISTS sub_category TEXT,
    ADD COLUMN IF NOT EXISTS structured_links JSONB DEFAULT '{}'::jsonb;

-- Indeksit hakuja varten
CREATE INDEX IF NOT EXISTS idx_encounters_user_id ON encounters(user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_company_id ON encounters(company_id);
CREATE INDEX IF NOT EXISTS idx_encounters_location_id ON encounters(location_id);

-- ----------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Käyttäjä näkee oman profiilinsa" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Käyttäjä voi muokata omaa profiiliaan" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- USER_ROLES – vain moderaattorit ja service role
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Käyttäjä näkee omat roolinsa" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

-- ENCOUNTERS – RLS ilmoituksille
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

-- Kaikki voivat lukea aktiiviset ilmoitukset
CREATE POLICY "Julkinen luku – aktiiviset ilmoitukset" ON encounters
    FOR SELECT USING (status = 'active');

-- Kirjautunut voi lisätä
CREATE POLICY "Kirjautunut voi lisätä ilmoituksen" ON encounters
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        OR auth.uid() IS NULL  -- myös anonyymi sallitaan (taaksepäinyhteensopivuus)
    );

-- Käyttäjä voi muokata/poistaa OMIA ilmoituksiaan
CREATE POLICY "Omistaja voi muokata" ON encounters
    FOR UPDATE USING (
        auth.uid() = user_id
        OR (
            -- Moderaattori voi muokata kaikkia
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = auth.uid()
                AND r.name = 'moderator'
            )
        )
    );

CREATE POLICY "Omistaja voi poistaa" ON encounters
    FOR DELETE USING (
        auth.uid() = user_id
        OR (
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = auth.uid()
                AND r.name = 'moderator'
            )
        )
    );

-- ----------------------------------------
-- 6. APUFUNKTIO: Hae käyttäjän roolit
-- ----------------------------------------
CREATE OR REPLACE FUNCTION get_my_roles()
RETURNS TABLE(role_name TEXT, target_id TEXT) AS $$
    SELECT r.name, ur.target_id
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ----------------------------------------
-- 7. ADMIN RPC-FUNKTIOT
-- ----------------------------------------

-- Hae käyttäjän ID sähköpostin perusteella (vain moderaattoreille)
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_input TEXT)
RETURNS UUID AS $$
DECLARE
    found_id UUID;
BEGIN
    -- Tarkista onko kutsujalla moderaattori-rooli
    IF NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name = 'moderator'
    ) THEN
        RAISE EXCEPTION 'Ei oikeuksia';
    END IF;

    SELECT id INTO found_id FROM auth.users WHERE email = email_input LIMIT 1;
    RETURN found_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hae kaikki roolit ja käyttäjien sähköpostit (vain moderaattoreille)
CREATE OR REPLACE FUNCTION get_all_roles_admin()
RETURNS TABLE(id INT, email VARCHAR, role_name TEXT, target_id TEXT) AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name = 'moderator'
    ) THEN
        RAISE EXCEPTION 'Ei oikeuksia';
    END IF;

    RETURN QUERY
    SELECT ur.id, u.email, r.name, ur.target_id
    FROM user_roles ur
    JOIN auth.users u ON ur.user_id = u.id
    JOIN roles r ON ur.role_id = r.id
    ORDER BY r.name, u.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------
-- VALMIS – tarkista taulut Supabase Table Editorissa
-- ----------------------------------------
