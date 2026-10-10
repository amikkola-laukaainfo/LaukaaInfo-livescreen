-- =========================================================
-- MIGRAATIO 051: publish_post_with_key() bugikorjaus
-- Poistaa 'Laukaa'-tekstifallbackin paikkariviltä
-- =========================================================
-- Aja tämä HETI 050_add_service_contexts.sql:n jälkeen
-- LaukaaInfon Supabase SQL Editorissa
--
-- Muutos: Ainoastaan post_places-insertti (vaihe 5)
-- Kaikki muut osat identtisiä alkuperäisen kanssa.
-- Taaksepäinyhteensopivuus säilyy täysin.
-- =========================================================

CREATE OR REPLACE FUNCTION public.publish_post_with_key(
    p_organization_id      TEXT,
    p_publish_key          TEXT,
    p_title                TEXT,
    p_content              TEXT            DEFAULT NULL,
    p_type                 TEXT            DEFAULT 'announcement',
    p_visibility           TEXT            DEFAULT 'public',
    p_status               TEXT            DEFAULT 'published',
    p_expires_at           TIMESTAMPTZ     DEFAULT NULL,
    p_pinned_until         TIMESTAMPTZ     DEFAULT NULL,
    p_places               JSONB           DEFAULT '[]'::jsonb,
    p_themes               JSONB           DEFAULT '[]'::jsonb,
    p_media                JSONB           DEFAULT '[]'::jsonb,
    p_links                JSONB           DEFAULT '[]'::jsonb,
    p_duration_days        INT             DEFAULT 30,
    p_attachments          JSONB           DEFAULT '[]'::jsonb,
    p_event_start_at       TIMESTAMPTZ     DEFAULT NULL,
    p_event_end_at         TIMESTAMPTZ     DEFAULT NULL,
    p_event_all_day        BOOLEAN         DEFAULT FALSE,
    p_event_location_detail TEXT           DEFAULT NULL,
    p_event_registration_url TEXT          DEFAULT NULL,
    p_offer_start_at       TIMESTAMPTZ     DEFAULT NULL,
    p_offer_end_at         TIMESTAMPTZ     DEFAULT NULL,
    p_offer_terms          TEXT            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verify_res             JSONB;
    v_post_id                UUID;
    v_elem                   JSONB;
    v_duration               INT;
    v_calculated_expires_at  TIMESTAMPTZ;
    v_place_id               TEXT;    -- kerätään erikseen ennen inserttia
BEGIN
    -- 1. Palvelinpuolen avaintarkistus
    v_verify_res := public.verify_publisher_key(p_organization_id, p_publish_key);
    IF (v_verify_res->>'valid')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', COALESCE(v_verify_res->>'error', 'Käyttöoikeus evätty.')
        );
    END IF;

    -- 2. Tyyppikohtainen validointi
    IF p_type = 'event'
       AND p_event_start_at IS NOT NULL
       AND p_event_end_at IS NOT NULL
       AND p_event_end_at < p_event_start_at
    THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Tapahtuman päättymisaika ei voi olla ennen alkamisaikaa.');
    END IF;

    IF p_type = 'offer'
       AND p_offer_start_at IS NOT NULL
       AND p_offer_end_at IS NOT NULL
       AND p_offer_end_at < p_offer_start_at
    THEN
        RETURN jsonb_build_object('success', false,
            'error', 'Tarjouksen päättymispäivä ei voi olla ennen alkamispäivää.');
    END IF;

    -- 3. Palvelinpuolen expires_at keston perusteella
    v_duration := COALESCE(p_duration_days, 30);
    IF v_duration NOT IN (7, 14, 30) THEN
        v_duration := 30;
    END IF;
    v_calculated_expires_at := COALESCE(
        p_expires_at,
        NOW() + (v_duration || ' days')::INTERVAL
    );

    -- 4. Luo uusi julkaisu
    v_post_id := gen_random_uuid();

    INSERT INTO public.posts (
        id, organization_id, title, content, type, visibility, status,
        expires_at, pinned_until, is_pinned, created_at, published_at,
        event_start_at, event_end_at, event_all_day,
        event_location_detail, event_registration_url,
        offer_start_at, offer_end_at, offer_terms
    ) VALUES (
        v_post_id, p_organization_id, p_title, p_content,
        p_type, p_visibility, p_status,
        v_calculated_expires_at,
        p_pinned_until,
        (p_pinned_until IS NOT NULL AND p_pinned_until > NOW()),
        NOW(), NOW(),
        CASE WHEN p_type = 'event' THEN p_event_start_at     ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_end_at       ELSE NULL END,
        CASE WHEN p_type = 'event' THEN COALESCE(p_event_all_day, FALSE) ELSE FALSE END,
        CASE WHEN p_type = 'event' THEN p_event_location_detail          ELSE NULL END,
        CASE WHEN p_type = 'event' THEN p_event_registration_url         ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_start_at     ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_end_at       ELSE NULL END,
        CASE WHEN p_type = 'offer' THEN p_offer_terms        ELSE NULL END
    );

    -- 5. Paikat – KORJATTU: ei 'Laukaa'-tekstifallbackia
    --
    -- Alkuperäinen (BUGI):
    --   COALESCE(v_elem->>'place_id', v_elem->>0, 'Laukaa')
    --   → kirjasi 'Laukaa'-tekstimerkkijonon kun paikka puuttui.
    --     Tämä ei ole UUID eikä viittaa mihinkään places-rivin.
    --
    -- Korjattu:
    --   Tarkistetaan UUID-muoto (36 merkkiä). Jos ei kelpaa, ohitetaan.
    --   Julkaisu syntyy ilman paikkaa eikä virheellistä dataa kirjata.
    IF jsonb_array_length(p_places) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_places) LOOP
            v_place_id := COALESCE(v_elem->>'place_id', v_elem->>0);
            IF v_place_id IS NOT NULL AND length(v_place_id) = 36 THEN
                INSERT INTO public.post_places (post_id, place_id, relation)
                VALUES (
                    v_post_id,
                    v_place_id,
                    COALESCE(v_elem->>'relation', 'venue')
                );
            END IF;
        END LOOP;
    END IF;

    -- 6. Teemat
    IF jsonb_array_length(p_themes) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_themes) LOOP
            INSERT INTO public.post_themes (post_id, tag_id)
            VALUES (v_post_id, COALESCE(v_elem->>'tag_id', v_elem->>0));
        END LOOP;
    END IF;

    -- 7. Liitteet (post_attachments: Kuva, PDF, YouTube)
    IF jsonb_array_length(p_attachments) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
            INSERT INTO public.post_attachments (
                post_id, type, provider, storage_path, imagekit_file_id,
                youtube_video_id, url, file_name, mime_type, file_size, sort_order
            ) VALUES (
                v_post_id,
                COALESCE(v_elem->>'type', 'image'),
                COALESCE(v_elem->>'provider', 'imagekit'),
                v_elem->>'storage_path',
                v_elem->>'imagekit_file_id',
                v_elem->>'youtube_video_id',
                COALESCE(v_elem->>'url', ''),
                v_elem->>'file_name',
                v_elem->>'mime_type',
                (v_elem->>'file_size')::BIGINT,
                COALESCE((v_elem->>'sort_order')::INT, 0)
            );
        END LOOP;
    END IF;

    -- 8. Legacy Media
    IF jsonb_array_length(p_media) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_media) LOOP
            IF (v_elem->>'url') IS NOT NULL AND length(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_media (post_id, media_type, url, title)
                VALUES (
                    v_post_id,
                    COALESCE(v_elem->>'media_type', 'image'),
                    v_elem->>'url',
                    v_elem->>'title'
                );
            END IF;
        END LOOP;
    END IF;

    -- 9. CTA-linkit
    IF jsonb_array_length(p_links) > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_links) LOOP
            IF (v_elem->>'url') IS NOT NULL AND length(v_elem->>'url') > 5 THEN
                INSERT INTO public.post_links (post_id, url, title, link_type)
                VALUES (
                    v_post_id,
                    v_elem->>'url',
                    COALESCE(v_elem->>'title', 'Lue lisää'),
                    COALESCE(v_elem->>'link_type', 'external')
                );
            END IF;
        END LOOP;
    END IF;

    -- Päivitetään avaimen viimeisin käyttöaika
    UPDATE public.organization_publish_credentials
    SET last_used_at = NOW()
    WHERE organization_id = p_organization_id AND revoked_at IS NULL;

    RETURN jsonb_build_object(
        'success',    true,
        'post_id',    v_post_id,
        'expires_at', v_calculated_expires_at,
        'message',    'Julkaisu luotu onnistuneesti!'
    );
END;
$$;

-- =========================================================
-- VARMISTUSKYSELY – testaa RPC toimii kuten ennen:
-- =========================================================
-- SELECT public.publish_post_with_key(
--   'test-org', 'TEST-AVAIN', 'Testititle',
--   'Sisältö', 'announcement', 'public', 'published',
--   NULL, NULL,
--   '[]'::jsonb,  -- tyhjä places-array → ei kirjata paikkaa, ei virhettä
--   '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
-- );
-- Odotettu tulos: {"success": false, "error": "..."} (väärä avain)
-- = funktio toimii, mutta palauttaa autentikaatiovirheen normaalisti
-- =========================================================
