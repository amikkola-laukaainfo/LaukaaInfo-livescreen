-- =============================================================================
-- 075_board_item_lifecycle.sql
-- LaukaaInfo – Uuden toimintatauluasian turvallinen luonti ja elinkaari
-- =============================================================================
-- TILA: VALMIS HYVÄKSYNTÄTESTATTAVAKSI (v1.0.0)
--
-- Edellyttää aiempia migraatioita:
--   070_toimintataulu_schema.sql
--   072_organization_roles_and_governance.sql
--   073_board_task_governance.sql
--
-- Sallittu luonti (manage_tasks, kun p_target_item_id = NULL):
--   board_chair, board_member, secretary
--   (koordinaattori ja vetäjä rajautuvat automaattisesti pois organisaatiotason luonnista)
--
-- Turvallisuus ja samanaikaisuussuoja:
--   - Kutsuu _verify_member_governance_permission('manage_tasks')
--   - Sisältää organisaatiokohtaisen pg_advisory_xact_lock -lukituksen
--   - seq_num lasketaan atomisesti organisaatiolukon sisällä (estää duplikaatit)
--   - Uuden asian luonti ja ITEM_CREATED-auditointi samassa transaktiossa
--   - search_path on tyhjä ('')
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_board_item(
    p_session_token   TEXT,
    p_organization_id TEXT,
    p_title           TEXT,
    p_description     TEXT DEFAULT NULL,
    p_stage           TEXT DEFAULT 'idea',
    p_lead_name       TEXT DEFAULT NULL,
    p_deadline_at     TIMESTAMPTZ DEFAULT NULL,
    p_deadline_label  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_hash     TEXT;
    v_caller         RECORD;
    v_new_id         UUID;
    v_seq            INT;
    v_title          TEXT;
    v_description    TEXT;
    v_lead_name      TEXT;
    v_deadline_label TEXT;
    v_stage          TEXT;
BEGIN
    ------------------------------------------------------------------
    -- 1. Pakollisten tunnisteiden validointi
    ------------------------------------------------------------------

    IF p_organization_id IS NULL
       OR pg_catalog.btrim(p_organization_id) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Organisaatiotunnus puuttuu.'
        );
    END IF;

    IF p_session_token IS NULL
       OR pg_catalog.btrim(p_session_token) = '' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Henkilökohtainen rooli-istunto puuttuu.'
        );
    END IF;

    ------------------------------------------------------------------
    -- 2. Otsikon, kuvauksen ja muiden kenttien validointi
    ------------------------------------------------------------------

    v_title := pg_catalog.btrim(COALESCE(p_title, ''));

    IF pg_catalog.length(v_title) < 3
       OR pg_catalog.length(v_title) > 255 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Otsikon pituuden tulee olla 3–255 merkkiä.'
        );
    END IF;

    v_description := NULLIF(
        pg_catalog.btrim(p_description),
        ''
    );

    IF v_description IS NOT NULL AND pg_catalog.length(v_description) > 10000 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Kuvaus saa olla enintään 10 000 merkkiä.'
        );
    END IF;

    v_lead_name := NULLIF(
        pg_catalog.btrim(p_lead_name),
        ''
    );

    IF v_lead_name IS NOT NULL AND pg_catalog.length(v_lead_name) > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Vastuuhenkilön nimi saa olla enintään 100 merkkiä.'
        );
    END IF;

    v_deadline_label := NULLIF(
        pg_catalog.btrim(p_deadline_label),
        ''
    );

    IF v_deadline_label IS NOT NULL AND pg_catalog.length(v_deadline_label) > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error', 'Määräajan lisätieto saa olla enintään 100 merkkiä.'
        );
    END IF;

    v_stage := COALESCE(p_stage, 'idea');

    -- Uusi asia ei voi syntyä suoraan päätetyksi tai arkistoiduksi.
    IF NOT (
        v_stage = ANY (
            ARRAY['idea', 'discussion', 'in_progress']::TEXT[]
        )
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', FALSE,
            'error',
            'Aloitusvaiheeksi sallitaan vain: idea, discussion tai in_progress.'
        );
    END IF;

    ------------------------------------------------------------------
    -- 3. Henkilökohtaisen rooli-istunnon tunnisteen tiiviste
    ------------------------------------------------------------------

    v_token_hash := pg_catalog.encode(
        extensions.digest(
            pg_catalog.btrim(p_session_token),
            'sha256'
        ),
        'hex'
    );

    ------------------------------------------------------------------
    -- 4. Valtuutus ja lukitus
    --
    -- Olemassa oleva tarkistin:
    --   * lukitsee organisaation advisory-lukolla
    --   * tarkistaa istunnon voimassaolon
    --   * tarkistaa jäsenen aktiivisuuden
    --   * tarkistaa henkilökohtaisen roolin ja toimivallan
    --
    -- manage_tasks sallii organisaatiotason luonnin vain rooleille
    -- board_chair, board_member ja secretary, kun p_target_item_id
    -- on NULL.
    ------------------------------------------------------------------

    SELECT *
    INTO v_caller
    FROM public._verify_member_governance_permission(
        v_token_hash,
        p_organization_id,
        'manage_tasks',
        NULL::UUID
    );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Istunnolla ei ole oikeutta luoda toimintatauluasiaa.';
    END IF;

    IF v_caller.out_member_id IS NULL
       OR v_caller.out_organization_id
            IS DISTINCT FROM p_organization_id THEN
        RAISE EXCEPTION
            'Rooli-istunnon organisaatiotiedot eivät täsmää.';
    END IF;

    ------------------------------------------------------------------
    -- 5. Organisaatiokohtainen järjestysnumero
    --
    -- Tämä laskenta on turvallinen samanaikaisilta kutsuilta, kun
    -- kaikki samaan organisaatioon luovat kirjoituspolut käyttävät
    -- samaa advisory-lukituskäytäntöä.
    ------------------------------------------------------------------

    SELECT COALESCE(pg_catalog.max(bi.seq_num), 0) + 1
    INTO v_seq
    FROM public.board_items AS bi
    WHERE bi.organization_id = p_organization_id;

    ------------------------------------------------------------------
    -- 6. Uuden asian tallennus
    ------------------------------------------------------------------

    INSERT INTO public.board_items (
        organization_id,
        seq_num,
        title,
        description,
        stage,
        lead_name,
        deadline_at,
        deadline_label,
        created_by_name
    )
    VALUES (
        p_organization_id,
        v_seq,
        v_title,
        v_description,
        v_stage,
        v_lead_name,
        p_deadline_at,
        v_deadline_label,
        pg_catalog.format(
            '%s (%s)',
            v_caller.out_member_name,
            v_caller.out_authorized_role
        )
    )
    RETURNING id INTO v_new_id;

    ------------------------------------------------------------------
    -- 7. Auditointi
    --
    -- Jos auditointikirjaus epäonnistuu, koko transaktio peruutetaan,
    -- mukaan lukien edellä tehty INSERT.
    ------------------------------------------------------------------

    INSERT INTO public.organization_governance_audit (
        organization_id,
        actor_member_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        details
    )
    VALUES (
        p_organization_id,
        v_caller.out_member_id,
        v_caller.out_member_name,
        v_caller.out_authorized_role,
        'ITEM_CREATED',
        'board_item',
        v_new_id::TEXT,
        pg_catalog.jsonb_build_object(
            'title', v_title,
            'stage', v_stage,
            'seq_num', v_seq
        )
    );

    ------------------------------------------------------------------
    -- 8. Onnistumisvastaus
    ------------------------------------------------------------------

    RETURN pg_catalog.jsonb_build_object(
        'success', TRUE,
        'item_id', v_new_id,
        'seq_num', v_seq,
        'stage', v_stage
    );
END;
$function$;

-- Poistetaan oletusarvoiset kutsuoikeudet ja annetaan oikeus
-- sovelluksen tarvitsemille Supabase-rooleille.
REVOKE ALL ON FUNCTION public.create_board_item(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_board_item(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_board_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) IS
$$Luo uuden toimintataulun asian.
Vaatii voimassaolevan personal_role_code-istunnon ja manage_tasks-toimivallan:
board_chair, board_member tai secretary.
Laskee järjestysnumeron seq_num organisaation advisory-lukon sisällä.
Kirjaa automaattisesti ITEM_CREATED-tapahtuman hallinnon audit-lokiin.
v1.0.0 — 075-migraatio$$;

COMMIT;
