-- =============================================================================
-- 067_restrict_wall_settings_to_admin.sql
-- LaukaaInfo – Seinäasetukset vain ylläpitäjälle
-- =============================================================================
-- TILA: VALMIS AJETTAVAKSI
--
-- Muutokset:
--   1. set_organization_wall_access_code: poistetaan p_publish_key-polku.
--      Funktiota voidaan kutsua enää vain kirjautuneena ylläpitäjänä tai
--      service_rolena. Pelkkä julkaisuavain ei enää oikeuta seinän
--      avauskoodin muuttamiseen.
--   2. set_organization_default_visibility: sama muutos.
--      Oletusnäkyvyys on organisaation hallintatoiminto, ei julkaisutoiminto.
--   3. anon-roolin suorituslupa poistetaan molemmista funktioista.
--      service_role säilyy (luotettu palvelinprosessi, esim. Edge Function).
--
-- Mitä EI muuteta:
--   - resolve_publisher_key   — julkaisuavaimen tarkistus, ei koske tätä
--   - begin_org_session       — organisaatioistunnon aloitus, ei koske tätä
--   - create_encounter        — julkaiseminen julkaisuavaimella, ei koske tätä
--   - _check_org_admin_or_moderator — apufunktio, ei muuteta
--
-- Allekirjoitukset:
--   Molemmat funktiot säilyttävät saman allekirjoituksen kuin 066:ssa:
--     (p_organization_id TEXT, p_publish_key TEXT DEFAULT NULL,
--      p_access_code / p_default_visibility TEXT DEFAULT ...)
--   p_publish_key-parametri jätetään allekirjoitukseen yhteensopivuuden
--   vuoksi, mutta sitä ei enää tarkisteta eikä käytetä valtuutukseen.
--
-- Supabase-projekti: LaukaaInfo (km_org_session_token-projekti)
-- Ei koske: LostReFound (usswojtlvrnqtzwnffpg), Mixonet
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. set_organization_wall_access_code
--    Poistetaan julkaisuavainpolku — vaaditaan aina ylläpitäjävaltuutus.
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_organization_wall_access_code(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_organization_wall_access_code(
    p_organization_id TEXT,
    p_publish_key     TEXT DEFAULT NULL,   -- Parametri säilyy yhteensopivuuden vuoksi.
                                           -- Arvoa EI enää käytetä valtuutukseen.
    p_access_code     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_hash       TEXT;
BEGIN
    -- Pakollinen syötteen tarkistus
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    -- TIETOTURVARAJAUS (067): Julkaisuavain ei koskaan oikeuta seinäasetuksia.
    -- Vaaditaan aina kirjautunut ylläpitäjä tai service_role.
    IF NOT public._check_org_admin_or_moderator(p_organization_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Käyttöoikeus evätty. Seinän avauskoodin asettaminen vaatii ylläpitäjän kirjautumisen.'
        );
    END IF;

    v_clean_code := UPPER(REGEXP_REPLACE(COALESCE(p_access_code, ''), '\s+', '', 'g'));

    IF v_clean_code = '' OR p_access_code IS NULL THEN
        UPDATE public.organizations
        SET wall_access_code_hash = NULL, updated_at = now()
        WHERE id = p_organization_id;

        RETURN jsonb_build_object(
            'success',         true,
            'has_access_code', false,
            'message',         'Avauskoodi poistettu käytöstä.'
        );
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Avauskoodin tulee olla vähintään 4 merkkiä pitkä.'
        );
    END IF;

    v_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

    UPDATE public.organizations
    SET wall_access_code_hash = v_hash, updated_at = now()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object(
        'success',         true,
        'has_access_code', true,
        'message',         'Avauskoodi asetettu onnistuneesti.'
    );
END;
$$;

ALTER FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- =============================================================================
-- 2. set_organization_default_visibility
--    Poistetaan julkaisuavainpolku — vaaditaan aina ylläpitäjävaltuutus.
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_organization_default_visibility(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_organization_default_visibility(
    p_organization_id    TEXT,
    p_publish_key        TEXT DEFAULT NULL,   -- Parametri säilyy yhteensopivuuden vuoksi.
                                              -- Arvoa EI enää käytetä valtuutukseen.
    p_default_visibility TEXT DEFAULT 'public'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    -- Pakollinen syötteen tarkistus
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    -- TIETOTURVARAJAUS (067): Julkaisuavain ei koskaan oikeuta oletusnäkyvyyden muutokseen.
    -- Vaaditaan aina kirjautunut ylläpitäjä tai service_role.
    IF NOT public._check_org_admin_or_moderator(p_organization_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Käyttöoikeus evätty. Oletusnäkyvyyden muuttaminen vaatii ylläpitäjän kirjautumisen.'
        );
    END IF;

    IF p_default_visibility NOT IN ('public', 'code_protected') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Virheellinen näkyvyysarvo. Sallitut: public, code_protected.'
        );
    END IF;

    UPDATE public.organizations
    SET default_post_visibility = p_default_visibility, updated_at = now()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object(
        'success',                 true,
        'default_post_visibility', p_default_visibility
    );
END;
$$;

ALTER FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- =============================================================================
-- Tarkistuslause (aja erikseen tarvittaessa — ei muuta tietokantaa):
-- SELECT
--     p.proname AS function_name,
--     a.rolname AS grantee,
--     has_function_privilege(a.oid, p.oid, 'EXECUTE') AS can_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- CROSS JOIN pg_roles a
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--       'set_organization_wall_access_code',
--       'set_organization_default_visibility'
--   )
--   AND a.rolname IN ('anon', 'authenticated', 'service_role')
-- ORDER BY p.proname, a.rolname;
-- Odotettu tulos: anon = false, authenticated = true, service_role = true
-- =============================================================================

COMMIT;
