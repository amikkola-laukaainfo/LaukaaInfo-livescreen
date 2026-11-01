-- =========================================================
-- MIGRAATIO 085: posts.form_url -sarake
-- LaukaaInfo Kohdekortti & Profilointi: Osallistumiskaavake / Google Forms
-- =========================================================

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS form_url TEXT;

COMMENT ON COLUMN public.posts.form_url IS 'Erillinen osallistumiskaavake / Google Forms URL';
