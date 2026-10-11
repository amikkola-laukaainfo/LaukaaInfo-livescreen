-- =============================================================================
-- 060_encounters_unified_schema.sql (Versio 5 – Tuotantotason auditoitu kokonaisuus)
-- LaukaaInfo – Kohtaamiset (Encounters) Yhtenäistetty Tietokantaschema
-- =============================================================================
-- TILA: LUONNOS AUDITOINTIA VARTEN – ÄLÄ AJA VIELÄ TUOTANTOON
--
-- Korjaukset versioon 5 (Kokonaisvaltainen turvamalli):
--   1. Yhtenäistetty luontigatekeeper (`create_encounter` RPC):
--      Sekä anonyymit että kirjautuneet luovat kohtaamiset validoidun RPC:n kautta.
--      Tämä takaa, että syötteet (tyyppi, pituudet, structured_links) validoidaan
--      hallitusti ennen kantaan kirjoitusta, ja että anonyymi saa salaisen tokenin
--      suoraan vastauksessa ilman tietovuotoja.
--   2. Organisaation valtuutuksen tarkistus:
--      Organisaation nimissä (`publisher_type = 'company'/'association'` tai `organization_id`)
--      julkaiseminen vaatii todennetun valtuutuksen. Anonyymit tai valtuuttamattomat
--      käyttäjät pakotetaan tilaan 'personal' ja organisaatiotunniste nollataan.
--   3. Suojattu elinkaari ja `expires_at`:
--      `expires_at` on aina pakollinen (`NOT NULL`, max 90 pv luonnista). Sitä ei voi
--      asettaa NULL-arvoksi (mikä estää ikuiset ilmoitukset).
--   4. Rajoitteiden sidonta nimenomaan encounters-tauluun:
--      `pg_constraint`-tarkistukset käyttävät `conrelid = 'public.encounters'::regclass`.
--   5. `SECURITY DEFINER` -suojaukset:
--      `SET search_path = public, pg_temp;` kaikissa funktioissa, täsmälliset oikeudet
--      ja skeemamääritellyt kutsut.
-- =============================================================================

-- =============================================================================
-- 1. BANNATUT SÄHKÖPOSTIT (Palvelinpuolen estolista)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.banned_emails (
    email       TEXT PRIMARY KEY,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_banned_email_normalized CHECK (email = LOWER(TRIM(email)))
);

-- Suljetaan taulu täysin asiakasrooleilta
REVOKE ALL ON public.banned_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.banned_emails TO service_role;

ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. ENCOUNTERS -PÄÄTAULU
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.encounters (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type                TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Sarakkeiden idempotentti lisäys
ALTER TABLE public.encounters
    ADD COLUMN IF NOT EXISTS sub_category        TEXT NULL,
    ADD COLUMN IF NOT EXISTS price_info          TEXT NULL,
    ADD COLUMN IF NOT EXISTS place_id            UUID NULL REFERENCES public.places(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS location            TEXT NULL,
    ADD COLUMN IF NOT EXISTS location_id         TEXT NULL,
    ADD COLUMN IF NOT EXISTS organization_id     TEXT NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS company_id          TEXT NULL,
    ADD COLUMN IF NOT EXISTS publisher_type      TEXT DEFAULT 'personal',
    ADD COLUMN IF NOT EXISTS publisher_name      TEXT NULL,
    ADD COLUMN IF NOT EXISTS tags                TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS contact_email       TEXT NULL,
    ADD COLUMN IF NOT EXISTS contact_phone       TEXT NULL,
    ADD COLUMN IF NOT EXISTS allow_messages      BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS structured_links    JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS image_url           TEXT NULL,
    ADD COLUMN IF NOT EXISTS external_url        TEXT NULL,
    ADD COLUMN IF NOT EXISTS external_source     TEXT NULL,
    ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS visibility          TEXT DEFAULT 'public',
    ADD COLUMN IF NOT EXISTS user_id             UUID NULL,
    ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ DEFAULT (now() + interval '30 days') NOT NULL;

-- =============================================================================
-- 3. MUOKKAUSTOKENIEN ERILLISTAULU (Zero-Leakage Architecture)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.encounter_edit_tokens (
    encounter_id        UUID PRIMARY KEY REFERENCES public.encounters(id) ON DELETE CASCADE,
    edit_token          UUID DEFAULT gen_random_uuid() NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

REVOKE ALL ON public.encounter_edit_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.encounter_edit_tokens TO service_role;

ALTER TABLE public.encounter_edit_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. TIETOKANTATASON CHECK-RAJOITTEET (Sidottu conrelid:llä encounters-tauluun)
-- =============================================================================

DO $$
BEGIN
    -- 1. Type
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_type'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_type
            CHECK (type IN (
                'search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found',
                'need_help', 'offer_service', 'service_request', 'work_and_gigs',
                'space_rental', 'b2b_collab', 'event_staff', 'community', 'high_value', 'lost_and_found'
            ));
    END IF;

    -- 2. Status
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_status'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_status
            CHECK (status IN ('active', 'draft', 'closed', 'archived', 'deleted'));
    END IF;

    -- 3. Visibility
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_visibility'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_visibility
            CHECK (visibility IN ('public', 'code_protected'));
    END IF;

    -- 4. Publisher type
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_publisher_type'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_publisher_type
            CHECK (publisher_type IN ('personal', 'company', 'association', 'location', 'event', 'network', 'service'));
    END IF;

    -- 5. Title pituus
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_title_len'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_title_len
            CHECK (LENGTH(TRIM(title)) >= 3 AND LENGTH(title) <= 150);
    END IF;

    -- 6. Description pituus
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_desc_len'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_desc_len
            CHECK (LENGTH(TRIM(description)) >= 5);
    END IF;

    -- 7. Price info pituus
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_price_len'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_price_len
            CHECK (price_info IS NULL OR LENGTH(price_info) <= 80);
    END IF;

    -- 8. Structured links JSON-tyyppi
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_structured_links'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_structured_links
            CHECK (jsonb_typeof(structured_links) = 'object');
    END IF;

    -- 9. Expires at järkevyys (ei ikuinen, max 90 pv luonnista)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.encounters'::regclass AND conname = 'chk_encounters_expires_at'
    ) THEN
        ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_expires_at
            CHECK (expires_at > created_at AND expires_at <= created_at + interval '90 days');
    END IF;
END $$;

-- =============================================================================
-- 5. HAKUINDEKSIT
-- =============================================================================

CREATE INDEX IF NOT EXISTS encounters_type_idx ON public.encounters(type);
CREATE INDEX IF NOT EXISTS encounters_status_idx ON public.encounters(status);
CREATE INDEX IF NOT EXISTS encounters_place_id_idx ON public.encounters(place_id);
CREATE INDEX IF NOT EXISTS encounters_org_id_idx ON public.encounters(organization_id);
CREATE INDEX IF NOT EXISTS encounters_user_id_idx ON public.encounters(user_id);
CREATE INDEX IF NOT EXISTS encounters_created_at_idx ON public.encounters(created_at DESC);
CREATE INDEX IF NOT EXISTS encounters_tags_gin_idx ON public.encounters USING GIN (tags);

-- =============================================================================
-- 6. VALIDOINTI- JA TURVATRIGGERI (BEFORE INSERT / BEFORE UPDATE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_encounter_validation_and_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_is_org_member BOOLEAN := false;
BEGIN
    v_is_admin := LOWER(COALESCE(auth.jwt()->>'email', '')) IN (
        'info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com'
    );

    -- 1. Bannatun sähköpostiosoitteen esto
    IF NEW.contact_email IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.banned_emails
            WHERE email = LOWER(TRIM(NEW.contact_email))
        ) THEN
            RAISE EXCEPTION 'Ilmoituksen luonti estetty: sähköpostiosoite on estolistalla.';
        END IF;
    END IF;

    -- 2. Organisaation edustamisen valtuutustarkistus
    IF NEW.organization_id IS NOT NULL OR NEW.company_id IS NOT NULL OR NEW.publisher_type IN ('company', 'association') THEN
        IF auth.uid() IS NULL THEN
            -- Anonyymi ei koskaan saa esiintyä organisaationa
            NEW.organization_id := NULL;
            NEW.company_id      := NULL;
            NEW.publisher_type  := 'personal';
        ELSE
            -- Kirjautunut käyttäjä: tarkistetaan kuuluuko organisaatioon tai onko admin
            IF NOT v_is_admin THEN
                -- Tarkistetaan organization_members tai publish_credentials (tai user_roles target_id)
                SELECT EXISTS (
                    SELECT 1 FROM public.organization_members om
                    WHERE om.user_id = auth.uid()
                      AND om.organization_id = COALESCE(NEW.organization_id, NEW.company_id)
                ) INTO v_is_org_member;

                IF NOT v_is_org_member THEN
                    -- Jos ei jäsen, ei saa julkaista organisaation nimissä
                    NEW.organization_id := NULL;
                    NEW.company_id      := NULL;
                    NEW.publisher_type  := 'personal';
                END IF;
            END IF;
        END IF;
    END IF;

    -- 3. INSERT-pakotukset
    IF TG_OP = 'INSERT' THEN
        IF auth.uid() IS NULL THEN
            NEW.user_id      := NULL;
            NEW.status       := 'active';
            NEW.visibility   := 'public';
            NEW.created_at   := now();
            NEW.expires_at   := now() + interval '30 days';
        ELSE
            NEW.user_id      := auth.uid();
            IF NEW.expires_at IS NULL THEN
                NEW.expires_at := now() + interval '30 days';
            END IF;
        END IF;
    END IF;

    -- 4. UPDATE-suojaukset
    IF TG_OP = 'UPDATE' AND NOT v_is_admin THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'user_id-kenttää ei voi muuttaa.';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'created_at-kenttää ei voi muuttaa.';
        END IF;
        IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at > OLD.expires_at THEN
            RAISE EXCEPTION 'Voimassaoloaikaa ei voi pidentää ilman ylläpito-oikeutta.';
        END IF;
    END IF;

    -- 5. Paikkatunnisteiden kanonisointi (place_id on kanoninen)
    IF NEW.place_id IS NOT NULL AND NEW.location_id IS NOT NULL THEN
        IF NEW.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            IF NEW.location_id::uuid <> NEW.place_id THEN
                RAISE EXCEPTION 'Ristiriitaiset paikkatunnisteet: place_id ja location_id eivät täsmää.';
            END IF;
        END IF;
    ELSIF NEW.place_id IS NOT NULL AND NEW.location_id IS NULL THEN
        NEW.location_id := NEW.place_id::text;
    ELSIF NEW.place_id IS NULL AND NEW.location_id IS NOT NULL THEN
        IF NEW.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            NEW.place_id := NEW.location_id::uuid;
        ELSE
            IF NEW.location IS NULL OR TRIM(NEW.location) = '' THEN
                NEW.location := NEW.location_id;
            END IF;
        END IF;
    END IF;

    -- Paikan esitysnimi places-taulusta tarvittaessa
    IF (NEW.location IS NULL OR TRIM(NEW.location) = '') AND NEW.place_id IS NOT NULL THEN
        SELECT name INTO NEW.location
        FROM public.places
        WHERE id = NEW.place_id;
    END IF;

    -- 6. Toimijatunnisteiden kanonisointi (organization_id on kanoninen)
    IF NEW.organization_id IS NOT NULL AND NEW.company_id IS NOT NULL THEN
        IF NEW.organization_id <> NEW.company_id THEN
            RAISE EXCEPTION 'Ristiriitaiset organisaatiotunnisteet: organization_id ja company_id eivät täsmää.';
        END IF;
    ELSIF NEW.organization_id IS NOT NULL AND NEW.company_id IS NULL THEN
        NEW.company_id := NEW.organization_id;
    ELSIF NEW.organization_id IS NULL AND NEW.company_id IS NOT NULL THEN
        NEW.organization_id := NEW.company_id;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_encounter_validation_and_sync() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_encounter_validation_and_sync ON public.encounters;
CREATE TRIGGER trg_encounter_validation_and_sync
BEFORE INSERT OR UPDATE ON public.encounters
FOR EACH ROW
EXECUTE FUNCTION public.handle_encounter_validation_and_sync();

-- =============================================================================
-- 7. RLS JA KÄYTTÖOIKEUDET
-- =============================================================================

-- Anonyymeillä on vain SELECT-oikeus. Anonyymi luonti ja muokkaus kulkee
-- validoitujen RPC-funktioiden create_encounter ja update_encounter_with_token kautta.
REVOKE ALL ON public.encounters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.encounters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.encounters TO authenticated;
GRANT ALL ON public.encounters TO service_role;

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- 7a. SELECT
DROP POLICY IF EXISTS "encounters_select_policy" ON public.encounters;
CREATE POLICY "encounters_select_policy"
ON public.encounters
FOR SELECT
USING (
    (status = 'active' AND (visibility = 'public' OR visibility IS NULL) AND (expires_at > now()))
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (
        LOWER(COALESCE(auth.jwt()->>'email', '')) IN ('info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com')
    )
);

-- 7b. INSERT (Vain kirjautuneet)
DROP POLICY IF EXISTS "encounters_authenticated_insert_policy" ON public.encounters;
CREATE POLICY "encounters_authenticated_insert_policy"
ON public.encounters
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid())
);

-- 7c. UPDATE (Kirjautuneet omistajat tai Admin)
DROP POLICY IF EXISTS "encounters_authenticated_update_policy" ON public.encounters;
CREATE POLICY "encounters_authenticated_update_policy"
ON public.encounters
FOR UPDATE
TO authenticated
USING (
    (user_id = auth.uid())
    OR (
        LOWER(COALESCE(auth.jwt()->>'email', '')) IN ('info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com')
    )
)
WITH CHECK (
    (user_id = auth.uid())
    OR (
        LOWER(COALESCE(auth.jwt()->>'email', '')) IN ('info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com')
    )
);

-- 7d. DELETE (Kirjautuneet omistajat tai Admin)
DROP POLICY IF EXISTS "encounters_authenticated_delete_policy" ON public.encounters;
CREATE POLICY "encounters_authenticated_delete_policy"
ON public.encounters
FOR DELETE
TO authenticated
USING (
    (user_id = auth.uid())
    OR (
        LOWER(COALESCE(auth.jwt()->>'email', '')) IN ('info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com')
    )
);

-- =============================================================================
-- 8. RPC: VALIDOITU ILMOITUKSEN LUONTI (JA TOKENIN JAKELU LUOJALLE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_encounter(
    p_type             TEXT,
    p_title            TEXT,
    p_description      TEXT,
    p_sub_category     TEXT DEFAULT NULL,
    p_price_info       TEXT DEFAULT NULL,
    p_place_id         UUID DEFAULT NULL,
    p_location         TEXT DEFAULT NULL,
    p_location_id      TEXT DEFAULT NULL,
    p_organization_id  TEXT DEFAULT NULL,
    p_tags             TEXT[] DEFAULT '{}',
    p_contact_email    TEXT DEFAULT NULL,
    p_contact_phone    TEXT DEFAULT NULL,
    p_allow_messages   BOOLEAN DEFAULT true,
    p_structured_links JSONB DEFAULT '{}'::jsonb,
    p_image_url        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_id     UUID;
    v_edit_token UUID := gen_random_uuid();
    v_valid_types TEXT[] := ARRAY[
        'search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found',
        'need_help', 'offer_service', 'service_request', 'work_and_gigs',
        'space_rental', 'b2b_collab', 'event_staff', 'community', 'high_value', 'lost_and_found'
    ];
BEGIN
    -- 1. Syötevalidointi
    IF p_type IS NULL OR NOT (p_type = ANY(v_valid_types)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen ilmoitustyyppi (type).');
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

    -- 2. Luodaan kohtaaminen
    INSERT INTO public.encounters (
        type, sub_category, title, description, price_info,
        place_id, location, location_id, organization_id, tags,
        contact_email, contact_phone, allow_messages,
        structured_links, image_url, user_id
    ) VALUES (
        p_type, p_sub_category, TRIM(p_title), TRIM(p_description), NULLIF(TRIM(p_price_info), ''),
        p_place_id, p_location, p_location_id, p_organization_id, COALESCE(p_tags, '{}'),
        NULLIF(TRIM(p_contact_email), ''), NULLIF(TRIM(p_contact_phone), ''), COALESCE(p_allow_messages, true),
        COALESCE(p_structured_links, '{}'::jsonb), p_image_url, auth.uid()
    )
    RETURNING id INTO v_new_id;

    -- 3. Tallennetaan salainen edit_token erilliseen tauluun
    INSERT INTO public.encounter_edit_tokens (encounter_id, edit_token)
    VALUES (v_new_id, v_edit_token);

    -- 4. Palautetaan token VAIN kerran luontivastauksessa
    RETURN jsonb_build_object(
        'success',      true,
        'encounter_id', v_new_id,
        'edit_token',   v_edit_token
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT
) TO anon, authenticated;

-- =============================================================================
-- 9. RPC: ATOMINEN ANONYYMIN ILMOITUKSEN HALLINTA EDIT_TOKENILLA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_encounter_with_token(
    p_encounter_id UUID,
    p_edit_token   UUID,
    p_title        TEXT DEFAULT NULL,
    p_description  TEXT DEFAULT NULL,
    p_price_info   TEXT DEFAULT NULL,
    p_status       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_new_price  TEXT;
BEGIN
    -- 1. Syötevalidointi
    IF p_encounter_id IS NULL OR p_edit_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tunniste (ID) ja muokkausavain vaaditaan.');
    END IF;

    -- Otsikko: jos annettu tyhjä merkkijono, hylätään virheellä. Jos NULL, säilytetään vanha.
    IF p_title IS NOT NULL THEN
        IF TRIM(p_title) = '' OR LENGTH(TRIM(p_title)) < 3 OR LENGTH(p_title) > 150 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Otsikon on oltava 3–150 merkkiä pitkä.');
        END IF;
    END IF;

    -- Kuvaus: jos annettu tyhjä merkkijono, hylätään virheellä. Jos NULL, säilytetään vanha.
    IF p_description IS NOT NULL THEN
        IF TRIM(p_description) = '' OR LENGTH(TRIM(p_description)) < 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Kuvauksen on oltava vähintään 5 merkkiä pitkä.');
        END IF;
    END IF;

    -- Hintatiedon pituus ja tyhjennyssopimus
    IF p_price_info IS NOT NULL THEN
        IF LENGTH(TRIM(p_price_info)) > 80 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Hintatiedon enimmäispituus on 80 merkkiä.');
        END IF;
        -- Tyhjä merkkijono ('') tyhjentää hinnan (asettaa NULL)
        IF TRIM(p_price_info) = '' THEN
            v_new_price := NULL;
        ELSE
            v_new_price := TRIM(p_price_info);
        END IF;
    END IF;

    -- Status
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'closed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sallitut tilat anonyymille muokkaukselle: active tai closed.');
    END IF;

    -- 2. Atominen päivitys yhdessä lauseessa
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

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Päivitys epäonnistui: virheellinen avain, ilmoitus poistettu tai voimassaolo päättynyt.');
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_updated_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
