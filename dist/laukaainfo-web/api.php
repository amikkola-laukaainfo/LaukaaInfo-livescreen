<?php
/**
 * LaukaaInfo Feed API (api.php)
 * ───────────────────────────────────────
 * Location: /laukaainfo-web/api.php
 * Serves data from: content.json
 */

// --- CONFIGURATION ---
date_default_timezone_set('Europe/Helsinki');
$jsonFile  = 'content.json';
$maxLimit  = 50;
$defaultLimit = 50;

// Security: Prevent direct error leaking
error_reporting(0);
ini_set('display_errors', 0);

// Headers
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
header('Access-Control-Allow-Origin: *'); // Allow frontend calls

/**
 * Handle Output
 */
function sendResponse($data, $count, $status = 'ok') {
    echo json_encode([
        'status' => $status,
        'count'  => $count,
        'data'   => $data
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// --- CACHE LOGIC ---
$allowedParams = [
    'type' => $_GET['type'] ?? '',
    'business_id' => $_GET['business_id'] ?? '',
    'limit' => $_GET['limit'] ?? ''
];
$cacheKey = "feed_" . md5(serialize($allowedParams));
$cachePath = dirname(__FILE__) . "/cache_" . $cacheKey . ".json";

if (file_exists($cachePath) && (time() - filemtime($cachePath) < 60)) {
    $cachedContent = file_get_contents($cachePath);
    if ($cachedContent) {
        header('X-Cache: HIT');
        echo $cachedContent;
        exit;
    }
}

// --- LOAD DATA ---
if (!file_exists($jsonFile)) {
    sendResponse([], 0);
}

$rawJson = @file_get_contents($jsonFile);
$rawData = json_decode($rawJson, true);
if (!is_array($rawData)) {
    sendResponse([], 0);
}

// --- FILTERING ---
$filteredData = [];

// Query Params
$filterType = $_GET['type'] ?? null;
$filterBusiness = $_GET['business_id'] ?? null;
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : $defaultLimit;

// Enforce limit cap
if ($limit > $maxLimit) $limit = $maxLimit;
if ($limit < 1) $limit = $defaultLimit;

foreach ($rawData as $item) {
    // 1. Status Filter (Exclude archived)
    if (isset($item['status']) && $item['status'] === 'archived') {
        continue;
    }

    // 2. Type Filter
    if ($filterType && $item['type'] !== $filterType) {
        continue;
    }

    // 3. Business ID Filter
    if ($filterBusiness && $item['business_id'] != $filterBusiness) {
        continue;
    }

    // --- CLEAN DATA (Whitelist fields) ---
    // Part 4: Do NOT expose imagekit_file_id, internal status, or tokens
    $cleanItem = [
        'id'          => $item['id'] ?? '',
        'business_id' => $item['business_id'] ?? '',
        'type'        => $item['type'] ?? '',
        'title'       => $item['title'] ?? '',
        'description' => $item['description'] ?? '',
        'image'       => $item['image'] ?? '',
        'publish_at'  => $item['publish_at'] ?? '',
        'is_promoted' => $item['is_promoted'] ?? false,
        'publisher_name' => $item['publisher_name'] ?? '',
        'package'     => $item['package'] ?? ($item['tyyppi'] ?? 'perus'),
        'images'      => is_array($item['images'] ?? null) ? $item['images'] : (!empty($item['image']) ? [$item['image']] : []),
        'videos'      => is_array($item['videos'] ?? null) ? $item['videos'] : (!empty($item['video_url']) ? [$item['video_url']] : [])
    ];

    // Optional fields
    if (isset($item['website_url']))   $cleanItem['website_url'] = $item['website_url'];
    if (isset($item['facebook_url']))  $cleanItem['facebook_url'] = $item['facebook_url'];
    if (isset($item['instagram_url'])) $cleanItem['instagram_url'] = $item['instagram_url'];
    if (isset($item['instagram']))     $cleanItem['instagram'] = $item['instagram'];
    if (isset($item['youtube_url']))   $cleanItem['youtube_url'] = $item['youtube_url'];
    if (isset($item['video_id']))      $cleanItem['video_id'] = $item['video_id'];
    if (isset($item['is_shorts']))     $cleanItem['is_shorts'] = $item['is_shorts'];
    if (isset($item['video']))         $cleanItem['video'] = $item['video'];
    if (isset($item['video_url']))     $cleanItem['video_url'] = $item['video_url'];
    
    // Contact Info
    if (isset($item['show_contact']))  $cleanItem['show_contact'] = (bool)$item['show_contact'];
    if (isset($item['contact_email'])) $cleanItem['contact_email'] = $item['contact_email'];
    if (isset($item['contact_phone'])) $cleanItem['contact_phone'] = $item['contact_phone'];
    
    if (isset($item['phone']))         $cleanItem['phone'] = $item['phone'];
    if (isset($item['puhelin']))       $cleanItem['puhelin'] = $item['puhelin'];
    if (isset($item['puhelinnumero'])) $cleanItem['puhelinnumero'] = $item['puhelinnumero'];
    if (isset($item['facebook']))      $cleanItem['facebook'] = $item['facebook'];

    $filteredData[] = $cleanItem;
}

// --- SORTING ---
// publish_at DESC (newest first)
usort($filteredData, function($a, $b) {
    $dateA = $a['publish_at'] ?? '';
    $dateB = $b['publish_at'] ?? '';
    return strcmp($dateB, $dateA);
});

// --- LIMITING ---
$finalData = array_slice($filteredData, 0, $limit);

// --- CACHE STORAGE ---
$response = json_encode([
    'status' => 'ok',
    'count'  => count($finalData),
    'data'   => $finalData
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

@file_put_contents($cachePath, $response);

header('X-Cache: MISS');
echo $response;
exit;
