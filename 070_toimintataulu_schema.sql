-- =============================================================================
-- 070_toimintataulu_schema.sql
-- LaukaaInfo – Päätös- ja toimintataulun tietokantamalli ja RPC-rajapinta
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Tämä migraatio lisää LaukaaInfoon organisaatioiden päätös- ja toimintataulun:
--   1. board_items: ideat, ehdotukset, äänestykset, päätökset ja elinkaari
--   2. board_tasks: tapahtuma- ja järjestelytehtävät vapaaehtoistarpeineen
--   3. board_task_signups: ilmoittautumiset, roolit ja kapasiteettiseuranta
--   4. board_votes: mielipidekyselyt ja päätöksenteon äänet
--   5. board_comments: asioiden keskusteluketjut
--
-- Riippuvuudet:
--   - 065_org_sessions.sql (public.organizations, public.org_publisher_sessions)
--   - supabase_seina_migration.sql (public.posts)
-- =============================================================================

BEGIN;

-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Varmistetaan esimerkkiorganisaatio 'laukaan-yrittajat' kehitystä ja pilotointia varten
INSERT INTO public.organizations (id, name, type, wall_visibility, publisher_enabled)
VALUES ('laukaan-yrittajat', 'Laukaan Yrittäjät ry', 'association', 'public', true)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    publisher_enabled = true;

-- =============================================================================
-- 1. TAULUT
-- =============================================================================

-- 1.1 board_items: Taulun asiat ja niiden elinkaari
CREATE TABLE IF NOT EXISTS public.board_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    seq_num              INT NOT NULL DEFAULT 1,
    title                TEXT NOT NULL,
    description          TEXT,
    stage                TEXT NOT NULL DEFAULT 'idea'
                         CHECK (stage IN ('idea', 'discussion', 'vote', 'decided', 'in_progress', 'done', 'archived')),
    lead_name            TEXT,
    deadline_at          TIMESTAMPTZ,
    deadline_label       TEXT,
    decision_summary     TEXT,
    created_by_name      TEXT NOT NULL DEFAULT 'Yhdistyksen jäsen',
    is_published_to_wall BOOLEAN NOT NULL DEFAULT FALSE,
    wall_post_id         UUID REFERENCES public.posts(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 board_tasks: Asioihin kytketyt tehtävät ja talkootarpeet
CREATE TABLE IF NOT EXISTS public.board_tasks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id              UUID NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL,
    time_slot            TEXT,
    required_volunteers  INT NOT NULL DEFAULT 1 CHECK (required_volunteers > 0),
    sort_order           INT NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 board_task_signups: Vapaaehtoisten ja vastuuhenkilöiden ilmoittautumiset
CREATE TABLE IF NOT EXISTS public.board_task_signups (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id              UUID NOT NULL REFERENCES public.board_tasks(id) ON DELETE CASCADE,
    item_id              UUID NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    participant_name     TEXT NOT NULL,
    participant_contact  TEXT, -- näytetään vain ylläpitäjälle / vastuuhenkilölle
    role_type            TEXT NOT NULL DEFAULT 'participant'
                         CHECK (role_type IN ('interested', 'participant', 'lead')),
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (task_id, participant_name)
);

-- 1.4 board_votes: Mielipiteet ja äänestykset
CREATE TABLE IF NOT EXISTS public.board_votes (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id              UUID NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    voter_name           TEXT NOT NULL,
    voter_fingerprint    TEXT NOT NULL, -- selaimen/istunnon tunniste kaksoisäänestyksen estoon
    choice               TEXT NOT NULL CHECK (choice IN ('yes', 'no', 'cond')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, voter_fingerprint)
);

-- 1.5 board_comments: Valmistelukeskustelu ja kommenttiketjut
CREATE TABLE IF NOT EXISTS public.board_comments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id              UUID NOT NULL REFERENCES public.board_items(id) ON DELETE CASCADE,
    organization_id      TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_name          TEXT NOT NULL,
    content              TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. INDEKSIT
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_board_items_org_stage ON public.board_items (organization_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_tasks_item ON public.board_tasks (item_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_board_signups_task ON public.board_task_signups (task_id);
CREATE INDEX IF NOT EXISTS idx_board_votes_item ON public.board_votes (item_id);
CREATE INDEX IF NOT EXISTS idx_board_comments_item ON public.board_comments (item_id, created_at ASC);

-- =============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE public.board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_task_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;

-- Lukuoikeudet julkisille / todennetuille rooleille organisaation taulun sisällölle
DROP POLICY IF EXISTS "Public read board items" ON public.board_items;
CREATE POLICY "Public read board items" ON public.board_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read board tasks" ON public.board_tasks;
CREATE POLICY "Public read board tasks" ON public.board_tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read task signups" ON public.board_task_signups;
CREATE POLICY "Public read task signups" ON public.board_task_signups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read board votes" ON public.board_votes;
CREATE POLICY "Public read board votes" ON public.board_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read board comments" ON public.board_comments;
CREATE POLICY "Public read board comments" ON public.board_comments FOR SELECT USING (true);

-- =============================================================================
-- 4. RPC-RAJAPINNAT (SECURITY DEFINER)
-- =============================================================================

-- 4.1 Hakee organisaation koko toimintataulun datan yhdellä optimoidulla kutsulla
CREATE OR REPLACE FUNCTION public.get_board_data(
    p_organization_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_org_name TEXT;
    v_items    JSONB;
BEGIN
    SELECT name INTO v_org_name
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Organisaatiota ei loydy.');
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', i.id,
            'seq', 'ASIA ' || LPAD(i.seq_num::text, 2, '0'),
            'title', i.title,
            'description', i.description,
            'stage', i.stage,
            'stage_name', CASE i.stage
                WHEN 'idea' THEN 'Uusi idea'
                WHEN 'discussion' THEN 'Keskustelussa'
                WHEN 'vote' THEN 'Äänestyksessä'
                WHEN 'decided' THEN 'Päätetty'
                WHEN 'in_progress' THEN 'Toteutuksessa'
                WHEN 'done' THEN 'Valmis'
                ELSE 'Arkistoitu'
            END,
            'lead', i.lead_name,
            'deadline', to_char(i.deadline_at, 'DD.MM.YYYY'),
            'deadline_label', COALESCE(i.deadline_label, to_char(i.deadline_at, 'DD.MM.YYYY')),
            'decision_summary', i.decision_summary,
            'is_published_to_wall', i.is_published_to_wall,
            'comments_count', (SELECT COUNT(*) FROM public.board_comments c WHERE c.item_id = i.id),
            'votes', (
                SELECT jsonb_build_object(
                    'yes', COUNT(*) FILTER (WHERE choice = 'yes'),
                    'no', COUNT(*) FILTER (WHERE choice = 'no'),
                    'cond', COUNT(*) FILTER (WHERE choice = 'cond'),
                    'total', COUNT(*)
                )
                FROM public.board_votes v
                WHERE v.item_id = i.id
            ),
            'tasks', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', t.id,
                        'name', t.name,
                        'required', t.required_volunteers,
                        'time', t.time_slot,
                        'signups', COALESCE((
                            SELECT jsonb_agg(s.participant_name ORDER BY s.created_at ASC)
                            FROM public.board_task_signups s
                            WHERE s.task_id = t.id
                        ), '[]'::jsonb)
                    ) ORDER BY t.sort_order ASC, t.created_at ASC
                )
                FROM public.board_tasks t
                WHERE t.item_id = i.id
            ), '[]'::jsonb)
        ) ORDER BY 
            CASE i.stage
                WHEN 'in_progress' THEN 1
                WHEN 'vote' THEN 2
                WHEN 'discussion' THEN 3
                WHEN 'idea' THEN 4
                WHEN 'decided' THEN 5
                ELSE 6
            END ASC,
            i.updated_at DESC
    ), '[]'::jsonb) INTO v_items
    FROM public.board_items i
    WHERE i.organization_id = p_organization_id
      AND i.stage <> 'archived';

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'items', v_items
    );
END;
$$;

-- 4.2 Äänestyksen / mielipiteen jättäminen (UPSERT)
CREATE OR REPLACE FUNCTION public.submit_board_vote(
    p_item_id           UUID,
    p_voter_name        TEXT,
    p_voter_fingerprint TEXT,
    p_choice            TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_org_id TEXT;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.board_items
    WHERE id = p_item_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei loydy.');
    END IF;

    IF p_choice NOT IN ('yes', 'no', 'cond') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen valinta.');
    END IF;

    INSERT INTO public.board_votes (
        item_id, organization_id, voter_name, voter_fingerprint, choice
    ) VALUES (
        p_item_id, v_org_id, TRIM(p_voter_name), TRIM(p_voter_fingerprint), p_choice
    )
    ON CONFLICT (item_id, voter_fingerprint)
    DO UPDATE SET 
        choice = EXCLUDED.choice,
        voter_name = EXCLUDED.voter_name,
        created_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4.3 Ilmoittautuminen vapaaehtoistehtävään
CREATE OR REPLACE FUNCTION public.signup_board_task(
    p_task_id          UUID,
    p_participant_name TEXT,
    p_contact          TEXT DEFAULT NULL,
    p_role             TEXT DEFAULT 'participant'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_task RECORD;
BEGIN
    SELECT id, item_id, organization_id INTO v_task
    FROM public.board_tasks
    WHERE id = p_task_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tehtavaa ei loydy.');
    END IF;

    IF TRIM(COALESCE(p_participant_name, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nimi on pakollinen.');
    END IF;

    INSERT INTO public.board_task_signups (
        task_id, item_id, organization_id, participant_name, participant_contact, role_type
    ) VALUES (
        p_task_id, v_task.item_id, v_task.organization_id, TRIM(p_participant_name), TRIM(p_contact), p_role
    )
    ON CONFLICT (task_id, participant_name)
    DO UPDATE SET 
        participant_contact = COALESCE(EXCLUDED.participant_contact, board_task_signups.participant_contact),
        role_type = EXCLUDED.role_type,
        created_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4.4 Ilmoittautumisen peruminen
CREATE OR REPLACE FUNCTION public.cancel_board_task_signup(
    p_task_id          UUID,
    p_participant_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
    DELETE FROM public.board_task_signups
    WHERE task_id = p_task_id
      AND LOWER(participant_name) = LOWER(TRIM(p_participant_name));

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4.5 Kommentin lisääminen
CREATE OR REPLACE FUNCTION public.post_board_comment(
    p_item_id     UUID,
    p_author_name TEXT,
    p_content     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_org_id TEXT;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.board_items
    WHERE id = p_item_id;

    IF v_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei loydy.');
    END IF;

    IF TRIM(COALESCE(p_content, '')) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kommentti ei voi olla tyhja.');
    END IF;

    INSERT INTO public.board_comments (
        item_id, organization_id, author_name, content
    ) VALUES (
        p_item_id, v_org_id, TRIM(COALESCE(p_author_name, 'Jäsen')), TRIM(p_content)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4.6 Ylläpitotoiminto: Asian tilan muuttaminen (vaatii validin istuntotokenin)
CREATE OR REPLACE FUNCTION public.manage_board_item(
    p_session_token    TEXT,
    p_item_id          UUID,
    p_stage            TEXT,
    p_decision_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_item       RECORD;
    v_session    public.org_publisher_sessions;
BEGIN
    -- 1. Tarkistetaan kohde
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei loydy.');
    END IF;

    -- 2. Validoidaan istunto
    v_token_hash := encode(digest(TRIM(p_session_token), 'sha256'), 'hex');
    v_session := public._verify_org_session_internal(v_token_hash, v_item.organization_id);

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istunto ei ole voimassa tai kayttooikeus puuttuu.');
    END IF;

    -- 3. Paivitetaan tila
    UPDATE public.board_items
    SET stage = p_stage,
        decision_summary = COALESCE(p_decision_summary, decision_summary),
        updated_at = now()
    WHERE id = p_item_id;

    RETURN jsonb_build_object('success', true, 'new_stage', p_stage);
END;
$$;

-- 4.7 1-klikkauksen julkaisu suoraan LaukaaInfon Seinälle (public.posts)
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
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
    v_token_hash TEXT;
    v_item       RECORD;
    v_session    public.org_publisher_sessions;
    v_post_id    UUID;
BEGIN
    SELECT * INTO v_item
    FROM public.board_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kohdetta ei loydy.');
    END IF;

    v_token_hash := encode(digest(TRIM(p_session_token), 'sha256'), 'hex');
    v_session := public._verify_org_session_internal(v_token_hash, v_item.organization_id);

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Istunto ei ole voimassa tai julkaisuoikeus puuttuu.');
    END IF;

    -- Luodaan virallinen postaus public.posts -tauluun
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
        TRIM(p_wall_title),
        TRIM(p_wall_content),
        p_target_type,
        'public',
        'published',
        v_item.deadline_at
    )
    RETURNING id INTO v_post_id;

    -- Merkataan board_item julkaistuksi
    UPDATE public.board_items
    SET is_published_to_wall = TRUE,
        wall_post_id = v_post_id,
        updated_at = now()
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'wall_post_id', v_post_id
    );
END;
$$;

-- Myönnetään suoritusoikeudet
GRANT EXECUTE ON FUNCTION public.get_board_data(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_board_vote(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_board_task(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_board_task_signup(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_board_comment(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_board_item(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_board_item_to_wall(TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 5. PILOTTIDATAN ALUSTUS ('laukaan-yrittajat')
-- =============================================================================
DO $$
DECLARE
    v_item1_id UUID;
    v_item2_id UUID;
    v_item3_id UUID;
    v_task1_id UUID;
    v_task2_id UUID;
BEGIN
    -- Poistetaan vanhat pilottirivit idempotentisti
    DELETE FROM public.board_items WHERE organization_id = 'laukaan-yrittajat';

    -- Asia 01: Joulunavaus
    INSERT INTO public.board_items (
        organization_id, seq_num, title, description, stage, lead_name, deadline_at, deadline_label, decision_summary, created_by_name
    ) VALUES (
        'laukaan-yrittajat', 1,
        'Laukaan joulunavaustapahtuman järjestelyt',
        'Järjestetään perinteinen joulunavaus Kirkonkylän torilla lauantaina 28.11. klo 10-14. Tapahtumaan tarvitaan vapaaehtoisia eri vastualueille ennen kuin järjestelyt voidaan lyödä lukkoon.',
        'in_progress', 'Matti K. (Vastuuhenkilö)', now() + interval '42 days', 'Tapahtumapäivä 28.11.',
        'Hallitus päätti 01.10. toteuttaa tapahtuman budjetilla 800€, edellyttäen että talkooväki saadaan kasaan.', 'Hallitus'
    ) RETURNING id INTO v_item1_id;

    -- Tehtävät asialle 01
    INSERT INTO public.board_tasks (item_id, organization_id, name, time_slot, required_volunteers, sort_order)
    VALUES (v_item1_id, 'laukaan-yrittajat', 'Tapahtumapaikan valmistelu & teltat', 'La klo 08:00 - 10:00', 4, 1)
    RETURNING id INTO v_task1_id;

    INSERT INTO public.board_tasks (item_id, organization_id, name, time_slot, required_volunteers, sort_order)
    VALUES (v_item1_id, 'laukaan-yrittajat', 'Glögi- ja piparitarjoilu', 'La klo 10:00 - 14:00', 3, 2)
    RETURNING id INTO v_task2_id;

    INSERT INTO public.board_tasks (item_id, organization_id, name, time_slot, required_volunteers, sort_order)
    VALUES (v_item1_id, 'laukaan-yrittajat', 'Purku & loppusiivous', 'La klo 14:00 - 15:30', 3, 3);

    -- Ilmoittautumiset
    INSERT INTO public.board_task_signups (task_id, item_id, organization_id, participant_name, role_type)
    VALUES 
        (v_task1_id, v_item1_id, 'laukaan-yrittajat', 'Matti K.', 'lead'),
        (v_task1_id, v_item1_id, 'laukaan-yrittajat', 'Jari P.', 'participant'),
        (v_task2_id, v_item1_id, 'laukaan-yrittajat', 'Helena V.', 'participant');

    -- Asia 02: Syysverkostoituminen (äänestys)
    INSERT INTO public.board_items (
        organization_id, seq_num, title, description, stage, lead_name, deadline_at, deadline_label, created_by_name
    ) VALUES (
        'laukaan-yrittajat', 2,
        'Yrittäjien Syysverkostoitumisilta & Budjetti',
        'Ehdotus syysillanvietosta paikallisessa ravintolassa marraskuun puolivälissä. Kustannusarvio yhdistykselle n. 600 € (tilat ja alkumaljat). Vaatii hallituksen päätöksen.',
        'vote', 'Helena V.', now() + interval '5 days', 'Äänestys päättyy 22.10.', 'Helena V.'
    ) RETURNING id INTO v_item2_id;

    -- Äänet asialle 02
    INSERT INTO public.board_votes (item_id, organization_id, voter_name, voter_fingerprint, choice)
    VALUES 
        (v_item2_id, 'laukaan-yrittajat', 'Helena V.', 'fp-1', 'yes'),
        (v_item2_id, 'laukaan-yrittajat', 'Juha T.', 'fp-2', 'yes'),
        (v_item2_id, 'laukaan-yrittajat', 'Pekka M.', 'fp-3', 'cond');

    -- Asia 03: Uusi idea
    INSERT INTO public.board_items (
        organization_id, seq_num, title, description, stage, lead_name, created_by_name
    ) VALUES (
        'laukaan-yrittajat', 3,
        'Laukaan yrityskummit nuorille yrittäjille',
        'Idea: kokeneemmat yrittäjät tarjoavat 2 tuntia kuukaudessa sparrausapua nuorille tai juuri aloittaneille toimijoille.',
        'idea', 'Tiina A.', 'Tiina A.'
    );

END $$;

COMMIT;
