-- ============================================================
-- 087_add_location_columns_to_posts.sql
-- Lisää erilliset sijaintikentät posts-tauluun (katuosoite, postinumero, kunta, karttalinkki)
-- Aja Supabasen SQL Editorissa (LaukaaLive: duxluwyqxvbmkkjzuzkz)
-- ============================================================

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS municipality TEXT,
ADD COLUMN IF NOT EXISTS map_url TEXT;

COMMENT ON COLUMN public.posts.address IS 'Kohteen katuosoite (esim. Huminankuja 2)';
COMMENT ON COLUMN public.posts.postal_code IS 'Kohteen postinumero (esim. 41400)';
COMMENT ON COLUMN public.posts.municipality IS 'Kohteen kunta tai taajama (esim. Lievestuore / Laukaa)';
COMMENT ON COLUMN public.posts.map_url IS 'Valinnainen Google Maps -suoralinkki';
