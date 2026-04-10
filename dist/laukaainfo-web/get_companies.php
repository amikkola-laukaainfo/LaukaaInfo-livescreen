<?php
/**
 * LaukaaInfo Company Data API
 * CSV data is processed server-side only.
 * The raw CSV source URL is never exposed to the browser.
 *
 * Supports GET parameters:
 *   search    - free text search (name, description, address)
 *   category  - filter by exact category name
 *   page      - page number (default: 1)
 *   limit     - results per page (default: 9999 = all, set to e.g. 25 for pagination)
 *   sort      - field to sort by ('nimi', 'kategoria'). Default: original order
 *   region    - not filtered here (done client-side with lat/lon)
 *
 * Response format:
 *   { "results": [...], "total": 123, "page": 1, "limit": 9999 }
 */

/* ---------- CORS -------------------------------------------------------- */
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
        die(json_encode(["status" => "error", "message" => "Forbidden Origin"]));
    }
} else {
    header('Access-Control-Allow-Origin: https://laukaainfo.fi');
}
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

/* ---------- Simple rate limiting (optional) ----------------------------- */
// Allows up to 60 requests per IP per minute via a temp file counter.
// Comment out this block to disable.
$rate_limit_dir = sys_get_temp_dir() . '/laukaainfo_rl/';
if (!is_dir($rate_limit_dir))
    @mkdir($rate_limit_dir, 0700, true);
$ip_key = $rate_limit_dir . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.txt';
$now = time();
$window = 60;
$max_rq = 60;
$hit_count = 1;
$hit_time = $now;
if (file_exists($ip_key)) {
    $parts = explode('|', file_get_contents($ip_key));
    if (count($parts) === 2 && ($now - (int) $parts[1]) < $window) {
        $hit_count = (int) $parts[0] + 1;
        $hit_time = (int) $parts[1];
        if ($hit_count > $max_rq) {
            http_response_code(429);
            die(json_encode(["status" => "error", "message" => "Too many requests"]));
        }
    }
}
@file_put_contents($ip_key, "$hit_count|$hit_time");

/* ---------- GET parameters ---------------------------------------------- */
$search = isset($_GET['search']) ? trim($_GET['search']) : '';
$category = isset($_GET['category']) ? trim($_GET['category']) : '';
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$limit = isset($_GET['limit']) ? max(1, min(500, (int) $_GET['limit'])) : 9999;
$sort = isset($_GET['sort']) ? trim($_GET['sort']) : '';

/* ---------- CSV source (never exposed to browser) ----------------------- */
// CSV data is processed server-side only.
$CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQTdoRdDSwSBVtImPr6hhIVLqRcA1FaWlLXg2zG9o9CjMqHQYX2kRo6Do2aHavTcgteTh1kno3GKXCd/pub?output=csv";
$CACHE_FILE = sys_get_temp_dir() . '/laukaainfo_companies_cache.json';
$CACHE_TTL = 3600; // seconds

/* ---------- Helpers ----------------------------------------------------- */
function convert_gdrive_link($url)
{
    if (empty($url))
        return $url;
    if (preg_match('/(?:id=|\/d\/|file\/d\/|drive_cache\/)([a-zA-Z0-9_-]{25,55})/', $url, $m)) {
        return "get_image.php?id=" . $m[1];
    }
    return $url;
}

function convert_youtube_link($url)
{
    if (empty($url))
        return $url;
    if (preg_match('/v=([^&]+)/', $url, $m))
        return "https://www.youtube.com/embed/" . $m[1];
    if (preg_match('/youtu\.be\/([^?\/]+)/', $url, $m))
        return "https://www.youtube.com/embed/" . $m[1];
    return $url;
}

function mb_safe($fn, ...$args)
{
    return function_exists('mb_' . $fn)
        ? call_user_func_array('mb_' . $fn, $args)
        : call_user_func_array($fn, $args);
}

/* ---------- Fetch / cache raw CSV --------------------------------------- */
if (!function_exists('curl_init')) {
    http_response_code(500);
    die(json_encode(["status" => "error", "message" => "CURL not installed on server"]));
}

$csv_data = null;

// Use cache only when no forced refresh is needed (i.e. no ?t= param)
$force_refresh = isset($_GET['t']);
if (!$force_refresh && file_exists($CACHE_FILE) && (time() - filemtime($CACHE_FILE)) < $CACHE_TTL) {
    $csv_data = file_get_contents($CACHE_FILE);
}

if (!$csv_data) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $CSV_URL,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'LaukaaInfo/2.0',
    ]);
    $csv_data = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($http_code !== 200 || !$csv_data) {
        http_response_code(502);
        die(json_encode(["status" => "error", "message" => "Could not fetch data (HTTP $http_code)"]));
    }

    // Cache the raw CSV text
    @file_put_contents($CACHE_FILE, $csv_data);
}

/* ---------- Parse CSV --------------------------------------------------- */
$stream = fopen('php://temp', 'r+');
fwrite($stream, $csv_data);
rewind($stream);

$header_raw = fgetcsv($stream);
if (!$header_raw) {
    http_response_code(500);
    die(json_encode(["status" => "error", "message" => "Malformed CSV header"]));
}

$header = [];
foreach ($header_raw as $i => $h) {
    $h = trim($h);
    if ($i === 0)
        $h = preg_replace('/^[\xEF\xBB\xBF\xFE\xFF]+/', '', $h); // Strip BOM
    $header[] = strtolower($h);
}

$all_companies = [];

while (($row_raw = fgetcsv($stream)) !== false) {
    if (count($row_raw) < 2)
        continue;

    // Build associative row
    $row = [];
    foreach ($header as $i => $key) {
        $row[$key] = isset($row_raw[$i]) ? trim($row_raw[$i]) : '';
    }

    /* --- Media: images ------------------------------------------------- */
    $media = [];
    $img_raw = '';
    foreach (['images', 'kuvat', 'kuva', 'photos', 'kuvalinkit'] as $key) {
        if (!empty($row[$key])) {
            $img_raw = $row[$key];
            break;
        }
    }
    if (!empty($img_raw)) {
        $img_raw = str_replace(['\"', '\"\"'], '"', $img_raw);
        $img_raw = trim($img_raw, '"\'');
        $imageUrls = [];
        if ($img_raw[0] === '[') {
            $decoded = json_decode($img_raw, true);
            if (is_array($decoded))
                $imageUrls = $decoded;
        }
        if (empty($imageUrls)) {
            $clean = str_replace(['[', ']', '"', "'"], '', $img_raw);
            $imageUrls = preg_split('/[,;\n\r]+/', $clean);
        }
        foreach ($imageUrls as $url) {
            $url = trim($url, " \t\n\r\0\x0B\"'\\");
            if (empty($url) || strpos($url, 'http') !== 0)
                continue;
            if (
                strpos($url, 'drive.google.com') !== false ||
                strpos($url, 'googleusercontent.com') !== false ||
                preg_match('/\.(jpg|jpeg|png|webp|gif|svg|avif|bmp)($|\?)/i', $url) ||
                strpos($url, 'drive/file/d/') !== false
            ) {
                $media[] = ["type" => "image", "url" => convert_gdrive_link($url)];
            }
        }
    }

    /* --- Media: kuvat (multiple) ---------------------------------------- */
    if (!empty($row['kuvat'])) {
        $kuvat_raw = str_replace(['[', ']', '"', "'"], '', $row['kuvat']);
        $kuvaUrls = preg_split('/[,;\n\r]+/', $kuvat_raw);
        foreach ($kuvaUrls as $url) {
            $url = trim($url);
            if (empty($url) || strpos($url, 'http') !== 0) continue;
            // Avoid duplicates
            $exists = false;
            foreach ($media as $m) { if ($m['url'] === $url) { $exists = true; break; } }
            if (!$exists) {
                $media[] = ["type" => "image", "url" => convert_gdrive_link($url)];
            }
        }
    }

    /* --- Media: YouTube & Videos ---------------------------------------- */
    $yt_urls = [];
    foreach (['videot', 'youtubeurl', 'youtube link', 'video', 'video url', 'youtube'] as $key) {
        if (!empty($row[$key])) {
            $val = str_replace(['[', ']', '"', "'"], '', $row[$key]);
            $yt_urls = array_merge($yt_urls, preg_split('/[,;\n\r]+/', $val));
        }
    }
    foreach ($yt_urls as $u) {
        $u = trim($u);
        if (empty($u)) continue;
        $media[] = ["type" => "video", "url" => convert_youtube_link($u)];
    }

    /* --- Coordinates --------------------------------------------------- */
    $lat = $lon = '';
    if (!empty($row['lat']))
        $lat = str_replace(',', '.', preg_replace('/[^0-9.,-]/', '', $row['lat']));
    if (!empty($row['lon']))
        $lon = str_replace(',', '.', preg_replace('/[^0-9.,-]/', '', $row['lon']));
    elseif (!empty($row['lng']))
        $lon = str_replace(',', '.', preg_replace('/[^0-9.,-]/', '', $row['lng']));
    // Fuzzy fallback
    if (empty($lat) || empty($lon)) {
        foreach ($row as $k => $v) {
            if (empty($lat) && strpos($k, 'leveys') !== false)
                $lat = str_replace(',', '.', preg_replace('/[^0-9.,-]/', '', $v));
            if (empty($lon) && (strpos($k, 'pituus') !== false || strpos($k, 'x-koord') !== false))
                $lon = str_replace(',', '.', preg_replace('/[^0-9.,-]/', '', $v));
        }
    }

    /* --- Basic fields -------------------------------------------------- */
    $desc = '';
    foreach (['description', 'esittely', 'kuvaus'] as $k) {
        if (!empty($row[$k])) {
            $desc = $row[$k];
            break;
        }
    }
    $name = !empty($row['name']) ? $row['name'] : (!empty($row['nimi']) ? $row['nimi'] : 'Nimetön');
    $rowid = !empty($row['rowid']) ? $row['rowid'] : (preg_replace('/[^a-z0-9]/', '', strtolower($name)) . '-' . count($all_companies));
    $kategoria = !empty($row['category']) ? $row['category'] : (!empty($row['kategoria']) ? $row['kategoria'] : 'Muu');

    /* --- Clean Media arrays -------------------------------------------- */
    $images_only = [];
    $videos_only = [];
    foreach ($media as $m) {
        if ($m['type'] === 'image') $images_only[] = $m['url'];
        if ($m['type'] === 'video') $videos_only[] = $m['url'];
    }

    $all_companies[] = [
        "id" => "company-" . $rowid,
        "nimi" => $name,
        "category" => $kategoria, // Alias for name
        "kategoria" => $kategoria,
        "package" => !empty($row['paketti']) ? strtolower($row['paketti']) : (!empty($row['taso']) ? strtolower($row['taso']) : 'perus'),
        "mainoslause" => mb_safe('strlen', $desc) > 100 ? mb_safe('substr', $desc, 0, 100) . '...' : $desc,
        "esittely" => $desc,
        "description" => $desc, // Alias
        "osoite" => !empty($row['address']) ? $row['address'] : (!empty($row['osoite']) ? $row['osoite'] : ''),
        "puhelin" => !empty($row['phone']) ? $row['phone'] : (!empty($row['puhelin']) ? $row['puhelin'] : ''),
        "email" => !empty($row['email']) ? $row['email'] : (!empty($row['sähköposti']) ? $row['sähköposti'] : ''),
        "nettisivu" => !empty($row['website']) ? $row['website'] : (!empty($row['nettisivu']) ? $row['nettisivu'] : ''),
        "karttalinkki" => ($lat && $lon) ? "https://www.google.com/maps?q=$lat,$lon" : "",
        "lat" => $lat,
        "lon" => $lon,
        "location" => ["lat" => $lat, "lng" => $lon], // Requested structure alias
        "media" => $media,
        "images" => $images_only,
        "videos" => $videos_only,
        "logo" => $row['logo'] ?? '',
        "facebook" => $row['facebook'] ?? '',
        "instagram" => $row['instagram'] ?? '',
        "linkedin" => $row['linkedin'] ?? '',
        "tiktok" => $row['tiktok'] ?? '',
        "whatsapp" => !empty($row['whatsapp']) ? $row['whatsapp'] : '',
        "mainoslinkit" => $row['mainoslinkit'] ?? '',
        "karusellipaino" => isset($row['karusellipaino']) ? (int) $row['karusellipaino'] : 0,
        "tyyppi" => $row['tyyppi'] ?? 'ilmainen',
        "voimassaolo_loppuu" => $row['voimassaolo_loppuu'] ?? '',
        "rss" => $row['rss'] ?? '',
        "tags" => $row['tags'] ?? '',
        "alue_slug" => $row['alue_slug'] ?? '',
        "kunta_slug" => $row['kunta_slug'] ?? '',
    ];
}
fclose($stream);

/* ---------- Server-side filtering -------------------------------------- */
$filtered = $all_companies;

// Filter by search (name, description, address)
if (!empty($search)) {
    $sq = mb_safe('strtolower', $search);
    $filtered = array_filter($filtered, function ($c) use ($sq) {
        return mb_safe('strpos', mb_safe('strtolower', $c['nimi']), $sq) !== false
            || mb_safe('strpos', mb_safe('strtolower', $c['esittely']), $sq) !== false
            || mb_safe('strpos', mb_safe('strtolower', $c['osoite']), $sq) !== false
            || mb_safe('strpos', mb_safe('strtolower', $c['kategoria']), $sq) !== false
            || mb_safe('strpos', mb_safe('strtolower', $c['tags'] ?? ''), $sq) !== false;
    });
}

// Filter by category (exact)
if (!empty($category)) {
    $filtered = array_filter($filtered, function ($c) use ($category) {
        return strcasecmp($c['kategoria'], $category) === 0;
    });
}

// Re-index
$filtered = array_values($filtered);

/* ---------- Sorting ---------------------------------------------------- */
if (!empty($sort)) {
    $valid_sorts = ['nimi', 'kategoria', 'karusellipaino'];
    if (in_array($sort, $valid_sorts)) {
        usort($filtered, function ($a, $b) use ($sort) {
            if ($sort === 'karusellipaino') {
                return ($b[$sort] ?? 0) - ($a[$sort] ?? 0); // descending
            }
            return strcmp($a[$sort] ?? '', $b[$sort] ?? '');
        });
    }
}

/* ---------- Pagination -------------------------------------------------- */
$total = count($filtered);
$offset = ($page - 1) * $limit;
$paged = ($limit >= 9999) ? $filtered : array_slice($filtered, $offset, $limit);

/* ---------- Output ------------------------------------------------------ */
echo json_encode([
    "results" => $paged,
    "total" => $total,
    "page" => $page,
    "limit" => $limit,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>