-- =============================================================================
-- 060_encounters_unified_schema.sql (Versio 5.20)
-- LaukaaInfo – Kohtaamiset (Encounters) Yhtenäistetty Tietokantaschema
-- =============================================================================
-- TILA: TESTAUSVALMIS (tietoturva- ja hakupolkukovennettu)
--
-- Korjaukset versioon 5.20:
--   K41. Hakupolun pgcrypto-korjaus: Lisätty 'extensions' kaikkien SECURITY DEFINER
--        -funktioiden hakupolkuihin (SET search_path = pg_catalog, public, extensions, pg_temp).
--        Tämä varmistaa, että digest()-kutsu löytää Supabasen pgcrypto-laajennuksen.
--   K42. verify_publisher_key() kovennettu ja integroitu migraatioon:
--        Hakupolku 'extensions' mukana ja poistettu epävarma "jos ei avaimia, sallitaan" -demo-ohitus.
--   K43. Ylläpitäjyyden keskitetty tunnistus public.is_admin():
--        Keskitetty apufunktio, joka edellyttää autentikoitua roolia (auth.jwt()->>'role' = 'authenticated')
--        ja sallittua sähköpostiosoitetta. Käytetään RLS-käytännöissä ja RPC-funktioissa.
-- Aiemmat korjaukset (v5.8–5.19): katso historia.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. PERUSTAULUN ALUSTUS (K28)
-- Varmistetaan encounters-taulun olemassaolo, jotta esiauditointi ja migraatio
-- toimivat luotettavasti myös tyhjässä/puhtaassa tietokanta-asennuksessa.
-- Vanhoissa kannoissa IF NOT EXISTS ei muuta olemassa olevaa taulua lainkaan.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.encounters (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type                TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================================
-- 0. ESIAUDITOINTI – Vain luku (RAISE NOTICE). Pysäyttää vain, jos id tai FK on rikki.
-- =============================================================================
DO $$
DECLARE
    v_col   RECORD;
    v_count BIGINT;
    v_type  TEXT;
BEGIN
    -- 0a. Raportoi kaikkien kriittisten sarakkeiden nykyiset tyypit
    FOR v_col IN
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'encounters'
          AND column_name IN (
              'id','user_id','place_id','created_at','expires_at',
              'title','description','structured_links','tags','type'
          )
        ORDER BY column_name
    LOOP
        RAISE NOTICE 'AUDIT sarake=% nykyinen_tyyppi=%', v_col.column_name, v_col.data_type;
    END LOOP;

    -- 0b. Tarkista id: jos tekstisarake sisältää ei-UUID-arvoja, migraatio PYSÄHTYY.
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='id';
    IF v_type IN ('text','character varying') THEN
        SELECT COUNT(*) INTO v_count FROM public.encounters
        WHERE id IS NULL
           OR NOT (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        IF v_count > 0 THEN
            RAISE EXCEPTION
                'STOP: encounters.id sisältää % ei-UUID-arvoa. Korjaa manuaalisesti ennen migraatiota.',
                v_count;
        END IF;
        RAISE NOTICE 'AUDIT id: kaikki % riviä ovat kelvollisia UUID-arvoja.', (SELECT COUNT(*) FROM public.encounters);
    END IF;

    -- 0b2. Tarkista encounters.id:hen kohdistuvat vierasavaimet muista tauluista (K25, K29)
    v_count := 0;
    FOR v_col IN
        SELECT con.conname, cl.relname AS source_table
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        WHERE con.confrelid = 'public.encounters'::regclass
          AND con.contype = 'f'
          AND con.conrelid <> 'public.encounters'::regclass
    LOOP
        v_count := v_count + 1;
        RAISE NOTICE 'AUDIT FK: Taulu % viittaa encounters.id:hen avaimella %', v_col.source_table, v_col.conname;
    END LOOP;
    IF v_count > 0 AND v_type IN ('text','character varying') THEN
        RAISE EXCEPTION 'STOP: encounters.id on tekstiä ja siihen viittaa % vierasavainta muista tauluista. Purkaa FK-viittaukset ennen tyyppimuunnosta.', v_count;
    END IF;

    -- 0b3. Tarkista ydinsarakkeiden olemassaolo vanhassa taulussa (K25)
    FOR v_type IN SELECT unnest(ARRAY['type', 'title', 'description', 'created_at']) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'encounters' AND column_name = v_type
        ) THEN
            RAISE NOTICE 'AUDIT huomio: encounters-taulusta puuttuu ydinsarake %, luodaan vaiheessa 2.', v_type;
        END IF;
    END LOOP;

    -- 0b4. Tarkista encounters_public -näkymästä riippuvat näkymät (K25, K30, K38)
    v_count := 0;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'encounters_public' AND relnamespace = 'public'::regnamespace) THEN
        FOR v_col IN
            SELECT DISTINCT dependee.relname AS dependent_view
            FROM pg_depend d
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class dependee ON dependee.oid = r.ev_class
            JOIN pg_class dependent ON dependent.oid = d.refobjid
            WHERE dependent.relname = 'encounters_public'
              AND dependee.relname <> 'encounters_public'
              AND dependee.relkind = 'v'
        LOOP
            v_count := v_count + 1;
            RAISE NOTICE 'AUDIT VAROITUS: Näkymä % riippuu encounters_public-näkymästä!', v_col.dependent_view;
        END LOOP;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'STOP: encounters_public -näkymästä riippuu % muuta näkymää. Purkaa tai päivitä riippuvat näkymät ennen migraatiota.', v_count;
        END IF;
    END IF;

    -- 0c. Laske virheelliset tekstiaikaleimut rivi kerrallaan (K7)
    -- Huom: subquery-pohjainen ::timestamptz-validointi ei toimi, koska poikkeus
    -- heitetään ennen kuin NOT/CASE ehtii toimia. Silmukka kaapataan per rivi.
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='expires_at';
    IF v_type IN ('text','character varying') THEN
        v_count := 0;
        DECLARE v_ts_row RECORD; BEGIN
            FOR v_ts_row IN SELECT expires_at AS val FROM public.encounters WHERE expires_at IS NOT NULL LOOP
                BEGIN
                    PERFORM v_ts_row.val::timestamptz;
                EXCEPTION WHEN OTHERS THEN
                    v_count := v_count + 1;
                END;
            END LOOP;
        END;
        RAISE NOTICE 'AUDIT expires_at: % virheellistä tekstiaikaleimaa (korjataan now()+30d).', v_count;
    END IF;

    -- Sama tarkistus created_at-sarakkeelle
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='created_at';
    IF v_type IN ('text','character varying') THEN
        v_count := 0;
        DECLARE v_ts_row RECORD; BEGIN
            FOR v_ts_row IN SELECT created_at AS val FROM public.encounters WHERE created_at IS NOT NULL LOOP
                BEGIN
                    PERFORM v_ts_row.val::timestamptz;
                EXCEPTION WHEN OTHERS THEN
                    v_count := v_count + 1;
                END;
            END LOOP;
        END;
        RAISE NOTICE 'AUDIT created_at: % virheellistä tekstiaikaleimaa (korjataan now()).', v_count;
    END IF;

    -- 0d. Ilmoita ei-UUID place_id -arvot (siirretään location-kenttään)
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='place_id';
    IF v_type IN ('text','character varying') THEN
        SELECT COUNT(*) INTO v_count FROM public.encounters
        WHERE place_id IS NOT NULL
          AND NOT (place_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        RAISE NOTICE 'AUDIT place_id: % ei-UUID-tekstiarvoa (siirretään location-kenttään).', COALESCE(v_count,0);
    END IF;

    -- 0d2. Ilmoita user_id-arvot, jotka muunnetaan NULLiksi (K10: omistajuus voi kadota)
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='user_id';
    IF v_type IN ('text','character varying') THEN
        SELECT COUNT(*) INTO v_count FROM public.encounters
        WHERE user_id IS NOT NULL
          AND NOT (user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        IF v_count > 0 THEN
            RAISE NOTICE 'AUDIT user_id: % arvoa ei ole kelvollisia UUID:ta (muunnetaan NULLiksi - omistajuus menetetään!).', v_count;
        END IF;
    END IF;

    -- 0d3. Arvioi structured_links- ja tags-muunnostappioriski (K10)
    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='structured_links';
    IF v_type IN ('text','character varying') THEN
        SELECT COUNT(*) INTO v_count FROM public.encounters
        WHERE structured_links IS NOT NULL
          AND TRIM(structured_links::text) <> ''
          AND TRIM(structured_links::text) NOT LIKE '{%'
          AND TRIM(structured_links::text) NOT LIKE '[%';
        RAISE NOTICE 'AUDIT structured_links: % riviä näyttää epäkelpaavalta JSON:lta (muunnetaan {}:ksi).', COALESCE(v_count,0);
    END IF;

    SELECT data_type INTO v_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='tags';
    IF v_type IN ('text','character varying') THEN
        SELECT COUNT(*) INTO v_count FROM public.encounters
        WHERE tags IS NOT NULL
          AND TRIM(tags::text) <> ''
          AND TRIM(tags::text) NOT LIKE '[%'
          AND TRIM(tags::text) NOT LIKE '%,%'
          AND TRIM(tags::text) NOT LIKE '{%';
        RAISE NOTICE 'AUDIT tags: % yksittaistä tekstiarvoa (muunnetaan 1-alkioiseksi taulukoksi).', COALESCE(v_count,0);
    END IF;

    -- 0e. Ilmoita normalisoitavat ilmoitustyypit
    SELECT COUNT(*) INTO v_count FROM public.encounters
    WHERE type IS NULL OR type NOT IN ('search','offer','sell','give','notice','idea','lost_found');
    RAISE NOTICE 'AUDIT type: % riviä normalisoidaan kanonisiksi tyypeiksi.', COALESCE(v_count,0);

    RAISE NOTICE 'AUDIT valmis. Migraatio jatkuu.';
END $$;

-- =============================================================================
-- 1. BANNATUT SÄHKÖPOSTIT (Palvelinpuolen estolista)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.banned_emails (
    email       TEXT PRIMARY KEY,
    reason      TEXT,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_banned_email_normalized CHECK (email = LOWER(TRIM(email)))
);

REVOKE ALL ON public.banned_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.banned_emails TO service_role;

ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 1b. NÄKYMÄN JA RLS-KÄYTÄNTÖJEN POISTO ENNEN SARAKEMUUTOKSIA (K39, K40)
-- encounters_public (_RETURN rule) ja vanhat RLS-käytännöt (kuten encounters_select_policy)
-- lukitsevat encounters-taulun sarakkeet (status, visibility, user_id, structured_links jne.).
-- Jotta saraketyyppien muunnokset onnistuvat ilman 'cannot alter type of a column
-- used by a view/policy' -virhettä, poistetaan vanha näkymä ja vanhat käytännöt tässä.
-- Uudet käytännöt ja näkymä luodaan puhtaina uudelleen tiedoston myöhemmissä vaiheissa.
-- Koska tämä tapahtuu saman transaktion (BEGIN..COMMIT) sisällä, operaatio on atominen.
-- =============================================================================
DROP VIEW IF EXISTS public.encounters_public;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'encounters'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.encounters';
    END LOOP;
END $$;

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

-- Sarakkeiden idempotentti lisäys ilman inline-viiteavaimia (viiteavaimet lisätään normalisoinnin jälkeen)
ALTER TABLE public.encounters
    ADD COLUMN IF NOT EXISTS type                TEXT NULL,
    ADD COLUMN IF NOT EXISTS title               TEXT NULL,
    ADD COLUMN IF NOT EXISTS description         TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
    ADD COLUMN IF NOT EXISTS _mig_legacy_user_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS sub_category        TEXT NULL,
    ADD COLUMN IF NOT EXISTS price_info          TEXT NULL,
    ADD COLUMN IF NOT EXISTS place_id            UUID NULL,
    ADD COLUMN IF NOT EXISTS location            TEXT NULL,
    ADD COLUMN IF NOT EXISTS location_id         TEXT NULL,
    ADD COLUMN IF NOT EXISTS organization_id     TEXT NULL,
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
-- 2a-apufunktiot: TURVALLINEN MUUNNOS (K16 järjestyskorjaus)
-- Luodaan ENNEN osiota 2a (timestamp-muunnos käyttää _mig_safe_to_ts:iä).
-- Poistetaan vasta kun kaikki muunnokset (2a ja 2c) ovat valmiit.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._mig_safe_to_ts(p_text TEXT, p_default TIMESTAMPTZ DEFAULT NULL)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF p_text IS NULL OR TRIM(p_text) = '' THEN RETURN p_default; END IF;
    RETURN TRIM(p_text)::timestamptz;
EXCEPTION WHEN OTHERS THEN
    RETURN p_default;
END;
$$;
ALTER FUNCTION public._mig_safe_to_ts(TEXT, TIMESTAMPTZ) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public._mig_safe_to_jsonb(p_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF p_text IS NULL OR TRIM(p_text) = '' THEN RETURN '{}'::jsonb; END IF;
    RETURN p_text::jsonb;
EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::jsonb;
END;
$$;
ALTER FUNCTION public._mig_safe_to_jsonb(TEXT) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public._mig_safe_to_tags(p_text TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_trimmed TEXT;
BEGIN
    IF p_text IS NULL OR TRIM(p_text) = '' THEN RETURN '{}'::text[]; END IF;
    v_trimmed := TRIM(p_text);
    IF v_trimmed LIKE '[%' THEN
        RETURN ARRAY(SELECT jsonb_array_elements_text(v_trimmed::jsonb));
    END IF;
    RETURN string_to_array(v_trimmed, ',');
EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::text[];
END;
$$;
ALTER FUNCTION public._mig_safe_to_tags(TEXT) OWNER TO postgres;

-- =============================================================================
-- 2a. KRIITTISTEN SARAKETYYPPIEN TARKISTUS JA MUUNNOS (K4, K5, K9, K16)
-- =============================================================================
DO $$
DECLARE
    v_data_type TEXT;
BEGIN
    -- id: UUID – esiauditointi (vaihe 0) on jo varmistanut, ettei ei-UUID-arvoja ole
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='id';
    IF v_data_type IN ('text','character varying') THEN
        ALTER TABLE public.encounters ALTER COLUMN id TYPE UUID USING id::uuid;
    END IF;

    -- user_id: UUID (yhteensopivuus auth.uid():n kanssa; ei-UUID arvot talteen K27)
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='user_id';
    IF v_data_type IN ('text','character varying') THEN
        UPDATE public.encounters
        SET _mig_legacy_user_id = user_id
        WHERE user_id IS NOT NULL
          AND NOT (user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

        ALTER TABLE public.encounters ALTER COLUMN user_id TYPE UUID USING
            CASE WHEN user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN user_id::uuid ELSE NULL END;
    END IF;

    -- place_id: K5 – säilytetään ei-UUID-tekstiarvot location-kentässä ennen nollaamista
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='place_id';
    IF v_data_type IN ('text','character varying') THEN
        -- Kopioidaan ei-UUID-tekstiarvot location-kenttään (ei ylikirjoiteta olemassa olevaa)
        UPDATE public.encounters
        SET location = COALESCE(NULLIF(TRIM(location),''), place_id)
        WHERE place_id IS NOT NULL
          AND NOT (place_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
        ALTER TABLE public.encounters ALTER COLUMN place_id TYPE UUID USING
            CASE WHEN place_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 THEN place_id::uuid ELSE NULL END;
    END IF;

    -- created_at: K9 – käytetään apufunktiota; käsittelee myös validi-muotoiset väärät päivämäärät (2026-99-99)
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='created_at';
    IF v_data_type IN ('text','character varying') THEN
        ALTER TABLE public.encounters ALTER COLUMN created_at TYPE TIMESTAMPTZ
            USING COALESCE(public._mig_safe_to_ts(created_at), now());
    ELSIF v_data_type = 'timestamp without time zone' THEN
        ALTER TABLE public.encounters ALTER COLUMN created_at TYPE TIMESTAMPTZ
            USING created_at AT TIME ZONE 'UTC';
    END IF;

    -- expires_at: K9 – apufunktio käsitelee myös väärät päivämäärät
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='expires_at';
    IF v_data_type IN ('text','character varying') THEN
        ALTER TABLE public.encounters ALTER COLUMN expires_at TYPE TIMESTAMPTZ
            USING COALESCE(public._mig_safe_to_ts(expires_at), now() + interval '30 days');
    ELSIF v_data_type = 'timestamp without time zone' THEN
        ALTER TABLE public.encounters ALTER COLUMN expires_at TYPE TIMESTAMPTZ
            USING expires_at AT TIME ZONE 'UTC';
    END IF;

    -- title ja description: TEXT
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='title';
    IF v_data_type = 'character varying' THEN
        ALTER TABLE public.encounters ALTER COLUMN title TYPE TEXT;
    END IF;

    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='description';
    IF v_data_type = 'character varying' THEN
        ALTER TABLE public.encounters ALTER COLUMN description TYPE TEXT;
    END IF;
END $$;

-- =============================================================================
-- 2c. JSONB JA ARRAY -SARAKKEIDEN MUUNNOS APUFUNKTIOILLA (K1, K2, K21)
-- =============================================================================
DO $$
DECLARE
    v_data_type TEXT;
    v_udt_name  TEXT;
BEGIN
    -- structured_links: K1 + K21 – USER-DEFINED tarkistetaan udt_name:lla
    SELECT data_type, udt_name INTO v_data_type, v_udt_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='structured_links';

    IF v_data_type IN ('text','character varying') THEN
        ALTER TABLE public.encounters
            ALTER COLUMN structured_links TYPE JSONB
            USING public._mig_safe_to_jsonb(structured_links::text);
    ELSIF v_data_type = 'json' THEN
        ALTER TABLE public.encounters
            ALTER COLUMN structured_links TYPE JSONB
            USING COALESCE(structured_links::jsonb, '{}'::jsonb);
    ELSIF v_data_type = 'jsonb' THEN
        -- Jo JSONB: vain COALESCE
        ALTER TABLE public.encounters
            ALTER COLUMN structured_links TYPE JSONB
            USING COALESCE(structured_links, '{}'::jsonb);
    ELSIF v_data_type = 'USER-DEFINED' AND v_udt_name = 'jsonb' THEN
        -- JSONB-domain (esim. custom domain on jsonb)
        ALTER TABLE public.encounters
            ALTER COLUMN structured_links TYPE JSONB
            USING COALESCE(structured_links::jsonb, '{}'::jsonb);
    ELSIF v_data_type = 'USER-DEFINED' THEN
        -- Tuntematon user-defined tyyppi: käännetään tekstin kautta; virheelliset '{}'ksi
        ALTER TABLE public.encounters
            ALTER COLUMN structured_links TYPE JSONB
            USING public._mig_safe_to_jsonb(structured_links::text);
    END IF;

    -- tags: K2 – apufunktio (JSON-taulukko, pilkkuerotteinen, virheelliset → '{}')
    SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='encounters' AND column_name='tags';

    IF v_data_type IN ('text','character varying') THEN
        ALTER TABLE public.encounters
            ALTER COLUMN tags TYPE TEXT[]
            USING public._mig_safe_to_tags(tags::text);
    ELSIF v_data_type = 'ARRAY' THEN
        ALTER TABLE public.encounters
            ALTER COLUMN tags TYPE TEXT[] USING COALESCE(tags::text[], '{}'::text[]);
    END IF;
END $$;

-- Apufunktiot poistetaan heti käytön jälkeen (vain migraatiotyökaluja)
DROP FUNCTION IF EXISTS public._mig_safe_to_ts(TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public._mig_safe_to_jsonb(TEXT);
DROP FUNCTION IF EXISTS public._mig_safe_to_tags(TEXT);

-- Eksplisiittiset tyypit kaikille sarakkeille
ALTER TABLE public.encounters
    ALTER COLUMN publisher_type TYPE TEXT,
    ALTER COLUMN status TYPE TEXT,
    ALTER COLUMN visibility TYPE TEXT,
    ALTER COLUMN sub_category TYPE TEXT,
    ALTER COLUMN price_info TYPE TEXT,
    ALTER COLUMN location TYPE TEXT,
    ALTER COLUMN location_id TYPE TEXT,
    ALTER COLUMN organization_id TYPE TEXT,
    ALTER COLUMN company_id TYPE TEXT,
    ALTER COLUMN publisher_name TYPE TEXT,
    ALTER COLUMN contact_email TYPE TEXT,
    ALTER COLUMN contact_phone TYPE TEXT,
    ALTER COLUMN image_url TYPE TEXT,
    ALTER COLUMN external_url TYPE TEXT,
    ALTER COLUMN external_source TYPE TEXT;

-- =============================================================================
-- 2b. VANHAN DATAN NORMALISOINTI JA KORJAUS (Järjestetty turvallisesti ennen rajoitteita)
-- =============================================================================

-- 1. NULL-arvojen ja tyhjien arvojen korjaukset pakollisille kentille
UPDATE public.encounters SET publisher_type = 'personal' WHERE publisher_type IS NULL OR TRIM(publisher_type) = '';
UPDATE public.encounters SET status = 'active' WHERE status IS NULL OR status NOT IN ('active', 'draft', 'closed', 'archived', 'deleted');
UPDATE public.encounters SET visibility = 'public' WHERE visibility IS NULL OR visibility NOT IN ('public', 'code_protected');
UPDATE public.encounters SET tags = '{}' WHERE tags IS NULL;
UPDATE public.encounters SET structured_links = '{}'::jsonb WHERE structured_links IS NULL OR jsonb_typeof(structured_links) <> 'object';

-- 2. Tyyppien korjaus (Siirtymävaiheen aliakset muunnetaan aina kanonisiksi arvoiksi)
-- KORJAUS (Havainto 1.3): WHERE-ehdon IN-listasta poistettu aliakset (need_help, offer_service jne.),
-- jotta CASE-haarat tosiasiassa suoritetaan niille. Nämä eivät enää ole hyväksyttyjä arvoja
-- CHECK-rajoitteessa (katso alla), joten ne muunnetaan pakotetusti.
UPDATE public.encounters
SET type = CASE
    WHEN type IN ('service_request', 'need_help') THEN 'search'
    WHEN type = 'offer_service'                   THEN 'offer'
    WHEN type IN ('local_notice', 'community')    THEN 'notice'
    WHEN type = 'work_and_gigs'                   THEN 'search'
    WHEN type = 'high_value'                      THEN 'sell'
    WHEN type = 'lost_and_found'                  THEN 'lost_found'
    WHEN type = 'b2b_collab'                      THEN 'offer'
    WHEN type = 'event_staff'                     THEN 'search'
    WHEN type = 'space_rental'                    THEN 'offer'
    ELSE 'notice'
END
WHERE type IS NULL OR type NOT IN (
    -- Kanoninen lista (VAIN kanonisia arvoja – siirtymäaliakset muunnetaan yllä)
    'search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found'
);

-- 3. Otsikon ja kuvauksen pituuksien normalisointi
UPDATE public.encounters SET title = SUBSTRING(TRIM(title) FROM 1 FOR 150) WHERE LENGTH(title) > 150;
UPDATE public.encounters SET title = RPAD(COALESCE(TRIM(title), 'Ilmoitus'), 3, '.') WHERE LENGTH(TRIM(COALESCE(title, ''))) < 3;
UPDATE public.encounters SET description = RPAD(COALESCE(TRIM(description), 'Tarkempi kuvaus'), 5, '.') WHERE LENGTH(TRIM(COALESCE(description, ''))) < 5;
UPDATE public.encounters SET price_info = SUBSTRING(TRIM(price_info) FROM 1 FOR 80) WHERE LENGTH(price_info) > 80;

-- 4. Organisaatiotunnisteiden ja julkaisijatyypin normalisointi (JÄRJESTYS KORJATTU: orvot ensin)
-- a) Orpojen organisaatiotunnisteiden nollaus (jos arvo ei löydy organizations-taulusta)
UPDATE public.encounters e
SET organization_id = NULL
WHERE e.organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = e.organization_id);

UPDATE public.encounters e
SET company_id = NULL
WHERE e.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = e.company_id);

-- b) Synkronointi vain vahvistetuista organisaatioista
UPDATE public.encounters e
SET organization_id = e.company_id
WHERE e.organization_id IS NULL AND e.company_id IS NOT NULL;

UPDATE public.encounters e
SET company_id = e.organization_id
WHERE e.organization_id IS NOT NULL AND (e.company_id IS NULL OR e.company_id <> e.organization_id);

-- c) Organisaatiotyypin asetus kannan organizations.type -tiedon pohjalta (EI ARVAILLA 'companyksi')
UPDATE public.encounters e
SET publisher_type = CASE LOWER(TRIM(COALESCE(o.type, '')))
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
END
FROM public.organizations o
WHERE e.organization_id = o.id;

-- Jos organisaation tyyppi oli tuntematon (publisher_type jäi NULLiksi):
-- puretaan organisaatiolinkitys ja palautetaan henkilökohtaiseksi, jottei data korruptoidu väärällä yritysroolilla!
UPDATE public.encounters
SET organization_id = NULL, company_id = NULL, publisher_type = 'personal'
WHERE organization_id IS NOT NULL AND (publisher_type IS NULL OR publisher_type NOT IN ('company', 'association', 'location', 'event', 'network', 'service'));

-- d) Jos organisaatiota ei ole, julkaisijatyyppi on aina 'personal'
UPDATE public.encounters
SET publisher_type = 'personal'
WHERE organization_id IS NULL AND publisher_type <> 'personal';

-- 5. Paikkatunnisteiden normalisointi (JÄRJESTYS KORJATTU: olemassaolo varmistetaan ennen kopiota)
-- a) Jos place_id osoittaa olemattomaan paikkaan, puretaan orpo viite
UPDATE public.encounters e
SET location = COALESCE(e.location, e.location_id, 'Muu paikka'),
    place_id = NULL
WHERE e.place_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.places p WHERE p.id = e.place_id);

-- b) Kopioidaan location_id place_id:ksi VAIN jos UUID on validi JA paikka löytyy places-taulusta
UPDATE public.encounters e
SET place_id = e.location_id::uuid
WHERE e.place_id IS NULL
  AND e.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM public.places p WHERE p.id = e.location_id::uuid);

-- c) Synkronoidaan location_id place_id:n tekstimuodoksi
UPDATE public.encounters
SET location_id = place_id::text
WHERE place_id IS NOT NULL;

-- d) Jos location_id ei ole kelvollinen UUID tai sitä ei löydy places-taulusta, siirretään teksti location-kenttään
UPDATE public.encounters e
SET location = COALESCE(e.location, e.location_id),
    location_id = NULL
WHERE e.location_id IS NOT NULL
  AND (
      NOT (e.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR NOT EXISTS (SELECT 1 FROM public.places p WHERE p.id::text = LOWER(TRIM(e.location_id)))
  );

-- 6. Voimassaoloaikojen normalisointi (created_at < expires_at <= created_at + 90 pv)
UPDATE public.encounters
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.encounters
SET expires_at = created_at + interval '30 days'
WHERE expires_at IS NULL
   OR expires_at <= created_at
   OR expires_at > created_at + interval '90 days';

-- 7. Vierasavainten liittäminen normalisoidulle datalle
-- Poistetaan ensin KAIKKI vanhat (automaattisesti tai manuaalisesti nimetyt) viiteavaimet näiltä sarakkeilta
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT DISTINCT con.conname  -- K11: DISTINCT estää kaksoiskäsittelyn
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE con.conrelid = 'public.encounters'::regclass
          AND con.contype = 'f'
          AND att.attname IN ('place_id', 'organization_id')
    ) LOOP
        EXECUTE 'ALTER TABLE public.encounters DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.encounters ADD CONSTRAINT fk_encounters_place_id
    FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE SET NULL;

ALTER TABLE public.encounters ADD CONSTRAINT fk_encounters_organization_id
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 8. Pakotetaan NOT NULL -määritteet suoraan kaikille pakollisille sarakkeille (K2, K32)
ALTER TABLE public.encounters
    ALTER COLUMN type SET NOT NULL,
    ALTER COLUMN title SET NOT NULL,
    ALTER COLUMN description SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN publisher_type SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN visibility SET NOT NULL,
    ALTER COLUMN tags SET NOT NULL,
    ALTER COLUMN structured_links SET NOT NULL,
    ALTER COLUMN expires_at SET NOT NULL;

-- =============================================================================
-- 3. MUOKKAUSTOKENIEN ERILLISTAULU (Zero-Leakage Architecture)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.encounter_edit_tokens (
    encounter_id        UUID PRIMARY KEY REFERENCES public.encounters(id) ON DELETE CASCADE,
    edit_token          UUID DEFAULT gen_random_uuid() NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.encounter_edit_tokens
    ADD COLUMN IF NOT EXISTS edit_token UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

REVOKE ALL ON public.encounter_edit_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.encounter_edit_tokens TO service_role;

ALTER TABLE public.encounter_edit_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. TIETOKANTATASON CHECK-RAJOITTEET (Idempotentti korvaus)
-- =============================================================================

-- 1. Type (KORJAUS 1.3, K32: pakollinen NOT NULL ja vain kanonisia arvoja)
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_type;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_type
    CHECK (type IS NOT NULL AND type IN (
        'search', 'offer', 'sell', 'give', 'notice', 'idea', 'lost_found'
    ));

-- 2. Status
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_status;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_status
    CHECK (status IS NOT NULL AND status IN ('active', 'draft', 'closed', 'archived', 'deleted'));

-- 3. Visibility
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_visibility;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_visibility
    CHECK (visibility IS NOT NULL AND visibility IN ('public', 'code_protected'));

-- 4. Publisher type
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_publisher_type;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_publisher_type
    CHECK (publisher_type IS NOT NULL AND publisher_type IN ('personal', 'company', 'association', 'location', 'event', 'network', 'service'));

-- 5. Organisaatiotunnuksen ja julkaisijatyypin eheys (NULL-vuotosuojattu, tukee kaikkia julkaisijatyyppejä)
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_org_publisher_type;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_org_publisher_type
    CHECK (
        publisher_type IS NOT NULL AND (
            (organization_id IS NOT NULL AND publisher_type IN ('company', 'association', 'location', 'event', 'network', 'service'))
            OR
            (organization_id IS NULL AND publisher_type = 'personal')
        )
    );

-- 6. Title pituus
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_title_len;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_title_len
    CHECK (LENGTH(TRIM(title)) >= 3 AND LENGTH(title) <= 150);

-- 7. Description pituus
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_desc_len;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_desc_len
    CHECK (LENGTH(TRIM(description)) >= 5);

-- 8. Price info pituus
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_price_len;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_price_len
    CHECK (price_info IS NULL OR LENGTH(price_info) <= 80);

-- 9. Structured links JSON-tyyppi
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_structured_links;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_structured_links
    CHECK (structured_links IS NOT NULL AND jsonb_typeof(structured_links) = 'object');

-- 10. Expires at järkevyys (ei ikuinen, max 90 pv luonnista)
ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS chk_encounters_expires_at;
ALTER TABLE public.encounters ADD CONSTRAINT chk_encounters_expires_at
    CHECK (expires_at IS NOT NULL AND expires_at > created_at AND expires_at <= created_at + interval '90 days');

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
-- 5b. YLLÄPITÄJYYDEN APUFUNKTIO (K43)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT (
        COALESCE(auth.jwt()->>'role', '') = 'authenticated'
        AND LOWER(COALESCE(auth.jwt()->>'email', '')) IN (
            'info.mediazoo@gmail.com', 'info@mediazoo.fi', 'antmikk@gmail.com'
        )
    );
$$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- =============================================================================
-- 6. VALIDOINTI- JA TURVATRIGGERI (BEFORE INSERT / BEFORE UPDATE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_encounter_validation_and_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    v_is_admin := public.is_admin();

    -- 1. Bannatun sähköpostiosoitteen esto
    IF NEW.contact_email IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.banned_emails
            WHERE email = LOWER(TRIM(NEW.contact_email))
        ) THEN
            RAISE EXCEPTION 'Ilmoituksen luonti estetty: sähköpostiosoite on estolistalla.';
        END IF;
    END IF;

    -- 2. INSERT-pakotukset
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();

        IF NEW.status IS NULL THEN
            NEW.status := 'active';
        END IF;

        IF NEW.visibility IS NULL THEN
            NEW.visibility := 'public';
        END IF;

        IF NEW.publisher_type IS NULL THEN
            NEW.publisher_type := 'personal';
        END IF;

        IF NEW.tags IS NULL THEN
            NEW.tags := '{}';
        END IF;

        IF NEW.structured_links IS NULL THEN
            NEW.structured_links := '{}'::jsonb;
        END IF;

        -- Voimassaoloaika pakotettu ja rajoitettu (max 90 pv luonnista)
        IF NEW.expires_at IS NULL THEN
            NEW.expires_at := now() + interval '30 days';
        ELSIF NEW.expires_at > now() + interval '90 days' THEN
            NEW.expires_at := now() + interval '90 days';
        ELSIF NEW.expires_at <= now() THEN
            NEW.expires_at := now() + interval '30 days';
        END IF;
    END IF;

    -- 3. UPDATE-suojaukset (Omistaja ei voi muuttaa suojattuja ankkureita)
    IF TG_OP = 'UPDATE' AND NOT v_is_admin THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION 'user_id-kenttää ei voi muuttaa.';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'created_at-kenttää ei voi muuttaa.';
        END IF;

        -- Organisaation kaskadi tai muutos (K34):
        -- Asiakkaan suorat UPDATE-oikeudet näihin sarakkeisiin on evätty sarakeoikeustasolla (K31).
        -- Kun FK ON DELETE SET NULL asettaa organization_id:n NULLiksi, sallitaan kaskadi puhtaasti:
        IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
            NEW.company_id := NULL;
            NEW.publisher_type := 'personal';
        ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
              NEW.company_id IS DISTINCT FROM OLD.company_id OR
              NEW.publisher_type IS DISTINCT FROM OLD.publisher_type OR
              NEW.publisher_name IS DISTINCT FROM OLD.publisher_name THEN
            RAISE EXCEPTION 'Organisaatiota tai julkaisijatietoja ei voi muuttaa luonnin jälkeen.';
        END IF;

        -- Paikkatunnisteiden kaskadi tai muutos (K34):
        -- Asiakkaan suorat UPDATE-oikeudet näihin sarakkeisiin on evätty sarakeoikeustasolla (K31).
        -- Kun FK ON DELETE SET NULL asettaa place_id:n NULLiksi, sallitaan kaskadi puhtaasti ja nollataan location_id:
        IF OLD.place_id IS NOT NULL AND NEW.place_id IS NULL THEN
            NEW.location_id := NULL;
        ELSIF NEW.place_id IS DISTINCT FROM OLD.place_id OR
              NEW.location_id IS DISTINCT FROM OLD.location_id THEN
            RAISE EXCEPTION 'Kanonisia paikkatunnisteita (place_id, location_id) ei voi muuttaa luonnin jälkeen.';
        END IF;

        IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at > OLD.expires_at THEN
            RAISE EXCEPTION 'Voimassaoloaikaa ei voi pidentää ilman ylläpito-oikeutta.';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('active', 'closed') THEN
            RAISE EXCEPTION 'Sallitut tilamuutokset ilmoitukselle: active tai closed.';
        END IF;
    END IF;

    -- 4. Paikkatunnisteiden kanonisointi (place_id on UUID)
    -- place_id on kanoninen ankkuri; location_id synkronoidaan siihen.
    -- location toimii vapaamuotoisena lisätarkenteena (esim. ovinumero/katuosoite).
    IF NEW.place_id IS NOT NULL AND NEW.location_id IS NOT NULL THEN
        -- Molemmat annettu: tarkistetaan että location_id on UUID ja täsmää place_id:hen
        IF NOT (NEW.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
            RAISE EXCEPTION 'location_id on oltava kelvollinen UUID-tunniste. Vapaamuotoinen paikkatieto annetaan location-kentässä.';
        END IF;
        IF LOWER(TRIM(NEW.location_id)) <> LOWER(NEW.place_id::text) THEN
            RAISE EXCEPTION 'Ristiriitaiset paikkatunnisteet: place_id (%) ja location_id (%) eivät täsmää.',
                NEW.place_id, NEW.location_id;
        END IF;
        NEW.location_id := NEW.place_id::text;
    ELSIF NEW.place_id IS NOT NULL AND NEW.location_id IS NULL THEN
        NEW.location_id := NEW.place_id::text;
    ELSIF NEW.location_id IS NOT NULL AND NEW.place_id IS NULL THEN
        IF NOT (NEW.location_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
            RAISE EXCEPTION 'location_id on oltava kelvollinen UUID-tunniste. Vapaamuotoinen paikkatieto annetaan location-kentässä.';
        END IF;
        NEW.place_id := NEW.location_id::uuid;
        NEW.location_id := NEW.place_id::text;
    END IF;

    -- Täydennetään location paikan nimellä vain jos se puuttuu
    IF NEW.place_id IS NOT NULL AND (NEW.location IS NULL OR TRIM(NEW.location) = '') THEN
        SELECT name INTO NEW.location
        FROM public.places
        WHERE id = NEW.place_id;
    END IF;

    -- 5. Organisaatiotunnisteiden normalisointi ja ON DELETE SET NULL -tuki (K3)
    IF TG_OP = 'INSERT' THEN
        IF NEW.organization_id IS NOT NULL AND NEW.company_id IS NULL THEN
            NEW.company_id := NEW.organization_id;
        ELSIF NEW.company_id IS NOT NULL AND NEW.organization_id IS NULL THEN
            NEW.organization_id := NEW.company_id;
        ELSIF NEW.organization_id IS NOT NULL AND NEW.company_id IS NOT NULL THEN
            IF NEW.organization_id <> NEW.company_id THEN
                RAISE EXCEPTION 'Ristiriitaiset organisaatiotunnisteet: organization_id (%) ja company_id (%) eivät täsmää.',
                    NEW.organization_id, NEW.company_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.organization_id IS NOT NULL THEN
            NEW.company_id := NEW.organization_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_encounter_validation_and_sync() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_encounter_validation_and_sync() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_encounter_validation_and_sync ON public.encounters;
CREATE TRIGGER trg_encounter_validation_and_sync
BEFORE INSERT OR UPDATE ON public.encounters
FOR EACH ROW
EXECUTE FUNCTION public.handle_encounter_validation_and_sync();

-- =============================================================================
-- 7. AFTER INSERT -TRIGGERI: ATOMINEN EDIT_TOKENIN LUONTI
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_encounter_after_insert_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    INSERT INTO public.encounter_edit_tokens (encounter_id, edit_token)
    VALUES (NEW.id, gen_random_uuid())
    ON CONFLICT (encounter_id) DO NOTHING;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_encounter_after_insert_token() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_encounter_after_insert_token() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_encounter_after_insert_token ON public.encounters;
CREATE TRIGGER trg_encounter_after_insert_token
AFTER INSERT ON public.encounters
FOR EACH ROW
EXECUTE FUNCTION public.handle_encounter_after_insert_token();

-- =============================================================================
-- 8. RLS JA KÄYTTÖOIKEUDET
-- =============================================================================

-- Anonyymeiltä ja autentikoiduilta EVÄTÄÄN suora INSERT.
-- KAIKKI ilmoitukset luodaan hallitusti create_encounter() RPC:n kautta.
-- K12: Sarakeoikeudet erikseen – contact_email ja contact_phone EI ole annettu
-- authenticated-roolille suoraan. Omistaja saa yhteystietonsa
-- get_encounter_contact()-RPC:n kautta (kohta 9b alla).
-- K35: Puhdistetaan kaikki vanhat taulu- ja sarakekohtaiset oikeudet
REVOKE ALL ON public.encounters FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT DISTINCT column_name, privilege_type, grantee
        FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = 'encounters'
          AND UPPER(grantee) IN ('ANON', 'AUTHENTICATED', 'PUBLIC')
    LOOP
        EXECUTE format('REVOKE %s (%I) ON public.encounters FROM %I', col.privilege_type, col.column_name, col.grantee);
    END LOOP;
END $$;

-- K31: user_id poistettu SELECT-sarakkeista (yksityisyyssuoja; authenticated ei voi urkkia muiden tunnisteita)
GRANT SELECT (
    id, type, sub_category, title, description, price_info,
    place_id, location, location_id,
    organization_id, company_id,
    publisher_type, publisher_name,
    tags, allow_messages, structured_links,
    image_url, external_url, external_source,
    status, visibility, created_at, expires_at
) ON public.encounters TO authenticated;

-- K31: UPDATE rajattu vain sallittuihin sisältökenttiin (ei voi muuttaa id, user_id, aikoja tai FK-ankkureita)
GRANT UPDATE (
    title, description, price_info, status, visibility, allow_messages, structured_links, image_url
) ON public.encounters TO authenticated;

-- K33: Suorat DELETE-oikeudet evätty täysin!
-- Ilmoitusten sulkeminen/poistaminen hoidetaan aina hallitusti delete_encounter_with_token() RPC:n kautta.
REVOKE DELETE ON public.encounters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.encounters TO service_role;

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

-- KORJAUS (Havainto 1.1): Poistetaan KAIKKI vanhat RLS-käytännöt taulusta ennen uusien luomista.
-- Vanhat, laajemmat käytännöt voivat ohittaa uudet rajaukset (PostgreSQL OR-logiikka).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'encounters'
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.encounters';
    END LOOP;
END $$;

-- 8a. SELECT: Julkiset aktiiviset tai omat tai admin
DROP POLICY IF EXISTS "encounters_select_policy" ON public.encounters;
CREATE POLICY "encounters_select_policy"
ON public.encounters
FOR SELECT
USING (
    (status = 'active' AND (visibility = 'public' OR visibility IS NULL) AND (expires_at > now()))
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin()
);

-- 8b. UPDATE: Kirjautuneet omistajat tai Admin
DROP POLICY IF EXISTS "encounters_authenticated_update_policy" ON public.encounters;
CREATE POLICY "encounters_authenticated_update_policy"
ON public.encounters
FOR UPDATE
TO authenticated
USING (
    (user_id = auth.uid()) OR public.is_admin()
)
WITH CHECK (
    (user_id = auth.uid()) OR public.is_admin()
);

-- 8c. DELETE: Suora DELETE on evätty taulutasolla (K33, K37).
-- Poistetaan mahdolliset vanhat DELETE-käytännöt ilman uudelleenluontia.
DROP POLICY IF EXISTS "encounters_authenticated_delete_policy" ON public.encounters;

-- =============================================================================
-- 8d. APUFUNKTIO: ORGANISAATION JULKAISUAVAIMEN TARKISTUS (K41, K42)
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
    IF p_organization_id IS NULL OR TRIM(p_organization_id) = '' OR p_publish_key IS NULL OR TRIM(p_publish_key) = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaatiotunnus ja julkaisuavain vaaditaan.');
    END IF;

    v_clean_key := UPPER(REGEXP_REPLACE(p_publish_key, '[^A-Z0-9]', '', 'g'));
    v_hash := encode(digest(v_clean_key, 'sha256'), 'hex');

    -- Tarkistetaan organisaation tila
    SELECT name, publisher_enabled INTO v_org_name, v_enabled
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaatiota ei löydy järjestelmästä.');
    END IF;

    IF v_enabled IS FALSE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Organisaation julkaisuoikeus on estetty.');
    END IF;

    -- Tarkistetaan avaimen hash (vain aktiiviset, peruuttamattomat avaimet)
    SELECT EXISTS (
        SELECT 1 FROM public.organization_publish_credentials
        WHERE organization_id = p_organization_id
          AND code_hash = v_hash
          AND revoked_at IS NULL
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
-- 9. RPC: VALIDOITU ILMOITUKSEN LUONTI (JA TOKENIN JAKELU LUOJALLE)
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
    p_publisher_type   TEXT DEFAULT 'personal',
    p_publisher_name   TEXT DEFAULT NULL,
    p_organization_id  TEXT DEFAULT NULL,
    p_publish_key      TEXT DEFAULT NULL,
    p_tags             TEXT[] DEFAULT '{}',
    p_contact_email    TEXT DEFAULT NULL,
    p_contact_phone    TEXT DEFAULT NULL,
    p_allow_messages   BOOLEAN DEFAULT true,
    p_structured_links JSONB DEFAULT '{}'::jsonb,
    p_image_url        TEXT DEFAULT NULL,
    p_duration_days    INT DEFAULT 30
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
    v_effective_type     TEXT;  -- K3: kanoninen tyyppi aliaksen jälkeen
    v_is_admin           BOOLEAN;
    v_duration           INT;
    -- K13: hyväksytyt syötearvot (kanoniset + siirtymäaliakset, mukaan local_notice)
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

    -- Voimassaoloaika (oletus 30 pv, min 1 pv, max 90 pv)
    v_duration := LEAST(GREATEST(COALESCE(p_duration_days, 30), 1), 90);

    -- K3: Normalisoidaan siirtymäaliakset kanonisiksi tyypeiksi ennen INSERTiä
    -- (RPC hyväksyy aliakset takaisinyhteensopivuuden vuoksi, mutta tallentaa aina kanonisen arvon)
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
        ELSE p_type  -- jo kanoninen arvo
    END;

    -- 2. Organisaation todennus ja tyyppimuunnos (K1, K24)
    IF p_organization_id IS NOT NULL THEN
        SELECT name, type INTO v_db_org_name, v_db_org_type
        FROM public.organizations
        WHERE id = p_organization_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei löydy järjestelmästä.');
        END IF;

        -- Eksplisiittinen ja deterministinen organisaatiotyypin muunnos (K1)
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
        ELSE
            IF p_publish_key IS NULL OR TRIM(p_publish_key) = '' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Organisaation nimissä julkaiseminen vaatii julkaisuavaimen.'
                );
            END IF;

            v_verify_res := public.verify_publisher_key(p_organization_id, TRIM(p_publish_key));
            IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', COALESCE(v_verify_res->>'error', 'Virheellinen organisaation julkaisuavain.')
                );
            END IF;

            v_effective_org_id   := p_organization_id;
            v_effective_pub_name := COALESCE(NULLIF(TRIM(p_publisher_name), ''), v_db_org_name, v_verify_res->>'org_name');
        END IF;
    ELSE
        -- Henkilökohtainen julkaisu
        IF p_publisher_type IS NOT NULL AND p_publisher_type <> 'personal' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Organisaatiojulkaisijatyyppi vaatii organisaatiotunnuksen (organization_id) ja julkaisuavaimen.'
            );
        END IF;

        v_effective_pub_type := 'personal';
        v_effective_pub_name := NULLIF(TRIM(p_publisher_name), '');
        v_effective_org_id   := NULL;
    END IF;

    -- 3. Luodaan kohtaaminen (Suoritetaan postgres-roolilla, ohittaen taulun RLS)
    INSERT INTO public.encounters (
        type, sub_category, title, description, price_info,
        place_id, location, location_id,
        publisher_type, publisher_name, organization_id,
        tags, contact_email, contact_phone, allow_messages,
        structured_links, image_url, user_id,
        expires_at
    ) VALUES (
        v_effective_type,  -- K3: kanoninen arvo (alias normalisoitu yllä)
        p_sub_category, TRIM(p_title), TRIM(p_description), NULLIF(TRIM(COALESCE(p_price_info,'')), ''),
        p_place_id, p_location, p_location_id,
        v_effective_pub_type, v_effective_pub_name, v_effective_org_id,
        COALESCE(p_tags, '{}'), NULLIF(TRIM(COALESCE(p_contact_email,'')), ''), NULLIF(TRIM(COALESCE(p_contact_phone,'')), ''), COALESCE(p_allow_messages, true),
        COALESCE(p_structured_links, '{}'::jsonb), p_image_url, auth.uid(),
        now() + (v_duration || ' days')::interval
    )
    RETURNING id INTO v_new_id;

    -- 4. Haetaan AFTER INSERT -triggerin luoma salainen edit_token
    SELECT edit_token INTO v_edit_token
    FROM public.encounter_edit_tokens
    WHERE encounter_id = v_new_id;

    -- 5. Palautetaan token kerran luontivastauksessa
    RETURN jsonb_build_object(
        'success',      true,
        'encounter_id', v_new_id,
        'edit_token',   v_edit_token
    );
END;
$$;

ALTER FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_encounter(
    TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, BOOLEAN, JSONB, TEXT, INT
) TO anon, authenticated;

-- =============================================================================
-- 10. RPC: ATOMINEN ANONYYMIN ILMOITUKSEN HALLINTA EDIT_TOKENILLA
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
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_updated_id UUID;
    v_new_price  TEXT;
BEGIN
    -- 1. Syötevalidointi
    IF p_encounter_id IS NULL OR p_edit_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tunniste (ID) ja muokkausavain vaaditaan.');
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
        RETURN jsonb_build_object('success', false, 'error', 'Sallitut tilat anonyymille muokkaukselle: active tai closed.');
    END IF;

    -- 2. Atominen päivitys
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
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Päivitys epäonnistui: virheellinen avain, ilmoitus poistettu tai voimassaolo päättynyt.'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_updated_id);
END;
$$;

ALTER FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_encounter_with_token(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- =============================================================================
-- 11. RPC: ILMOITUKSEN SULKEMINEN / POISTAMINEN TOKENILLA
-- =============================================================================

DROP FUNCTION IF EXISTS public.delete_encounter_with_token(UUID);
DROP FUNCTION IF EXISTS public.delete_encounter_with_token(UUID, UUID);

CREATE OR REPLACE FUNCTION public.delete_encounter_with_token(
    p_encounter_id UUID,
    p_edit_token   UUID DEFAULT NULL
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

    -- Merkitään tila 'closed' atomisesti (K33):
    -- Sallitaan jos:
    -- 1) Ylläpitäjä (v_is_admin)
    -- 2) Kirjautunut omistaja (auth.uid() = user_id)
    -- 3) Kelvollinen muokkaustoken (p_edit_token täsmää)
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

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Toiminto epäonnistui: virheellinen avain tai käyttöoikeus, ilmoitus jo suljettu tai voimassaolo päättynyt.'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'id', v_updated_id);
END;
$$;

ALTER FUNCTION public.delete_encounter_with_token(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_encounter_with_token(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_encounter_with_token(UUID, UUID) TO anon, authenticated;

-- =============================================================================
-- 9b. RPC: OMISTAJAN YHTEYSTIEDOT (contact_email, contact_phone) (K12)
-- =============================================================================
-- Vain ilmoituksen omistaja (tai admin) voi hakea yhteystietonsa.
-- Näin authenticated-roolin sarakeoikeudet voivat jättää yhteystiedot pois
-- ja silti sallia niiden hakemisen hallitusti tarvittaessa.
DROP FUNCTION IF EXISTS public.get_encounter_contact(UUID);
DROP FUNCTION IF EXISTS public.get_encounter_contact(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_encounter_contact(
    p_encounter_id UUID,
    p_edit_token   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_user_id       UUID;
    v_email         TEXT;
    v_phone         TEXT;
    v_is_admin      BOOLEAN;
    v_token_valid   BOOLEAN := false;
BEGIN
    v_is_admin := public.is_admin();

    IF p_encounter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ilmoituksen tunniste puuttuu.');
    END IF;

    SELECT user_id, contact_email, contact_phone
    INTO v_user_id, v_email, v_phone
    FROM public.encounters
    WHERE id = p_encounter_id
      AND status NOT IN ('deleted', 'archived');

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ilmoitusta ei löydy.');
    END IF;

    -- Tarkistetaan edit_token jos annettu (K23: vieraskäyttäjän yhteystietotuki)
    IF p_edit_token IS NOT NULL THEN
        SELECT true INTO v_token_valid
        FROM public.encounter_edit_tokens
        WHERE encounter_id = p_encounter_id AND edit_token = p_edit_token;
    END IF;

    -- Sallitaan yhteystiedot jos:
    -- 1) Käyttäjä on ylläpitäjä (v_is_admin)
    -- 2) Käyttäjällä on ilmoituksen kelvollinen edit_token (anonyymi luoja)
    -- 3) Käyttäjä on kirjautunut ilmoituksen omistaja (auth.uid() = user_id)
    IF NOT v_is_admin
       AND NOT COALESCE(v_token_valid, false)
       AND (auth.uid() IS NULL OR v_user_id IS NULL OR auth.uid() <> v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ei käyttöoikeutta yhteystietoihin.');
    END IF;

    RETURN jsonb_build_object(
        'success',       true,
        'contact_email', v_email,
        'contact_phone', v_phone
    );
END;
$$;

ALTER FUNCTION public.get_encounter_contact(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_encounter_contact(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_encounter_contact(UUID, UUID) TO anon, authenticated;

-- K18: encounters_public uusitaan DROP+CREATE (K18), koska CREATE OR REPLACE VIEW
-- ei salli sarakkeiden poistamista olemassa olevasta näkymästä.
DROP VIEW IF EXISTS public.encounters_public;
CREATE VIEW public.encounters_public AS
SELECT
    id,
    type,
    sub_category,
    title,
    description,
    price_info,
    place_id,
    location,
    location_id,
    organization_id,
    publisher_type,
    publisher_name,
    tags,
    allow_messages,
    structured_links,
    image_url,
    external_url,
    external_source,
    status,
    visibility,
    -- user_id poistettu (K15): anonyymille ei tarvita omistajatunnistetta
    -- contact_email ja contact_phone poistettu (K8): yksityiset kentät
    created_at,
    expires_at
FROM public.encounters
WHERE
    status = 'active'
    AND (visibility = 'public' OR visibility IS NULL)
    AND expires_at > now();

ALTER VIEW public.encounters_public OWNER TO postgres;
REVOKE ALL ON public.encounters_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.encounters_public TO anon, authenticated;

-- K22: COMMIT täällä – kaikki muutokset (taulut, RLS, RPC:t, näkymä) ovat näin atomisia.
COMMIT;
