-- =============================================================================
-- 071_toimintataulu_security_hardening.sql
-- LaukaaInfo – Päätös- ja toimintataulun tietoturvan ja eheyden kovennus
-- =============================================================================
-- TILA: VALMIS TESTATTAVAKSI (v11, koodiauditoitu – vaatii testiajon)
--
-- Koodiauditoinnin perusteella toteutetut korjaukset (v11):
--   1. Rikkoutuneen julkaisulinkin ja tilakoneen erilliset korjauspolut:
--      - Vieras organisaatio: hylätään aina.
--      - Ristiriitainen toinen kohde tai virheellinen kohdetyyppi: hylätään aina.
--      - Historiallinen/leimaamaton postaus (target_id/target_type NULL): vaatii p_force_relink.
--      - Piilotetun/luonnoksen palautus: vaatii p_force_relink.
--      - Rikkoutunut viite (postaus poistettu): vaatii p_force_relink uuden luontiin.
--   2. Ilmoittautumisen organisaation ja item_id:n täydellinen eheystarkistus:
--      - Sekä signup_board_task että cancel_board_task_signup tarkistavat että
--        olemassa olevan ilmoittautumisrivin organization_id ja item_id vastaavat
--        tehtävän ja pääkohteen tietoja.
--   3. Esitarkistukset laajennettu kattamaan NULL- ja tyhjät nimikentät
--      sekä ilmoittautumisten ja tehtävien organisaatiorajat.
--   4. 070-version lyhyiden funktioiden poisto ja allekirjoitusten hallinta.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ESITARKISTUKSET JA SARAKEMUUTOKSET
-- =============================================================================

-- 1.1 Tarkistetaan ettei kannassa ole virheellistä tai päällekkäistä dataa ennen indeksien luontia.
DO $$
DECLARE
    v_dup_signups INT;
    v_dup_wall_posts INT;
    v_org_mismatches INT;
    v_null_names INT;
    v_signup_org_mismatches INT;
BEGIN
    -- Tarkistetaan duplikaatit normalisoidulla nimellä lower(btrim(name))
    SELECT COUNT(*) INTO v_dup_signups
    FROM (
        SELECT task_id, pg_catalog.lower(pg_catalog.btrim(participant_name))
        FROM public.board_task_signups
        GROUP BY task_id, pg_catalog.lower(pg_catalog.btrim(participant_name))
        HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_signups > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: kannassa on % kpl päällekkäisiä ilmoittautumisia (task_id, LOWER(BTRIM(name))). Tarkista ja siivoa duplikaatit ennen indeksointia.', v_dup_signups;
    END IF;

    -- Tarkistetaan ettei nimikenttä ole tyhjä tai NULL missään ilmoittautumisessa
    SELECT COUNT(*) INTO v_null_names
    FROM public.board_task_signups
    WHERE participant_name IS NULL OR pg_catalog.btrim(participant_name) = '';

    IF v_null_names > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: kannassa on % kpl ilmoittautumisia, joilta puuttuu nimi (NULL tai tyhjä). Korjaa tai poista vialliset rivit ennen indeksointia.', v_null_names;
    END IF;

    -- Tarkistetaan päällekkäiset julkaisuviitteet
    SELECT COUNT(*) INTO v_dup_wall_posts
    FROM (
        SELECT wall_post_id
        FROM public.board_items
        WHERE wall_post_id IS NOT NULL
        GROUP BY wall_post_id
        HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_wall_posts > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: kannassa on % kpl päällekkäisiä julkaisuviitteitä (wall_post_id). Tarkista viitteet ennen 1:1 -indeksin luontia.', v_dup_wall_posts;
    END IF;

    -- Tarkistetaan tehtävien ja asioiden organisaatioiden yhtenäisyys NULL-turvallisesti
    SELECT COUNT(*) INTO v_org_mismatches
    FROM public.board_tasks t
    JOIN public.board_items i ON i.id = t.item_id
    WHERE t.organization_id IS DISTINCT FROM i.organization_id;

    IF v_org_mismatches > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: kannassa on % kpl tehtäviä, joiden organization_id poikkeaa pääkohteen organisaatiosta.', v_org_mismatches;
    END IF;

    -- Tarkistetaan ilmoittautumisten, tehtävien ja asioiden vastaavuus NULL-turvallisesti
    SELECT COUNT(*) INTO v_signup_org_mismatches
    FROM public.board_task_signups s
    JOIN public.board_tasks t ON t.id = s.task_id
    WHERE s.organization_id IS DISTINCT FROM t.organization_id
       OR s.item_id IS DISTINCT FROM t.item_id;

    IF v_signup_org_mismatches > 0 THEN
        RAISE EXCEPTION 'Migraatio keskeytetty: kannassa on % kpl ilmoittautumisia, joiden organization_id tai item_id poikkeaa tehtävän vastaavista arvoista.', v_signup_org_mismatches;
    END IF;
END $$;

-- 1.2 Lisätään perumissalaisuuden SHA-256-tiiviste
ALTER TABLE public.board_task_signups
ADD COLUMN IF NOT EXISTS cancellation_secret_hash TEXT;

-- 1.3 Historiadatan suojaus: Jos kannassa on ilmoittautumisia ilman tiivistettä,
-- generoidaan niille satunnainen arvo pg_catalog.encode() -funktiolla.
UPDATE public.board_task_signups
SET cancellation_secret_hash = pg_catalog.encode(extensions.digest(extensions.gen_random_bytes(16), 'sha256'), 'hex')
WHERE cancellation_secret_hash IS NULL;

-- 1.4 Kirjainkoosta ja välilyönneistä riippumaton yksilöivä indeksi ilmoittautumisille
CREATE UNIQUE INDEX IF NOT EXISTS board_task_signups_task_participant_norm_uidx
ON public.board_task_signups (
    task_id,
    pg_catalog.lower(pg_catalog.btrim(participant_name))
);

-- 1.5 Yksilöivä 1:1 -indeksi toimintataulun julkaisuviitteelle
CREATE UNIQUE INDEX IF NOT EXISTS board_items_wall_post_id_uidx
ON public.board_items (wall_post_id)
WHERE wall_post_id IS NOT NULL;

-- =============================================================================
-- 2. VANHOJEN 070-YLIKUORMIEN POISTO
-- =============================================================================
-- Poistetaan vanhat 070-version lyhyemmät ylikuormat, jotta kantaan ei jää
-- rinnakkaisia turvattomia funktioversioita.
DROP FUNCTION IF EXISTS public.cancel_board_task_signup(UUID, TEXT);
DROP FUNCTION IF EXISTS public.signup_board_task(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.post_board_comment(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT);

-- =============================================================================
-- 3. KOVENNETUT RPC-FUNKTIOT
-- =============================================================================

-- 3.1 Ilmoittautuminen vapaaehtoistehtävään (Takeover- ja rinnakkaisuussuojattu)
CREATE OR REPLACE FUNCTION public.signup_board_task(
    p_task_id          UUID,
    p_participant_name TEXT,
    p_contact          TEXT DEFAULT NULL,
    p_role             TEXT DEFAULT 'participant',
    p_existing_secret  TEXT DEFAULT NULL,
    p_session_token    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task             RECORD;
    v_clean_name       TEXT;
    v_clean_contact    TEXT;
    v_existing_signup  RECORD;
    v_secret_raw       TEXT;
    v_secret_hash      TEXT;
    v_token_hash       TEXT;
    v_is_authorized    BOOLEAN := FALSE;
    v_constraint_name  TEXT;
BEGIN
    -- 1. Syötevalidointi
    v_clean_name := pg_catalog.substr(pg_catalog.btrim(COALESCE(p_participant_name, '')), 1, 100);
    IF pg_catalog.length(v_clean_name) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nimen tulee olla vähintään 2 merkkiä.');
    END IF;

    v_clean_contact := pg_catalog.substr(pg_catalog.btrim(COALESCE(p_contact, '')), 1, 150);

    -- Eksplisiittinen NULL- ja arvojoukkotarkistus roolille
    IF p_role IS NULL OR p_role NOT IN ('interested', 'participant', 'lead') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen tai puuttuva roolityyppi (sallitut: interested, participant, lead).');
    END IF;

    -- 2. Tehtävän ja asian synkronoitu lukitus (FOR SHARE OF t, i estää samanaikaisen sulkemisen)
    SELECT t.id, t.item_id, t.organization_id, i.organization_id AS item_org_id, i.stage INTO v_task
    FROM public.board_tasks t
    JOIN public.board_items i ON i.id = t.item_id
    WHERE t.id = p_task_id
    FOR SHARE OF t, i;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtävää ei löydy.');
    END IF;

    -- NULL-turvallinen organisaatiotarkistus
    IF v_task.organization_id IS DISTINCT FROM v_task.item_org_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtävän ja pääkohteen organisaatiotunnus on ristiriidassa.');
    END IF;

    -- NULL-turvallinen elinkaaritilan tarkistus
    IF v_task.stage IS NULL OR v_task.stage IN ('done', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtävään ei voi enää ilmoittautua (asia on suljettu tai tila tuntematon).');
    END IF;

    -- 3. Tarkistetaan olemassa oleva ilmoittautuminen normalisoidulla nimellä
    SELECT id, task_id, item_id, organization_id, cancellation_secret_hash, participant_contact, role_type INTO v_existing_signup
    FROM public.board_task_signups
    WHERE task_id = p_task_id
      AND pg_catalog.lower(pg_catalog.btrim(participant_name)) = pg_catalog.lower(v_clean_name)
    FOR UPDATE;

    -- 4. Jos nimi on jo ilmoittautunut: vaaditaan omistajuuden varmennus
    IF FOUND THEN
        -- Tarkistetaan olemassa olevan ilmoittautumisrivin organisaatio- ja kohde-eheys
        IF v_existing_signup.organization_id IS DISTINCT FROM v_task.organization_id 
           OR v_existing_signup.item_id IS DISTINCT FROM v_task.item_id THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Tietokannan eheysvirhe: Olemassa olevan ilmoittautumisrivin organisaatio tai kohde ei vastaa tehtävän tietoja.'
            );
        END IF;

        -- a) Tarkistetaan organisaation ylläpitoistunto
        IF p_session_token IS NOT NULL AND pg_catalog.btrim(p_session_token) <> '' THEN
            v_token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex');
            IF public._verify_org_session_internal(v_token_hash, v_task.organization_id) IS NOT NULL THEN
                v_is_authorized := TRUE;
            END IF;
        END IF;

        -- b) Tarkistetaan ilmoittautujan oma salaisuus
        IF p_existing_secret IS NOT NULL AND pg_catalog.btrim(p_existing_secret) <> '' THEN
            v_secret_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_existing_secret), 'sha256'), 'hex');
            IF v_existing_signup.cancellation_secret_hash IS NOT NULL 
               AND v_existing_signup.cancellation_secret_hash = v_secret_hash THEN
                v_is_authorized := TRUE;
            END IF;
        END IF;

        -- Jos kutsujalla ei ole oikeutta, hylätään salaisuuden vaihtoyritys
        IF NOT v_is_authorized THEN
            RETURN jsonb_build_object(
                'success', false,
                'already_registered', true,
                'error', 'Henkilö nimellä "' || v_clean_name || '" on jo ilmoittautunut tähän tehtävään. Tietojen muuttaminen vaatii aiemman perumissalaisuuden tai ylläpitäjän koodin.'
            );
        END IF;

        -- Valtuutettu muokkaus:
        -- - Säilytetään alkuperäinen luontiaika (created_at EI muutu)
        -- - Säilytetään alkuperäinen salaisuuden tiiviste (cancellation_secret_hash EI muutu)
        -- - Säilytetään aiempi yhteystieto, jos uutta ei annettu
        UPDATE public.board_task_signups
        SET participant_contact = COALESCE(NULLIF(v_clean_contact, ''), participant_contact),
            role_type = p_role
        WHERE id = v_existing_signup.id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'updated',
            'already_registered', true
        );
    END IF;

    -- 5. Uusi ilmoittautuminen: Luodaan uniikki perumissalaisuus
    v_secret_raw  := pg_catalog.encode(extensions.gen_random_bytes(16), 'hex');
    v_secret_hash := pg_catalog.encode(extensions.digest(v_secret_raw, 'sha256'), 'hex');

    BEGIN
        INSERT INTO public.board_task_signups (
            task_id, item_id, organization_id, participant_name, participant_contact, role_type, cancellation_secret_hash
        ) VALUES (
            p_task_id, v_task.item_id, v_task.organization_id, v_clean_name, v_clean_contact, p_role, v_secret_hash
        );
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name IN ('board_task_signups_task_participant_norm_uidx', 'board_task_signups_task_participant_lower_uidx', 'board_task_signups_task_id_participant_name_key') THEN
            RETURN jsonb_build_object(
                'success', false,
                'already_registered', true,
                'error', 'Samanniminen osallistuja ehti juuri ilmoittautua tähän tehtävään. Päivitä sivu tarkistaaksesi tilanteen.'
            );
        ELSE
            RAISE;
        END IF;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'created',
        'signup_secret', v_secret_raw
    );
END;
$$;


-- 3.2 Ilmoittautumisen turvallinen peruminen (vaatii salaisuuden TAI ylläpitoistunnon)
CREATE OR REPLACE FUNCTION public.cancel_board_task_signup(
    p_task_id          UUID,
    p_participant_name TEXT,
    p_signup_secret    TEXT DEFAULT NULL,
    p_session_token    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_signup      RECORD;
    v_secret_hash TEXT;
    v_token_hash  TEXT;
    v_is_admin    BOOLEAN := FALSE;
BEGIN
    IF p_participant_name IS NULL OR pg_catalog.btrim(p_participant_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Osallistujan nimi puuttuu.');
    END IF;

    -- Haetaan ilmoittautuminen normalisoidulla nimellä
    SELECT s.*, i.organization_id AS org_id, t.item_id AS task_item_id, t.organization_id AS task_org_id INTO v_signup
    FROM public.board_task_signups s
    JOIN public.board_tasks t ON t.id = s.task_id
    JOIN public.board_items i ON i.id = s.item_id
    WHERE s.task_id = p_task_id
      AND pg_catalog.lower(pg_catalog.btrim(s.participant_name)) = pg_catalog.lower(pg_catalog.btrim(p_participant_name))
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ilmoittautumista ei löydy.');
    END IF;

    -- NULL-turvallinen organisaatioiden ja kohteiden vastaavuustarkistus
    IF v_signup.organization_id IS DISTINCT FROM v_signup.org_id 
       OR v_signup.organization_id IS DISTINCT FROM v_signup.task_org_id
       OR v_signup.item_id IS DISTINCT FROM v_signup.task_item_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tietokannan eheysvirhe: Ilmoittautumisen, tehtävän ja pääkohteen organisaatiotunnus tai kohde on ristiriidassa.');
    END IF;

    -- 1. Tarkistetaan onko kutsujalla voimassaoleva organisaation ylläpitoistunto
    IF p_session_token IS NOT NULL AND pg_catalog.btrim(p_session_token) <> '' THEN
        v_token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex');
        IF public._verify_org_session_internal(v_token_hash, v_signup.organization_id) IS NOT NULL THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    -- 2. Tarkistetaan täsmääkö ilmoittautujan oma salaisuus
    IF p_signup_secret IS NOT NULL AND pg_catalog.btrim(p_signup_secret) <> '' THEN
        v_secret_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_signup_secret), 'sha256'), 'hex');
        IF v_signup.cancellation_secret_hash IS NOT NULL AND v_signup.cancellation_secret_hash = v_secret_hash THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    -- Jos kumpikaan ei täsmää, hylätään peruminen turvallisesti
    IF NOT v_is_admin THEN
        IF v_signup.cancellation_secret_hash IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Aiemmin luodulla ilmoittautumisella ei ole perumistunnistetta. Peruminen vaatii ylläpitäjän koodin.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Peruminen epäonnistui: puuttuva tai virheellinen perumistunniste.'
        );
    END IF;

    DELETE FROM public.board_task_signups WHERE id = v_signup.id;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 3.3 Kommentointi: pituusrajat, tilan lukitus ja atominen rinnakkaisuussuojaus (advisory lock)
CREATE OR REPLACE FUNCTION public.post_board_comment(
    p_item_id        UUID,
    p_author_name    TEXT,
    p_content        TEXT,
    p_session_token  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item            RECORD;
    v_clean_author    TEXT;
    v_clean_content   TEXT;
    v_token_hash      TEXT;
    v_is_admin        BOOLEAN := FALSE;
    v_recent_count    INT;
    v_last_comment_at TIMESTAMPTZ;
BEGIN
    -- 1. Tarkistetaan kohdeasia ja lukitaan rivi FOR SHARE (estää samanaikaisen arkistoinnin)
    SELECT id, organization_id, stage INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei löydy.');
    END IF;

    IF v_item.stage IS NULL OR v_item.stage IN ('done', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Valmistunutta, arkistoitua tai virheellisessä tilassa olevaa asiaa ei voi enää kommentoida.');
    END IF;

    -- 2. Tarkistetaan valinnainen ylläpitoistunto
    IF p_session_token IS NOT NULL AND pg_catalog.btrim(p_session_token) <> '' THEN
        v_token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex');
        IF public._verify_org_session_internal(v_token_hash, v_item.organization_id) IS NOT NULL THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    -- 3. Syötteiden sanitaatio ja pituusrajat
    v_clean_content := pg_catalog.btrim(COALESCE(p_content, ''));
    IF pg_catalog.length(v_clean_content) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kommentti on liian lyhyt (vähintään 2 merkkiä).');
    END IF;

    IF pg_catalog.length(v_clean_content) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kommentti ylittää sallitun enimmäispituuden (1000 merkkiä).');
    END IF;

    v_clean_author := pg_catalog.substr(pg_catalog.btrim(COALESCE(p_author_name, 'Osallistuja')), 1, 100);
    IF pg_catalog.length(v_clean_author) < 1 THEN
        v_clean_author := 'Osallistuja';
    END IF;

    -- 4. Väärinkäytön torjunta ja atominen rinnakkaislukitus (Advisory Xact Lock)
    IF NOT v_is_admin THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtext(p_item_id::text),
            pg_catalog.hashtext(pg_catalog.lower(v_clean_author))
        );

        -- a) Suoja-aika: vähintään 10 sekuntia saman nimimerkin kommenteille kohteessa
        SELECT MAX(created_at) INTO v_last_comment_at
        FROM public.board_comments
        WHERE item_id = p_item_id
          AND pg_catalog.lower(author_name) = pg_catalog.lower(v_clean_author);

        IF v_last_comment_at IS NOT NULL AND v_last_comment_at > (now() - INTERVAL '10 seconds') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Odota hetki ennen uuden kommentin lähettämistä (10 s suoja-aika).');
        END IF;

        -- b) Duplikaattisuoja: täsmälleen samaa viestiä ei sallita kohteessa 5 minuutin sisällä
        IF EXISTS (
            SELECT 1 FROM public.board_comments
            WHERE item_id = p_item_id
              AND content = v_clean_content
              AND created_at > (now() - INTERVAL '5 minutes')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Sama kommentti on jo lähetetty äskettäin.');
        END IF;

        -- c) Määrärajoitus: enintään 10 kommenttia / 10 minuuttia samalta nimimerkiltä kohteessa
        SELECT COUNT(*) INTO v_recent_count
        FROM public.board_comments
        WHERE item_id = p_item_id
          AND pg_catalog.lower(author_name) = pg_catalog.lower(v_clean_author)
          AND created_at > (now() - INTERVAL '10 minutes');

        IF v_recent_count >= 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Kommenttikiintiö täynnä tältä nimimerkiltä (enintään 10 kommenttia 10 minuutissa).');
        END IF;
    END IF;

    -- 5. Tallennetaan kommentti
    INSERT INTO public.board_comments (
        item_id, organization_id, author_name, content
    ) VALUES (
        p_item_id, v_item.organization_id, v_clean_author, v_clean_content
    );

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 3.4 Seinälle julkaiseminen: organisaation suojaus, alkuperän eheys ja näkyvyyden säilytys
CREATE OR REPLACE FUNCTION public.publish_board_item_to_wall(
    p_session_token TEXT,
    p_item_id       UUID,
    p_wall_title    TEXT,
    p_wall_content  TEXT,
    p_target_type   TEXT DEFAULT 'event',
    p_force_relink  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_token_hash     TEXT;
    v_item           RECORD;
    v_session        public.org_publisher_sessions;
    v_post_id        UUID;
    v_existing_post  RECORD;
    v_clean_title    TEXT;
    v_clean_content  TEXT;
    v_valid_types    TEXT[] := ARRAY['event', 'announcement', 'news', 'project', 'request'];
BEGIN
    -- 1. Syötevalidointi
    v_clean_title := pg_catalog.substr(pg_catalog.btrim(COALESCE(p_wall_title, '')), 1, 255);
    IF pg_catalog.length(v_clean_title) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Otsikko on liian lyhyt (vähintään 3 merkkiä).');
    END IF;

    v_clean_content := pg_catalog.btrim(COALESCE(p_wall_content, ''));
    IF pg_catalog.length(v_clean_content) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sisältö on liian lyhyt (vähintään 5 merkkiä).');
    END IF;

    IF pg_catalog.length(v_clean_content) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sisältö ylittää sallitun enimmäispituuden (10000 merkkiä).');
    END IF;

    -- Eksplisiittinen NULL- ja tyyppivalidointi
    IF p_target_type IS NULL OR NOT (p_target_type = ANY(v_valid_types)) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Virheellinen tai puuttuva julkaisutyyppi. Sallitut tyypit ovat: event, announcement, news, project, request.'
        );
    END IF;

    -- 2. Lukitaan toimintataulun asia transaktion ajaksi (FOR UPDATE estää kilpatilanteet)
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Toimintataulun kohdetta ei löydy.');
    END IF;

    -- NULL-turvallinen suljetun tilan tarkistus
    IF v_item.stage IS NULL OR v_item.stage IN ('done', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Suljettua, arkistoitua tai virheellisessä tilassa olevaa asiaa ei voi julkaista Seinälle.');
    END IF;

    -- 3. Tarkistetaan organisaation julkaisuistunto
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisu vaatii aktiivisen istunnon.');
    END IF;

    v_token_hash := pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex');
    v_session := public._verify_org_session_internal(v_token_hash, v_item.organization_id);

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istunto ei ole voimassa tai organisaation julkaisuoikeus on estetty.');
    END IF;

    -- 4. Täydellinen tilakone ja postauksen alkuperän eheystarkistus
    -- Tila A: Viite olemassa (wall_post_id asetettu)
    IF v_item.wall_post_id IS NOT NULL THEN
        -- Haetaan postaus ID:llä ILMAN organisaatiosuodatusta, jotta tunnistetaan
        -- kuuluuko postaus toiselle organisaatiolle sen sijaan että se näyttäytyisi puuttuvana
        SELECT id, organization_id, target_id, target_type, status, visibility INTO v_existing_post
        FROM public.posts
        WHERE id = v_item.wall_post_id
        FOR UPDATE;

        IF FOUND THEN
            -- a) Organisaation tarkistus: Jos postaus kuuluu toiselle organisaatiolle, toiminto hylätään AINA (NULL-turvallinen)
            IF v_existing_post.organization_id IS DISTINCT FROM v_item.organization_id THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Luvaton julkaisuviite: viitattu postaus (ID: ' || v_item.wall_post_id::text || ') kuuluu toiselle organisaatiolle. Toiminto estetty.'
                );
            END IF;

            -- b) Alkuperän ristiriita toiseen toimintataulun kohteeseen:
            IF v_existing_post.target_id IS NOT NULL AND v_existing_post.target_id <> p_item_id::text THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Ristiriitainen julkaisuviite: postaus kuuluu toiselle kohteelle (ID: ' || v_existing_post.target_id || '). Ristiriitaa ei voi korjata relinkillä.'
                );
            END IF;

            -- c) Ristiriitainen kohdetyyppi (postaus kuuluu muulle kuin board_item-kohteelle):
            IF v_existing_post.target_type IS NOT NULL AND v_existing_post.target_type <> 'board_item' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Ristiriitainen julkaisuviite: postauksen kohdetyyppi on "' || v_existing_post.target_type || '" (odotettu: "board_item"). Toiminto hylätty.'
                );
            END IF;

            -- d) Historiallinen tai puutteellisesti leimattu postaus saman organisaation alla (target_id tai target_type on NULL):
            IF (v_existing_post.target_id IS NULL OR v_existing_post.target_type IS NULL) AND NOT p_force_relink THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Julkaisuviite vaatii vahvistuksen: kohdepostaukselta puuttuu toimintataulun kytkentä (target_id tai target_type on tyhjä). Vahvista linkitys kohteeseen (p_force_relink = true).'
                );
            END IF;

            -- e) Tarkistetaan onko postaus erikseen piilotettu tai luonnostilassa Seinällä:
            IF (v_existing_post.status IS DISTINCT FROM 'published' OR v_existing_post.visibility IS DISTINCT FROM 'public') AND NOT p_force_relink THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Postaus on Seinällä piilotettu tai luonnostilassa (status: ' || COALESCE(v_existing_post.status, 'NULL') || ', visibility: ' || COALESCE(v_existing_post.visibility, 'NULL') || '). Sisällön päivitys ei muuta näkyvyyttä automaattisesti. Jos haluat palauttaa sen julkiseksi, vahvista uudelleenjulkaisu (p_force_relink = true).'
                );
            END IF;

            -- f) Epäjohdonmukaisuus: is_published_to_wall = FALSE, mutta postausviite on olemassa ja kuuluu tähän kohteeseen:
            IF NOT COALESCE(v_item.is_published_to_wall, FALSE) AND NOT p_force_relink THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Epäjohdonmukainen tila: asiaa ei ole merkitty julkaistuksi, mutta siihen liittyy aiempi postaus (ID: ' || v_item.wall_post_id::text || '). Vahvista uudelleenjulkaisu (p_force_relink = true).'
                );
            END IF;

            -- g) Vahvistettu tai normaali päivitys: päivitetään olemassa oleva postaus ja varmistetaan status/visibility
            UPDATE public.posts
            SET title = v_clean_title,
                content = v_clean_content,
                type = p_target_type,
                target_id = p_item_id::text,
                target_type = 'board_item',
                status = 'published',
                visibility = 'public',
                event_start_at = v_item.deadline_at,
                updated_at = now()
            WHERE id = v_existing_post.id;

            UPDATE public.board_items
            SET is_published_to_wall = TRUE,
                updated_at = now()
            WHERE id = p_item_id;

            RETURN jsonb_build_object(
                'success', true,
                'wall_post_id', v_existing_post.id,
                'action', CASE WHEN COALESCE(v_item.is_published_to_wall, FALSE) THEN 'updated' ELSE 'relinked_and_updated' END
            );
        ELSE
            -- A3: wall_post_id osoittaa puuttuvaan postaukseen (rikkoutunut linkki)
            IF NOT p_force_relink THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Rikkoutunut julkaisulinkki: kohteessa on viite poistettuun postaukseen (ID: ' || v_item.wall_post_id::text || '). Vahvista uuden julkaisun luonti (p_force_relink = true).'
                );
            END IF;
        END IF;

    -- Tila B: wall_post_id ON NULL, mutta is_published_to_wall ON TRUE (epäjohdonmukainen tila)
    ELSIF COALESCE(v_item.is_published_to_wall, FALSE) THEN
        IF NOT p_force_relink THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Epäjohdonmukainen tila: asia on merkitty julkaistuksi, mutta postausviite puuttuu. Vahvista uuden julkaisun luonti (p_force_relink = true).'
            );
        END IF;
    END IF;

    -- 5. Uuden postauksen luonti (Tila C: Normaali ensimmäinen julkaisu TAI p_force_relink-vahvistettu korjaus rikkoutuneelle viitteelle)
    INSERT INTO public.posts (
        organization_id,
        title,
        content,
        type,
        visibility,
        status,
        event_start_at,
        target_id,
        target_type
    ) VALUES (
        v_item.organization_id,
        v_clean_title,
        v_clean_content,
        p_target_type,
        'public',
        'published',
        v_item.deadline_at,
        p_item_id::text,
        'board_item'
    )
    RETURNING id INTO v_post_id;

    -- Linkitetään syntynyt postaus toimintataulun asiaan
    UPDATE public.board_items
    SET is_published_to_wall = TRUE,
        wall_post_id = v_post_id,
        updated_at = now()
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'wall_post_id', v_post_id,
        'action', 'created'
    );
END;
$$;

-- =============================================================================
-- 4. KÄYTTÖOIKEUDET & REVOKE PUBLIC
-- =============================================================================

-- Poistetaan oletusoikeudet PUBLIC-roolilta ennen eksplisiittisiä myöntöjä
REVOKE ALL ON FUNCTION public.signup_board_task(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_board_task_signup(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_board_comment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;

-- Myönnetään täsmälliset suoritusoikeudet
GRANT EXECUTE ON FUNCTION public.signup_board_task(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_board_task_signup(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_board_comment(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated, service_role;

COMMIT;
