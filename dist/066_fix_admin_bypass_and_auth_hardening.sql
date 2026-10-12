-- =============================================================================
-- 066_fix_admin_bypass_and_auth_hardening.sql
-- LaukaaInfo – Tietoturvakovennus ja ADMIN-ohituksen poisto
-- =============================================================================
-- TILA: TUOTANTOON
--
-- Muutokset:
--   1. Poistaa vaarallisen p_publish_key = 'ADMIN' -merkkijono-ohituksen
--      funktioista set_organization_wall_access_code ja set_organization_default_visibility.
--   2. Vaatii ilman avainta kutsuttaessa aidon Supabase Auth -kirjautumisen
--      (auth.uid()) ja roolitarkistuksen (admin, moderator tai kyseisen organisaation company_admin).
--   3. Varmistaa, että set_organization_publish_key EI ole anon-roolin kutsuttavissa.
--      Suoritusoikeus myönnetään vain authenticated ja service_role -rooleille,
--      ja funktion sisällä tarkistetaan announcement.manage -oikeus.
--   4. Koodinvaihto peruuttaa vanhat julkaisukoodit (revoked_at = now()),
--      mitätöi välittömästi kaikki aktiiviset org_publisher_sessions -istunnot
--      ja kasvattaa publisher_code_version -laskuria.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. APUFUNKTIO: Sisäinen ylläpitäjä- / organisaatio-oikeustarkistus
-- =============================================================================

CREATE OR REPLACE FUNCTION public._check_org_admin_or_moderator(
    p_organization_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    -- service_role ohittaa aina
    IF current_user = 'service_role' OR COALESCE(auth.role(), '') = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Kirjautumaton käyttäjä ei voi olla ylläpitäjä
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Yleinen moderaattori / hallintaoikeus
    IF public.check_permission('announcement.manage') IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- 2. Suora roolitarkistus (admin, moderator tai kohde-organisaation admin)
    IF EXISTS (
        SELECT 1
        FROM public.user_roles ur
        LEFT JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND (
              COALESCE(r.name, ur.role_name) IN ('admin', 'moderator')
              OR (
                  COALESCE(r.name, ur.role_name) = 'company_admin'
                  AND ur.target_id = REPLACE(p_organization_id, 'company-', '')
              )
          )
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

ALTER FUNCTION public._check_org_admin_or_moderator(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._check_org_admin_or_moderator(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._check_org_admin_or_moderator(TEXT) TO authenticated, service_role;

-- =============================================================================
-- 2. KORJATTU: set_organization_wall_access_code (ADMIN-ohitus poistettu)
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_organization_wall_access_code(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_organization_wall_access_code(
    p_organization_id TEXT,
    p_publish_key     TEXT DEFAULT NULL,
    p_access_code     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_key  TEXT;
    v_verify_res JSONB;
    v_clean_code TEXT;
    v_hash       TEXT;
BEGIN
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_clean_key := TRIM(COALESCE(p_publish_key, ''));

    -- TIETOTURVAKORJAUS: Ei enää 'ADMIN'-merkkijonotarkistusta!
    -- Jos julkaisuavain on annettu, tarkistetaan se:
    IF v_clean_key != '' THEN
        v_verify_res := public.verify_publisher_key(p_organization_id, v_clean_key);
        IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Virheellinen julkaisuavain.'));
        END IF;
    ELSE
        -- Jos avainta ei ole annettu, vaaditaan todennettu ylläpitäjäistunto (Supabase Auth)
        IF NOT public._check_org_admin_or_moderator(p_organization_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Käyttöoikeus evätty. Toiminto vaatii organisaation julkaisuavaimen tai valtuutetun ylläpitäjän kirjautumisen.');
        END IF;
    END IF;

    v_clean_code := UPPER(REGEXP_REPLACE(COALESCE(p_access_code, ''), '\s+', '', 'g'));

    IF v_clean_code = '' OR p_access_code IS NULL THEN
        -- Poistetaan avauskoodi käytöstä
        UPDATE public.organizations
        SET wall_access_code_hash = NULL, updated_at = now()
        WHERE id = p_organization_id;

        RETURN jsonb_build_object('success', true, 'has_access_code', false, 'message', 'Avauskoodi poistettu käytöstä.');
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Avauskoodin tulee olla vähintään 4 merkkiä pitkä.');
    END IF;

    v_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

    UPDATE public.organizations
    SET wall_access_code_hash = v_hash, updated_at = now()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'has_access_code', true, 'message', 'Avauskoodi asetettu onnistuneesti.');
END;
$$;

ALTER FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_organization_wall_access_code(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 3. KORJATTU: set_organization_default_visibility (ADMIN-ohitus poistettu)
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_organization_default_visibility(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_organization_default_visibility(
    p_organization_id    TEXT,
    p_publish_key        TEXT DEFAULT NULL,
    p_default_visibility TEXT DEFAULT 'public'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_key  TEXT;
    v_verify_res JSONB;
BEGIN
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_clean_key := TRIM(COALESCE(p_publish_key, ''));

    -- TIETOTURVAKORJAUS: Ei enää 'ADMIN'-merkkijonotarkistusta!
    IF v_clean_key != '' THEN
        v_verify_res := public.verify_publisher_key(p_organization_id, v_clean_key);
        IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', COALESCE(v_verify_res->>'error', 'Virheellinen julkaisuavain.'));
        END IF;
    ELSE
        -- Jos avainta ei ole annettu, vaaditaan todennettu ylläpitäjäistunto (Supabase Auth)
        IF NOT public._check_org_admin_or_moderator(p_organization_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Käyttöoikeus evätty. Toiminto vaatii organisaation julkaisuavaimen tai valtuutetun ylläpitäjän kirjautumisen.');
        END IF;
    END IF;

    IF p_default_visibility NOT IN ('public', 'code_protected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen näkyvyysarvo. Sallitut: public, code_protected.');
    END IF;

    UPDATE public.organizations
    SET default_post_visibility = p_default_visibility, updated_at = now()
    WHERE id = p_organization_id;

    RETURN jsonb_build_object('success', true, 'default_post_visibility', p_default_visibility);
END;
$$;

ALTER FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_organization_default_visibility(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 4. KORJATTU: set_organization_publish_key (Lukittu: Vain authenticated ylläpitäjä tai service_role)
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_organization_publish_key(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.set_organization_publish_key(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.set_organization_publish_key(
    p_organization_id TEXT,
    p_raw_key         TEXT,
    p_org_name        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_key   TEXT;
    v_hash        TEXT;
    v_new_version INT;
BEGIN
    -- 1. Valtuutustarkistus: Vain todellinen ylläpitäjä tai service_role saa asettaa/vaihtaa avaimen!
    IF NOT public._check_org_admin_or_moderator(p_organization_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Käyttöoikeus evätty. Vain valtuutettu ylläpitäjä voi generoida tai vaihtaa julkaisukoodeja.');
    END IF;

    -- 2. Avaimen validointi
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_clean_key := UPPER(REGEXP_REPLACE(p_raw_key, '[^A-Z0-9]', '', 'g'));
    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisukoodin tulee olla vähintään 6 merkkiä pitkä.');
    END IF;

    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- 3. Varmistetaan organisaatiorivi
    INSERT INTO public.organizations (id, name, publisher_enabled, publisher_code_version)
    VALUES (p_organization_id, COALESCE(p_org_name, p_organization_id), TRUE, 1)
    ON CONFLICT (id) DO UPDATE
    SET publisher_enabled = TRUE,
        updated_at        = now();

    SELECT publisher_code_version INTO v_new_version
    FROM public.organizations
    WHERE id = p_organization_id;

    -- 4. Peruutetaan kaikki aiemmat credentials-rivit tälle organisaatiolle
    UPDATE public.organization_publish_credentials
    SET revoked_at = now()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    -- 5. MITÄTÖIDÄÄN KAIKKI AKTIIVISET ISTUNNOT VÄLITTÖMÄSTI (K6)
    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    -- 6. Kasvatetaan koodiversio (kaksinkertainen varmennus) (K4)
    v_new_version := COALESCE(v_new_version, 1) + 1;
    UPDATE public.organizations
    SET publisher_code_version = v_new_version,
        updated_at             = now()
    WHERE id = p_organization_id;

    -- 7. Tallennetaan uusi SHA-256 tiiviste
    INSERT INTO public.organization_publish_credentials (organization_id, code_hash)
    VALUES (p_organization_id, v_hash);

    RETURN jsonb_build_object(
        'success',         true,
        'organization_id', p_organization_id,
        'code_version',    v_new_version,
        'message',         'Julkaisukoodi päivitetty. Kaikki vanhat istunnot mitätöity.'
    );
END;
$$;

ALTER FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) OWNER TO postgres;

-- TIETOTURVARAJAUS: Ei missään nimessä oikeutta anon-roolille!
REVOKE ALL ON FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
