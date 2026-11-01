-- ============================================================
-- 086: Korjataan post_media RLS profilointityökalua varten
-- ============================================================
-- Ongelma: post_media-taulu sallii vain public SELECT (USING true),
-- mutta INSERT/UPDATE/DELETE vaatii autentikaation. Profilointityökalu
-- käyttää anon-avainta, joten se ei pysty tallentamaan kuvia post_media-tauluun.
--
-- Ratkaisu: Sallitaan INSERT/DELETE anon-avaimella niille riveille
-- joiden viittaama posts-rivi on olemassa.
-- ============================================================

-- Poistetaan vanhat politiikat
DROP POLICY IF EXISTS "Allow insert post_media" ON public.post_media;
DROP POLICY IF EXISTS "Allow delete post_media" ON public.post_media;
DROP POLICY IF EXISTS "Allow update post_media" ON public.post_media;
DROP POLICY IF EXISTS "Anon insert post_media" ON public.post_media;
DROP POLICY IF EXISTS "Anon delete post_media" ON public.post_media;

-- Salli INSERT kaikille kun post_id viittaa olemassaolevaan postiin
CREATE POLICY "Allow insert post_media"
  ON public.post_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id
    )
  );

-- Salli DELETE kaikille omille riveille
CREATE POLICY "Allow delete post_media"
  ON public.post_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id
    )
  );

-- Salli UPDATE
CREATE POLICY "Allow update post_media"
  ON public.post_media
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_media.post_id
    )
  );

-- Tarkista lopputulos
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'post_media'
ORDER BY policyname;
