-- =============================================================================
-- 065_org_sessions.sql
-- LaukaaInfo – Organisaation Istuntotunniste (Org Publisher Session)
-- =============================================================================
-- TILA: TUOTANTOVALMIS (tietoturvatarkastettu)
--
-- Tämä migraatio lisää Kohtaamiset- ja Seinä-palveluihin organisaatiokohtaisen
-- määräaikaisen istuntotunnisteen. Julkaisija syöttää julkaisukoodin kerran,
-- palvelin antaa rajoitetun istuntotunnisteen, jota käytetään saman session ajan.
--
-- Riippuvuudet (täytyy olla ajettuna ennen tätä):
--   - supabase_seina_migration.sql (organizations, organization_publish_credentials)
--   - 060_encounters_unified_schema.sql v5.20+ (encounters, encounter_edit_tokens)
--
-- Tietoturvamuutokset vs. alkuperäinen suunnitelma (käyttäjän korjaukset):
--   K1. Istuntotunniste tallennetaan tietokantaan SHA-256-tiivisteenä,
--       ei selväkielisenä (asiakkaalle palautetaan vain kerran alkuperäinen UUID).
--   K2. Indeksit korjattu: ei now()-kutsua partiaalisen indeksin predikaatissa.
--       Vanheneminen tarkistetaan kyselyssä. Tokenin indeksi on UNIQUE.
--   K3. verify_org_session() tarkistaa credential-rivin revoked_at-tilan
--       (ei luoteta pelkkään CASCADE:en, joka ei laukea soft-deletessa).
--   K4. publisher_code_version kopioidaan istuntoon – koodinvaihto mitätöi
--       kaikki vanhan version istunnot ilman erillistä siivousta.
--   K5. verify_org_session() tarkistaa myös organizations.publisher_enabled.
--   K6. set_organization_publish_key() mitätöi nyt eksplisiittisesti vanhat
--       istunnot (revoked_at = now()) lisäksi publisher_code_version-versionoinnin
--       ohella – kaksinkertainen suoja.
--   K7. Yksityishenkilön anonyymi ilmoitus (publisher_type='personal') ei koskaan
--       kuulu org-session hallittavaksi: omistajuustarkistus on encounters-taulussa.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ORG_PUBLISHER_SESSIONS -TAULU
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_publisher_sessions (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id  TEXT        NOT NULL
                                 REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Istuntotunniste tallennetaan tiivisteenä (K1).
    -- Asiakkaalle palautetaan kertaluonteisesti alkuperäinen UUID begin_org_session():sta.
    token_hash       TEXT        NOT NULL,
    -- Käytetyn credential-rivin ID (K3: tarkistetaan kyselyissä revoked_at).
    -- Ei CASCADE: credential-rivin poistaminen ei poista istuntoa, mutta
    -- _verify_org_session_internal() hylkää istunnon jos credential on peruutettu.
    credential_id    UUID        REFERENCES public.organization_publish_credentials(id)
                                 ON DELETE SET NULL,
    -- Koodin versio istuntoa luodessa (K4): koodinvaihto nostaa version,
    -- vanhat istunnot hylätään version-tarkistuksessa.
    code_version     INT         NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '8 hours'),
    revoked_at       TIMESTAMPTZ NULL,
    last_used_at     TIMESTAMPTZ NULL
);

-- Sarakkeiden idempotentti lisäys (jos taulu on jo olemassa vanhemmasta ajosta)
ALTER TABLE public.org_publisher_sessions
    ADD COLUMN IF NOT EXISTS credential_id  UUID        REFERENCES public.organization_publish_credentials(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS code_version   INT         NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_used_at   TIMESTAMPTZ NULL;

-- =============================================================================
-- 2. INDEKSIT (K2: ei now()-kutsua predikaateissa)
-- =============================================================================

-- Yksikäsitteinen haku token_hash:lla – UNIQUE estää myös törmäykset (K2)
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_sessions_token_hash
    ON public.org_publisher_sessions(token_hash);

-- Organisaation aktiivisten istuntojen haku (vanheneminen tarkistetaan kyselyssä)
CREATE INDEX IF NOT EXISTS idx_org_sessions_org_active
    ON public.org_publisher_sessions(organization_id)
    WHERE revoked_at IS NULL;

-- Credential-rivin peruutuksen vaikutusten haku
CREATE INDEX IF NOT EXISTS idx_org_sessions_credential
    ON public.org_publisher_sessions(credential_id)
    WHERE revoked_at IS NULL;

-- =============================================================================
-- 3. KÄYTTÖOIKEUDET
-- =============================================================================

REVOKE ALL ON public.org_publisher_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.org_publisher_sessions TO service_role;
ALTER TABLE public.org_publisher_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: Ei suoraa lukuoikeutta kenellekään. Kaikki toiminnot SECURITY DEFINER -RPC:n kautta.
DROP POLICY IF EXISTS "No direct access to org sessions" ON public.org_publisher_sessions;
CREATE POLICY "No direct access to org sessions"
    ON public.org_publisher_sessions
    FOR ALL
    USING (false);

-- =============================================================================
-- 4. APUFUNKTIO: SISÄINEN ISTUNTOTARKISTUS (ei julkinen)
--
-- Tarkistaa KAIKKI seuraavat ehdot (K3, K4, K5):
--   1. Istunto olemassa ja voimassa (expires_at > now(), revoked_at IS NULL)
--   2. Istunnon organization_id täsmää pyydettyyn (ei voi vaihtaa orgia)
--   3. Alkuperäinen credential on edelleen aktiivinen (revoked_at IS NULL)
--   4. Koodin versio täsmää organisaation nykyiseen versioon (K4)
--   5. Organisaation publisher_enabled on tosi (K5)
--
-- Palauttaa SESSION-rivin tai NULL jos mikä tahansa tarkistus epäonnistuu.
-- Päivittää last_used_at onnistuneessa tarkistuksessa.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._verify_org_session_internal(
    p_token_hash      TEXT,
    p_organization_id TEXT
)
RETURNS public.org_publisher_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_session    public.org_publisher_sessions;
    v_org_ok     BOOLEAN;
    v_cred_ok    BOOLEAN;
BEGIN
    -- 1. Haetaan istunto token_hash-tiivisteellä, tarkistetaan org ja voimassaolo
    SELECT s.* INTO v_session
    FROM public.org_publisher_sessions s
    WHERE s.token_hash       = p_token_hash
      AND s.organization_id  = p_organization_id   -- org-täsmäys palvelinpuolella (K3/K7)
      AND s.revoked_at       IS NULL
      AND s.expires_at       > now();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- 2. Tarkistetaan organisaation tila ja koodin versio (K4, K5)
    SELECT
        o.publisher_enabled
        AND o.publisher_code_version = v_session.code_version  -- K4: versiotarkistus
    INTO v_org_ok
    FROM public.organizations o
    WHERE o.id = p_organization_id;

    IF NOT COALESCE(v_org_ok, FALSE) THEN
        RETURN NULL;
    END IF;

    -- 3. Tarkistetaan credential-rivin tila (K3: soft-delete ei laukaise CASCADEa)
    IF v_session.credential_id IS NOT NULL THEN
        SELECT (revoked_at IS NULL)
        INTO v_cred_ok
        FROM public.organization_publish_credentials
        WHERE id = v_session.credential_id;

        IF NOT COALESCE(v_cred_ok, FALSE) THEN
            RETURN NULL;
        END IF;
    END IF;

    -- 4. Päivitetään viimeisin käyttöaika
    UPDATE public.org_publisher_sessions
    SET last_used_at = now()
    WHERE id = v_session.id;

    RETURN v_session;
END;
$$;

ALTER FUNCTION public._verify_org_session_internal(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._verify_org_session_internal(TEXT, TEXT) FROM PUBLIC;
-- Ei GRANT:ia julkiselle – vain SECURITY DEFINER -funktiot voivat kutsua tätä

-- =============================================================================
-- 5. RPC: ISTUNNON ALOITUS
--
-- Asiakasohjelma kutsuu kerran julkaisukoodilla.
-- Palvelin: tarkistaa koodin -> luo istunnon -> palauttaa session_token kertaalleen.
-- Asiakas: tallentaa session_token sessionStorage:iin (ei localStorage!).
-- Tietokanta: tallentaa vain SHA-256-tiivisteen, ei selväkielistä tokenia (K1).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.begin_org_session(
    p_organization_id TEXT,
    p_publish_key     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_key    TEXT;
    v_key_hash     TEXT;
    v_session_uuid UUID;
    v_token_hash   TEXT;
    v_cred         RECORD;
    v_org          RECORD;
    v_session_id   UUID;
BEGIN
    -- 1. Syötevalidointi
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    IF p_publish_key IS NULL OR TRIM(p_publish_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisuavain vaaditaan.');
    END IF;

    -- 2. Normalisoidaan ja hashataan avain (sama logiikka kuin verify_publisher_key():ssä)
    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisuavaimen tulee olla vahintaan 6 merkkia.');
    END IF;
    v_key_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- 3. Tarkistetaan organisaatio
    SELECT id, name, publisher_enabled, publisher_code_version
    INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei loydy jarjestelmasta.');
    END IF;

    IF v_org.publisher_enabled IS FALSE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaation julkaisuoikeus on estetty.');
    END IF;

    -- 4. Tarkistetaan julkaisuavain credentials-taulusta
    SELECT id, code_hash, revoked_at
    INTO v_cred
    FROM public.organization_publish_credentials
    WHERE organization_id = p_organization_id
      AND code_hash = v_key_hash
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- HUOM: Seinan vanha verify_publisher_key() salli "demo-ohituksen" jos avaimia ei ole.
        -- Tassa funktiossa se ei ole sallittua - istuntoa ei luoda ilman kelvollista avainta.
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen julkaisuavain.');
    END IF;

    -- 5. Paivitetaan avaimen viimeisin kayttoaika
    UPDATE public.organization_publish_credentials
    SET last_used_at = now()
    WHERE id = v_cred.id;

    -- 6. Luodaan istuntotunniste (K1: tallennetaan vain tiiviste)
    v_session_uuid := gen_random_uuid();
    v_token_hash   := encode(digest(v_session_uuid::text, 'sha256'), 'hex');

    INSERT INTO public.org_publisher_sessions (
        organization_id,
        token_hash,
        credential_id,
        code_version,
        expires_at
    ) VALUES (
        p_organization_id,
        v_token_hash,
        v_cred.id,
        COALESCE(v_org.publisher_code_version, 1),
        now() + interval '8 hours'
    )
    RETURNING id INTO v_session_id;

    -- 7. Palautetaan alkuperainen UUID kertaluonteisesti (K1)
    RETURN jsonb_build_object(
        'success',       true,
        'session_token', v_session_uuid,   -- selvakelinen UUID, lahetetaan vain kerran
        'session_id',    v_session_id,
        'org_id',        p_organization_id,
        'org_name',      v_org.name,
        'expires_at',    (now() + interval '8 hours')
    );
END;
$$;

ALTER FUNCTION public.begin_org_session(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.begin_org_session(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_org_session(TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- 6. RPC: ISTUNNON LOPETUS (Uloskirjautuminen)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.end_org_session(
    p_session_token   UUID,
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash   TEXT;
    v_rows_updated INT;
BEGIN
    IF p_session_token IS NULL OR p_organization_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istuntotunniste ja organisaatiotunnus vaaditaan.');
    END IF;

    v_token_hash := encode(digest(p_session_token::text, 'sha256'), 'hex');

    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE token_hash      = v_token_hash
      AND organization_id = p_organization_id  -- organisaatiotasmays myos lopetuksessa
      AND revoked_at      IS NULL;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
        -- Istunto oli jo paattynyt tai ei loydy - ei virhe asiakkaalle
        RETURN jsonb_build_object('success', true, 'message', 'Istunto paattynyt tai ei loydy.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Istunto paatettiin onnistuneesti.');
END;
$$;

ALTER FUNCTION public.end_org_session(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.end_org_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_org_session(UUID, TEXT) TO anon, authenticated;

-- =============================================================================
-- 7. LAAJENNUS: set_organization_publish_key() – MITATOI VANHAT ISTUNNOT (K6)
--
-- Seinan alkuperainen funktio merkitsi vanhat credentials revoked_at:lla,
-- mutta ei mitaatoinut niilla luotuja istuntoja.
-- Lisataan eksplisiittinen istuntojen peruutus koodinvaihdon yhteydessa:
--   - Vanhat istunnot merkitaan revoked_at = now()
--   - publisher_code_version nostetaan (K4) – sekin mitaatoi istunnot verify:ssa
-- =============================================================================

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
    -- 1. Validointi
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiotunnus vaaditaan.');
    END IF;

    v_clean_key := UPPER(REGEXP_REPLACE(p_raw_key, '[^A-Z0-9]', '', 'g'));
    IF LENGTH(v_clean_key) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisuavaimen tulee olla vahintaan 6 merkkia.');
    END IF;

    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- 2. Varmistetaan organisaation olemassaolo
    INSERT INTO public.organizations (id, name, publisher_enabled, publisher_code_version)
    VALUES (p_organization_id, COALESCE(p_org_name, p_organization_id), TRUE, 1)
    ON CONFLICT (id) DO UPDATE
    SET publisher_enabled = TRUE,
        updated_at        = now();

    SELECT publisher_code_version INTO v_new_version
    FROM public.organizations
    WHERE id = p_organization_id;

    -- 3. Merkitaan vanhat credentials peruutetuiksi
    UPDATE public.organization_publish_credentials
    SET revoked_at = now()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    -- 4. UUTTA (K6): Mitatoidaan kaikki vanhat istunnot eksplisiittisesti
    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    -- 5. Nostetaan publisher_code_version (K4): kaksinkertainen suoja istuntojen mitatoinnissa
    v_new_version := COALESCE(v_new_version, 1) + 1;
    UPDATE public.organizations
    SET publisher_code_version = v_new_version,
        updated_at             = now()
    WHERE id = p_organization_id;

    -- 6. Taltioidaan uusi credential-hash
    INSERT INTO public.organization_publish_credentials (organization_id, code_hash)
    VALUES (p_organization_id, v_hash);

    RETURN jsonb_build_object(
        'success',         true,
        'organization_id', p_organization_id,
        'code_version',    v_new_version,
        'message',         'Julkaisuavain paivitetty. Vanhat istunnot mitatoity.'
    );
END;
$$;

ALTER FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) FROM PUBLIC;
-- Vain service_role – kutsutaan vain yllapidon kautta
GRANT EXECUTE ON FUNCTION public.set_organization_publish_key(TEXT, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 8. ENCOUNTER_ORG_AUDIT – KEVYT TAPAHTUMALOKI
--
-- Tallentaa organisaatioistunnon kautta tehdyt toiminnot ilman arkaluonteisia tietoja.
-- Ei tallenna julkaisuavaimia, session_tokenia eikä edit_tokenia selvakelisina.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.encounter_org_audit (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id TEXT        NOT NULL,
    session_id      UUID        NULL,   -- viittaa org_publisher_sessions.id (ei token_hash)
    encounter_id    UUID        NULL,   -- viittaa encounters.id
    action          TEXT        NOT NULL,  -- 'create' | 'update' | 'close'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_action CHECK (action IN ('create', 'update', 'close'))
);

CREATE INDEX IF NOT EXISTS idx_audit_org
    ON public.encounter_org_audit(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_session
    ON public.encounter_org_audit(session_id)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_encounter
    ON public.encounter_org_audit(encounter_id)
    WHERE encounter_id IS NOT NULL;

REVOKE ALL ON public.encounter_org_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.encounter_org_audit TO service_role;
ALTER TABLE public.encounter_org_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct audit access" ON public.encounter_org_audit;
CREATE POLICY "No direct audit access" ON public.encounter_org_audit FOR ALL USING (false);

-- =============================================================================
-- 9. SIIVOUSFUNKTIO (ajettavissa Supabase Cron -tehtavana)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revoke_expired_org_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE public.org_publisher_sessions
    SET revoked_at = now()
    WHERE expires_at < now()
      AND revoked_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

ALTER FUNCTION public.revoke_expired_org_sessions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_expired_org_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_expired_org_sessions() TO service_role;

-- =============================================================================
-- 10. PAIVITETTY verify_publisher_key() – DEMO-OHITUS POISTETTU
--
-- Seinan vanha versio salli tarkistuksen laipaisemisen jos avaimia ei ole
-- ("ensimmainen alustus"). Tama on tietoturvariski tuotannossa.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_publisher_key(
    p_organization_id TEXT,
    p_publish_key     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_clean_key TEXT;
    v_hash      TEXT;
    v_enabled   BOOLEAN;
    v_valid     BOOLEAN := FALSE;
    v_org_name  TEXT;
BEGIN
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = ''
       OR p_publish_key IS NULL OR TRIM(p_publish_key) = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaatiotunnus ja julkaisuavain vaaditaan.');
    END IF;

    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    SELECT name, publisher_enabled
    INTO v_org_name, v_enabled
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaatiota ei loydy jarjestelmasta.');
    END IF;

    IF v_enabled IS FALSE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaation julkaisuoikeus on estetty.');
    END IF;

    -- KORJAUS: Poistettu "demo-ohitus" (IF NOT EXISTS avaimia -> sallitaan).
    -- Tietokannassa taytya aina olla voimassaoleva avain.
    SELECT EXISTS (
        SELECT 1 FROM public.organization_publish_credentials
        WHERE organization_id = p_organization_id
          AND code_hash       = v_hash
          AND revoked_at      IS NULL
    ) INTO v_valid;

    IF v_valid THEN
        RETURN jsonb_build_object('valid', true, 'org_name', v_org_name, 'org_id', p_organization_id);
    ELSE
        RETURN jsonb_build_object('valid', false, 'error', 'Virheellinen julkaisuavain.');
    END IF;
END;
$$;

ALTER FUNCTION public.verify_publisher_key(TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_publisher_key(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_publisher_key(TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- 11. RPC: create_encounter() – TUETTU ORG SESSION TOKENILLA JA JULKAISUAVAIMELLA
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT
);
DROP FUNCTION IF EXISTS public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT, UUID
);

CREATE OR REPLACE FUNCTION public.create_encounter(
    p_type              TEXT,
    p_title             TEXT,
    p_description       TEXT,
    p_sub_category      TEXT DEFAULT NULL,
    p_price_info        TEXT DEFAULT NULL,
    p_place_id          UUID DEFAULT NULL,
    p_location          TEXT DEFAULT NULL,
    p_location_id       TEXT DEFAULT NULL,
    p_publisher_type    TEXT DEFAULT 'personal',
    p_publisher_name    TEXT DEFAULT NULL,
    p_organization_id   TEXT DEFAULT NULL,
    p_publish_key       TEXT DEFAULT NULL,
    p_tags              TEXT[] DEFAULT '{}',
    p_contact_email     TEXT DEFAULT NULL,
    p_contact_phone     TEXT DEFAULT NULL,
    p_allow_messages    BOOLEAN DEFAULT true,
    p_structured_links  JSONB DEFAULT '{}'::jsonb,
    p_image_url         TEXT DEFAULT NULL,
    p_duration_days     INT DEFAULT 30,
    p_org_session_token UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_new_id             UUID;
    v_edit_token         UUID;
    v_verify_res         JSONB;
    v_db_org_name        TEXT;
    v_db_org_type        TEXT;
    v_effective_org_id   TEXT := NULL;
    v_effective_pub_name TEXT := NULL;
    v_effective_pub_type TEXT := 'personal';
    v_effective_type     TEXT;
    v_is_admin           BOOLEAN;
    v_duration           INT;
    v_session            public.org_publisher_sessions;
    v_token_hash         TEXT;
    v_valid_types TEXT[] := ARRAY[
        'search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found',
        'need_help', 'offer_service', 'service_request', 'work_and_gigs',
        'space_rental', 'b2b_collab', 'event_staff', 'community',
        'high_value', 'lost_and_found', 'local_notice'
    ];
    v_valid_pub_types TEXT[] := ARRAY[
        'personal', 'company', 'association', 'location', 'event', 'network', 'service'
    ];
BEGIN
    v_is_admin := public.is_admin();

    -- 1. Syötevalidointi
    IF p_type IS NULL OR NOT (p_type = ANY(v_valid_types)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen ilmoitustyyppi (type).');
    END IF;

    IF p_publisher_type IS NOT NULL AND NOT (p_publisher_type = ANY(v_valid_pub_types)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen julkaisijatyyppi (publisher_type).');
    END IF;

    IF p_title IS NULL OR LENGTH(TRIM(p_title)) < 3 OR LENGTH(p_title) > 150 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Otsikon on oltava 3–150 merkkiä pitkä.');
    END IF;

    IF p_description IS NULL OR LENGTH(TRIM(p_description)) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kuvauksen on oltava vähintään 5 merkkiä pitkä.');
    END IF;

    IF p_price_info IS NOT NULL AND LENGTH(TRIM(p_price_info)) > 80 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hintatiedon maksimipituus on 80 merkkiä.');
    END IF;

    IF p_structured_links IS NOT NULL AND jsonb_typeof(p_structured_links) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'structured_links on oltava JSON-objekti.');
    END IF;

    v_duration := LEAST(GREATEST(COALESCE(p_duration_days, 30), 1), 90);

    v_effective_type := CASE p_type
        WHEN 'need_help'       THEN 'search'
        WHEN 'service_request' THEN 'search'
        WHEN 'work_and_gigs'   THEN 'search'
        WHEN 'event_staff'     THEN 'search'
        WHEN 'offer_service'   THEN 'offer'
        WHEN 'b2b_collab'      THEN 'offer'
        WHEN 'space_rental'    THEN 'offer'
        WHEN 'local_notice'    THEN 'notice'
        WHEN 'community'       THEN 'notice'
        WHEN 'high_value'      THEN 'sell'
        WHEN 'lost_and_found'  THEN 'lost_found'
        ELSE p_type
    END;

    -- 2. Organisaation todennus ja tyyppimuunnos
    IF p_organization_id IS NOT NULL THEN
        SELECT name, type INTO v_db_org_name, v_db_org_type
        FROM public.organizations
        WHERE id = p_organization_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei löydy järjestelmästä.');
        END IF;

        v_effective_pub_type := CASE LOWER(TRIM(COALESCE(v_db_org_type, '')))
            WHEN 'company'     THEN 'company'
            WHEN 'business'    THEN 'company'
            WHEN 'yritys'      THEN 'company'
            WHEN 'association' THEN 'association'
            WHEN 'ry'          THEN 'association'
            WHEN 'yhdistys'    THEN 'association'
            WHEN 'service'     THEN 'service'
            WHEN 'palvelu'     THEN 'service'
            WHEN 'event'       THEN 'event'
            WHEN 'tapahtuma'   THEN 'event'
            WHEN 'network'     THEN 'network'
            WHEN 'verkosto'    THEN 'network'
            WHEN 'location'    THEN 'location'
            WHEN 'paikka'      THEN 'location'
            ELSE NULL
        END;

        IF v_effective_pub_type IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Organisaation tyyppi kannassa (' || COALESCE(v_db_org_type, 'puuttuu/NULL') || ') ei ole tuettu julkaisijaksi.'
            );
        END IF;

        IF v_is_admin THEN
            v_effective_org_id   := p_organization_id;
            v_effective_pub_name := COALESCE(NULLIF(TRIM(p_publisher_name), ''), v_db_org_name, 'Ylläpito');
        ELSIF p_org_session_token IS NOT NULL THEN
            -- UUSI: Istuntotunnisteella julkaisu
            v_token_hash := encode(digest(p_org_session_token::text, 'sha256'), 'hex');
            v_session := public._verify_org_session_internal(v_token_hash, p_organization_id);
            IF v_session IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Organisaatioistunto on vanhentunut tai virheellinen.'
                );
            END IF;

            v_effective_org_id   := p_organization_id;
            v_effective_pub_name := COALESCE(NULLIF(TRIM(p_publisher_name), ''), v_db_org_name);
        ELSIF p_publish_key IS NOT NULL AND TRIM(p_publish_key) <> '' THEN
            -- Taaksepäin yhteensopivuus: suora julkaisuavain
            v_verify_res := public.verify_publisher_key(p_organization_id, TRIM(p_publish_key));
            IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', COALESCE(v_verify_res->>'error', 'Virheellinen organisaation julkaisuavain.')
                );
            END IF;

            v_effective_org_id   := p_organization_id;
            v_effective_pub_name := COALESCE(NULLIF(TRIM(p_publisher_name), ''), v_db_org_name, v_verify_res->>'org_name');
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Organisaation nimissä julkaiseminen vaatii julkaisuavaimen tai voimassa olevan istunnon.'
            );
        END IF;
    ELSE
        -- Henkilökohtainen julkaisu
        IF p_publisher_type IS NOT NULL AND p_publisher_type <> 'personal' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Organisaatiojulkaisijatyyppi vaatii organisaatiotunnuksen (organization_id).'
            );
        END IF;

        v_effective_pub_type := 'personal';
        v_effective_pub_name := NULLIF(TRIM(p_publisher_name), '');
        v_effective_org_id   := NULL;
    END IF;

    -- 3. Luodaan kohtaaminen
    INSERT INTO public.encounters (
        type, sub_category, title, description, price_info,
        place_id, location, location_id,
        publisher_type, publisher_name, organization_id,
        tags, contact_email, contact_phone, allow_messages,
        structured_links, image_url, user_id,
        expires_at
    ) VALUES (
        v_effective_type,
        p_sub_category, TRIM(p_title), TRIM(p_description), NULLIF(TRIM(COALESCE(p_price_info,'')), ''),
        p_place_id, p_location, p_location_id,
        v_effective_pub_type, v_effective_pub_name, v_effective_org_id,
        COALESCE(p_tags, '{}'), NULLIF(TRIM(COALESCE(p_contact_email,'')), ''), NULLIF(TRIM(COALESCE(p_contact_phone,'')), ''), COALESCE(p_allow_messages, true),
        COALESCE(p_structured_links, '{}'::jsonb), p_image_url, auth.uid(),
        now() + (v_duration || ' days')::interval
    )
    RETURNING id INTO v_new_id;

    -- 4. Audit-loki jos julkaistiin organisaatioistunnolla
    IF v_session IS NOT NULL THEN
        INSERT INTO public.encounter_org_audit (
            organization_id, session_id, encounter_id, action
        ) VALUES (
            p_organization_id, v_session.id, v_new_id, 'create'
        );
    END IF;

    -- 5. Haetaan AFTER INSERT -triggerin luoma edit_token
    SELECT edit_token INTO v_edit_token
    FROM public.encounter_edit_tokens
    WHERE encounter_id = v_new_id;

    RETURN jsonb_build_object(
        'success',      true,
        'encounter_id', v_new_id,
        'edit_token',   v_edit_token
    );
END;
$$;

ALTER FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT, UUID
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT, UUID
) TO anon, authenticated;

-- =============================================================================
-- 12. RPC: update_encounter_with_token() – TUETTU EDIT_TOKENILLA TAI ORG-ISTUNNOLLA
-- =============================================================================

DROP FUNCTION IF EXISTS public.update_encounter_with_token(UUID, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_encounter_with_token(UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_encounter_with_token(
    p_encounter_id      UUID,
    p_edit_token        UUID DEFAULT NULL,
    p_title             TEXT DEFAULT NULL,
    p_description       TEXT DEFAULT NULL,
    p_price_info        TEXT DEFAULT NULL,
    p_status            TEXT DEFAULT NULL,
    p_org_session_token UUID DEFAULT NULL,
    p_organization_id   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_new_price  TEXT;
    v_session    public.org_publisher_sessions;
    v_token_hash TEXT;
    v_is_admin   BOOLEAN;
BEGIN
    v_is_admin := public.is_admin();

    IF p_encounter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tunniste (ID) vaaditaan.');
    END IF;

    IF p_title IS NOT NULL THEN
        IF TRIM(p_title) = '' OR LENGTH(TRIM(p_title)) < 3 OR LENGTH(p_title) > 150 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Otsikon on oltava 3–150 merkkiä pitkä.');
        END IF;
    END IF;

    IF p_description IS NOT NULL THEN
        IF TRIM(p_description) = '' OR LENGTH(TRIM(p_description)) < 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Kuvauksen on oltava vähintään 5 merkkiä pitkä.');
        END IF;
    END IF;

    IF p_price_info IS NOT NULL THEN
        IF LENGTH(TRIM(p_price_info)) > 80 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Hintatiedon enimmäispituus on 80 merkkiä.');
        END IF;
        IF TRIM(p_price_info) = '' THEN
            v_new_price := NULL;
        ELSE
            v_new_price := TRIM(p_price_info);
        END IF;
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'closed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sallitut tilat: active tai closed.');
    END IF;

    -- Tarkistetaan oikeus:
    -- A) Admin
    -- B) Org-istunto (jos p_org_session_token ja p_organization_id annettu)
    -- C) edit_token
    IF p_org_session_token IS NOT NULL AND p_organization_id IS NOT NULL THEN
        v_token_hash := encode(digest(p_org_session_token::text, 'sha256'), 'hex');
        v_session := public._verify_org_session_internal(v_token_hash, p_organization_id);
        IF v_session IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Organisaatioistunto on vanhentunut tai virheellinen.');
        END IF;

        UPDATE public.encounters e
        SET title       = CASE WHEN p_title IS NOT NULL THEN TRIM(p_title) ELSE e.title END,
            description = CASE WHEN p_description IS NOT NULL THEN TRIM(p_description) ELSE e.description END,
            price_info  = CASE WHEN p_price_info IS NOT NULL THEN v_new_price ELSE e.price_info END,
            status      = COALESCE(p_status, e.status)
        WHERE e.id = p_encounter_id
          AND e.organization_id = p_organization_id
          AND e.status NOT IN ('deleted', 'archived')
          AND (e.expires_at > now())
        RETURNING e.id INTO v_updated_id;

        IF v_updated_id IS NOT NULL THEN
            INSERT INTO public.encounter_org_audit (
                organization_id, session_id, encounter_id, action
            ) VALUES (
                p_organization_id, v_session.id, p_encounter_id, 'update'
            );
        END IF;

    ELSIF p_edit_token IS NOT NULL THEN
        UPDATE public.encounters e
        SET title       = CASE WHEN p_title IS NOT NULL THEN TRIM(p_title) ELSE e.title END,
            description = CASE WHEN p_description IS NOT NULL THEN TRIM(p_description) ELSE e.description END,
            price_info  = CASE WHEN p_price_info IS NOT NULL THEN v_new_price ELSE e.price_info END,
            status      = COALESCE(p_status, e.status)
        FROM public.encounter_edit_tokens t
        WHERE e.id = p_encounter_id
          AND t.encounter_id = e.id
          AND t.edit_token = p_edit_token
          AND e.status NOT IN ('deleted', 'archived')
          AND (e.expires_at > now())
        RETURNING e.id INTO v_updated_id;

    ELSIF v_is_admin THEN
        UPDATE public.encounters e
        SET title       = CASE WHEN p_title IS NOT NULL THEN TRIM(p_title) ELSE e.title END,
            description = CASE WHEN p_description IS NOT NULL THEN TRIM(p_description) ELSE e.description END,
            price_info  = CASE WHEN p_price_info IS NOT NULL THEN v_new_price ELSE e.price_info END,
            status      = COALESCE(p_status, e.status)
        WHERE e.id = p_encounter_id
          AND e.status NOT IN ('deleted', 'archived')
        RETURNING e.id INTO v_updated_id;

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Muokkausoikeus vaatii edit_tokenin tai organisaatioistunnon.');
    END IF;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Päivitys epäonnistui: virheellinen avain, ilmoitus poistettu tai voimassaolo päättynyt.'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_updated_id);
END;
$$;

ALTER FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT
) TO anon, authenticated;

-- =============================================================================
-- 13. RPC: delete_encounter_with_token() – TUETTU EDIT_TOKENILLA TAI ORG-ISTUNNOLLA
-- =============================================================================

DROP FUNCTION IF EXISTS public.delete_encounter_with_token(UUID);
DROP FUNCTION IF EXISTS public.delete_encounter_with_token(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_encounter_with_token(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.delete_encounter_with_token(
    p_encounter_id      UUID,
    p_edit_token        UUID DEFAULT NULL,
    p_org_session_token UUID DEFAULT NULL,
    p_organization_id   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_is_admin   BOOLEAN;
    v_user_id    UUID;
    v_session    public.org_publisher_sessions;
    v_token_hash TEXT;
BEGIN
    IF p_encounter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tunniste vaaditaan.');
    END IF;

    v_is_admin := public.is_admin();

    SELECT user_id INTO v_user_id
    FROM public.encounters
    WHERE id = p_encounter_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ilmoitusta ei löydy.');
    END IF;

    IF p_org_session_token IS NOT NULL AND p_organization_id IS NOT NULL THEN
        v_token_hash := encode(digest(p_org_session_token::text, 'sha256'), 'hex');
        v_session := public._verify_org_session_internal(v_token_hash, p_organization_id);
        IF v_session IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Organisaatioistunto on vanhentunut tai virheellinen.');
        END IF;

        UPDATE public.encounters e
        SET status = 'closed'
        WHERE e.id = p_encounter_id
          AND e.organization_id = p_organization_id
          AND e.status NOT IN ('deleted', 'closed')
          AND (e.expires_at > now())
        RETURNING e.id INTO v_updated_id;

        IF v_updated_id IS NOT NULL THEN
            INSERT INTO public.encounter_org_audit (
                organization_id, session_id, encounter_id, action
            ) VALUES (
                p_organization_id, v_session.id, p_encounter_id, 'close'
            );
        END IF;

    ELSE
        UPDATE public.encounters e
        SET status = 'closed'
        WHERE e.id = p_encounter_id
          AND e.status NOT IN ('deleted', 'closed')
          AND (e.expires_at > now())
          AND (
              v_is_admin
              OR (auth.uid() IS NOT NULL AND v_user_id IS NOT NULL AND auth.uid() = v_user_id)
              OR (p_edit_token IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.encounter_edit_tokens t
                  WHERE t.encounter_id = e.id AND t.edit_token = p_edit_token
              ))
          )
        RETURNING e.id INTO v_updated_id;
    END IF;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Toiminto epäonnistui: virheellinen avain tai käyttöoikeus, ilmoitus jo suljettu tai voimassaolo päättynyt.'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_updated_id);
END;
$$;

ALTER FUNCTION public.delete_encounter_with_token(
    UUID, UUID, UUID, TEXT
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_encounter_with_token(
    UUID, UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_encounter_with_token(
    UUID, UUID, UUID, TEXT
) TO anon, authenticated;

-- =============================================================================
-- COMMIT
-- =============================================================================

COMMIT;
