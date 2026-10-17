-- =============================================================================
-- 073_board_task_governance.sql
-- LaukaaInfo – Toimintataulun hallintafunktioiden käyttöoikeuskovennus
-- =============================================================================
-- TILA: HYVÄKSYNTÄTESTATTU JA VALMIS TUOTANTOON (v1.1.0)
--       Kaikki 10 hyväksyntätestiä läpäisty hyväksytysti (073_precheck_and_test.sql)
--
-- Tavoite:
--   Kytketään 071-migraation publish_board_item_to_wall-funktio
--   _verify_member_governance_permission-tarkistukseen ('manage_content').
--   Muut 071:n toiminnot (signup, cancel, comment) pysyvät ennallaan.
--
-- Muutokset 071-migraatioon nähden:
--   publish_board_item_to_wall:
--     ENNEN: _verify_org_session_internal (sallii legacy_org_pin)
--     JÄLKEEN: _verify_member_governance_permission('manage_content')
--              (vaatii personal_role_code-istunnon + voimassaolevan hallintoroolin:
--               board_chair, board_member tai secretary)
--
-- Lukitusjärjestys (deadlock-turvallinen):
--   1. Ensin kohteen organisaatiotunnisteen haku ilman rivin lukitusta
--   2. Advisory xact lock (namespace 1936028780, hash(organization_id))
--   3. board_items FOR UPDATE
--   4. Varmistus ettei kohteen organisaatio muuttunut lukitusten välillä
--   5. _verify_member_governance_permission('manage_content', p_item_id)
--   6. Kohteen stage-tilan tarkistus (vasta oikeustarkistuksen jälkeen)
--   7. posts FOR UPDATE (jos wall_post_id asetettu)
--
-- Audit-kirjaukset:
--   - ITEM_PUBLISHED: uusi julkaisu Seinälle
--   - ITEM_REPUBLISHED: olemassa olevan postauksen päivitys / relink
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PÄIVITETTY _verify_member_governance_permission (manage_content + secretary)
-- =============================================================================

CREATE OR REPLACE FUNCTION public._verify_member_governance_permission(
    p_token_hash      TEXT,
    p_organization_id TEXT,
    p_action          TEXT,
    p_target_item_id  UUID DEFAULT NULL
)
RETURNS TABLE (
    out_member_id       UUID,
    out_member_name     TEXT,
    out_authorized_role TEXT,
    out_organization_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session        public.org_publisher_sessions;
    v_cred           public.organization_role_credentials;
    v_member         public.organization_members;
    v_role           public.organization_role_assignments;
    v_is_ok          BOOLEAN := FALSE;
    v_lock_namespace CONSTANT INT := 1936028780;
BEGIN
    -- 1. HIERARKIATASO 1: Organisaation transaktiolukko (Advisory lock)
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_namespace, pg_catalog.hashtext(p_organization_id));

    -- 2. HIERARKIATASO 2: Organisaatiorivin lukitus
    PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

    -- Haetaan alustavasti istuntorivi jäsen- ja kooditunnisteiden selvittämiseksi
    SELECT * INTO v_session
    FROM public.org_publisher_sessions
    WHERE token_hash = p_token_hash
      AND organization_id = p_organization_id
      AND revoked_at IS NULL
      AND expires_at > now();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istunto ei ole voimassa tai organisaatiotunnus on virheellinen.';
    END IF;

    IF v_session.session_type IS DISTINCT FROM 'personal_role_code' OR v_session.member_id IS NULL THEN
        RAISE EXCEPTION 'Toiminto vaatii todennetun henkilökohtaisen roolin (organisaation yleinen julkaisukoodi ei riitä hallintoon).';
    END IF;

    IF v_session.role_credential_id IS NULL THEN
        RAISE EXCEPTION 'Henkilökohtaisella istunnolla on oltava valtuuskoodi (role_credential_id puuttuu).';
    END IF;

    -- 3. HIERARKIATASO 3: Jäsenen lukitus FOR UPDATE
    SELECT * INTO v_member
    FROM public.organization_members
    WHERE id = v_session.member_id
      AND organization_id = p_organization_id
      AND is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Henkilö ei ole enää aktiivinen tässä organisaatiossa.';
    END IF;

    -- 4. HIERARKIATASO 4: Roolin lukitus FOR UPDATE
    IF p_target_item_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.board_items
            WHERE id = p_target_item_id AND organization_id = p_organization_id
        ) THEN
            RAISE EXCEPTION 'Kohde ei kuulu tähän organisaatioon tai kohdetta ei löydy.';
        END IF;
    END IF;

    IF p_action = 'manage_tasks' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND (
              role_type IN ('board_chair', 'board_member', 'secretary')
              OR (role_type IN ('coordinator', 'lead')
                  AND scope_item_id IS NOT NULL
                  AND scope_item_id = p_target_item_id)
          )
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 WHEN 'board_member' THEN 2 ELSE 3 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'change_stage' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND (
              role_type IN ('board_chair', 'board_member', 'secretary')
              OR (role_type = 'coordinator'
                  AND scope_item_id IS NOT NULL
                  AND scope_item_id = p_target_item_id)
          )
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 ELSE 2 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'record_decision' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type IN ('board_chair', 'board_member', 'secretary')
        ORDER BY CASE role_type WHEN 'board_chair' THEN 1 ELSE 2 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action IN ('manage_content', 'publish_wall') THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type IN ('board_chair', 'board_member', 'secretary')
        ORDER BY CASE role_type 
            WHEN 'board_chair' THEN 1 
            WHEN 'board_member' THEN 2 
            WHEN 'secretary' THEN 3 
            ELSE 4 END
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;

    ELSIF p_action = 'manage_governance' THEN
        SELECT * INTO v_role
        FROM public.organization_role_assignments
        WHERE member_id = v_member.id
          AND organization_id = p_organization_id
          AND is_active IS TRUE
          AND valid_from <= now()
          AND (valid_until IS NULL OR valid_until > now())
          AND role_type = 'board_chair'
        LIMIT 1
        FOR UPDATE;
        IF FOUND THEN v_is_ok := TRUE; END IF;
    END IF;

    IF NOT v_is_ok THEN
        RAISE EXCEPTION 'Käyttöoikeus evätty toimintoon "%". Henkilöllä ei ole vaadittavaa voimassaolevaa toimivaltaa.', p_action;
    END IF;

    -- 5. HIERARKIATASO 5: Valtuuskoodin lukitus FOR UPDATE
    SELECT * INTO v_cred
    FROM public.organization_role_credentials
    WHERE id = v_session.role_credential_id
      AND organization_id = p_organization_id
      AND member_id = v_session.member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istunnon valtuuskoodi ei kuulu tähän organisaatioon tai jäseneen.';
    END IF;

    IF v_cred.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Käytetty henkilökohtainen valtuuskoodi on peruutettu.';
    END IF;

    -- 6. HIERARKIATASO 6: Istunnon lukitus FOR UPDATE ja KAKSOISVARMENNUS
    SELECT * INTO v_session
    FROM public.org_publisher_sessions
    WHERE id = v_session.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Istuntoa ei enää löydy.';
    END IF;

    IF v_session.token_hash IS DISTINCT FROM p_token_hash
       OR v_session.organization_id IS DISTINCT FROM p_organization_id
       OR v_session.session_type IS DISTINCT FROM 'personal_role_code'
       OR v_session.member_id IS DISTINCT FROM v_member.id
       OR v_session.role_credential_id IS DISTINCT FROM v_cred.id
       OR v_session.revoked_at IS NOT NULL
       OR v_session.expires_at IS NULL
       OR v_session.expires_at <= now() THEN
        RAISE EXCEPTION 'Istunto ei ole enää voimassa tai sen sidokset ovat muuttuneet.';
    END IF;

    UPDATE public.org_publisher_sessions
    SET last_used_at = now()
    WHERE id = v_session.id;

    out_member_id       := v_member.id;
    out_member_name     := v_member.full_name;
    out_authorized_role := v_role.role_type;
    out_organization_id := p_organization_id;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_member_governance_permission(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_member_governance_permission(TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 2. PÄIVITETTY publish_board_item_to_wall
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_board_item_to_wall(
    p_session_token TEXT,
    p_item_id       UUID,
    p_wall_title    TEXT,
    p_wall_content  TEXT,
    p_target_type   TEXT    DEFAULT 'event',
    p_force_relink  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_namespace CONSTANT INT := 1936028780;

    v_token_hash     TEXT;
    v_item_org_id    TEXT;
    v_caller         RECORD;
    v_item           RECORD;
    v_post_id        UUID;
    v_existing_post  RECORD;
    v_clean_title    TEXT;
    v_clean_content  TEXT;
    v_valid_types    CONSTANT TEXT[] :=
        ARRAY['event', 'announcement', 'news', 'project', 'request'];
BEGIN
    -- ------------------------------------------------------------------
    -- 1. SYÖTEVALIDOINTI (ennen lukitusta — nopea hylkäys)
    -- ------------------------------------------------------------------
    IF p_session_token IS NULL OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Julkaisu vaatii aktiivisen istunnon.');
    END IF;

    IF p_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Toimintataulun kohteen tunniste (p_item_id) vaaditaan.');
    END IF;

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

    IF p_target_type IS NULL OR NOT (p_target_type = ANY(v_valid_types)) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Virheellinen tai puuttuva julkaisutyyppi. Sallitut tyypit ovat: event, announcement, news, project, request.'
        );
    END IF;

    -- ------------------------------------------------------------------
    -- 2. DEADLOCK-TURVALLINEN LUKITUSJÄRJESTYS
    -- ------------------------------------------------------------------
    -- a) Haetaan ensin kohteen organisaatiotunniste ilman rivin lukitusta
    SELECT organization_id::TEXT
    INTO v_item_org_id
    FROM public.board_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Toimintataulun kohdetta ei löydy.'
        );
    END IF;

    -- b) Organisaation yhteinen advisory-lukko ennen kohderivin lukitsemista
    PERFORM pg_catalog.pg_advisory_xact_lock(
        v_lock_namespace,
        pg_catalog.hashtext(v_item_org_id)
    );

    -- c) Haetaan ja lukitaan koko kohderivin tiedot
    SELECT *
    INTO v_item
    FROM public.board_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Toimintataulun kohdetta ei löydy.'
        );
    END IF;

    -- d) Varmistetaan, ettei kohteen organisaatio muuttunut lukitusten välillä
    IF v_item.organization_id::TEXT IS DISTINCT FROM v_item_org_id THEN
        RAISE EXCEPTION 'Toimintataulun kohteen organisaatio muuttui käsittelyn aikana.';
    END IF;

    -- ------------------------------------------------------------------
    -- 3. KÄYTTÖOIKEUSTARKISTUS (kaksoisvarmennettu rooli-istunto)
    -- ------------------------------------------------------------------
    v_token_hash := pg_catalog.encode(
        extensions.digest(pg_catalog.btrim(p_session_token), 'sha256'), 'hex'
    );

    -- Vaatii personal_role_code-istunnon ja manage_content-toimivallan.
    -- Oikeutettuja rooleja ovat: board_chair, board_member ja secretary.
    -- Jos istunto ei kelpaa tai oikeus puuttuu, funktio heittää EXCEPTION.
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        v_item.organization_id::TEXT,
        'manage_content',
        p_item_id
    );

    -- ------------------------------------------------------------------
    -- 4. KOHTEEN TILATARKISTUS (vasta onnistuneen käyttöoikeustarkistuksen jälkeen)
    -- ------------------------------------------------------------------
    IF v_item.stage IS NULL OR v_item.stage IN ('done', 'archived') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Suljettua, arkistoitua tai virheellisessä tilassa olevaa asiaa ei voi julkaista Seinälle.'
        );
    END IF;

    -- ------------------------------------------------------------------
    -- 5. TILAKONE JA POSTAUKSEN ALKUPERÄN EHEYSTARKISTUS
    -- ------------------------------------------------------------------

    -- Tila A: Viite olemassa (wall_post_id asetettu)
    IF v_item.wall_post_id IS NOT NULL THEN
        SELECT id, organization_id, target_id, target_type, type, status, visibility
        INTO v_existing_post
        FROM public.posts
        WHERE id = v_item.wall_post_id
        FOR UPDATE;

        IF FOUND THEN
            -- a) Organisaation tarkistus: toiselle organisaatiolle kuuluva → estetään aina
            IF v_existing_post.organization_id IS DISTINCT FROM v_item.organization_id THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Luvaton julkaisuviite: viitattu postaus kuuluu toiselle organisaatiolle. Toiminto estetty.'
                );
            END IF;

            -- b) Kohteen ja kohdetyypin ristiriita:
            --    Hylätään vain olemassa olevat, mutta väärät viitteet.
            --    NULL-arvot käsitellään seuraavassa force_relink-tarkistuksessa.
            IF (
                v_existing_post.target_id IS NOT NULL
                AND v_existing_post.target_id IS DISTINCT FROM p_item_id::TEXT
            )
            OR (
                v_existing_post.target_type IS NOT NULL
                AND v_existing_post.target_type IS DISTINCT FROM 'board_item'
            ) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Ristiriitainen julkaisuviite: postaus kuuluu toiselle kohteelle tai eri kohdetyypille. Ristiriitaa ei voi korjata relinkillä.'
                );
            END IF;

            -- c) Puutteelliset viitteet, piilotettu/luonnostila tai synkronointiero:
            --    Vaatii p_force_relink = TRUE palauttamiseksi.
            IF v_existing_post.target_id IS NULL
               OR v_existing_post.target_type IS NULL
               OR v_existing_post.status IS DISTINCT FROM 'published'
               OR v_existing_post.visibility IS DISTINCT FROM 'public'
               OR NOT COALESCE(v_item.is_published_to_wall, FALSE) THEN

                IF NOT COALESCE(p_force_relink, FALSE) THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Postaus on piilotettu, luonnos tai sen viitteet ovat puutteelliset. Käytä p_force_relink=true palauttaaksesi se.',
                        'requires_force_relink', true
                    );
                END IF;

                -- p_force_relink=true → päivitetään postauksen tiedot ja palautetaan julkiseksi
                UPDATE public.posts
                SET title          = v_clean_title,
                    content        = v_clean_content,
                    type           = p_target_type,
                    target_id      = p_item_id::TEXT,
                    target_type    = 'board_item',
                    status         = 'published',
                    visibility     = 'public',
                    event_start_at = v_item.deadline_at,
                    updated_at     = now()
                WHERE id = v_existing_post.id;

                UPDATE public.board_items
                SET is_published_to_wall = TRUE,
                    updated_at           = now()
                WHERE id = p_item_id;

                INSERT INTO public.organization_governance_audit (
                    organization_id, actor_member_id, actor_name, actor_role,
                    action, target_type, target_id, details
                ) VALUES (
                    v_item.organization_id,
                    v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
                    'ITEM_REPUBLISHED', 'board_item', p_item_id::TEXT,
                    jsonb_build_object(
                        'post_id',      v_existing_post.id,
                        'post_type',    p_target_type,
                        'force_relink', true,
                        'title',        v_clean_title
                    )
                );

                RETURN jsonb_build_object(
                    'success',      true,
                    'action',       'republished',
                    'wall_post_id', v_existing_post.id,
                    'post_id',      v_existing_post.id
                );
            END IF;

            -- d) Normaali uudelleenjulkaisu (tila ja viitteet kunnossa)
            UPDATE public.posts
            SET title          = v_clean_title,
                content        = v_clean_content,
                type           = p_target_type,
                event_start_at = v_item.deadline_at,
                updated_at     = now()
            WHERE id = v_existing_post.id;

            UPDATE public.board_items
            SET is_published_to_wall = TRUE,
                updated_at           = now()
            WHERE id = p_item_id;

            INSERT INTO public.organization_governance_audit (
                organization_id, actor_member_id, actor_name, actor_role,
                action, target_type, target_id, details
            ) VALUES (
                v_item.organization_id,
                v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
                'ITEM_REPUBLISHED', 'board_item', p_item_id::TEXT,
                jsonb_build_object(
                    'post_id',      v_existing_post.id,
                    'post_type',    p_target_type,
                    'force_relink', false,
                    'title',        v_clean_title
                )
            );

            RETURN jsonb_build_object(
                'success',      true,
                'action',       'updated',
                'wall_post_id', v_existing_post.id,
                'post_id',      v_existing_post.id
            );

        ELSE
            -- e) wall_post_id asetettu mutta postaus poistettu kannasta → vaatii p_force_relink
            IF NOT COALESCE(p_force_relink, FALSE) THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Julkaisuviite osoittaa poistettuun postaukseen. Käytä p_force_relink=true luodaksesi uuden postauksen.',
                    'requires_force_relink', true
                );
            END IF;
            -- p_force_relink=true → nollataan vanha viite ja luodaan uusi postaus
            UPDATE public.board_items SET wall_post_id = NULL WHERE id = p_item_id;
            v_item.wall_post_id := NULL;
        END IF;

    -- Tila B: wall_post_id ON NULL, mutta is_published_to_wall ON TRUE (epäjohdonmukainen tila)
    ELSIF COALESCE(v_item.is_published_to_wall, FALSE) THEN
        IF NOT COALESCE(p_force_relink, FALSE) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Epäjohdonmukainen tila: asia on merkitty julkaistuksi, mutta postausviite puuttuu. Vahvista uuden julkaisun luonti (p_force_relink = true).',
                'requires_force_relink', true
            );
        END IF;
    END IF;

    -- ------------------------------------------------------------------
    -- 6. UUDEN POSTAUKSEN LUONTI (Tila C: ensijulkaisu tai korjauspolku)
    -- ------------------------------------------------------------------
    INSERT INTO public.posts (
        organization_id,
        title,
        content,
        type,
        target_id,
        target_type,
        status,
        visibility,
        event_start_at
    ) VALUES (
        v_item.organization_id,
        v_clean_title,
        v_clean_content,
        p_target_type,
        p_item_id::TEXT,
        'board_item',
        'published',
        'public',
        v_item.deadline_at
    ) RETURNING id INTO v_post_id;

    UPDATE public.board_items
    SET wall_post_id         = v_post_id,
        is_published_to_wall = TRUE,
        updated_at           = now()
    WHERE id = p_item_id;

    INSERT INTO public.organization_governance_audit (
        organization_id, actor_member_id, actor_name, actor_role,
        action, target_type, target_id, details
    ) VALUES (
        v_item.organization_id,
        v_caller.out_member_id, v_caller.out_member_name, v_caller.out_authorized_role,
        'ITEM_PUBLISHED', 'board_item', p_item_id::TEXT,
        jsonb_build_object(
            'post_id',   v_post_id,
            'post_type', p_target_type,
            'title',     v_clean_title
        )
    );

    RETURN jsonb_build_object(
        'success',      true,
        'action',       'published',
        'wall_post_id', v_post_id,
        'post_id',      v_post_id
    );

END;
$$;

-- =============================================================================
-- 2. KÄYTTÖOIKEUDET
-- =============================================================================

REVOKE ALL ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN)
    TO anon, authenticated, service_role;

-- =============================================================================
-- 3. KOMMENTTI
-- =============================================================================

COMMENT ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN) IS
$$Julkaisee toimintataulun asian Seinä-syötteeseen.
Vaatii voimassaolevan personal_role_code-istunnon ja manage_content-toimivallan:
board_chair, board_member tai secretary.
Legacy-julkaisukoodi (legacy_org_pin) ei riitä julkaisutoimintoon.
Audit-kirjaus: ITEM_PUBLISHED (uusi) tai ITEM_REPUBLISHED (päivitys).
v1.2.0 — 073-migraatio (korvaa 071:n version)$$;

COMMIT;
