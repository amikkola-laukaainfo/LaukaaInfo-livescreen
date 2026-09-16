-- Supabase RPC Function: get_route_with_access
-- Safe server-side route access validation for LaukaaInfo Elämyspolku Engine

-- Ensure pgcrypto extension is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION get_route_with_access(route_id UUID, provided_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_route RECORD;
    v_points JSONB;
    v_granted BOOLEAN := FALSE;
    v_provided_hash TEXT;
    -- Pre-calculated SHA-256 hashes of server admin passwords (never store raw passwords!)
    -- Example SHA-256 hashes:
    -- 'laukaa-admin-2026' -> '63b965f80bfebfdf696144ec3c22adfa874f67c46132488d752c0029b9f9ecbe'
    -- 'suunnittelija'     -> 'f606771d18bcffed1e09c11867c2d82bf4f323a77d1302821d3f94e9f390df03'
    v_admin_hashes TEXT[] := ARRAY[
        '63b965f80bfebfdf696144ec3c22adfa874f67c46132488d752c0029b9f9ecbe',
        'f606771d18bcffed1e09c11867c2d82bf4f323a77d1302821d3f94e9f390df03'
    ];
BEGIN
    SELECT * INTO v_route FROM routes WHERE id = route_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Reittiä ei löytynyt');
    END IF;

    -- Check if route is public
    IF v_route.is_public = TRUE THEN
        v_granted := TRUE;
    ELSIF provided_code IS NOT NULL AND trim(provided_code) <> '' THEN
        -- Hash the provided input for comparison
        v_provided_hash := encode(extensions.digest(lower(trim(provided_code)), 'sha256'), 'hex');

        -- Check if provided code matches route access_code or matches any hashed admin password
        IF lower(trim(provided_code)) = lower(trim(COALESCE(v_route.access_code, '')))
           OR v_provided_hash = ANY(v_admin_hashes) THEN
            v_granted := TRUE;
        END IF;
    END IF;

    IF v_granted THEN
        -- Fetch route waypoints if separated, or full data
        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordinal) INTO v_points
        FROM route_points p WHERE p.route_id = route_id;

        RETURN jsonb_build_object(
            'id', v_route.id,
            'title', v_route.title,
            'description', v_route.description,
            'is_public', v_route.is_public,
            'access_granted', true,
            'route_geojson', v_route.route_geojson,
            'points', COALESCE(v_points, '[]'::jsonb)
        );
    ELSE
        -- Return only public summary WITHOUT GeoJSON coordinates or secret story content
        RETURN jsonb_build_object(
            'id', v_route.id,
            'title', v_route.title,
            'description', 'Tämä elämyspolku on suojattu. Syötä pääsykoodi avataksesi reitin.',
            'is_public', false,
            'access_granted', false
        );
    END IF;
END;
$$;

-- Security hardening for SECURITY DEFINER RPC
REVOKE ALL ON FUNCTION get_route_with_access(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_route_with_access(UUID, TEXT) TO anon, authenticated, service_role;
