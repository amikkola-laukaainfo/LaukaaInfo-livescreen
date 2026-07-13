-- kohtaamiset_rbac_v3_rls.sql
-- Vaihe 3: Siirretään RLS-politiikat ja oikeustarkistukset käyttämään atomisia permissions-oikeuksia

-- 1. Apufunktio oikeuksien tarkistamiseen (RLS ja frontend-kyselyt)
CREATE OR REPLACE FUNCTION public.check_permission(p_name VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = auth.uid()
          AND p.name = p_name
    );
END;
$$;

-- 2. Päivitetään encounters-taulun RLS-politiikat
DROP POLICY IF EXISTS "Salli julkisten luku" ON public.encounters;
DROP POLICY IF EXISTS "Käyttäjät voivat muokata omia" ON public.encounters;
DROP POLICY IF EXISTS "Salli omien luku" ON public.encounters;
DROP POLICY IF EXISTS "Yritys-admin luku" ON public.encounters;
DROP POLICY IF EXISTS "Kohde-admin luku" ON public.encounters;
DROP POLICY IF EXISTS "Yritys-admin muokkaus" ON public.encounters;
DROP POLICY IF EXISTS "Kohde-admin muokkaus" ON public.encounters;
DROP POLICY IF EXISTS "Moderaattori voi tehdä kaikkea" ON public.encounters;
DROP POLICY IF EXISTS "Kirjautuneet voivat lukea registered-ilmoituksia" ON public.encounters;
DROP POLICY IF EXISTS "Suljetut näkyvät vain yrityksille" ON public.encounters;

-- Luku (SELECT)
CREATE POLICY "Encounter Select Policy"
    ON public.encounters
    FOR SELECT
    USING (
        -- Julkiset tai rekisteröityneille tarkoitetut (jos käyttäjä on kirjautunut)
        status = 'active' AND (
            visibility = 'public'
            OR (visibility = 'registered' AND auth.uid() IS NOT NULL)
        )
        -- Omat ilmoitukset (kaikki tilat)
        OR user_id = auth.uid()
        -- Ylläpitäjät näkevät kaiken 'announcement.manage' oikeudella
        OR public.check_permission('announcement.manage')
    );

-- Lisäys (INSERT)
CREATE POLICY "Encounter Insert Policy"
    ON public.encounters
    FOR INSERT
    WITH CHECK (
        -- Tavallinen käyttäjä voi luoda jos hänellä on 'announcement.create' (tai kaikki saavat oletuksena luoda kirjautumatta)
        -- Tässä oletamme, että kuka tahansa voi luoda (koska anon insert on sallittu tokeneiden avulla).
        -- Mutta jos uid on, liitetään se omiin ilmoituksiin.
        TRUE
    );

-- Muokkaus (UPDATE)
CREATE POLICY "Encounter Update Policy"
    ON public.encounters
    FOR UPDATE
    USING (
        user_id = auth.uid()
        OR public.check_permission('announcement.manage')
    );

-- Poisto (DELETE)
CREATE POLICY "Encounter Delete Policy"
    ON public.encounters
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR public.check_permission('announcement.delete')
    );

-- 3. Päivitetään content_links-taulun RLS-politiikat
DROP POLICY IF EXISTS "Salli luku kaikille" ON public.content_links;
DROP POLICY IF EXISTS "Salli muokkaus vain moderaattoreille tai omistajille" ON public.content_links;

CREATE POLICY "Content Links Select Policy"
    ON public.content_links
    FOR SELECT
    USING (TRUE);

CREATE POLICY "Content Links Update Policy"
    ON public.content_links
    FOR ALL
    USING (
        -- Moderaattorit (joilla on manage oikeus)
        public.check_permission('announcement.manage')
        -- Omien ilmoitusten linkitykset voisi sallia tässä liittämällä encounterin omistajuuteen
        OR EXISTS (
            SELECT 1 FROM public.encounters e
            WHERE e.id = content_links.source_id
              AND e.user_id = auth.uid()
        )
    );
