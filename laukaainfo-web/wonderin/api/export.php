<?php
/**
 * Wonderin API – CSV-vienti (round-trip export)
 * schema_version 1.0
 *
 * /api/export.php?map=<map_id>
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

$auth = ['jwt' => get_session_jwt(), 'user' => get_session_user()];
if (!$auth['jwt'] || !$auth['user']) {
    http_response_code(401);
    echo 'Kirjautuminen vaaditaan.';
    exit;
}

$jwt    = $auth['jwt'];
$uid    = $auth['user']['id'];
$map_id = $_GET['map'] ?? '';

if (!$map_id) { http_response_code(400); echo 'map-parametri puuttuu.'; exit; }

// Tarkista omistajuus
$map_res = supabase_request('GET',
    '/rest/v1/routes?id=eq.' . urlencode($map_id)
    . '&owner_id=eq.' . urlencode($uid)
    . '&experience_type=eq.MEMORY&select=id,title,edit_expires_at,view_expires_at,archive_until',
    null, $jwt
);
if ($map_res['status'] !== 200 || empty($map_res['data'])) {
    http_response_code(403); echo 'Ei oikeutta.'; exit;
}
$map = $map_res['data'][0];
$map_state = map_state($map['edit_expires_at']??null, $map['view_expires_at']??null, $map['archive_until']??null);
if ($map_state === 'PURGED') { http_response_code(410); echo 'Kartta on poistettu.'; exit; }

// Hae paikat memory_places-taulusta
$places_res = supabase_request('GET',
    '/rest/v1/memory_places?route_id=eq.' . urlencode($map_id) . '&select=*&order=sort_order.asc,created_at.asc',
    null, $jwt
);
$places = ($places_res['status'] === 200 && is_array($places_res['data'])) ? $places_res['data'] : [];

// Hae muistot kaikille paikoille
$rows = [];
foreach ($places as $place) {
    $mres = supabase_request('GET',
        '/rest/v1/memories?place_id=eq.' . urlencode($place['id'])
        . '&select=*&order=created_at.asc',
        null, $jwt
    );
    $memories = ($mres['status'] === 200 && is_array($mres['data'])) ? $mres['data'] : [];

    if (empty($memories)) {
        // Paikka ilman muistoja
        $rows[] = [
            'schema_version'   => '1.0',
            'map_title'        => $map['title'],
            'place_export_id'  => $place['id'],
            'place_name'       => $place['name'] ?? '',
            'lat'              => $place['lat'] ?? '',
            'lon'              => $place['lng'] ?? '',
            'memory_export_id' => '',
            'memory_title'     => '',
            'memory_year'      => '',
            'story_text'       => '',
            'media_url'        => '',
            'media_type'       => '',
        ];
    } else {
        foreach ($memories as $m) {
            $rows[] = [
                'schema_version'   => '1.0',
                'map_title'        => $map['title'],
                'place_export_id'  => $place['id'],
                'place_name'       => $place['title'] ?? $place['name'] ?? '',
                'lat'              => $place['lat'] ?? '',
                'lon'              => $place['lng'] ?? '',
                'memory_export_id' => $m['id'],
                'memory_title'     => $m['title'] ?? ($m['memory_title'] ?? ''),
                'memory_year'      => $m['year'] ?? ($m['memory_year'] ?? ''),
                'story_text'       => $m['description'] ?? ($m['story_text'] ?? ''),
                'media_url'        => $m['media_url'] ?? '',
                'media_type'       => $m['media_type'] ?? '',
            ];
        }
    }
}

// ── Tuota CSV ─────────────────────────────────────────────────────────────────
$filename = 'muistokartta_' . preg_replace('/[^a-z0-9_-]/i', '_', $map['title']) . '_' . date('Ymd') . '.csv';

header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');

// BOM UTF-8 Excel-yhteensopivuutta varten
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');

// Otsikkorivi
fputcsv($out, array_keys($rows[0] ?? ['schema_version','map_title','place_export_id','place_name','lat','lon','memory_export_id','memory_title','memory_year','story_text','media_url','media_type']));

foreach ($rows as $row) {
    fputcsv($out, array_values($row));
}

fclose($out);
exit;
