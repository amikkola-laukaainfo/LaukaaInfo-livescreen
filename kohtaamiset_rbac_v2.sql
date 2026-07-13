-- ============================================================
-- LaukaaInfo Kohtaamiset – RBAC v2 & Announcement_Links
-- Arkkitehtuurin laajennus: location_admin, monilinkitys, näkyvyys-RLS
--
-- AJO-JÄRJESTYS:
--   1. kohtaamiset_schema.sql  (perusrakenne)
--   2. auth_schema.sql         (profiles, roles, user_roles)
--   3. kohtaamiset_schema.sql OSIO C+D  (laajennussarakkeet)
--   4. TÄMÄ TIEDOSTO           (location_admin, Announcement_Links, RLS v2)
--
-- Aja Supabase SQL Editorissa (Settings > SQL Editor)
-- ============================================================


-- ============================================================
-- 1. ROOLI: location_admin
-- ============================================================

INSERT INTO roles (name, description) VALUES
    ('location_admin', 'Kohteen ylläpitäjä – voi julkaista ilmoituksia kohteen nimissä')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- 2. ANNOUNCEMENT_LINKS – Monilinkitystaulu
-- Yksi ilmoitus voidaan linkittää useaan kohteeseen/yritykseen/tapahtumaan.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcement_links (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
    link_type    VARCHAR NOT NULL,  -- 'company' | 'location' | 'event'
    target_id    TEXT NOT NULL,     -- yrityksen/kohteen/tapahtuman id
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(encounter_id, link_type, target_id)
);

-- Indeksit hakuja varten
CREATE INDEX IF NOT EXISTS idx_announcement_links_encounter
    ON public.announcement_links(encounter_id);
CREATE INDEX IF NOT EXISTS idx_announcement_links_target
    ON public.announcement_links(link_type, target_id);

-- RLS: Announcement_Links
ALTER TABLE public.announcement_links ENABLE ROW LEVEL SECURITY;

-- Kaikki voivat lukea linkitykset (tarvitaan yrityskorttisivuille)
DROP POLICY IF EXISTS "Announcement_links julkinen luku" ON public.announcement_links;
CREATE POLICY "Announcement_links julkinen luku"
    ON public.announcement_links FOR SELECT
    USING (true);

-- Omistaja ja moderaattori voivat hallita linkityksiä
DROP POLICY IF EXISTS "Announcement_links hallinta" ON public.announcement_links;
CREATE POLICY "Announcement_links hallinta"
    ON public.announcement_links FOR ALL
    USING (
        -- Omistaja (tarkistetaan encounters-taulusta)
        EXISTS (
            SELECT 1 FROM public.encounters e
            WHERE e.id = encounter_id
              AND e.user_id = auth.uid()
        )
        OR
        -- Moderaattori
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
              AND r.name = 'moderator'
        )
    );


-- ============================================================
-- 3. RLS-POLITIIKAT: Näkyvyys (visibility-kenttä)
-- Korvataan vanhat yksinkertaiset politiikat kolmitasoisella mallilla.
-- ============================================================

-- Poista vanha julkinen luku -politiikka
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.encounters;
DROP POLICY IF EXISTS "Julkinen luku – aktiiviset ilmoitukset" ON public.encounters;

-- Taso 1: Julkinen – kaikki näkevät (myös anonyymit)
CREATE POLICY "Näkyvyys: julkinen"
    ON public.encounters FOR SELECT
    USING (
        status = 'active'
        AND visibility = 'public'
    );

-- Taso 2: Kirjautuneille – vain kirjautuneet käyttäjät
CREATE POLICY "Näkyvyys: kirjautuneille"
    ON public.encounters FOR SELECT
    USING (
        status = 'active'
        AND visibility = 'registered'
        AND auth.uid() IS NOT NULL
    );

-- Taso 3: Omistaja näkee aina omat (myös luonnokset ja arkistoidut)
CREATE POLICY "Näkyvyys: oma ilmoitus"
    ON public.encounters FOR SELECT
    USING (
        user_id = auth.uid()
    );

-- Moderaattori näkee kaikki
CREATE POLICY "Näkyvyys: moderaattori"
    ON public.encounters FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
              AND r.name = 'moderator'
        )
    );


-- ============================================================
-- 4. APUFUNKTIO: Hae ilmoitukset tietyn yrityksen/kohteen nimissä
-- Käytetään yrityskorttisivulta hakemaan kaikki ko. yrityksen ilmoitukset.
-- ============================================================

CREATE OR REPLACE FUNCTION get_encounters_by_target(
    p_link_type TEXT,
    p_target_id TEXT
)
RETURNS TABLE (
    id            UUID,
    type          VARCHAR,
    title         VARCHAR,
    description   TEXT,
    price_info    VARCHAR,
    location      VARCHAR,
    tags          TEXT[],
    status        VARCHAR,
    visibility    VARCHAR,
    publisher_type VARCHAR,
    publisher_name VARCHAR,
    created_at    TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ
) AS $$
    SELECT
        e.id, e.type, e.title, e.description,
        e.price_info, e.location, e.tags, e.status,
        e.visibility, e.publisher_type, e.publisher_name,
        e.created_at, e.expires_at
    FROM public.encounters e
    JOIN public.announcement_links al ON al.encounter_id = e.id
    WHERE al.link_type = p_link_type
      AND al.target_id = p_target_id
      AND e.status = 'active'
      AND e.visibility = 'public'
    ORDER BY e.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;


-- ============================================================
-- 5. APUFUNKTIO: Hae käyttäjän hallinnoimat kohteet
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_managed_targets()
RETURNS TABLE(role_name TEXT, target_id TEXT) AS $$
    SELECT r.name, ur.target_id
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND r.name IN ('company_admin', 'location_admin')
      AND ur.target_id IS NOT NULL;
$$ LANGUAGE sql SECURITY DEFINER;


-- ============================================================
-- VALMIS – tarkista Supabase Table Editorissa:
--   - announcement_links -taulu on luotu
--   - roles-taulussa on 'location_admin'
--   - encounters-taulussa on visibility, publisher_type, publisher_name
-- ============================================================
