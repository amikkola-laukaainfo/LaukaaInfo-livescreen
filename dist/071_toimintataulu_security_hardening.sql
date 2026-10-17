-- =============================================================================
-- 071_toimintataulu_security_hardening.sql
-- LaukaaInfo – Päätös- ja toimintataulun tietoturvan ja eheyden kovennus
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Korjaukset:
--   1. Ilmoittautumisen peruminen: lisätään cancellation_secret_hash. Peruminen
--      onnistuu vain luodulla salaisuudella TAI validilla ylläpitoistunnolla.
--   2. Seinä-julkaisu: transaktiolukitus (FOR UPDATE), idempotenssi ja
--      organisaatiotarkistus (ei koskaan muokata toisen organisaation postausta).
--   3. Kommentointi: tiukka pituustarkistus (2-1000 merkkiä), tekijä (1-100 merkkiä),
--      arkistoitujen asioiden kommentointikielto.
--   4. RLS & Search path kovennus: SET search_path = '' kaikissa funktioissa.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. SARAKEMUUTOKSET
-- =============================================================================

-- Lisätään perumissalaisuuden SHA-256-tiiviste
ALTER TABLE public.board_task_signups
ADD COLUMN IF NOT EXISTS cancellation_secret_hash TEXT;

-- =============================================================================
-- 2. KOVENNETUT RPC-FUNKTIOT
-- =============================================================================

-- 2.1 Ilmoittautuminen vapaaehtoistehtävään (palauttaa kertaluonteisen salaisuuden)
CREATE OR REPLACE FUNCTION public.signup_board_task(
    p_task_id          UUID,
    p_participant_name TEXT,
    p_contact          TEXT DEFAULT NULL,
    p_role             TEXT DEFAULT 'participant'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task          RECORD;
    v_clean_name    TEXT;
    v_clean_contact TEXT;
    v_secret_raw    TEXT;
    v_secret_hash   TEXT;
BEGIN
    -- 1. Syötevalidointi
    v_clean_name := SUBSTRING(TRIM(COALESCE(p_participant_name, '')) FROM 1 FOR 100);
    IF LENGTH(v_clean_name) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nimen tulee olla vähintään 2 merkkiä.');
    END IF;

    v_clean_contact := SUBSTRING(TRIM(COALESCE(p_contact, '')) FROM 1 FOR 150);

    IF p_role NOT IN ('interested', 'participant', 'lead') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen roolityyppi.');
    END IF;

    -- 2. Tehtävän ja asian tarkistus transaktiolukituksella
    SELECT t.id, t.item_id, t.organization_id, i.stage INTO v_task
    FROM public.board_tasks t
    JOIN public.board_items i ON i.id = t.item_id
    WHERE t.id = p_task_id
    FOR SHARE OF t;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtävää ei löydy.');
    END IF;

    IF v_task.stage IN ('done', 'archived') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtävään ei voi enää ilmoittautua (asia on suljettu).');
    END IF;

    -- 3. Luodaan uniikki perumissalaisuus (16 satunnaistavua hex-muodossa)
    v_secret_raw  := extensions.encode(extensions.gen_random_bytes(16), 'hex');
    v_secret_hash := extensions.encode(extensions.digest(v_secret_raw, 'sha256'), 'hex');

    -- 4. Lisätään tai päivitetään ilmoittautuminen
    INSERT INTO public.board_task_signups (
        task_id, item_id, organization_id, participant_name, participant_contact, role_type, cancellation_secret_hash
    ) VALUES (
        p_task_id, v_task.item_id, v_task.organization_id, v_clean_name, v_clean_contact, p_role, v_secret_hash
    )
    ON CONFLICT (task_id, participant_name)
    DO UPDATE SET 
        participant_contact = COALESCE(EXCLUDED.participant_contact, public.board_task_signups.participant_contact),
        role_type = EXCLUDED.role_type,
        cancellation_secret_hash = EXCLUDED.cancellation_secret_hash,
        created_at = now();

    -- Palautetaan salaisuus asiakkaalle paikalliseen tallennukseen
    RETURN jsonb_build_object(
        'success', true,
        'signup_secret', v_secret_raw
    );
END;
$$;


-- 2.2 Ilmoittautumisen turvallinen peruminen (vaatii salaisuuden TAI ylläpitoistunnon)
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
    IF p_participant_name IS NULL OR TRIM(p_participant_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Osallistujan nimi puuttuu.');
    END IF;

    SELECT s.*, i.organization_id AS org_id INTO v_signup
    FROM public.board_task_signups s
    JOIN public.board_items i ON i.id = s.item_id
    WHERE s.task_id = p_task_id
      AND LOWER(s.participant_name) = LOWER(TRIM(p_participant_name))
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ilmoittautumista ei löydy.');
    END IF;

    -- 1. Tarkistetaan onko kutsujalla voimassaoleva organisaation ylläpitoistunto
    IF p_session_token IS NOT NULL AND TRIM(p_session_token) <> '' THEN
        v_token_hash := extensions.encode(extensions.digest(TRIM(p_session_token), 'sha256'), 'hex');
        IF public._verify_org_session_internal(v_token_hash, v_signup.org_id) IS NOT NULL THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    -- 2. Tarkistetaan täsmääkö ilmoittautujan oma salaisuus
    IF p_signup_secret IS NOT NULL AND TRIM(p_signup_secret) <> '' THEN
        v_secret_hash := extensions.encode(extensions.digest(TRIM(p_signup_secret), 'sha256'), 'hex');
        IF v_signup.cancellation_secret_hash IS NOT NULL AND v_signup.cancellation_secret_hash = v_secret_hash THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    -- Jos kumpikaan ei täsmää, hylätään peruminen turvallisesti
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Peruminen epäonnistui: puuttuva tai virheellinen perumistunniste.'
        );
    END IF;

    DELETE FROM public.board_task_signups WHERE id = v_signup.id;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 2.3 Kommentointi: pituusrajat, sanitaatio ja tilatarkistus
CREATE OR REPLACE FUNCTION public.post_board_comment(
    p_item_id     UUID,
    p_author_name TEXT,
    p_content     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_item RECORD;
    v_clean_author TEXT;
    v_clean_content TEXT;
BEGIN
    -- 1. Tarkistetaan kohdeasia
    SELECT id, organization_id, stage INTO v_item
    FROM public.board_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei löydy.');
    END IF;

    IF v_item.stage = 'archived' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Arkistoitua asiaa ei voi enää kommentoida.');
    END IF;

    -- 2. Tiukka syöterajaus
    v_clean_content := TRIM(COALESCE(p_content, ''));
    IF LENGTH(v_clean_content) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kommentti on liian lyhyt (vähintään 2 merkkiä).');
    END IF;

    IF LENGTH(v_clean_content) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kommentti ylittää sallitun enimmäispituuden (1000 merkkiä).');
    END IF;

    v_clean_author := SUBSTRING(TRIM(COALESCE(p_author_name, 'Jäsen')) FROM 1 FOR 100);
    IF LENGTH(v_clean_author) < 1 THEN
        v_clean_author := 'Jäsen';
    END IF;

    INSERT INTO public.board_comments (
        item_id, organization_id, author_name, content
    ) VALUES (
        p_item_id, v_item.organization_id, v_clean_author, v_clean_content
    );

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 2.4 Seinälle julkaiseminen: transaktiolukitus, idempotenssi ja organisaatiosuoja
CREATE OR REPLACE FUNCTION public.publish_board_item_to_wall(
    p_session_token TEXT,
    p_item_id       UUID,
    p_wall_title    TEXT,
    p_wall_content  TEXT,
    p_target_type   TEXT DEFAULT 'event'
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
BEGIN
    -- 1. Syötevalidointi
    v_clean_title := SUBSTRING(TRIM(COALESCE(p_wall_title, '')) FROM 1 FOR 255);
    IF LENGTH(v_clean_title) < 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Otsikko on liian lyhyt (vähintään 3 merkkiä).');
    END IF;

    v_clean_content := TRIM(COALESCE(p_wall_content, ''));
    IF LENGTH(v_clean_content) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sisältö on liian lyhyt (vähintään 5 merkkiä).');
    END IF;

    -- 2. Lukitaan toimintataulun asia transaktion ajaksi (FOR UPDATE estää kilpatilanteet)
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Toimintataulun kohdetta ei löydy.');
    END IF;

    -- 3. Tarkistetaan organisaation julkaisuistunto
    IF p_session_token IS NULL OR TRIM(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisu vaatii aktiivisen istunnon.');
    END IF;

    v_token_hash := extensions.encode(extensions.digest(TRIM(p_session_token), 'sha256'), 'hex');
    v_session := public._verify_org_session_internal(v_token_hash, v_item.organization_id);

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istunto ei ole voimassa tai organisaation julkaisuoikeus on estetty.');
    END IF;

    -- 4. Idempotentti käsittely: Tarkistetaan onko olemassa oleva julkaisu aito ja kuuluuko samaan organisaatioon
    IF v_item.is_published_to_wall AND v_item.wall_post_id IS NOT NULL THEN
        SELECT id, organization_id INTO v_existing_post
        FROM public.posts
        WHERE id = v_item.wall_post_id
          AND organization_id = v_item.organization_id
        FOR UPDATE;

        IF FOUND THEN
            -- Päivitetään aiempi julkaisu (estää tuplajulkaisut samanaikaisissa pyynnöissä)
            UPDATE public.posts
            SET title = v_clean_title,
                content = v_clean_content,
                updated_at = now()
            WHERE id = v_existing_post.id;

            RETURN jsonb_build_object(
                'success', true,
                'wall_post_id', v_existing_post.id,
                'action', 'updated'
            );
        END IF;
    END IF;

    -- 5. Ensimmäinen julkaisu: Luodaan uusi postaus
    INSERT INTO public.posts (
        organization_id,
        title,
        content,
        type,
        visibility,
        status,
        event_start_at
    ) VALUES (
        v_item.organization_id,
        v_clean_title,
        v_clean_content,
        p_target_type,
        'public',
        'published',
        v_item.deadline_at
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

-- Myönnetään suoritusoikeudet
GRANT EXECUTE ON FUNCTION public.signup_board_task(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_board_task_signup(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_board_comment(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

COMMIT;
