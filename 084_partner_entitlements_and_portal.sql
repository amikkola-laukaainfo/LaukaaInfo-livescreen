-- =============================================================================
-- 084_partner_entitlements_and_portal.sql
-- LaukaaInfo & Wonderin – B2B Partner Entitlement Pools & Distribution Engine
-- =============================================================================
-- TILA: TUOTANTOVALMIS (PostgreSQL 15+, Supabase)
--
-- Tavoite:
--   1. partner_organizations:
--      Matkailuyritykset, hotellit, leirintäalueet, matkanjärjestäjät ja jakelijat.
--   2. partner_entitlement_pools:
--      Yrityksen ostamat käyttöoikeuskiintiöt (esim. 50, 500 tai 2000 kpl).
--      Yhdistää yrityksen reittiin, saldon seurantaan ja uniikkiin jakelutunnukseen.
--   3. entitlement_transactions:
--      Reaaliaikainen transaktioloki jokaisesta lunastuksesta.
--   4. redeem_partner_token RPC:
--      Atominen lunastusfunktio loppuasiakkaalle (LaukaaInfo web & Wonderin app).
--      Vähentää saldon, estää tuplakulutuksen ja palauttaa reitin GeoJSON-sisällön
--      sekä kumppanin brändäystiedot (logo, tervetulotoivotus).
--   5. get_partner_portal_data RPC:
--      Kumppanin oma hallintanäkymä (reitti-partner.html): saldot, analytiikka ja materiaalit.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =============================================================================
-- 1. Taulurakenteet
-- =============================================================================

-- Kumppaniorganisaatiot (jakelijat)
CREATE TABLE IF NOT EXISTS public.partner_organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL UNIQUE,
    contact_name        TEXT,
    contact_email       TEXT,
    contact_phone       TEXT,
    logo_url            TEXT,
    website             TEXT,
    portal_access_key   TEXT NOT NULL UNIQUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Käyttöoikeuskiintiöt (Entitlement Pools)
CREATE TABLE IF NOT EXISTS public.partner_entitlement_pools (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id          UUID NOT NULL REFERENCES public.partner_organizations(id) ON DELETE CASCADE,
    route_id            UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    package_name        TEXT NOT NULL DEFAULT 'Yrityspaketti 500',
    total_credits       INT NOT NULL DEFAULT 500 CHECK (total_credits > 0),
    used_credits        INT NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
    distribution_token  TEXT NOT NULL UNIQUE,
    welcome_title       TEXT DEFAULT 'Tervetuloa luontoelämykseen!',
    welcome_message     TEXT DEFAULT 'Tämä reitti sisältyy majoitukseesi ja vierailuusi. Mukavaa retkeä!',
    valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until         TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaktioloki lunastuksista
CREATE TABLE IF NOT EXISTS public.entitlement_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id             UUID NOT NULL REFERENCES public.partner_entitlement_pools(id) ON DELETE CASCADE,
    route_id            UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    client_type         TEXT NOT NULL DEFAULT 'web', -- 'web', 'android', 'ios'
    client_fingerprint  TEXT,
    ip_hash             TEXT,
    redeemed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeksit nopeaan hakuun
CREATE INDEX IF NOT EXISTS idx_partner_pools_token ON public.partner_entitlement_pools (upper(trim(distribution_token)));
CREATE INDEX IF NOT EXISTS idx_partner_pools_partner_id ON public.partner_entitlement_pools (partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_orgs_portal_key ON public.partner_organizations (upper(trim(portal_access_key)));
CREATE INDEX IF NOT EXISTS idx_entitlement_tx_pool_id ON public.entitlement_transactions (pool_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_tx_redeemed_at ON public.entitlement_transactions (redeemed_at DESC);

-- RLS
ALTER TABLE public.partner_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_entitlement_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_transactions ENABLE ROW LEVEL SECURITY;

-- Julkinen luku suojataan RPC-funktioiden kautta
CREATE POLICY "Allow public read through RPC functions" ON public.partner_organizations FOR SELECT USING (false);
CREATE POLICY "Allow public read through RPC functions" ON public.partner_entitlement_pools FOR SELECT USING (false);
CREATE POLICY "Allow public read through RPC functions" ON public.entitlement_transactions FOR SELECT USING (false);

-- =============================================================================
-- 2. RPC: redeem_partner_token (Asiakkaan lunastus)
-- =============================================================================
DROP FUNCTION IF EXISTS public.redeem_partner_token(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.redeem_partner_token(
    p_token         TEXT,
    p_fingerprint   TEXT DEFAULT NULL,
    p_client_type   TEXT DEFAULT 'web'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_token   TEXT;
    v_pool          RECORD;
    v_partner       RECORD;
    v_route         RECORD;
    v_recent_tx     RECORD;
    v_already_used  BOOLEAN := FALSE;
    v_new_used      INT;
BEGIN
    v_clean_token := upper(trim(COALESCE(p_token, '')));
    IF v_clean_token = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pääsyavain puuttuu.');
    END IF;

    -- Lukitaan pool-rivi samanaikaisten päivitysten varalta
    SELECT * INTO v_pool
    FROM public.partner_entitlement_pools
    WHERE upper(trim(distribution_token)) = v_clean_token
      AND is_active IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen tai suljettu kumppaniavain.');
    END IF;

    -- Voimassaolotarkistus
    IF v_pool.valid_from > NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Käyttöoikeus ei ole vielä alkanut.');
    END IF;
    IF v_pool.valid_until IS NOT NULL AND v_pool.valid_until < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Käyttöoikeuskiintiö on vanhentunut.');
    END IF;

    -- Haetaan kumppanin tiedot
    SELECT * INTO v_partner
    FROM public.partner_organizations
    WHERE id = v_pool.partner_id AND is_active IS TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kumppaniorganisaatiota ei löydy tai se ei ole aktiivinen.');
    END IF;

    -- Haetaan reitin tiedot
    SELECT * INTO v_route
    FROM public.routes
    WHERE id = v_pool.route_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reittiä ei löytynyt.');
    END IF;

    -- Idempotenssitarkistus: Jos sama laite/selain on jo lunastanut tämän saman poolin
    -- viimeisen 12 tunnin sisällä, ei vähennetä uutta saldoa, vaan palautetaan reitti
    IF p_fingerprint IS NOT NULL AND trim(p_fingerprint) <> '' THEN
        SELECT * INTO v_recent_tx
        FROM public.entitlement_transactions
        WHERE pool_id = v_pool.id
          AND client_fingerprint = trim(p_fingerprint)
          AND redeemed_at > (NOW() - INTERVAL '12 hours')
        ORDER BY redeemed_at DESC
        LIMIT 1;

        IF FOUND THEN
            v_already_used := TRUE;
        END IF;
    END IF;

    -- Jos ei ole jo hiljattain lunastettu, tarkistetaan ja vähennetään kiintiö
    IF NOT v_already_used THEN
        IF v_pool.used_credits >= v_pool.total_credits THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Käyttöoikeuskiintiö on tältä erää täyttynyt. Ota yhteyttä majoituspaikkaan tai infoon.',
                'quota_exceeded', true
            );
        END IF;

        UPDATE public.partner_entitlement_pools
        SET used_credits = used_credits + 1
        WHERE id = v_pool.id
        RETURNING used_credits INTO v_new_used;

        INSERT INTO public.entitlement_transactions (
            pool_id, route_id, client_type, client_fingerprint
        ) VALUES (
            v_pool.id, v_route.id, COALESCE(p_client_type, 'web'), p_fingerprint
        );
    ELSE
        v_new_used := v_pool.used_credits;
    END IF;

    RETURN jsonb_build_object(
        'success',              true,
        'access_granted',        true,
        'already_redeemed',     v_already_used,
        'partner', jsonb_build_object(
            'id',               v_partner.id,
            'name',             v_partner.name,
            'slug',             v_partner.slug,
            'logo_url',         v_partner.logo_url,
            'website',          v_partner.website,
            'welcome_title',    COALESCE(v_pool.welcome_title, 'Tervetuloa!'),
            'welcome_message',  COALESCE(v_pool.welcome_message, 'Tämä elämys sisältyy vierailuusi.')
        ),
        'pool', jsonb_build_object(
            'package_name',     v_pool.package_name,
            'credits_total',    v_pool.total_credits,
            'credits_used',     v_new_used,
            'credits_left',     GREATEST(0, v_pool.total_credits - v_new_used)
        ),
        'route', jsonb_build_object(
            'id',               v_route.id,
            'title',            v_route.title,
            'description',      v_route.description,
            'cover_image',      v_route.cover_image,
            'distance_meters',  v_route.distance_meters,
            'category',         v_route.category,
            'route_geojson',    v_route.route_geojson,
            'visibility',       v_route.visibility
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_partner_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_partner_token(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- =============================================================================
-- 3. RPC: get_partner_portal_data (Kumppanin hallintaportaali)
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_partner_portal_data(TEXT);

CREATE OR REPLACE FUNCTION public.get_partner_portal_data(
    p_portal_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_key TEXT;
    v_partner   RECORD;
    v_pools     JSONB;
    v_stats     JSONB;
    v_recent    JSONB;
BEGIN
    v_clean_key := upper(trim(COALESCE(p_portal_key, '')));
    IF v_clean_key = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Portaaliavain puuttuu.');
    END IF;

    SELECT * INTO v_partner
    FROM public.partner_organizations
    WHERE upper(trim(portal_access_key)) = v_clean_key
      AND is_active IS TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Virheellinen portaaliavain.');
    END IF;

    -- Haetaan kumppanin kaikki aktiiviset kiintiöt
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'pool_id',            p.id,
            'route_id',           p.route_id,
            'route_title',        r.title,
            'route_category',     r.category,
            'route_distance',     r.distance_meters,
            'package_name',       p.package_name,
            'total_credits',      p.total_credits,
            'used_credits',       p.used_credits,
            'credits_remaining',  GREATEST(0, p.total_credits - p.used_credits),
            'percentage_used',    ROUND((p.used_credits::NUMERIC / GREATEST(1, p.total_credits)) * 100, 1),
            'distribution_token', p.distribution_token,
            'welcome_title',      p.welcome_title,
            'welcome_message',    p.welcome_message,
            'valid_from',         p.valid_from,
            'valid_until',        p.valid_until,
            'is_active',          p.is_active,
            'created_at',         p.created_at
        ) ORDER BY p.created_at DESC
    ), '[]'::jsonb)
    INTO v_pools
    FROM public.partner_entitlement_pools p
    JOIN public.routes r ON r.id = p.route_id
    WHERE p.partner_id = v_partner.id;

    -- Kokonaistilastot
    SELECT jsonb_build_object(
        'total_pools',            COUNT(p.id),
        'total_purchased_credits', COALESCE(SUM(p.total_credits), 0),
        'total_used_credits',     COALESCE(SUM(p.used_credits), 0),
        'total_remaining_credits', GREATEST(0, COALESCE(SUM(p.total_credits), 0) - COALESCE(SUM(p.used_credits), 0))
    )
    INTO v_stats
    FROM public.partner_entitlement_pools p
    WHERE p.partner_id = v_partner.id AND p.is_active IS TRUE;

    -- Viimeisimmät 20 lunastustapahtumaa
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',           t.id,
            'route_title',  r.title,
            'client_type',  t.client_type,
            'redeemed_at',  t.redeemed_at
        ) ORDER BY t.redeemed_at DESC
    ), '[]'::jsonb)
    INTO v_recent
    FROM (
        SELECT t.*
        FROM public.entitlement_transactions t
        JOIN public.partner_entitlement_pools p ON p.id = t.pool_id
        WHERE p.partner_id = v_partner.id
        ORDER BY t.redeemed_at DESC
        LIMIT 20
    ) t
    JOIN public.routes r ON r.id = t.route_id;

    RETURN jsonb_build_object(
        'success',      true,
        'partner', jsonb_build_object(
            'id',           v_partner.id,
            'name',         v_partner.name,
            'slug',         v_partner.slug,
            'logo_url',     v_partner.logo_url,
            'website',      v_partner.website,
            'contact_name', v_partner.contact_name,
            'contact_email', v_partner.contact_email
        ),
        'stats',        v_stats,
        'pools',        v_pools,
        'recent_events', v_recent
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_portal_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_portal_data(TEXT) TO anon, authenticated, service_role;


-- =============================================================================
-- 4. Esimerkkidata (Peurunka Resort pilottiavain)
-- =============================================================================
DO $$
DECLARE
    v_first_route UUID;
    v_partner_id  UUID;
BEGIN
    -- Etsi jokin olemassa oleva reitti esimerkkiä varten
    SELECT id INTO v_first_route FROM public.routes LIMIT 1;

    IF v_first_route IS NOT NULL THEN
        -- Lisää tai päivitä pilottikumppani
        INSERT INTO public.partner_organizations (
            name, slug, contact_name, contact_email, website, portal_access_key
        ) VALUES (
            'Kylpylähotelli Peurunka',
            'peurunka-resort',
            'Matkailumyynti',
            'myynti@peurunka.fi',
            'https://peurunka.fi',
            'PEURUNKA-PORTAL-2026'
        )
        ON CONFLICT (slug) DO UPDATE
        SET portal_access_key = 'PEURUNKA-PORTAL-2026'
        RETURNING id INTO v_partner_id;

        -- Lisää pilottikiintiö (500 kpl)
        INSERT INTO public.partner_entitlement_pools (
            partner_id, route_id, package_name, total_credits, used_credits,
            distribution_token, welcome_title, welcome_message
        ) VALUES (
            v_partner_id,
            v_first_route,
            'Hotelli & Majoituspaketti 500',
            500,
            47, -- 47 käytetty havainnollistamiseen
            'PEURUNKA-500',
            'Tervetuloa Peurunkaan!',
            'Tämä elämysreitti sisältyy majoitukseesi. Mukavaa ja elämyksellistä retkeä!'
        )
        ON CONFLICT (distribution_token) DO NOTHING;
    END IF;
END $$;

COMMIT;
