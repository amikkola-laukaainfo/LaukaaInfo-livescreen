<?php
/**
 * resolve-gphoto.php
 * Ratkaisee Google Photos -jakolinkin (photos.app.goo.gl tai photos.google.com/share)
 * suoraksi kuva-URLiksi (lh3.googleusercontent.com/pw/...=w1600).
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$url = $_GET['url'] ?? '';
if (empty($url)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing url parameter']);
    exit;
}

// Varmistetaan että URL on Google Photos -linkki
if (!preg_match('#^https?://(photos\.app\.goo\.gl|photos\.google\.com)/#i', $url)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Not a valid Google Photos URL']);
    exit;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
curl_setopt($ch, CURLOPT_TIMEOUT, 8);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
$html = curl_exec($ch);
curl_close($ch);

if (!$html) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'Failed to fetch content']);
    exit;
}

// 1. Etsitään og:image
if (preg_match('/<meta\s+property=["\']og:image["\']\s+content=["\'](https:\/\/lh3\.googleusercontent\.com\/[^"\']+)["\']/i', $html, $matches)) {
    $direct = preg_replace('/=w\d+.*$/', '', $matches[1]) . '=w1600';
    echo json_encode(['success' => true, 'directUrl' => $direct]);
    exit;
}

// 2. Etsitään pw-kuva
if (preg_match('/https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_\-]+/', $html, $matches)) {
    echo json_encode(['success' => true, 'directUrl' => $matches[0] . '=w1600']);
    exit;
}

// 3. Etsitään mikä tahansa lh3-kuva
if (preg_match('/https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-]+/', $html, $matches)) {
    echo json_encode(['success' => true, 'directUrl' => $matches[0] . '=w1600']);
    exit;
}

http_response_code(404);
echo json_encode(['success' => false, 'error' => 'No image found']);
