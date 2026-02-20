<?php
/**
 * Advanced Google Drive Image Proxy
 * Fetches image from Google Drive using multiple endpoints.
 * Compatible with PHP 5.4+
 */

$fileId = isset($_GET['id']) ? $_GET['id'] : '';

if (empty($fileId)) {
    http_response_code(400);
    die('File ID required');
}

header('Access-Control-Allow-Origin: *');
header('X-Proxy-Status: active');

$cacheDir = 'drive_cache/';
$cacheFile = $cacheDir . $fileId . '.jpg';

// Serve from cache if available
if (file_exists($cacheFile)) {
    $mime = 'image/jpeg'; // Default for cache
    header('Content-Type: ' . $mime);
    header('X-Cache: HIT');
    header('Cache-Control: public, max-age=86400');
    readfile($cacheFile);
    exit;
}
function is_valid_image($data)
{
    if (empty($data) || strlen($data) < 10)
        return false;
    $magic = substr($data, 0, 4);
    // JPEG (\xFF\xD8\xFF), PNG (\x89PNG), GIF (GIF8), WebP (RIFF...WEBP)
    if (strpos($magic, "\xFF\xD8\xFF") === 0)
        return true;
    if (strpos($magic, "\x89PNG") === 0)
        return true;
    if (strpos($magic, "GIF8") === 0)
        return true;
    if (strpos($data, "RIFF") === 0 && strpos($data, "WEBP", 8) !== false)
        return true;
    return false;
}

$endpoints = array(
    "https://lh3.googleusercontent.com/d/" . $fileId . "=w1200", // New high-reliability direct endpoint
    "https://drive.google.com/thumbnail?id=" . $fileId . "&sz=w1200",
    "https://drive.usercontent.google.com/download?id=" . $fileId . "&export=view",
    "https://drive.google.com/uc?export=view&id=" . $fileId
);

$imageData = null;
$contentType = null;
$errorLog = array();

if (!function_exists('curl_init')) {
    header('Content-Type: image/svg+xml');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#dc3545"/><text x="20" y="50" fill="white" font-family="Arial">CURL not installed</text></svg>';
    exit;
}

foreach ($endpoints as $url) {
    if ($imageData)
        break;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_ENCODING, "");
    curl_setopt($ch, CURLOPT_TIMEOUT, 6); // Max 24s total
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_MAXREDIRS, 4);
    curl_setopt($ch, CURLOPT_REFERER, 'https://drive.google.com/');

    $data = curl_exec($ch);
    $info = curl_getinfo($ch);
    $httpCode = $info['http_code'];
    $detectedType = $info['content_type'];
    $curlError = curl_error($ch);
    curl_close($ch);

    // Accept if it's a 200 OK and EITHER magic bytes match OR it's clearly an image
    if ($httpCode == 200 && !empty($data) && (is_valid_image($data) || strpos($detectedType, 'image/') === 0)) {
        $imageData = $data;
        $contentType = $detectedType;

        if (!empty($imageData) && is_writable($cacheDir)) {
            if (!is_dir($cacheDir))
                @mkdir($cacheDir, 0755, true);
            @file_put_contents($cacheFile, $imageData);
        }
        break;
    }

    $host = parse_url($url, PHP_URL_HOST);
    $errorLog[] = $host . ":" . $httpCode;
}

if (empty($imageData)) {
    header('Content-Type: image/svg+xml');
    header('Cache-Control: no-cache');
    $errorString = implode(' | ', $errorLog);
    header('X-Proxy-Error: ' . $errorString);

    // Create a more informative error SVG
    echo '<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <rect width="600" height="400" fill="#2c3e50"/>
        <circle cx="300" cy="150" r="50" fill="none" stroke="#e74c3c" stroke-width="5"/>
        <line x1="280" y1="130" x2="320" y2="170" stroke="#e74c3c" stroke-width="5"/>
        <line x1="320" y1="130" x2="280" y2="170" stroke="#e74c3c" stroke-width="5"/>
        <text x="300" y="240" text-anchor="middle" font-family="Arial" font-size="20" fill="#ecf0f1" font-weight="bold">Mediaa ei voitu noutaa</text>
        <text x="300" y="270" text-anchor="middle" font-family="Arial" font-size="14" fill="#bdc3c7">Google Drive -tiedosto ei ole julkinen tai palvelin on estetty.</text>
        <text x="300" y="310" text-anchor="middle" font-family="Arial" font-size="11" fill="#95a5a6">ID: ' . htmlspecialchars($fileId) . '</text>
        <text x="300" y="330" text-anchor="middle" font-family="Arial" font-size="10" fill="#7f8c8d">' . htmlspecialchars(substr($errorString, 0, 80)) . '...</text>
    </svg>';
    exit;
}

header('Content-Type: ' . $contentType);
header('Cache-Control: public, max-age=86400');
header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 86400) . ' GMT');
echo $imageData;
?>