<?php
/**
 * Wonderin API – Muistojen hallinta
 * Muistot tallennetaan memories-tauluun, joka viittaa memory_places-tauluun.
 * Muiston rakenne: { place_id, memory_title, memory_year, story_text, media_url, media_type }
 *
 * /api/memories.php
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

$auth = ['jwt' => get_session_jwt(), 'user' => get_session_user()];
if (!$auth['jwt'] || !$auth['user']) {
    // Salli myös katselijoille lukuoikeus
    $viewer_ok = !empty($_SESSION['viewer_map_id']);
    if (!$viewer_ok) {
        json_response(['ok' => false, 'error' => 'Kirjautuminen vaaditaan.'], 401);
    }
}

$jwt    = $auth['jwt'] ?? SUPABASE_ANON_KEY;
$uid    = $auth['user']['id'] ?? null;
$method = $_SERVER['REQUEST_METHOD'];
$body   = ($method === 'POST') ? (json_decode(file_get_contents('php://input'), true) ?? []) : [];
$action = $body['action'] ?? ($_GET['action'] ?? ($method === 'GET' ? 'list' : ''));

// ── Hae muistot paikan mukaan ─────────────────────────────────────────────────
if ($action === 'list' || ($method === 'GET' && isset($_GET['place_id']))) {
    $place_id = $_GET['place_id'] ?? $body['place_id'] ?? '';
    if (!$place_id) json_response(['ok' => false, 'error' => 'place_id puuttuu.'], 400);

    $res = supabase_request('GET',
        '/rest/v1/memories?place_id=eq.' . urlencode($place_id)
        . '&select=*&order=created_at.asc',
        null, $jwt
    );
    $data = ($res['status'] === 200 && is_array($res['data'])) ? $res['data'] : [];
    foreach ($data as &$m) {
        $m['memory_title'] = $m['title'] ?? ($m['memory_title'] ?? '');
        $m['story_text']   = $m['description'] ?? ($m['story_text'] ?? '');
        $m['memory_year']  = $m['year'] ?? ($m['memory_year'] ?? '');
    }
    unset($m);
    json_response(['ok' => true, 'data' => $data]);
}

// Muokkaus vaatii aina autentikoinnin ja muokattavan kartan
if (!$uid) json_response(['ok' => false, 'error' => 'Kirjautuminen vaaditaan.'], 401);

function verify_place_editable(string $place_id, string $jwt, string $uid): string {
    // Hae place → route_id (käytetään memory_places-taulua)
    $res = supabase_request('GET',
        '/rest/v1/memory_places?id=eq.' . urlencode($place_id) . '&select=id,route_id',
        null, $jwt
    );
    if ($res['status'] !== 200 || empty($res['data'])) {
        json_response(['ok' => false, 'error' => 'Paikkaa ei löydy.'], 404);
    }
    $map_id = $res['data'][0]['route_id'];

    // Tarkista omistajuus & muokattavuus
    if (!empty($_SESSION['user']['is_dev'])) {
        return $map_id;
    }
    $mr = supabase_request('GET',
        '/rest/v1/routes?id=eq.' . urlencode($map_id) . '&owner_id=eq.' . urlencode($uid)
        . '&experience_type=eq.MEMORY&select=id,edit_expires_at,view_expires_at,archive_until',
        null, $jwt
    );
    if ($mr['status'] !== 200 || empty($mr['data'])) {
        json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
    }
    $map = $mr['data'][0];
    $st  = map_state($map['edit_expires_at']??null, $map['view_expires_at']??null, $map['archive_until']??null);
    if (!in_array($st, ['EDITABLE', 'DRAFT'])) {
        json_response(['ok' => false, 'error' => 'Muokkausaika päättynyt.'], 403);
    }
    return $map_id;
}

// ── Luo muisto ────────────────────────────────────────────────────────────────
if ($action === 'create') {
    $place_id = $body['place_id'] ?? '';
    if (!$place_id) json_response(['ok' => false, 'error' => 'place_id puuttuu.'], 400);
    verify_place_editable($place_id, $jwt, $uid);

    $title = trim($body['title'] ?? ($body['memory_title'] ?? ''));
    if (!$title) json_response(['ok' => false, 'error' => 'Otsikko puuttuu.'], 400);

    $payload = [
        'place_id'    => $place_id,
        'title'       => $title,
        'description' => trim($body['description'] ?? ($body['story_text'] ?? '')) ?: null,
        'year'        => !empty($body['year']) ? (int)$body['year'] : (!empty($body['memory_year']) ? (int)$body['memory_year'] : null),
        'media_url'   => trim($body['media_url']   ?? '') ?: null,
        'media_type'  => !empty($body['media_type']) ? strtoupper($body['media_type']) : null,
    ];

    $res = supabase_request('POST', '/rest/v1/memories', $payload, $jwt);
    if ($res['status'] === 201 && !empty($res['data'])) {
        $memory = $res['data'][0];
        $memory['memory_title'] = $memory['title'] ?? '';
        $memory['story_text']   = $memory['description'] ?? '';
        $memory['memory_year']  = $memory['year'] ?? '';
        json_response(['ok' => true, 'memory' => $memory]);
    }
    $errMsg = is_array($res['data']) ? ($res['data']['message'] ?? ($res['data']['error_description'] ?? json_encode($res['data'], JSON_UNESCAPED_UNICODE))) : (string)$res['data'];
    json_response(['ok' => false, 'error' => 'Tallennusvirhe (HTTP ' . $res['status'] . '): ' . $errMsg], 500);
}

// ── Päivitä muisto ────────────────────────────────────────────────────────────
if ($action === 'update') {
    $id       = $body['id'] ?? '';
    $place_id = $body['place_id'] ?? '';
    if (!$id || !$place_id) json_response(['ok' => false, 'error' => 'id tai place_id puuttuu.'], 400);
    verify_place_editable($place_id, $jwt, $uid);

    $update = [];
    if (isset($body['title']) || isset($body['memory_title'])) {
        $update['title'] = trim($body['title'] ?? $body['memory_title']);
    }
    if (isset($body['description']) || isset($body['story_text'])) {
        $update['description'] = trim($body['description'] ?? $body['story_text']) ?: null;
    }
    if (isset($body['year']) || isset($body['memory_year'])) {
        $y = $body['year'] ?? $body['memory_year'];
        $update['year'] = $y ? (int)$y : null;
    }
    if (isset($body['media_url']))  $update['media_url']  = trim($body['media_url']) ?: null;
    if (isset($body['media_type'])) $update['media_type'] = $body['media_type'] ? strtoupper($body['media_type']) : null;

    $res = supabase_request('PATCH',
        '/rest/v1/memories?id=eq.' . urlencode($id) . '&place_id=eq.' . urlencode($place_id),
        $update, $jwt
    );
    json_response(['ok' => $res['status'] < 300]);
}

// ── Poista muisto ─────────────────────────────────────────────────────────────
if ($action === 'delete') {
    $id       = $body['id'] ?? '';
    $place_id = $body['place_id'] ?? '';

    // Jos place_id puuttuu, haetaan se muiston ID:llä
    if (!$place_id && $id) {
        $mr = supabase_request('GET', '/rest/v1/memories?id=eq.' . urlencode($id) . '&select=place_id', null, $jwt);
        if ($mr['status'] === 200 && !empty($mr['data'])) $place_id = $mr['data'][0]['place_id'];
    }

    if (!$id) json_response(['ok' => false, 'error' => 'id puuttuu.'], 400);
    if ($place_id) verify_place_editable($place_id, $jwt, $uid);

    $res = supabase_request('DELETE', '/rest/v1/memories?id=eq.' . urlencode($id), null, $jwt);
    json_response(['ok' => $res['status'] < 300]);
}

json_response(['ok' => false, 'error' => 'Tuntematon toiminto.'], 400);
