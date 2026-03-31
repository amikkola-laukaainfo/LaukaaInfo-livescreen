<?php
/**
 * Pikkuilmot API (pikkuilmot_api.php)
 * Handles JSON storage for small ads with 7-day expiration.
 */

// --- CONFIGURATION ---
error_reporting(0);
ini_set('display_errors', 0);
date_default_timezone_set('Europe/Helsinki');
$jsonFile = 'pikkuilmot.json';
$adminPassword = 'Laukaa2026'; // PLEASE CHANGE THIS AFTER DEPLOYMENT

// Headers
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

// Handle Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

/**
 * Load and filter data (7-day expiration)
 */
function getItems($file) {
    if (!file_exists($file)) return [];
    
    $raw = @file_get_contents($file);
    if (!$raw) return [];
    
    $data = json_decode($raw, true);
    if (!is_array($data)) return [];

    $now = time();
    $active = [];
    $hasChanged = false;

    foreach ($data as $item) {
        $publishTime = strtotime($item['publish_at'] ?? '2000-01-01');
        // Check if older than 7 days (7 * 24 * 60 * 60 = 604800 seconds)
        if (($now - $publishTime) < 604800) {
            $active[] = $item;
        } else {
            $hasChanged = true;
        }
    }

    // Save cleaned data if expired items were removed
    if ($hasChanged) {
        @file_put_contents($file, json_encode($active, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    // Sort: Newest first
    usort($active, function($a, $b) {
        return strcmp($b['publish_at'], $a['publish_at']);
    });

    return $active;
}

// --- ROUTING ---
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $items = getItems($jsonFile);
    echo json_encode([
        'status' => 'ok',
        'count'  => count($items),
        'data'   => $items
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    // Security Check
    $password = $input['password'] ?? '';
    if ($password !== $adminPassword) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
        exit;
    }

    // Validation
    $title = trim($input['title'] ?? '');
    $link  = trim($input['link'] ?? '');
    $tags  = $input['tags'] ?? []; // Expected as array

    if (empty($title) || empty($link)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing title or link']);
        exit;
    }

    // Prepare Item
    $newItem = [
        'id'         => uniqid(),
        'title'      => $title,
        'link'       => $link,
        'tags'       => is_array($tags) ? array_map('trim', $tags) : [],
        'publish_at' => date('Y-m-d H:i:s'),
        'clicks'     => 0
    ];

    // Load, Append, Save
    $items = getItems($jsonFile); // This also cleans old ones
    $items[] = $newItem;

    if (@file_put_contents($jsonFile, json_encode($items, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
        echo json_encode(['status' => 'ok', 'id' => $newItem['id'], 'share_url' => $link]);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Save failed']);
    }
    exit;
}

// Invalid method
http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
