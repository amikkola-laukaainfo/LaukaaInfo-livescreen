-- =========================================================
-- MIGRAATIO 050: service_contexts-taulu
-- LaukaaInfo → Monialustainen palvelukonteksti
-- =========================================================
-- Aja tämä LaukaaInfon Supabase SQL Editorissa
-- (duxluwyqxvbmkkjzuzkz.supabase.co)
--
-- ENNEN AJOA – varmista näillä kyselyillä:
--
--   SELECT id, name, canonical_name, type
--   FROM places
--   WHERE id = '55555555-5555-4555-a555-555555555555';
--
--   SELECT to_regclass('public.service_contexts');
--   -- Pitää palauttaa NULL (ei olemassa vielä)
--
--   SELECT DISTINCT place_id, length(place_id) as len
--   FROM post_places LIMIT 10;
--   -- Dokumentoi TEXT vs UUID -tilanne
--
-- =========================================================

-- 1. Palvelukontekstirekisteri
-- Vain lisäys – ei muuta olemassa olevia tauluja.
CREATE TABLE IF NOT EXISTS public.service_contexts (
    id               TEXT        PRIMARY KEY,         -- 'laukaainfo', 'hankasalmiinfo'
    name             TEXT        NOT NULL,             -- 'LaukaaInfo', 'HankasalmiInfo'
    default_place_id UUID        REFERENCES public.places(id) ON DELETE SET NULL,
    feature_flags    JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {"wall":true,"wonderin":true}
    branding         JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {"name":"LaukaaInfo"}
    is_active        BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.service_contexts IS
    'Palvelukontekstirekisteri – yksi rivi per alueellinen palvelu (LaukaaInfo, HankasalmiInfo jne.)';
COMMENT ON COLUMN public.service_contexts.id IS
    'Lyhyt tunniste, käytetään sovelluskoodissa SERVICE_ID-muuttujana';
COMMENT ON COLUMN public.service_contexts.default_place_id IS
    'Oletuspaikka etusivulle ja julkaisujen fallback-ankurille. Viittaa places.id (AREA-taso).';

-- 2. RLS – julkinen luku, ei kirjoitusoikeutta
ALTER TABLE public.service_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read service_contexts" ON public.service_contexts;
CREATE POLICY "Public read service_contexts"
    ON public.service_contexts
    FOR SELECT
    USING (is_active = true);

-- Huom: INSERT/UPDATE/DELETE vain service_role:lle (Supabase admin-paneeli).
-- Ei tarvita erillistä politiikkaa – oletuksena kielletty.

GRANT SELECT ON public.service_contexts TO anon;
GRANT SELECT ON public.service_contexts TO authenticated;

-- 3. Indeksi
CREATE INDEX IF NOT EXISTS idx_service_contexts_active
    ON public.service_contexts(is_active);

-- 4. LaukaaInfo seed-data
-- default_place_id = Laukaan kirkonkylä (alueet_insert.sql rivi 5)
-- UUID: '55555555-5555-4555-a555-555555555555', canonical_name = 'Laukaa kk', type = 'AREA'
INSERT INTO public.service_contexts (id, name, default_place_id, feature_flags, branding)
VALUES (
    'laukaainfo',
    'LaukaaInfo',
    '55555555-5555-4555-a555-555555555555',
    '{"wall": true, "wonderin": true, "muisto": true}'::jsonb,
    '{"name": "LaukaaInfo", "logo_url": null}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- VARMISTUSKYSELY – aja tämä migraation jälkeen:
-- =========================================================
-- SELECT id, name, default_place_id, feature_flags, branding, is_active
-- FROM public.service_contexts;
-- Pitää palauttaa yksi rivi: laukaainfo
-- =========================================================
