-- ============================================================
-- LaukaaInfo Kohtaamiset – RBAC v3 & Yhtenäinen sisältömalli
-- Arkkitehtuurin laajennus: content_links (ristiinlinkitys) ja permissions (oikeusmalli)
--
-- Aja Supabase SQL Editorissa (Settings > SQL Editor)
-- ============================================================

-- ============================================================
-- 1. UUSI TAULU: content_links (Korvaa announcement_links)
-- Mahdollistaa minkä tahansa sisällön linkittämisen toiseen sisältöön.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_links (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id    UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE, -- Tulevaisuudessa voi olla muukin kuin encounter
    target_type  VARCHAR NOT NULL,  -- 'company' | 'location' | 'event' | 'association' | 'service' | 'article'
    target_id    TEXT NOT NULL,     -- kohde-entiteetin id
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_type, target_id)
);

-- Indeksit hakuja varten
CREATE INDEX IF NOT EXISTS idx_content_links_source ON public.content_links(source_id);
CREATE INDEX IF NOT EXISTS idx_content_links_target ON public.content_links(target_type, target_id);

-- RLS: content_links
ALTER TABLE public.content_links ENABLE ROW LEVEL SECURITY;

-- Kaikki voivat lukea linkitykset (tarvitaan dynaamisille yritys/kohdekorteille)
DROP POLICY IF EXISTS "content_links julkinen luku" ON public.content_links;
CREATE POLICY "content_links julkinen luku"
    ON public.content_links FOR SELECT
    USING (true);

-- Omistaja ja moderaattori voivat hallita linkityksiä
DROP POLICY IF EXISTS "content_links hallinta" ON public.content_links;
CREATE POLICY "content_links hallinta"
    ON public.content_links FOR ALL
    USING (
        -- Omistaja (tarkistetaan encounters-taulusta)
        EXISTS (
            SELECT 1 FROM public.encounters e
            WHERE e.id = source_id
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

-- Siirretään mahdollinen olemassa oleva data announcement_links -> content_links
INSERT INTO public.content_links (source_id, target_type, target_id, created_at)
SELECT encounter_id, link_type, target_id, created_at
FROM public.announcement_links
ON CONFLICT DO NOTHING;

-- (Valinnainen) tiputetaan vanha taulu myöhemmin: DROP TABLE public.announcement_links;

-- ============================================================
-- 2. ENCOUNTERS-taulun laajennus (Tarkistus/Päivitys)
-- Varmistetaan, että publisher_type sallii uudet arvot
-- (PostgreSQL VARCHAR ei rajoita arvoja ellei käytetä CHECK-ehtoa. 
--  Meillä se hoidetaan UI:ssa, joten kenttä on valmis ottamaan vastaan uudet arvot)
-- ============================================================

-- Päivitetään get_encounters_by_target käyttämään uutta content_links-taulua
DROP FUNCTION IF EXISTS get_encounters_by_target(text, text);

CREATE OR REPLACE FUNCTION get_encounters_by_target(
    p_target_type TEXT,
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
    structured_links JSONB, -- Varmistetaan että tämä palautetaan dynaamisille korteille!
    created_at    TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ
) AS $$
    SELECT
        e.id, e.type, e.title, e.description,
        e.price_info, e.location, e.tags, e.status,
        e.visibility, e.publisher_type, e.publisher_name,
        e.structured_links,
        e.created_at, e.expires_at
    FROM public.encounters e
    JOIN public.content_links cl ON cl.source_id = e.id
    WHERE cl.target_type = p_target_type
      AND cl.target_id = p_target_id
      AND e.status = 'active'
      AND e.visibility = 'public'
    ORDER BY e.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- 3. OIKEUSMALLI: Permissions-taulu (RBAC v3 pohja)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        VARCHAR NOT NULL UNIQUE, -- esim. 'announcement.create', 'company.publish'
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id       INT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Syötetään perusoikeudet
INSERT INTO public.permissions (name, description) VALUES
    ('announcement.create', 'Voi luoda uusia ilmoituksia'),
    ('announcement.edit', 'Voi muokata ilmoituksia'),
    ('company.publish', 'Voi julkaista yrityksen nimissä'),
    ('location.publish', 'Voi julkaista kohteen nimissä'),
    ('association.publish', 'Voi julkaista yhdistyksen nimissä'),
    ('admin.roles', 'Voi hallita käyttäjärooleja')
ON CONFLICT (name) DO NOTHING;

-- Liitetään oikeudet rooleihin (esimerkki)
-- Esimerkiksi location_admin saa location.publish -oikeuden
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM public.roles r, public.permissions p
WHERE r.name = 'location_admin' AND p.name = 'location.publish'
ON CONFLICT DO NOTHING;

-- ============================================================
-- VALMIS
-- ============================================================
