-- ============================================================
-- Wonderin Muistokartta – Supabase SQL-migraatio v3
-- Aja tämä Supabase SQL Editor -näkymässä
-- Kaikki lausekkeet ovat idempotentteja (voidaan ajaa uudelleen)
-- ============================================================

-- ── 1. Aktivointikoodit ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activation_codes (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash             TEXT        NOT NULL UNIQUE,   -- SHA-256(koodi)
    product_sku           TEXT        NOT NULL,          -- esim. 'DIGI-3M'
    edit_duration_days    INT         NOT NULL DEFAULT 90,
    view_duration_days    INT         NOT NULL DEFAULT 365,
    archive_duration_days INT         NOT NULL DEFAULT 365,
    is_redeemed           BOOLEAN     NOT NULL DEFAULT false,
    redeemed_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    redeemed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT now(),
    notes                 TEXT
);

ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public read"           ON public.activation_codes;
DROP POLICY IF EXISTS "Service role full access" ON public.activation_codes;

CREATE POLICY "No public read"
    ON public.activation_codes FOR SELECT USING (false);

-- ── 2. Elinkaarikenttien lisäys routes-tauluun ───────────────────────────────

ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS owner_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS share_token      TEXT,
    ADD COLUMN IF NOT EXISTS view_pin         TEXT,
    ADD COLUMN IF NOT EXISTS view_pin_hash    TEXT,
    ADD COLUMN IF NOT EXISTS edit_expires_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS view_expires_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archive_until    TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_share_token_unique
    ON public.routes (share_token)
    WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_routes_owner_memory
    ON public.routes (owner_id, experience_type)
    WHERE owner_id IS NOT NULL;

-- ── 2b. RLS: Routes (Muistokarttojen käyttöoikeudet) ──────────────────────────
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own memory routes"   ON public.routes;
DROP POLICY IF EXISTS "Owner updates own memory routes" ON public.routes;
DROP POLICY IF EXISTS "Owner deletes own memory routes" ON public.routes;

CREATE POLICY "Owner reads own memory routes" ON public.routes
    FOR SELECT USING (
        (owner_id = auth.uid() AND experience_type = 'MEMORY')
        OR visibility = 'public'
    );

CREATE POLICY "Owner updates own memory routes" ON public.routes
    FOR UPDATE USING (
        owner_id = auth.uid()
        AND experience_type = 'MEMORY'
        AND (edit_expires_at IS NULL OR now() <= edit_expires_at)
    );

CREATE POLICY "Owner deletes own memory routes" ON public.routes
    FOR DELETE USING (
        owner_id = auth.uid()
        AND experience_type = 'MEMORY'
        AND (edit_expires_at IS NULL OR now() <= edit_expires_at)
    );

-- ── 2c. Aktivointikoodien RPC-funktiot (SECURITY DEFINER) ──────────────────────
-- Näiden ansiosta koodien tarkistus ja lunastus toimii pelkällä SUPABASE_ANON_KEY:llä,
-- eikä vaarallista service_role-avainta tarvita web-palvelimen config.php:ssä lainkaan!

CREATE OR REPLACE FUNCTION public.check_activation_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_code_clean TEXT;
    v_code_hash  TEXT;
    v_code_row   RECORD;
BEGIN
    v_code_clean := upper(trim(coalesce(p_code, '')));
    IF length(v_code_clean) < 6 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Liian lyhyt aktivointikoodi.');
    END IF;

    v_code_hash := encode(sha256(v_code_clean::bytea), 'hex');

    SELECT product_sku, edit_duration_days, view_duration_days, archive_duration_days, is_redeemed
    INTO v_code_row
    FROM public.activation_codes
    WHERE code_hash = v_code_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Aktivointikoodia ei löydy. Tarkista koodi.');
    END IF;

    IF v_code_row.is_redeemed THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Tämä koodi on jo käytetty.');
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'product_sku', v_code_row.product_sku,
        'edit_duration_days', v_code_row.edit_duration_days,
        'view_duration_days', v_code_row.view_duration_days,
        'archive_duration_days', v_code_row.archive_duration_days
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_activation_code(
    p_code TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_code_clean TEXT;
    v_code_hash  TEXT;
    v_code_row   RECORD;
    v_new_route_id UUID;
    v_share_token TEXT;
    v_pin         TEXT;
    v_pin_hash    TEXT;
    v_now         TIMESTAMPTZ := clock_timestamp();
    v_edit_exp    TIMESTAMPTZ;
    v_view_exp    TIMESTAMPTZ;
    v_arch_exp    TIMESTAMPTZ;
    v_map_title   TEXT;
    v_valid_user  UUID := NULL;
BEGIN
    v_code_clean := upper(trim(coalesce(p_code, '')));
    IF length(v_code_clean) < 6 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Liian lyhyt aktivointikoodi.');
    END IF;

    v_code_hash := encode(sha256(v_code_clean::bytea), 'hex');

    -- 1. Tarkista ja lukitse koodirivi samanaikaisen käytön estämiseksi
    SELECT * INTO v_code_row
    FROM public.activation_codes
    WHERE code_hash = v_code_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Aktivointikoodia ei löydy. Tarkista koodi.');
    END IF;

    IF v_code_row.is_redeemed THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Tämä koodi on jo käytetty.');
    END IF;

    -- 2. Varmista p_user_id (asetetaan vain jos löytyy auth.users-taulusta)
    IF p_user_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
            v_valid_user := p_user_id;
        END IF;
    END IF;

    -- 3. Laske voimassaoloajat
    v_edit_exp := v_now + (v_code_row.edit_duration_days || ' days')::interval;
    v_view_exp := v_now + (v_code_row.view_duration_days || ' days')::interval;
    v_arch_exp := v_now + ((v_code_row.view_duration_days + v_code_row.archive_duration_days) || ' days')::interval;

    -- 4. Generoi share_token ja 4-numeroinen PIN (1000-9999)
    v_share_token := encode(gen_random_bytes(16), 'hex');
    v_pin         := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    v_pin_hash    := encode(sha256(v_pin::bytea), 'hex');
    v_map_title   := 'Muistokartta ' || to_char(v_now, 'DD.MM.YYYY');

    -- 5. Luo uusi reitti/kartta
    INSERT INTO public.routes (
        title,
        description,
        experience_type,
        visibility,
        distance_meters,
        route_geojson,
        owner_id,
        share_token,
        view_pin,
        view_pin_hash,
        edit_expires_at,
        view_expires_at,
        archive_until,
        created_at
    ) VALUES (
        v_map_title,
        '',
        'MEMORY',
        'private',
        0,
        '{"type": "FeatureCollection", "features": []}'::jsonb,
        v_valid_user,
        v_share_token,
        v_pin,
        v_pin_hash,
        v_edit_exp,
        v_view_exp,
        v_arch_exp,
        v_now
    ) RETURNING id INTO v_new_route_id;

    -- 6. Merkitse koodi käytetyksi
    UPDATE public.activation_codes
    SET is_redeemed = true,
        redeemed_by = v_valid_user,
        redeemed_at = v_now
    WHERE id = v_code_row.id;

    RETURN jsonb_build_object(
        'ok', true,
        'map_id', v_new_route_id,
        'map_title', v_map_title,
        'share_token', v_share_token,
        'pin', v_pin,
        'edit_expires_at', v_edit_exp,
        'view_expires_at', v_view_exp,
        'product_sku', v_code_row.product_sku
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_activation_code(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(TEXT, UUID) TO anon, authenticated, service_role;

-- ── 2d. Aktivointikoodien luonti ja hallinta ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_activation_codes(
    p_sku TEXT,
    p_edit_days INT,
    p_view_days INT,
    p_archive_days INT DEFAULT 365,
    p_count INT DEFAULT 5,
    p_prefix TEXT DEFAULT 'WOND',
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    selvakoodi TEXT,
    tuote TEXT,
    muokkausaika_pv INT,
    katseluaika_pv INT,
    arkistointiaika_pv INT,
    suoralinkki TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_code TEXT;
    v_random TEXT;
    v_clean_sku TEXT;
    v_clean_prefix TEXT;
BEGIN
    v_clean_sku := coalesce(nullif(trim(p_sku), ''), 'DIGI-3M');
    v_clean_prefix := coalesce(nullif(trim(p_prefix), ''), 'WOND');

    FOR i IN 1..p_count LOOP
        -- Generoidaan siisti, helposti luettava 6-merkkinen satunnaispääte (esim. 7K2M9X)
        v_random := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
        v_code := v_clean_prefix || '-' || v_random;

        INSERT INTO public.activation_codes (
            code_hash, product_sku, edit_duration_days, view_duration_days, archive_duration_days, notes
        ) VALUES (
            encode(sha256(v_code::bytea), 'hex'),
            v_clean_sku,
            p_edit_days,
            p_view_days,
            coalesce(p_archive_days, 365),
            p_notes
        );

        selvakoodi         := v_code;
        tuote              := v_clean_sku;
        muokkausaika_pv    := p_edit_days;
        katseluaika_pv     := p_view_days;
        arkistointiaika_pv := coalesce(p_archive_days, 365);
        suoralinkki        := 'https://mediazoo.fi/laukaainfo-web/wonderin/redeem.php?code=' || v_code;
        RETURN NEXT;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_single_activation_code(
    p_code TEXT,
    p_sku TEXT,
    p_edit_days INT DEFAULT 90,
    p_view_days INT DEFAULT 365,
    p_archive_days INT DEFAULT 365,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_clean_code TEXT;
    v_clean_sku  TEXT;
    v_hash       TEXT;
BEGIN
    v_clean_code := upper(trim(coalesce(p_code, '')));
    IF length(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Koodin tulee olla vähintään 4 merkkiä pitkä.');
    END IF;

    v_clean_sku := coalesce(nullif(trim(p_sku), ''), 'DIGI-3M');
    v_hash := encode(sha256(v_clean_code::bytea), 'hex');

    INSERT INTO public.activation_codes (
        code_hash, product_sku, edit_duration_days, view_duration_days, archive_duration_days, notes
    ) VALUES (
        v_hash,
        v_clean_sku,
        p_edit_days,
        p_view_days,
        coalesce(p_archive_days, 365),
        p_notes
    );

    RETURN jsonb_build_object(
        'ok', true,
        'selvakoodi', v_clean_code,
        'tuote', v_clean_sku,
        'muokkausaika_pv', p_edit_days,
        'katseluaika_pv', p_view_days,
        'suoralinkki', 'https://mediazoo.fi/laukaainfo-web/wonderin/redeem.php?code=' || v_clean_code
    );
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tämä koodi on jo olemassa kannassa.');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_activation_codes(p_limit INT DEFAULT 100)
RETURNS TABLE (
    id UUID,
    product_sku TEXT,
    edit_duration_days INT,
    view_duration_days INT,
    archive_duration_days INT,
    is_redeemed BOOLEAN,
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.product_sku,
        a.edit_duration_days,
        a.view_duration_days,
        a.archive_duration_days,
        a.is_redeemed,
        a.redeemed_at,
        a.created_at,
        a.notes
    FROM public.activation_codes a
    ORDER BY a.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_activation_codes(TEXT, INT, INT, INT, INT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_single_activation_code(TEXT, TEXT, INT, INT, INT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_activation_codes(INT) TO anon, authenticated, service_role;

-- ── 3. Muistokartan paikat ────────────────────────────────────────────────────
-- Paikat tallennetaan erilliseen tauluun, koska experience_points-taulua
-- ei ole tässä Supabase-ympäristössä. Jokainen paikka kuuluu yhteen route/karttaan.

CREATE TABLE IF NOT EXISTS public.memory_places (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id    UUID        NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_places_route_id
    ON public.memory_places (route_id);

ALTER TABLE public.memory_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own places"   ON public.memory_places;
DROP POLICY IF EXISTS "Owner writes own places"  ON public.memory_places;
DROP POLICY IF EXISTS "Owner updates own places" ON public.memory_places;
DROP POLICY IF EXISTS "Owner deletes own places" ON public.memory_places;

CREATE POLICY "Owner reads own places" ON public.memory_places
    FOR SELECT USING (
        route_id IN (
            SELECT id FROM public.routes
            WHERE  owner_id = auth.uid()
              AND  experience_type = 'MEMORY'
        )
    );

CREATE POLICY "Owner writes own places" ON public.memory_places
    FOR INSERT WITH CHECK (
        route_id IN (
            SELECT id FROM public.routes
            WHERE  owner_id = auth.uid()
              AND  experience_type = 'MEMORY'
              AND  (edit_expires_at IS NULL OR now() <= edit_expires_at)
        )
    );

CREATE POLICY "Owner updates own places" ON public.memory_places
    FOR UPDATE USING (
        route_id IN (
            SELECT id FROM public.routes
            WHERE  owner_id = auth.uid()
              AND  experience_type = 'MEMORY'
              AND  (edit_expires_at IS NULL OR now() <= edit_expires_at)
        )
    );

CREATE POLICY "Owner deletes own places" ON public.memory_places
    FOR DELETE USING (
        route_id IN (
            SELECT id FROM public.routes
            WHERE  owner_id = auth.uid()
              AND  experience_type = 'MEMORY'
              AND  (edit_expires_at IS NULL OR now() <= edit_expires_at)
        )
    );

-- ── 4. Muistot ───────────────────────────────────────────────────────────────
-- Yksittäiset muistot (tarinat, kuvat, äänitteet) on sidottu memory_places-tauluun.

CREATE TABLE IF NOT EXISTS public.memories (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id      UUID        NOT NULL REFERENCES public.memory_places(id) ON DELETE CASCADE,
    memory_title  TEXT        NOT NULL DEFAULT '',
    memory_year   INT,
    story_text    TEXT,
    media_url     TEXT,
    media_type    TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Lisää puuttuvat sarakkeet jos taululla on jo vanhempi rakenne
ALTER TABLE public.memories
    ADD COLUMN IF NOT EXISTS title        TEXT,
    ADD COLUMN IF NOT EXISTS description  TEXT,
    ADD COLUMN IF NOT EXISTS year         INT,
    ADD COLUMN IF NOT EXISTS media_url    TEXT,
    ADD COLUMN IF NOT EXISTS media_type   TEXT,
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

-- Poistetaan vanha foreign key places-tauluun, jotta muistot voidaan liittää memory_places-tauluun:
ALTER TABLE public.memories
    DROP CONSTRAINT IF EXISTS memories_place_id_fkey;

CREATE INDEX IF NOT EXISTS idx_memories_place_id
    ON public.memories (place_id);

CREATE INDEX IF NOT EXISTS idx_memories_year
    ON public.memories (memory_year);

-- CHECK-ehto media_type-sarakkeelle
ALTER TABLE public.memories
    DROP CONSTRAINT IF EXISTS memories_media_type_check;

ALTER TABLE public.memories
    ADD CONSTRAINT memories_media_type_check
        CHECK (media_type IN ('IMAGE','VIDEO','AUDIO','DOCUMENT'));

-- ── 5. Trigger: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memories_updated_at ON public.memories;
CREATE TRIGGER memories_updated_at
    BEFORE UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. RLS: Muistot ──────────────────────────────────────────────────────────
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own memories"                 ON public.memories;
DROP POLICY IF EXISTS "Owner writes own memories when editable"  ON public.memories;
DROP POLICY IF EXISTS "Owner updates own memories when editable" ON public.memories;
DROP POLICY IF EXISTS "Owner deletes own memories when editable" ON public.memories;

CREATE POLICY "Owner reads own memories" ON public.memories
    FOR SELECT USING (
        place_id IN (
            SELECT mp.id FROM public.memory_places mp
            JOIN   public.routes r ON mp.route_id = r.id
            WHERE  r.owner_id = auth.uid()
              AND  r.experience_type = 'MEMORY'
        )
    );

CREATE POLICY "Owner writes own memories when editable" ON public.memories
    FOR INSERT WITH CHECK (
        place_id IN (
            SELECT mp.id FROM public.memory_places mp
            JOIN   public.routes r ON mp.route_id = r.id
            WHERE  r.owner_id = auth.uid()
              AND  r.experience_type = 'MEMORY'
              AND  (r.edit_expires_at IS NULL OR now() <= r.edit_expires_at)
        )
    );

CREATE POLICY "Owner updates own memories when editable" ON public.memories
    FOR UPDATE USING (
        place_id IN (
            SELECT mp.id FROM public.memory_places mp
            JOIN   public.routes r ON mp.route_id = r.id
            WHERE  r.owner_id = auth.uid()
              AND  r.experience_type = 'MEMORY'
              AND  (r.edit_expires_at IS NULL OR now() <= r.edit_expires_at)
        )
    );

CREATE POLICY "Owner deletes own memories when editable" ON public.memories
    FOR DELETE USING (
        place_id IN (
            SELECT mp.id FROM public.memory_places mp
            JOIN   public.routes r ON mp.route_id = r.id
            WHERE  r.owner_id = auth.uid()
              AND  r.experience_type = 'MEMORY'
              AND  (r.edit_expires_at IS NULL OR now() <= r.edit_expires_at)
        )
    );

-- ── 7. Tarkistushaku ─────────────────────────────────────────────────────────
SELECT 'activation_codes' AS taulu, count(*)::text AS riveja FROM public.activation_codes
UNION ALL
SELECT 'memory_places', count(*)::text FROM public.memory_places
UNION ALL
SELECT 'memories', count(*)::text FROM public.memories
UNION ALL
SELECT 'routes.' || column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'routes'
  AND column_name  IN ('owner_id','share_token','view_pin','view_pin_hash','edit_expires_at','view_expires_at','archive_until')
ORDER BY 1;

-- ── 8. Testikoodit (valinnainen) ─────────────────────────────────────────────
/*
INSERT INTO public.activation_codes
    (code_hash, product_sku, edit_duration_days, view_duration_days, archive_duration_days, notes)
VALUES
    (encode(sha256('DIGI-TESTI1'::bytea), 'hex'), 'DIGI-3M', 90, 365, 365, 'Testiasiakas 1'),
    (encode(sha256('DIGI-TESTI2'::bytea), 'hex'), 'DIGI-6M', 180, 365, 365, 'Testiasiakas 2')
ON CONFLICT (code_hash) DO NOTHING;
*/
