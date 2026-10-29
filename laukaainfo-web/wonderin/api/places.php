<?php
/**
 * Wonderin API – Paikkojen hallinta
 * Käyttää memory_places-taulua (ei experience_points, jota ei ole tässä Supabasessa)
 * /api/places.php
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

$auth = ['jwt' => get_session_jwt(), 'user' => get_session_user()];
if (!$auth['jwt'] || !$auth['user']) {
    json_response(['ok' => false, 'error' => 'Kirjautuminen vaaditaan.'], 401);
}

$jwt    = $auth['jwt'];
$uid    = $auth['user']['id'];
$method = $_SERVER['REQUEST_METHOD'];
$body   = ($method === 'POST') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];
$action = $body['action'] ?? ($_GET['action'] ?? ($method === 'GET' ? 'list' : ''));

// ── Apufunktio: tarkista kartan omistajuus ja muokattavuus ────────────────────
function verify_editable_map(string $map_id, string $jwt, string $uid): void {
    if (!empty($_SESSION['user']['is_dev'])) return;
    $res = supabase_request('GET',
        '/rest/v1/routes?id=eq.' . urlencode($map_id)
        . '&owner_id=eq.' . urlencode($uid)
        . '&experience_type=eq.MEMORY&select=id,edit_expires_at,view_expires_at,archive_until',
        null, $jwt
    );
    if ($res['status'] !== 200 || empty($res['data'])) {
        json_response(['ok' => false, 'error' => 'Karttaa ei löydy tai ei oikeutta.'], 403);
    }
    $map = $res['data'][0];
    $st  = map_state($map['edit_expires_at'] ?? null, $map['view_expires_at'] ?? null, $map['archive_until'] ?? null);
    if (!in_array($st, ['EDITABLE', 'DRAFT'])) {
        json_response(['ok' => false, 'error' => 'Muokkausaika päättynyt. Osta uusi muokkausjakso.'], 403);
    }
}

// ── Listaa paikan pisteet ─────────────────────────────────────────────────────
if ($action === 'list' || $method === 'GET') {
    $map_id = $body['map_id'] ?? ($_GET['map_id'] ?? '');
    if (!$map_id) json_response(['ok' => false, 'error' => 'map_id puuttuu.'], 400);

    // Tarkista omistajuus tai katselijasessio
    $viewer_map = $_SESSION['viewer_map_id'] ?? null;
    if ($viewer_map !== $map_id && empty($_SESSION['user']['is_dev'])) {
        $own_res = supabase_request('GET',
            '/rest/v1/routes?id=eq.' . urlencode($map_id) . '&owner_id=eq.' . urlencode($uid)
            . '&experience_type=eq.MEMORY&select=id',
            null, $jwt
        );
        if ($own_res['status'] !== 200 || empty($own_res['data'])) {
            json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
        }
    }

    $res = supabase_request('GET',
        '/rest/v1/memory_places?route_id=eq.' . urlencode($map_id)
        . '&select=*&order=sort_order.asc,created_at.asc',
        null, $jwt
    );
    json_response(['ok' => true, 'places' => $res['data'] ?? []]);
}

// ── Luo paikka ───────────────────────────────────────────────────────────────
if ($action === 'create') {
    $map_id = $body['map_id'] ?? '';
    if (!$map_id) json_response(['ok' => false, 'error' => 'map_id puuttuu.'], 400);
    verify_editable_map($map_id, $jwt, $uid);

    $name = trim($body['name'] ?? '');
    if (!$name) json_response(['ok' => false, 'error' => 'Paikan nimi puuttuu.'], 400);

    // Laske seuraava järjestysnumero
    $cnt_res = supabase_request('GET',
        '/rest/v1/memory_places?route_id=eq.' . urlencode($map_id) . '&select=id',
        null, $jwt
    );
    $order = is_array($cnt_res['data']) ? count($cnt_res['data']) : 0;

    $payload = [
        'route_id'   => $map_id,
        'name'       => $name,
        'description'=> trim($body['description'] ?? '') ?: null,
        'lat'        => is_numeric($body['lat'] ?? null) ? (float)$body['lat'] : null,
        'lng'        => is_numeric($body['lng'] ?? null) ? (float)$body['lng'] : null,
        'sort_order' => $order,
    ];

    $res = supabase_request('POST', '/rest/v1/memory_places', $payload, $jwt);
    if ($res['status'] === 201 && !empty($res['data'])) {
        $place = $res['data'][0];
        // Normalisoi kenttänimet vastaamaan editoria (title/name yhtenäisyys)
        $place['title'] = $place['name'];
        json_response(['ok' => true, 'place' => $place]);
    }
    $errMsg = is_array($res['data']) ? ($res['data']['message'] ?? ($res['data']['error_description'] ?? json_encode($res['data'], JSON_UNESCAPED_UNICODE))) : (string)$res['data'];
    json_response(['ok' => false, 'error' => 'Tallennusvirhe (HTTP ' . $res['status'] . '): ' . $errMsg], 500);
}

// ── Päivitä paikka ────────────────────────────────────────────────────────────
if ($action === 'update') {
    $place_id = $body['id'] ?? '';
    $map_id   = $body['map_id'] ?? '';
    if (!$place_id || !$map_id) json_response(['ok' => false, 'error' => 'id tai map_id puuttuu.'], 400);
    verify_editable_map($map_id, $jwt, $uid);

    $update = [];
    if (isset($body['name']))        $update['name']        = trim($body['name']);
    if (isset($body['description'])) $update['description'] = trim($body['description']) ?: null;
    if (isset($body['lat']))         $update['lat']         = is_numeric($body['lat']) ? (float)$body['lat'] : null;
    if (isset($body['lng']))         $update['lng']         = is_numeric($body['lng']) ? (float)$body['lng'] : null;

    if (empty($update)) json_response(['ok' => false, 'error' => 'Ei muutoksia.'], 400);

    $is_svc = !empty($_SESSION['user']['is_dev']);
    $res = supabase_request('PATCH',
        '/rest/v1/memory_places?id=eq.' . urlencode($place_id) . '&route_id=eq.' . urlencode($map_id),
        $update, $jwt, $is_svc
    );
    json_response(['ok' => $res['status'] < 300]);
}

// ── Poista paikka ─────────────────────────────────────────────────────────────
if ($action === 'delete') {
    $place_id = $body['id'] ?? '';
    $map_id   = $body['map_id'] ?? '';
    if (!$place_id || !$map_id) json_response(['ok' => false, 'error' => 'id tai map_id puuttuu.'], 400);
    verify_editable_map($map_id, $jwt, $uid);

    $is_svc = !empty($_SESSION['user']['is_dev']);
    // Muistot poistuvat CASCADE:lla
    $res = supabase_request('DELETE',
        '/rest/v1/memory_places?id=eq.' . urlencode($place_id) . '&route_id=eq.' . urlencode($map_id),
        null, $jwt, $is_svc
    );
    json_response(['ok' => $res['status'] < 300]);
}

// ── Järjestä paikka (ylös/alas) ──────────────────────────────────────────────
if ($action === 'reorder') {
    $map_id   = $body['map_id'] ?? '';
    $place_id = $body['id'] ?? '';
    $dir      = $body['direction'] ?? ''; // 'up' tai 'down'
    if (!$map_id || !$place_id || !in_array($dir, ['up','down'])) {
        json_response(['ok' => false, 'error' => 'map_id, id ja direction (up/down) vaaditaan.'], 400);
    }
    verify_editable_map($map_id, $jwt, $uid);

    // Hae kaikki paikat järjestyksessä
    $all = supabase_request('GET',
        '/rest/v1/memory_places?route_id=eq.' . urlencode($map_id)
        . '&select=id,sort_order&order=sort_order.asc,created_at.asc',
        null, $jwt
    );
    if ($all['status'] !== 200 || !is_array($all['data'])) {
        json_response(['ok' => false, 'error' => 'Paikkojen haku epäonnistui.'], 500);
    }
    $list = $all['data'];
    $idx  = array_search($place_id, array_column($list, 'id'));
    if ($idx === false) json_response(['ok' => false, 'error' => 'Paikkaa ei löydy.'], 404);

    $swap_idx = $dir === 'up' ? $idx - 1 : $idx + 1;
    if ($swap_idx < 0 || $swap_idx >= count($list)) {
        json_response(['ok' => false, 'error' => 'Jo ensimmäinen tai viimeinen.'], 400);
    }

    // Vaihda sort_order-arvot
    $a = $list[$idx];
    $b = $list[$swap_idx];

    // Normalisoi: varmista että eri arvot (jotta ei konflikti)
    $new_a = (int)$b['sort_order'];
    $new_b = (int)$a['sort_order'];
    if ($new_a === $new_b) { $new_a = $swap_idx; $new_b = $idx; }

    $is_svc = !empty($_SESSION['user']['is_dev']);
    $r1 = supabase_request('PATCH',
        '/rest/v1/memory_places?id=eq.' . urlencode($a['id']) . '&route_id=eq.' . urlencode($map_id),
        ['sort_order' => $new_a], $jwt, $is_svc
    );
    $r2 = supabase_request('PATCH',
        '/rest/v1/memory_places?id=eq.' . urlencode($b['id']) . '&route_id=eq.' . urlencode($map_id),
        ['sort_order' => $new_b], $jwt, $is_svc
    );
    json_response(['ok' => $r1['status'] < 300 && $r2['status'] < 300]);
}

json_response(['ok' => false, 'error' => 'Tuntematon toiminto.'], 400);
