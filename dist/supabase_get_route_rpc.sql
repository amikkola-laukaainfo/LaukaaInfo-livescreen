-- Supabase RPC Function: get_route_with_access
-- Safe server-side route access validation for LaukaaInfo Elämyspolku Engine

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.get_route_with_access(route_id UUID, provided_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_route RECORD;
    v_granted BOOLEAN := FALSE;
    v_provided_hash TEXT;
    v_admin_hashes TEXT[] := ARRAY[
        '63b965f80bfebfdf696144ec3c22adfa874f67c46132488d752c0029b9f9ecbe',
        'f606771d18bcffed1e09c11867c2d82bf4f323a77d1302821d3f94e9f390df03'
    ];
BEGIN
    SELECT * INTO v_route FROM public.routes WHERE id = route_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Reittiä ei löytynyt');
    END IF;

    -- Check if route is public or if visibility column is not set
    IF v_route.visibility = 'public' OR v_route.visibility IS NULL THEN
        v_granted := TRUE;
    ELSIF provided_code IS NOT NULL AND trim(provided_code) <> '' THEN
        -- Hash provided code using SHA-256 for comparison with access_code_hash
        v_provided_hash := encode(extensions.digest(lower(trim(provided_code)), 'sha256'), 'hex');

        IF v_provided_hash = COALESCE(v_route.access_code_hash, '')
           OR v_provided_hash = ANY(v_admin_hashes) THEN
            v_granted := TRUE;
        END IF;
    END IF;

    IF v_granted THEN
        RETURN jsonb_build_object(
            'id', v_route.id,
            'title', v_route.title,
            'description', v_route.description,
            'visibility', COALESCE(v_route.visibility, 'public'),
            'access_granted', true,
            'route_geojson', v_route.route_geojson,
            'distance_meters', v_route.distance_meters,
            'category', COALESCE(v_route.category, '')
        );
    ELSE
        -- Return public summary WITHOUT GeoJSON coordinates
        RETURN jsonb_build_object(
            'id', v_route.id,
            'title', v_route.title,
            'description', 'Tämä elämyspolku on suojattu. Syötä pääsykoodi avataksesi reitin.',
            'visibility', v_route.visibility,
            'access_granted', false
        );
    END IF;
END;
$$;

-- Security hardening for SECURITY DEFINER RPC
REVOKE ALL ON FUNCTION public.get_route_with_access(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_route_with_access(UUID, TEXT) TO anon, authenticated, service_role;

