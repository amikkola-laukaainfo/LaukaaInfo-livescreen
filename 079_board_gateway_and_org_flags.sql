-- =============================================================================
-- 079_board_gateway_and_org_flags.sql
-- LaukaaInfo – Toimintataulu-gateway, julkinen org-lista ja ehdotusasetukset
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Sisältö ja katselmoinnin ratkaisut:
--   1. organizations-taulun laajennus:
--      - board_enabled (BOOLEAN NOT NULL DEFAULT FALSE): Onko toimintataulu käytössä
--      - accept_public_suggestions (BOOLEAN NOT NULL DEFAULT TRUE): Ottaako ehdotuksia
--      - suggestion_guidelines (TEXT): Ohje kuntalaisille/ehdottajille
--      - is_active (BOOLEAN NOT NULL DEFAULT TRUE): Organisaation aktiivisuuslippu
--   2. board_suggestions -taulun laajennus ja automaattinen updated_at:
--      - ref_post_id (UUID REFERENCES public.posts(id) ON DELETE SET NULL)
--      - ref_post_title (TEXT)
--      - updated_at (TIMESTAMPTZ NOT NULL DEFAULT now())
--      - Automaattinen BEFORE UPDATE -triggeri (public.update_updated_at_column)
--   3. RPC: get_public_organizations()
--      - RETURNS TABLE (...) LANGUAGE sql STABLE
--      - Suodattaa: board_enabled IS TRUE AND is_active IS TRUE
--   4. Päivitetty RPC: submit_board_suggestion(...)
--      - Pudottaa vanhan 5-parametrisen version PostgREST-konfliktien estämiseksi
--      - Normalisoi yhteystiedon (lower + btrim) ja vaatii 5–150 merkkiä
--      - Tarkistaa että viitejulkaisu (ref_post_id) kuuluu tälle organisaatiolle
--      - pg_advisory_xact_lock(hashtext(org), hashtext(contact)) estämään race conditionit
--      - 24 tunnin liukuva rajoitus samalle normalisoidulle yhteystiedolle
--   5. RPC: update_organization_board_settings(...)
--      - p_update_guidelines -lippu: erottaa "älä muuta" ja "tyhjennä ohje"
--      - 2 000 merkin pituusvalidointi ohjeelle
--      - Todennus: admin tai _verify_member_governance_permission ('manage_content')
--      - extensions.digest(..., 'sha256') tokenin tiivistykseen
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. TAULULAAJENNUKSET: organizations
-- =============================================================================

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS board_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS accept_public_suggestions BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS suggestion_guidelines TEXT;

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.organizations.board_enabled IS 
    'Määrittää onko organisaation toimintataulu käytössä ja avattavissa.';
COMMENT ON COLUMN public.organizations.accept_public_suggestions IS 
    'Määrittää ottaako yhdistys vastaan julkisia ideoita/ehdotuksia ehdotusjonoon.';
COMMENT ON COLUMN public.organizations.suggestion_guidelines IS 
    'Yhdistyksen vapaaehtoinen ohjeistus kuntalaisille ehdotusten jättämiseen (max 2000 merkkiä).';
COMMENT ON COLUMN public.organizations.is_active IS 
    'Määrittää onko organisaatio toiminnassa (passiiviset piilotetaan julkisista listoista).';

-- Aktivoidaan toimintataulu oletustesteille ja esimerkkiorganisaatioille
UPDATE public.organizations
SET board_enabled = TRUE, accept_public_suggestions = TRUE, is_active = TRUE
WHERE id IN ('laukaan-yrittajat', 'laukaan-testaajat');

-- =============================================================================
-- 2. TAULULAAJENNUKSET: board_suggestions & updated_at -triggeri
-- =============================================================================

ALTER TABLE public.board_suggestions
ADD COLUMN IF NOT EXISTS ref_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;

ALTER TABLE public.board_suggestions
ADD COLUMN IF NOT EXISTS ref_post_title TEXT;

ALTER TABLE public.board_suggestions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_board_suggestions_ref_post 
ON public.board_suggestions(ref_post_id) 
WHERE ref_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_suggestions_rate_limit 
ON public.board_suggestions(organization_id, author_contact, created_at DESC) 
WHERE author_contact IS NOT NULL;

-- Kytketään automaattinen updated_at -triggeri
DROP TRIGGER IF EXISTS trg_board_suggestions_updated_at ON public.board_suggestions;
CREATE TRIGGER trg_board_suggestions_updated_at
BEFORE UPDATE ON public.board_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3. RPC: get_public_organizations()
-- =============================================================================
-- Palauttaa julkisen taulukon organisaatioista toimintataulun sisääntulovalikkoon.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_organizations()
RETURNS TABLE (
    id text,
    name text,
    type text,
    accept_public_suggestions boolean,
    suggestion_guidelines text,
    description text,
    logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        o.id,
        o.name,
        o.type,
        o.accept_public_suggestions,
        o.suggestion_guidelines,
        o.description,
        o.logo_url
    FROM public.organizations AS o
    WHERE o.board_enabled IS TRUE
      AND o.is_active IS TRUE
    ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_organizations() TO anon, authenticated;

-- =============================================================================
-- 4. PÄIVITETTY RPC: submit_board_suggestion
-- =============================================================================
-- Poistaa vanhan 5-parametrisen version PostgREST-konfliktin välttämiseksi.
-- Tarkistaa viitejulkaisun organisaation ja toteuttaa atomisen 24h päivärajoituksen.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_board_suggestion(
    TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.submit_board_suggestion(
    p_organization_id text,
    p_title           text,
    p_description     text DEFAULT NULL,
    p_author_name     text DEFAULT NULL,
    p_author_contact  text DEFAULT NULL,
    p_ref_post_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_title          text;
    v_description    text;
    v_author_name    text;
    v_contact        text;
    v_post_title     text := NULL;
    v_suggestion_id  uuid;
    v_org            public.organizations%ROWTYPE;
BEGIN
    -- 1. Normalisointi
    v_title := pg_catalog.btrim(COALESCE(p_title, ''));
    v_description := NULLIF(pg_catalog.btrim(COALESCE(p_description, '')), '');
    v_author_name := COALESCE(
        NULLIF(pg_catalog.substr(pg_catalog.btrim(COALESCE(p_author_name, '')), 1, 100), ''),
        'Kuntalainen / Osallistuja'
    );
    v_contact := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_author_contact, '')));

    -- 2. Validointi: Organisaatio
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    -- 3. Validointi: Otsikko
    IF pg_catalog.char_length(v_title) < 3 OR pg_catalog.char_length(v_title) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Otsikon pituuden tulee olla 3–255 merkkiä.'
        );
    END IF;

    -- 4. Validointi: Kuvaus
    IF v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 10000 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kuvaus saa olla enintään 10 000 merkkiä.'
        );
    END IF;

    -- 5. Validointi: Yhteystieto (pakollinen spämmäyksen ja rajoitusten kierron estämiseksi)
    IF v_contact IS NULL OR pg_catalog.char_length(v_contact) < 5 OR pg_catalog.char_length(v_contact) > 150 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Anna toimiva yhteystieto (sähköposti tai puhelinnumero, 5–150 merkkiä).'
        );
    END IF;

    -- 6. Organisaation tilan ja vastaanotto-oikeuden tarkistus
    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiota ei löydy.'
        );
    END IF;

    IF NOT COALESCE(v_org.is_active, TRUE) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Tämä organisaatio ei ole tällä hetkellä aktiivinen.'
        );
    END IF;

    IF NOT COALESCE(v_org.board_enabled, FALSE) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Toimintataulu ei ole käytössä tällä organisaatiolla.'
        );
    END IF;

    IF NOT COALESCE(v_org.accept_public_suggestions, FALSE) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Tämä yhdistys ei ota vastaan julkisia ehdotuksia toimintataululle.'
        );
    END IF;

    -- 7. Viitejulkaisun tiukka omistajuustarkistus
    IF p_ref_post_id IS NOT NULL THEN
        SELECT p.title INTO v_post_title
        FROM public.posts AS p
        WHERE p.id = p_ref_post_id
          AND p.organization_id = p_organization_id;

        IF NOT FOUND THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Viitattua ilmoitusta ei löydy tästä organisaatiosta.'
            );
        END IF;
    END IF;

    -- 8. ATOMINEN PÄIVÄRAJOITUS: Advisory transaction lock saman organisaation ja yhteystiedon pareille
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(p_organization_id),
        pg_catalog.hashtext(v_contact)
    );

    IF EXISTS (
        SELECT 1
        FROM public.board_suggestions AS s
        WHERE s.organization_id = p_organization_id
          AND pg_catalog.lower(pg_catalog.btrim(s.author_contact)) = v_contact
          AND s.created_at >= (now() - interval '24 hours')
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Tällä yhteystiedolla on jo lähetetty ehdotus tälle yhdistykselle viimeisen 24 tunnin aikana. Voit lähettää uuden ehdotuksen huomenna.'
        );
    END IF;

    -- 9. Tallennus
    INSERT INTO public.board_suggestions (
        organization_id,
        title,
        description,
        author_name,
        author_contact,
        ref_post_id,
        ref_post_title,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        v_title,
        v_description,
        v_author_name,
        pg_catalog.btrim(p_author_contact),
        p_ref_post_id,
        v_post_title,
        'pending',
        now(),
        now()
    ) RETURNING id INTO v_suggestion_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'suggestion_id', v_suggestion_id,
        'message', 'Ehdotus lähetetty onnistuneesti yhdistyksen käsiteltäväksi.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_board_suggestion(
    text, text, text, text, text, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_board_suggestion(
    text, text, text, text, text, uuid
) TO anon, authenticated;

-- =============================================================================
-- 5. RPC: update_organization_board_settings
-- =============================================================================
-- Hallitustason RPC asetusten säätämiseen.
-- p_update_guidelines = false -> säilytä nykyinen ohjeteksti
-- p_update_guidelines = true  -> päivitä ohje (NULL tai tyhjä tyhjentää sen)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_organization_board_settings(
    p_organization_id           text,
    p_session_token             text,
    p_accept_public_suggestions boolean DEFAULT NULL,
    p_suggestion_guidelines     text DEFAULT NULL,
    p_update_guidelines         boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_admin   boolean := FALSE;
    v_token_hash text;
    v_caller     record;
    v_guidelines text := NULL;
BEGIN
    -- 1. Validointi: Organisaatio
    IF p_organization_id IS NULL OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', FALSE, 'error', 'Organisaatiotunnus puuttuu.');
    END IF;

    -- 2. Validointi: Ohjetekstin pituus
    IF p_update_guidelines AND p_suggestion_guidelines IS NOT NULL THEN
        IF pg_catalog.char_length(pg_catalog.btrim(p_suggestion_guidelines)) > 2000 THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Ohjeteksti saa olla enintään 2 000 merkkiä.'
            );
        END IF;
        v_guidelines := NULLIF(pg_catalog.btrim(p_suggestion_guidelines), '');
    END IF;

    -- 3. Tarkistetaan järjestelmänvalvoja (auth.uid() -> user_roles admin)
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() AND role = 'admin'
        ) INTO v_is_admin;
    END IF;

    -- 4. Jos ei järjestelmänvalvoja, tarkistetaan hallituksen valtuuskoodi/istunto
    IF NOT v_is_admin THEN
        IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Kirjautuminen tai hallituksen tunnistautuminen vaaditaan.'
            );
        END IF;

        v_token_hash := pg_catalog.encode(
            extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'),
            'hex'
        );

        -- Todennetaan istunto ja oikeus 'manage_content' (board_chair, board_member, secretary)
        SELECT * INTO v_caller
        FROM public._verify_member_governance_permission(
            v_token_hash,
            p_organization_id,
            'manage_content',
            NULL::uuid
        );

        IF NOT FOUND OR v_caller.out_member_id IS NULL THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Käyttöoikeus evätty: Istunnolla ei ole hallitusvaltuutusta tähän organisaatioon.'
            );
        END IF;

        IF v_caller.out_organization_id IS DISTINCT FROM p_organization_id THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', FALSE,
                'error', 'Ei oikeutta muuttaa tämän organisaation asetuksia.'
            );
        END IF;
    END IF;

    -- 5. Päivitetään organisaation asetukset
    UPDATE public.organizations AS o
    SET accept_public_suggestions = COALESCE(p_accept_public_suggestions, o.accept_public_suggestions),
        suggestion_guidelines = CASE 
            WHEN p_update_guidelines THEN v_guidelines 
            ELSE o.suggestion_guidelines 
        END,
        updated_at = now()
    WHERE o.id = p_organization_id;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiota ei löytynyt päivitystä varten.'
        );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'message', 'Asetukset päivitetty onnistuneesti.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_board_settings(
    text, text, boolean, text, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_organization_board_settings(
    text, text, boolean, text, boolean
) TO anon, authenticated;

COMMIT;
