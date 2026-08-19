// LaukaaInfo Supabase Edge Function: places-api
// ================================================
// Tarjoaa julkisen rajapinnan LaukaaInfon places-taulun tietoihin.
// Mixonet ja muut ulkoiset palvelut hakevat paikat tämän kautta.
//
// Deploy: supabase functions deploy places-api
// URL:    https://duxluwyqxvbmkkjzuzkz.supabase.co/functions/v1/places-api
//
// Endpointit:
//   GET /places-api             → kaikki paikat (kevyt lista)
//   GET /places-api?id=<uuid>   → yksittäisen paikan tiedot
//   GET /places-api?q=<haku>    → tekstihaku nimellä tai kunnalla
//   GET /places-api?type=AREA   → suodatus tyypin mukaan
//   GET /places-api?municipality=Laukaa → suodatus kunnan mukaan

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const q = url.searchParams.get('q');
  const type = url.searchParams.get('type');
  const municipality = url.searchParams.get('municipality');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);

  // Käytetään service_role-avainta, jotta voidaan lukea RLS:n ohi
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Yksittäinen paikka ID:llä ──────────────────────────────────────────
    if (id) {
      const { data, error } = await supabase
        .from('places')
        .select('place_id, name, canonical_name, type, municipality, description, lat, lon, importance, status, verified, is_visibility_target, parent_place_id')
        .eq('place_id', id)
        .neq('status', 'deleted')
        .single();

      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ error: 'Place not found' }), {
          status: 404,
          headers: CORS_HEADERS,
        });
      }

      return new Response(JSON.stringify(data), { headers: CORS_HEADERS });
    }

    // ── Lista paikoista ────────────────────────────────────────────────────
    let query = supabase
      .from('places')
      .select('place_id, name, canonical_name, type, municipality, description, lat, lon, importance, status, is_visibility_target')
      .neq('status', 'deleted')
      .order('importance', { ascending: false })
      .limit(limit);

    // Tekstihaku
    if (q) {
      query = query.or(`name.ilike.%${q}%,canonical_name.ilike.%${q}%,municipality.ilike.%${q}%`);
    }

    // Tyyppihaku
    if (type) {
      query = query.eq('type', type.toUpperCase());
    }

    // Kuntahaku
    if (municipality) {
      query = query.ilike('municipality', `%${municipality}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return new Response(
      JSON.stringify({
        count: data?.length ?? 0,
        places: data ?? [],
        // Mixonetin place_cache voi tallentaa tämän välimuistiin
        cached_at: new Date().toISOString(),
      }),
      { headers: CORS_HEADERS }
    );

  } catch (err: any) {
    console.error('places-api error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
