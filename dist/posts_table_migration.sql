-- =====================================================
-- POSTS-TAULUN LAAJENNUS – Aja Supabasen SQL-editorissa
-- Lisää uudet kentät OLEMASSA OLEVAAN posts-tauluun.
-- Nämä komennot ovat turvallisia: IF NOT EXISTS estää
-- virheet jos kenttä on jo lisätty aiemmin.
-- =====================================================

-- 1. Salli business_id NULL (tarvitaan yhteisöjulkaisuille)
ALTER TABLE public.posts ALTER COLUMN business_id DROP NOT NULL;

-- 2. Lisää yhteisöjulkaisun tekijäkenttä
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id);

-- 3. Lisää paikkalinkitys (esim. 'haarlan-uimaranta')
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS place_id TEXT;

-- 4. Lisää moderointitila
--    APPROVED = näkyy julkisesti
--    PENDING  = odottaa ylläpidon hyväksyntää
--    REJECTED = hylätty
--    HIDDEN   = piilotettu
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'APPROVED';

-- 5. Lisää teematagit (esim. '{lapsiperheet, liikunta}')
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 6. Päivitetty RLS: Salli myös tavallisten käyttäjien omat julkaisut
--    (Poista ensin vanhat politiikat ja luo uudet)
DROP POLICY IF EXISTS "Owners can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Owners can update posts" ON public.posts;
DROP POLICY IF EXISTS "Owners can delete posts" ON public.posts;
DROP POLICY IF EXISTS "Public can read posts" ON public.posts;
DROP POLICY IF EXISTS "Owners and authors can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Owners and authors can update posts" ON public.posts;
DROP POLICY IF EXISTS "Owners and authors can delete posts" ON public.posts;

-- Vain APPROVED-tilaiset (tai vanhat ilman statusta) näkyvät julkisesti
CREATE POLICY "Public can read posts" ON public.posts
    FOR SELECT USING (status = 'APPROVED' OR status IS NULL);

-- Omistajat (yritykset) TAI tavallinen kirjautunut käyttäjä voi lisätä omia
CREATE POLICY "Owners and authors can insert posts" ON public.posts
    FOR INSERT WITH CHECK (
        (business_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.company_owners
            WHERE owner_id = auth.uid() AND business_id = public.posts.business_id
        ))
        OR
        (author_id = auth.uid())
    );

CREATE POLICY "Owners and authors can update posts" ON public.posts
    FOR UPDATE USING (
        (business_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.company_owners
            WHERE owner_id = auth.uid() AND business_id = public.posts.business_id
        ))
        OR
        (author_id = auth.uid())
    );

CREATE POLICY "Owners and authors can delete posts" ON public.posts
    FOR DELETE USING (
        (business_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.company_owners
            WHERE owner_id = auth.uid() AND business_id = public.posts.business_id
        ))
        OR
        (author_id = auth.uid())
    );

-- =====================================================
-- VALMIS! Tarkista kentät Supabasesta:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'posts' ORDER BY ordinal_position;
-- =====================================================
