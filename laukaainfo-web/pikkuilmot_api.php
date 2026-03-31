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
if (function_exists('ob_start')) ob_start();

try {
    // Headers
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

    // Handle Preflight
    if ($method === 'OPTIONS') {
        if (function_exists('ob_end_clean')) @ob_end_clean();
        exit;
    }

    /**
     * Load and filter data (7-day expiration)
     */
    function getItems($file) {
        if (!file_exists($file)) return array();
        $raw = @file_get_contents($file);
        if (!$raw) return array();
        $data = json_decode($raw, true);
        if (!is_array($data)) return array();

        $now = time();
        $active = array();
        $hasChanged = false;

        foreach ($data as $item) {
            $pubAt = isset($item['publish_at']) ? $item['publish_at'] : '2000-01-01';
            $publishTime = strtotime($pubAt);
            if (($now - $publishTime) < 604800) {
                $active[] = $item;
            } else {
                $hasChanged = true;
            }
        }

        if ($hasChanged) {
            @file_put_contents($file, json_encode($active));
        }

        usort($active, function($a, $b) {
            $atA = isset($a['publish_at']) ? $a['publish_at'] : '';
            $atB = isset($b['publish_at']) ? $b['publish_at'] : '';
            return strcmp($atB, $atA);
        });
        return $active;
    }

    if ($method === 'GET') {
        $items = getItems($jsonFile);
        if (function_exists('ob_end_clean')) @ob_end_clean();
        echo json_encode(array('status' => 'ok', 'count' => count($items), 'data' => $items));
        exit;
    }

    if ($method === 'POST') {
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true);
        if (!$input) $input = $_POST;

        $pass = isset($input['password']) ? $input['password'] : '';
        if ($pass !== $adminPassword) {
            http_response_code(403);
            throw new Exception('Unauthorized');
        }

        $title = isset($input['title']) ? trim($input['title']) : '';
        $link  = isset($input['link']) ? trim($input['link']) : '';
        $tagsRaw = isset($input['tags']) ? $input['tags'] : array();

        if (is_string($tagsRaw)) {
            if (strpos($tagsRaw, '[') === 0) {
                $decoded = json_decode($tagsRaw, true);
                $tagsArray = is_array($decoded) ? $decoded : explode(',', $tagsRaw);
            } else {
                $tagsArray = explode(',', $tagsRaw);
            }
        } else {
            $tagsArray = is_array($tagsRaw) ? $tagsRaw : array();
        }

        $tagsArray = array_values(array_filter(array_map('trim', $tagsArray)));

        if (empty($title) || empty($link)) {
            http_response_code(400);
            throw new Exception('Missing title or link');
        }

        $newItem = array(
            'id' => uniqid(),
            'title' => $title,
            'link' => $link,
            'tags' => $tagsArray,
            'publish_at' => date('Y-m-d H:i:s'),
            'clicks' => 0
        );

        $items = getItems($jsonFile);
        $items[] = $newItem;

        if (@file_put_contents($jsonFile, json_encode($items))) {
            if (function_exists('ob_end_clean')) @ob_end_clean();
            echo json_encode(array('status' => 'ok', 'id' => $newItem['id'], 'share_url' => $link));
        } else {
            http_response_code(500);
            throw new Exception('Save failed');
        }
        exit;
    }

    http_response_code(405);
    throw new Exception('Method not allowed');

} catch (Exception $e) {
    if (function_exists('ob_end_clean')) @ob_end_clean();
    echo json_encode(array('status' => 'error', 'message' => $e->getMessage()));
}
