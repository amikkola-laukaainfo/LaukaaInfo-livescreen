<?php
/**
 * LaukaaInfo Company Data Proxy
 * Fetches CSV from Google Sheets, parses it to JSON, and implements caching.
 * Compatible with PHP 5.4+ (Strict fallback for older environments)
 */

// Disable browser caching for the API response
header('Content-Type: application/json; charset=UTF-8');
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
        die(json_encode(array("status" => "error", "message" => "Forbidden Origin")));
    }
} else {
    // If no origin is provided (e.g. same-origin or direct access), we can default to allow the main domain
    header('Access-Control-Allow-Origin: https://laukaainfo.fi');
}
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

$CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiT9tfmTO0wAi6FZEtuYNRsrIwhq_iBMh-5vqix31ct14nZB58v6HfOM6vAawYTtHgk6IaePCUCZsB/pub?output=csv";
$CACHE_FILE = 'companies_cache.json';
$CACHE_TIME = 3600; // 1 hour in seconds
// Check cache - force refresh if ANY GET parameter is present (like ?t= from script.js)
$force_refresh = !empty($_GET);
if (!$force_refresh && file_exists($CACHE_FILE) && (time() - filemtime($CACHE_FILE) < $CACHE_TIME)) {
    echo file_get_contents($CACHE_FILE);
    exit;
}

function convert_gdrive_link($url)
{
    if (empty($url))
        return $url;
    // Extract ID from various Google Drive link formats (web, file, direct)
    if (preg_match('/(?:id=|\/d\/|file\/d\/)([a-zA-Z0-9_-]{25,35})/', $url, $matches)) {
        $fileId = $matches[1];
        // Always return the proxy URL. get_image.php handles its own internal caching.
        // This avoids relative path issues and ensures CORS headers are sent.
        return "get_image.php?id=" . $fileId;
    }
    return $url;
}

function convert_youtube_link($url)
{
    if (empty($url))
        return $url;
    if (preg_match('/v=([^&]+)/', $url, $matches)) {
        return "https://www.youtube.com/embed/" . $matches[1];
    }
    if (preg_match('/youtu\.be\/([^?\/]+)/', $url, $matches)) {
        return "https://www.youtube.com/embed/" . $matches[1];
    }
    return $url;
}

// Check if CURL is available
if (!function_exists('curl_init')) {
    http_response_code(500);
    die(json_encode(array("status" => "error", "message" => "CURL not installed on server")));
}

// Fetch CSV
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $CSV_URL);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$csv_data = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200 || !$csv_data) {
    if (file_exists($CACHE_FILE)) {
        header('X-Cache: Serving expired cache');
        echo file_get_contents($CACHE_FILE);
        exit;
    }
    http_response_code(500);
    echo json_encode(array("status" => "error", "message" => "Failed to fetch CSV (HTTP $http_code)"));
    exit;
}

// Parsing logic
$stream = fopen('php://temp', 'r+');
fwrite($stream, $csv_data);
rewind($stream);

$header_raw = fgetcsv($stream);
if (!$header_raw) {
    http_response_code(500);
    die(json_encode(array("status" => "error", "message" => "Malformed CSV header")));
}

// Normalize headers: lowercase and clean
$header = array();
foreach ($header_raw as $i => $h) {
    $h = trim($h);
    // Remove BOM (Byte Order Mark) if it exists on the first element
    if ($i === 0) {
        $h = preg_replace('/^[\xEF\xBB\xBF\xFE\xFF]+/', '', $h);
    }
    $header[] = strtolower($h);
}

$companies = array();

while (($row_raw = fgetcsv($stream)) !== FALSE) {
    if (count($row_raw) < 2)
        continue;

    // Create associative row with index safety and trimming
    $row = array();
    foreach ($header as $i => $key) {
        $row[$key] = isset($row_raw[$i]) ? trim($row_raw[$i]) : '';
    }

    $media = array();

    // 1. Process Images - Enhanced parser for JSON arrays and comma-separated URLs
    $img_raw = '';
    foreach (array('images', 'kuvat', 'kuva', 'photos', 'kuvalinkit') as $key) {
        if (isset($row[$key]) && !empty(trim($row[$key]))) {
            $img_raw = trim($row[$key]);
            break;
        }
    }

    if (!empty($img_raw)) {
        // Remove escaped quotes that might come from CSV double-quoting issues
        $img_raw = str_replace(['\"', '\"\"'], '"', $img_raw);
        // Poistetaan mahdolliset ylimääräiset lainausmerkit koko merkkijonon ympäriltä
        $img_raw = trim($img_raw, '"\'');

        $imageUrls = array();

        // Check if it's a JSON array
        if (strpos($img_raw, '[') === 0) {
            $jsonData = json_decode($img_raw, true);
            if (is_array($jsonData)) {
                $imageUrls = $jsonData;
            }
        }

        // If JSON fails or it's not JSON, split by comma or newline
        if (empty($imageUrls)) {
            $img_raw_clean = str_replace(['[', ']', '"', "'"], '', $img_raw);
            $imageUrls = preg_split('/[,;\n\r]+/', $img_raw_clean);
        }

        foreach ($imageUrls as $url) {
            $url = trim($url, " \t\n\r\0\x0B\"'\\"); // Aggressive trim
            if (empty($url))
                continue;

            // Handle potential backslash-escaped forward slashes (common in some JSON exports)
            $url = str_replace('\/', '/', $url);

            // Tarkistetaan, että se on http-osoite
            if (strpos($url, 'http') !== 0)
                continue;

            // Suodatetaan vain kuvat ja Google Drive -linkit
            if (
                strpos($url, 'drive.google.com') !== false ||
                strpos($url, 'googleusercontent.com') !== false ||
                preg_match('/\.(jpg|jpeg|png|webp|gif|svg|avif)($|\?)/i', $url) ||
                strpos($url, 'drive/file/d/') !== false
            ) {
                $media[] = array(
                    "type" => "image",
                    "url" => convert_gdrive_link($url)
                );
            }
        }
    }

    // 2. Process YouTube
    $yt_url = '';
    foreach (array('youtubeurl', 'youtube link', 'video', 'video url') as $key) {
        if (isset($row[$key]) && !empty(trim($row[$key]))) {
            $yt_url = trim($row[$key]);
            break;
        }
    }
    if (!empty($yt_url)) {
        $media[] = array("type" => "video", "url" => convert_youtube_link($yt_url));
    }

    // Extraction of other fields
    $lat = '';
    $lon = '';

    // 1. Kokeillaan ensin suoraa täsmäystä (yleisin tapa)
    if (isset($row['lat']) && !empty($row['lat'])) {
        $cleaned = preg_replace('/[^0-9.,-]/', '', $row['lat']);
        $lat = str_replace(',', '.', $cleaned);
    }
    if (isset($row['lon']) && !empty($row['lon'])) {
        $cleaned = preg_replace('/[^0-9.,-]/', '', $row['lon']);
        $lon = str_replace(',', '.', $cleaned);
    } elseif (isset($row['lng']) && !empty($row['lng'])) {
        $cleaned = preg_replace('/[^0-9.,-]/', '', $row['lng']);
        $lon = str_replace(',', '.', $cleaned);
    }

    // 2. Jos ei löytynyt, kokeillaan sumeaa hakua sarakkeen nimistä
    if (empty($lat) || empty($lon)) {
        foreach ($row as $key => $val) {
            $val = trim($val);
            if (empty($val))
                continue;

            if (empty($lat) && (strpos($key, 'leveys') !== false || strpos($key, 'koordinaatti_n') !== false)) {
                $cleaned = preg_replace('/[^0-9.,-]/', '', $val);
                $lat = str_replace(',', '.', $cleaned);
            }
            if (empty($lon) && (strpos($key, 'pituus') !== false || strpos($key, 'koordinaatti_e') !== false || strpos($key, 'x-koord') !== false)) {
                $cleaned = preg_replace('/[^0-9.,-]/', '', $val);
                $lon = str_replace(',', '.', $cleaned);
            }
        }
    }

    $desc = '';
    foreach (array('description', 'esittely', 'kuvaus') as $key) {
        if (isset($row[$key]) && !empty(trim($row[$key]))) {
            $desc = $row[$key];
            break;
        }
    }

    $company_name = isset($row['name']) ? $row['name'] : (isset($row['nimi']) ? $row['nimi'] : 'Nimetön');
    $company_id = isset($row['rowid']) && !empty($row['rowid']) ? $row['rowid'] : preg_replace('/[^a-z0-9]/', '', strtolower($company_name)) . '-' . count($companies);

    $companies[] = array(
        "id" => "company-" . $company_id,
        "nimi" => $company_name,
        "kategoria" => isset($row['category']) ? $row['category'] : (isset($row['kategoria']) ? $row['kategoria'] : 'Muu'),
        "mainoslause" => ((function_exists('mb_strlen') ? mb_strlen($desc) : strlen($desc)) > 100) ? (function_exists('mb_substr') ? mb_substr($desc, 0, 100) : substr($desc, 0, 100)) . '...' : $desc,
        "esittely" => $desc,
        "osoite" => isset($row['address']) ? $row['address'] : (isset($row['osoite']) ? $row['osoite'] : ''),
        "puhelin" => isset($row['phone']) ? $row['phone'] : (isset($row['puhelin']) ? $row['puhelin'] : ''),
        "email" => "",
        "nettisivu" => isset($row['website']) ? $row['website'] : (isset($row['nettisivu']) ? $row['nettisivu'] : ''),
        "karttalinkki" => ($lat && $lon) ? "https://www.google.com/maps?q=$lat,$lon" : "",
        "lat" => $lat,
        "lon" => $lon,
        "media" => $media
    );
}

// Add debug headers to the first element if not empty
if (!empty($companies)) {
    $companies[0]['_debug_headers'] = $header;
}

$output = json_encode($companies, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
file_put_contents($CACHE_FILE, $output);
echo $output;
?>