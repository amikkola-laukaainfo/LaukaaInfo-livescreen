<?php
/**
 * Wonderin API – Muistokarttojen hallinta (maps)
 * /api/maps.php
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
$action = $body['action'] ?? ($_GET['action'] ?? '');
$map_id = $body['map_id'] ?? ($_GET['map_id'] ?? '');

// ── Apufunktio: tarkista omistajuus ──────────────────────────────────────────
function get_own_map(string $map_id, string $jwt, string $uid): ?array {
    $owner_filter = empty($_SESSION['user']['is_dev']) ? '&owner_id=eq.' . urlencode($uid) : '';
    $res = supabase_request('GET',
        '/rest/v1/routes?id=eq.' . urlencode($map_id)
        . $owner_filter
        . '&experience_type=eq.MEMORY&select=*',
        null, $jwt
    );
    if ($res['status'] === 200 && !empty($res['data'])) return $res['data'][0];
    return null;
}

// ── Toiminnot ─────────────────────────────────────────────────────────────────

// Listaa omat kartat
if ($action === 'list') {
    $owner_filter = empty($_SESSION['user']['is_dev']) ? '&owner_id=eq.' . urlencode($uid) : '';
    $res = supabase_request('GET',
        '/rest/v1/routes?experience_type=eq.MEMORY' . $owner_filter
        . '&select=id,title,edit_expires_at,view_expires_at,archive_until,created_at&order=created_at.desc',
        null, $jwt
    );
    json_response(['ok' => true, 'maps' => $res['data'] ?? []]);
}

// Hae yksittäinen kartta
if ($action === 'get') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Karttaa ei löydy.'], 404);
    $map_state = map_state($map['edit_expires_at']??null, $map['view_expires_at']??null, $map['archive_until']??null);
    json_response(['ok' => true, 'map' => $map, 'state' => $map_state]);
}

// Päivitä otsikko
if ($action === 'update_title') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
    $st = map_state($map['edit_expires_at']??null,$map['view_expires_at']??null,$map['archive_until']??null);
    if (!in_array($st, ['EDITABLE','DRAFT'])) json_response(['ok'=>false,'error'=>'Muokkausaika päättynyt.'],403);
    $title = trim($body['title'] ?? '');
    if (!$title) json_response(['ok'=>false,'error'=>'Nimi puuttuu.'],400);
    supabase_request('PATCH', '/rest/v1/routes?id=eq.' . urlencode($map_id), ['title' => $title], $jwt);
    json_response(['ok' => true]);
}

// Päivitä asetukset
if ($action === 'update_settings') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
    $st = map_state($map['edit_expires_at']??null,$map['view_expires_at']??null,$map['archive_until']??null);
    if (!in_array($st, ['EDITABLE','DRAFT'])) json_response(['ok'=>false,'error'=>'Muokkausaika päättynyt.'],403);
    $update = [];
    if (!empty($body['title']))       $update['title']       = trim($body['title']);
    if (isset($body['description']))  $update['description'] = trim($body['description']);
    if (empty($update)) json_response(['ok'=>false,'error'=>'Ei muutoksia.'],400);
    supabase_request('PATCH', '/rest/v1/routes?id=eq.' . urlencode($map_id), $update, $jwt);
    json_response(['ok' => true]);
}

// Hae nykyinen PIN-koodi (näytetään omistajalle; koodia ei vaihdeta)
if ($action === 'get_pin') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);

    // Jos selväkielinen view_pin on jo tallessa, palautetaan se suoraan!
    if (!empty($map['view_pin'])) {
        json_response(['ok' => true, 'pin' => $map['view_pin'], 'is_existing' => true]);
    }

    // Jos view_pin puuttuu (vanha kartta luotu ennen kentän lisäystä), luodaan kerran ja tallennetaan
    $pin = generate_pin();
    $hash = hash('sha256', $pin);
    supabase_request('PATCH', '/rest/v1/routes?id=eq.' . urlencode($map_id), [
        'view_pin'      => $pin,
        'view_pin_hash' => $hash,
    ], $jwt);
    json_response(['ok' => true, 'pin' => $pin, 'is_existing' => false]);
}

// Luo uusi PIN (vaihtaa koodin vain erikseen pyydettäessä)
if ($action === 'regenerate_pin') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
    $st = map_state($map['edit_expires_at']??null,$map['view_expires_at']??null,$map['archive_until']??null);
    if (!in_array($st, ['EDITABLE','VIEW_ONLY','DRAFT'])) json_response(['ok'=>false,'error'=>'Kartta arkistoitu.'],403);
    $pin  = generate_pin();
    $hash = hash('sha256', $pin);
    supabase_request('PATCH', '/rest/v1/routes?id=eq.' . urlencode($map_id), [
        'view_pin'      => $pin,
        'view_pin_hash' => $hash,
    ], $jwt);
    json_response(['ok' => true, 'pin' => $pin]);
}

// Poista kartta
if ($action === 'delete') {
    $map = get_own_map($map_id, $jwt, $uid);
    if (!$map) json_response(['ok' => false, 'error' => 'Ei oikeutta.'], 403);
    // Poista kaikki kartan pisteet ensin (CASCADE saattaa hoitaa sen, mutta varmistetaan)
    supabase_request('DELETE', '/rest/v1/experience_points?route_id=eq.' . urlencode($map_id), null, $jwt);
    supabase_request('DELETE', '/rest/v1/routes?id=eq.' . urlencode($map_id) . '&owner_id=eq.' . urlencode($uid), null, $jwt);
    json_response(['ok' => true]);
}

json_response(['ok' => false, 'error' => 'Tuntematon toiminto.'], 400);
