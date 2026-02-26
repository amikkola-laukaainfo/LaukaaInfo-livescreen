<?php
/**
 * LaukaaInfo Google Drive HTML Proxy
 * Fetches HTML content from Google Drive and serves it with correct headers.
 */

$page_map = [
    'sivu1' => '1JgaDXgiVkTsTM2fjYoSch9-yhiphqyYS',
    'sivu2' => '1g50w0IUca_fiKusmV4deIZGfIRfYX4Bo',
    'sivu3' => '11Hw6dDS5_5ICiyulccznhkQhRL-I5VSy'
];

$page = isset($_GET['page']) ? $_GET['page'] : '';

if (!isset($page_map[$page])) {
    http_response_code(404);
    die("Error: Page not found.");
}

$fileId = $page_map[$page];
$url = "https://drive.google.com/uc?export=download&id=" . $fileId;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

$data = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200 || !$data) {
    http_response_code(500);
    die("Error fetching content from Google Drive (HTTP $http_code)");
}

// Force UTF-8 and HTML content type
header('Content-Type: text/html; charset=UTF-8');
header('X-Source: Google Drive');
header('Cache-Control: public, max-age=3600'); // Cache for 1 hour

echo $data;
?>