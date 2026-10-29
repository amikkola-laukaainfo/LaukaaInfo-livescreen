<?php
/**
 * Wonderin API – CSV-tuonti (round-trip import) ID-remapping-logiikalla
 * /api/import.php
 *
 * POST { map_id, mode: 'new'|'merge', rows: [...] }
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

$auth = ['jwt' => get_session_jwt(), 'user' => get_session_user()];
if (!$auth['jwt'] || !$auth['user']) {
    json_response(['ok' => false, 'error' => 'Kirjautuminen vaaditaan.'], 401);
}

$jwt    = $auth['jwt'];
$uid    = $auth['user']['id'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$mode   = $body['mode'] ?? 'new';
$rows   = $body['rows'] ?? [];
$map_id = $body['map_id'] ?? '';

if (empty($rows)) json_response(['ok' => false, 'error' => 'Ei tuotavia rivejä.'], 400);

// Tarkista schema_version
$first = $rows[0];
if (($first['schema_version'] ?? '') !== '1.0') {
    json_response(['ok' => false, 'error' => 'Tuntematon schema_version: ' . ($first['schema_version'] ?? 'puuttuu')], 400);
}

// ── Validointi ────────────────────────────────────────────────────────────────
$errors = [];
foreach ($rows as $i => $row) {
    if (empty($row['place_name'])) $errors[] = "Rivi $i: place_name puuttuu.";
    if (!empty($row['lat']) && !is_numeric($row['lat'])) $errors[] = "Rivi $i: lat ei ole numero.";
    if (!empty($row['lon']) && !is_numeric($row['lon'])) $errors[] = "Rivi $i: lon ei ole numero.";
}
if ($errors) json_response(['ok' => false, 'error' => implode(' ', $errors)], 400);

// ── Määritä kohdekartta ───────────────────────────────────────────────────────
$target_map_id = null;

if ($mode === 'new') {
    // Luo uusi MEMORY-kartta
    $import_title = $first['map_title'] ?? ('Tuotu muistokartta ' . date('d.m.Y'));
    $tok = generate_share_token();
    $pin = generate_pin();
    $pin_hash = hash('sha256', $pin);

    // Uusi kartta ilman muokkausaikaa (luonnos) – lunasta aktivointikoodi erikseen
    $create_res = supabase_request('POST', '/rest/v1/routes', [
        'title'           => $import_title,
        'description'     => 'Tuotu CSV-tiedostosta ' . date('d.m.Y'),
        'experience_type' => 'MEMORY',
        'visibility'      => 'private',
        'distance_meters' => 0,
        'route_geojson'   => [
            'type'     => 'FeatureCollection',
            'features' => [],
        ],
        'owner_id'        => $uid,
        'share_token'     => $tok,
        'view_pin'        => $pin,
        'view_pin_hash'   => $pin_hash,
    ], $jwt);

    if ($create_res['status'] !== 201 || empty($create_res['data'])) {
        json_response(['ok' => false, 'error' => 'Uuden kartan luonti epäonnistui.'], 500);
    }
    $target_map_id = $create_res['data'][0]['id'];

} elseif ($mode === 'merge') {
    // Tarkista omistajuus olemassa olevaan karttaan
    if (!$map_id) json_response(['ok' => false, 'error' => 'map_id puuttuu merge-tuonnissa.'], 400);
    $mr = supabase_request('GET',
        '/rest/v1/routes?id=eq.' . urlencode($map_id) . '&owner_id=eq.' . urlencode($uid)
        . '&experience_type=eq.MEMORY&select=id,edit_expires_at,view_expires_at,archive_until',
        null, $jwt
    );
    if ($mr['status'] !== 200 || empty($mr['data'])) {
        json_response(['ok' => false, 'error' => 'Karttaa ei löydy tai ei oikeutta.'], 403);
    }
    $map = $mr['data'][0];
    $st  = map_state($map['edit_expires_at']??null, $map['view_expires_at']??null, $map['archive_until']??null);
    if (!in_array($st, ['EDITABLE', 'DRAFT'])) {
        json_response(['ok' => false, 'error' => 'Muokkausaika päättynyt.'], 403);
    }
    $target_map_id = $map_id;
}

// ── ID-remapping: ryhmittele rivit paikan export_id:n mukaan ──────────────────
$place_groups = [];
foreach ($rows as $row) {
    $pid = $row['place_export_id'] ?? $row['place_name'] ?? 'unknown';
    if (!isset($place_groups[$pid])) $place_groups[$pid] = ['info' => $row, 'memories' => []];
    if (!empty($row['memory_export_id']) || !empty($row['memory_title'])) {
        $place_groups[$pid]['memories'][] = $row;
    }
}

// ── Tallenna paikat ja muistot ────────────────────────────────────────────────
$created_places   = 0;
$created_memories = 0;
$order = 0;

foreach ($place_groups as $export_pid => $group) {
    $info = $group['info'];

    // Luo paikka → uusi UUID (ei käytetä CSV:n place_export_id:tä suoraan)
    $place_payload = [
        'route_id'   => $target_map_id,
        'name'       => $info['place_name'] ?? 'Nimetön paikka',
        'description'=> null,
        'lat'        => !empty($info['lat'])  ? (float)$info['lat']  : null,
        'lng'        => !empty($info['lon'])  ? (float)$info['lon']  : null,
        'sort_order' => $order++,
    ];
    $pr = supabase_request('POST', '/rest/v1/memory_places', $place_payload, $jwt);
    if ($pr['status'] !== 201 || empty($pr['data'])) continue; // Ohita virheelliset paikat
    $new_place_id = $pr['data'][0]['id'];
    $created_places++;

    // Luo muistot → uudet UUID:t
    foreach ($group['memories'] as $m) {
        $mTitle = $m['title'] ?? ($m['memory_title'] ?? '');
        if (empty($mTitle)) continue;
        $mr = supabase_request('POST', '/rest/v1/memories', [
            'place_id'    => $new_place_id,
            'title'       => $mTitle,
            'description' => ($m['description'] ?? ($m['story_text'] ?? '')) ?: null,
            'year'        => !empty($m['year']) ? (int)$m['year'] : (!empty($m['memory_year']) ? (int)$m['memory_year'] : null),
            'media_url'   => ($m['media_url'] ?? '') ?: null,
            'media_type'  => !empty($m['media_type']) ? strtoupper($m['media_type']) : null,
        ], $jwt);
        if ($mr['status'] === 201) $created_memories++;
    }
}

json_response([
    'ok'               => true,
    'target_map_id'    => $target_map_id,
    'created_places'   => $created_places,
    'created_memories' => $created_memories,
    'mode'             => $mode,
]);
