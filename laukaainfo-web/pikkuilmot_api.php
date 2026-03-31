<?php
/**
 * Pikkuilmot API (pikkuilmot_api.php)
 * Handles JSON storage for small ads with 7-day expiration.
 */

// --- CONFIGURATION ---
error_reporting(E_ALL);
ini_set('display_errors', 1);
date_default_timezone_set('Europe/Helsinki');
$jsonFile = 'pikkuilmot.json';
$adminPassword = 'Laukaa2026';

// Prevent any output before headers
ob_start();

try {
    // Headers
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

    // Handle Preflight
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        ob_end_clean();
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
            if (($now - $publishTime) < 604800) {
                $active[] = $item;
            } else {
                $hasChanged = true;
            }
        }

        if ($hasChanged) {
            @file_put_contents($file, json_encode($active, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }

        usort($active, function($a, $b) {
            return strcmp($b['publish_at'] ?? '', $a['publish_at'] ?? '');
        });
        return $active;
    }

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $items = getItems($jsonFile);
        ob_end_clean();
        echo json_encode(['status' => 'ok', 'count' => count($items), 'data' => $items], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) $input = $_POST;

        if (($input['password'] ?? '') !== $adminPassword) {
            http_response_code(403);
            throw new Exception('Unauthorized');
        }

        $title = trim($input['title'] ?? '');
        $link  = trim($input['link'] ?? '');
        $tagsRaw = $input['tags'] ?? [];

        if (is_string($tagsRaw)) {
            $tagsArray = (strpos($tagsRaw, '[') === 0) ? (json_decode($tagsRaw, true) ?? explode(',', $tagsRaw)) : explode(',', $tagsRaw);
        } else {
            $tagsArray = is_array($tagsRaw) ? $tagsRaw : [];
        }

        $tagsArray = array_values(array_filter(array_map('trim', $tagsArray)));
        $primaryTag = !empty($tagsArray) ? $tagsArray[0] : '';

        if (empty($title) || empty($link)) {
            http_response_code(400);
            throw new Exception('Missing title or link');
        }

        $newItem = [
            'id' => uniqid(),
            'title' => $title,
            'link' => $link,
            'tag' => $primaryTag,
            'tags' => $tagsArray,
            'publish_at' => date('Y-m-d H:i:s'),
            'clicks' => 0
        ];

        $items = getItems($jsonFile);
        $items[] = $newItem;

        if (@file_put_contents($jsonFile, json_encode($items, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))) {
            ob_end_clean();
            echo json_encode(['status' => 'ok', 'id' => $newItem['id'], 'share_url' => $link]);
        } else {
            http_response_code(500);
            throw new Exception('Save failed');
        }
        exit;
    }

    http_response_code(405);
    throw new Exception('Method not allowed');

} catch (Throwable $e) {
    ob_end_clean();
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
