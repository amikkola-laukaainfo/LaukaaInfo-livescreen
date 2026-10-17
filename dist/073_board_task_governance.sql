-- =============================================================================
-- 073_board_task_governance.sql
-- LaukaaInfo – Toimintataulun hallintafunktioiden käyttöoikeuskovennus
-- =============================================================================
-- TILA: HYVÄKSYNTÄTESTATTU JA VALMIS TUOTANTOON (v1.1.0)
--       Kaikki 10 hyväksyntätestiä läpäisty hyväksytysti (073_precheck_and_test.sql)
--
-- Tavoite:
--   Kytketään 071-migraation publish_board_item_to_wall-funktio
--   _verify_member_governance_permission-tarkistukseen ('publish_wall').
--   Muut 071:n toiminnot (signup, cancel, comment) pysyvät ennallaan.
--
-- Muutokset 071-migraatioon nähden:
--   publish_board_item_to_wall:
--     ENNEN: _verify_org_session_internal (sallii legacy_org_pin)
--     JÄLKEEN: _verify_member_governance_permission('publish_wall')
--              (vaatii personal_role_code-istunnon + voimassaolevan hallintoroolin:
--               board_chair tai board_member; 072-määrityksen mukaisesti)
--
-- Lukitusjärjestys (deadlock-turvallinen):
--   1. Ensin kohteen organisaatiotunnisteen haku ilman rivin lukitusta
--   2. Advisory xact lock (namespace 1936028780, hash(organization_id))
--   3. board_items FOR UPDATE
--   4. Varmistus ettei kohteen organisaatio muuttunut lukitusten välillä
--   5. _verify_member_governance_permission('publish_wall', p_item_id)
--   6. Kohteen stage-tilan tarkistus (vasta oikeustarkistuksen jälkeen)
--   7. posts FOR UPDATE (jos wall_post_id asetettu)
--
-- Audit-kirjaukset:
--   - ITEM_PUBLISHED: uusi julkaisu Seinälle
--   - ITEM_REPUBLISHED: olemassa olevan postauksen päivitys / relink
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PÄIVITETTY publish_board_item_to_wall
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

    -- Vaatii personal_role_code-istunnon ja publish_wall-toimivallan.
    -- 072-migraation mukaan oikeutettuja ovat board_chair ja board_member.
    -- Jos istunto ei kelpaa tai oikeus puuttuu, funktio heittää EXCEPTION.
    SELECT * INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        v_item.organization_id::TEXT,
        'publish_wall',
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
Vaatii voimassaolevan personal_role_code-istunnon ja publish_wall-toimivallan:
board_chair tai board_member (072-migraation mukaisesti).
Legacy-julkaisukoodi (legacy_org_pin) ei riitä julkaisutoimintoon.
Audit-kirjaus: ITEM_PUBLISHED (uusi) tai ITEM_REPUBLISHED (päivitys).
v1.1.0 — 073-migraatio (korvaa 071:n version)$$;

COMMIT;
