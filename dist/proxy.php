<?php
/**
 * LaukaaInfo RSS Proxy - Phase 21
 * Restores CURL logic and robustifies encoding conversion.
 */
$allowed_origins = [
    'https://laukaainfo.fi',
    'https://www.laukaainfo.fi',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://localhost'
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim($_SERVER['HTTP_ORIGIN'], '/') : '';
if ($origin) {
    if (in_array($origin, $allowed_origins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    } else {
        http_response_code(403);
        die('Forbidden Origin');
    }
} else {
    header('Access-Control-Allow-Origin: https://laukaainfo.fi');
}

// Clear buffer and set defaults
if (ob_get_level())
    ob_clean();
ini_set('default_charset', 'UTF-8');

$url = isset($_GET['url']) ? $_GET['url'] : '';
$encoding = isset($_GET['encoding']) ? $_GET['encoding'] : 'utf-8';

if (empty($url)) {
    header('Content-Type: text/plain; charset=UTF-8');
    die("Error: No URL provided.");
}

// Fetch the content
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; LaukaaInfo/1.1; +https://www.mediazoo.fi/)');
curl_setopt($ch, CURLOPT_ENCODING, '');
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$data = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200 || !$data) {
    http_response_code($http_code ?: 500);
    header('Content-Type: text/plain; charset=UTF-8');
    die("Error fetching RSS (HTTP $http_code)");
}

// Robust Encoding Conversion
if (function_exists('mb_convert_encoding')) {
    $source_encoding = $encoding;

    // Sniff from content if it claims to be UTF-8 but looks like ISO
    if (strtolower($encoding) === 'utf-8') {
        if (preg_match('/encoding="([^"]+)"/i', $data, $matches)) {
            $xml_enc = strtolower($matches[1]);
            if ($xml_enc !== 'utf-8')
                $source_encoding = $xml_enc;
        }
    }

    if (strtolower($source_encoding) !== 'utf-8') {
        $converted = mb_convert_encoding($data, 'UTF-8', $source_encoding);
        if ($converted) {
            $data = $converted;
            $data = preg_replace('/encoding="[^"]+"/i', 'encoding="UTF-8"', $data);
        }
    }
}

// Force output header and echo
header('Content-Type: application/xml; charset=UTF-8');
echo trim($data);
?>