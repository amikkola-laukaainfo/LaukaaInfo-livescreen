const fs = require('fs');
const path = require('path');

const targetFile = 'D:\\Sovelluskehitys\\LaukaaInfo-livescreen\\laukaainfo-web\\mainoskortti.php';
const backupFile = 'D:\\Sovelluskehitys\\LaukaaInfo-livescreen\\laukaainfo-web\\mainoskortti.php.bak';

const originalContent = fs.readFileSync(backupFile, 'utf8');

const splitMarker = '<!DOCTYPE html>';
const splitIndex = originalContent.indexOf(splitMarker);
if (splitIndex === -1) {
    console.error('Marker not found!');
    process.exit(1);
}

let bodyHtml = originalContent.substring(splitIndex);

// Päivitetään staattiset tekstit HTML:ssä ottamaan huomioon myös kohdekortti
bodyHtml = bodyHtml.replace(
    'Tutustu meihin LaukaaInfo-matkailuportaalissa ja katso yhteystietomme!',
    '<?= !empty($kuvaus_safe) ? $kuvaus_safe : ($is_kohde ? "Tutustu kohteeseen LaukaaInfossa!" : "Tutustu meihin LaukaaInfo-matkailuportaalissa ja katso yhteystietomme!") ?>'
);
bodyHtml = bodyHtml.replace(
    '<div class="li-tag">Skannaa yrityskortti</div>',
    '<div class="li-tag"><?= $is_kohde ? "Skannaa kohdekortti" : "Skannaa yrityskortti" ?></div>'
);
bodyHtml = bodyHtml.replace(
    '<div class="scan-text">Skannaa QR-koodi ja tutustu yrityskorttiin</div>',
    '<div class="scan-text">Skannaa QR-koodi ja tutustu <?= $is_kohde ? "kohteeseen" : "yrityskorttiin" ?></div>'
);
bodyHtml = bodyHtml.replace(
    '<div class="scan">Skannaa yrityskortti</div>',
    '<div class="scan"><?= $is_kohde ? "Skannaa kohdekortti" : "Skannaa yrityskortti" ?></div>'
);

const phpHeader = `<?php
header('Content-Type: text/html; charset=utf-8');

$id     = isset($_GET['id'])   ? preg_replace('/[^a-zA-Z0-9_.-]/', '', $_GET['id'])   : '';
$type   = isset($_GET['type']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['type']) : 'somekuva';
$source = isset($_GET['source']) ? trim($_GET['source']) : '';

if (empty($id) && empty($_GET['name']) && empty($_GET['title'])) {
    die('Virhe: ID tai kohteen nimi puuttuu.');
}

// PHP-versio JS slugifysta
function phpSlugify($text) {
    $text = mb_strtolower(trim($text), 'UTF-8');
    $map = ['ä'=>'a','ö'=>'o','å'=>'a','Ä'=>'a','Ö'=>'o','Å'=>'a'];
    $text = strtr($text, $map);
    $text = preg_replace('/[^a-z0-9\\s-]/', '', $text);
    $text = preg_replace('/[\\s-]+/', '-', $text);
    return trim($text, '-');
}

// Tiedoston tai URL:n haku
function fetchJson($file, $url) {
    if (file_exists($file)) return file_get_contents($file);
    return @file_get_contents($url);
}

// Supabase REST API -haku
define('AI_SB_URL2', 'https://duxluwyqxvbmkkjzuzkz.supabase.co');
define('AI_SB_KEY2', 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu');

function supabase_fetch_rows(string $table, array $params = []): ?array {
    $url = AI_SB_URL2 . '/rest/v1/' . $table . '?' . http_build_query($params);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => [
            'apikey: '        . AI_SB_KEY2,
            'Authorization: Bearer ' . AI_SB_KEY2,
            'Accept: application/json',
        ]
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $status >= 400) return null;
    $data = json_decode($body, true);
    return is_array($data) ? $data : null;
}

$company_data = null;
$found_company_id = null;
$is_kohde = ($source === 'kohdekortti');

// 1. Jos ID on annettu, etsitään ensin Supabasen posts-taulusta (tapahtumat, tarjoukset, ilmoitukset)
if (!empty($id)) {
    $posts = supabase_fetch_rows('posts', [
        'id'     => 'eq.' . $id,
        'select' => 'id,title,type,description,content,contact_phone,website_url,image_url,target_id,target_type',
        'limit'  => 1
    ]);
    if (empty($posts)) {
        $posts = supabase_fetch_rows('posts', [
            'target_id' => 'eq.' . $id,
            'select'    => 'id,title,type,description,content,contact_phone,website_url,image_url,target_id,target_type',
            'limit'     => 1
        ]);
    }
    if (!empty($posts[0]['title'])) {
        $p = $posts[0];
        $company_data = [
            'id'        => $p['id'],
            'nimi'      => $p['title'],
            'kategoria' => $p['type'] ?? '',
            'kuvaus'    => $p['description'] ?? $p['content'] ?? '',
            'puhelin'   => $p['contact_phone'] ?? '',
            'nettisivu' => $p['website_url'] ?? '',
            'logo'      => $p['image_url'] ?? '',
            'images'    => !empty($p['image_url']) ? [$p['image_url']] : [],
            'is_kohde'  => true
        ];
        $is_kohde = true;
    }
}

// 2. Kokeillaan Supabasen places-taulusta (käyntikohteet, alueet, palvelut)
if (!$company_data && !empty($id)) {
    $places = supabase_fetch_rows('places', [
        'place_id' => 'eq.' . $id,
        'select'   => 'place_id,name,type,description,phone,website,image_url,canonical_name',
        'limit'    => 1
    ]);
    if (empty($places)) {
        $places = supabase_fetch_rows('places', [
            'canonical_name' => 'eq.' . $id,
            'select'         => 'place_id,name,type,description,phone,website,image_url,canonical_name',
            'limit'          => 1
        ]);
    }
    if (!empty($places[0]['name'])) {
        $pl = $places[0];
        $company_data = [
            'id'        => $pl['place_id'],
            'nimi'      => $pl['name'],
            'kategoria' => $pl['type'] ?? '',
            'kuvaus'    => $pl['description'] ?? '',
            'puhelin'   => $pl['phone'] ?? '',
            'nettisivu' => $pl['website'] ?? '',
            'logo'      => $pl['image_url'] ?? '',
            'images'    => !empty($pl['image_url']) ? [$pl['image_url']] : [],
            'is_kohde'  => true
        ];
        $is_kohde = true;
    }
}

// 3. Etsitään yritysdatasta (companies_data.json)
if (!$company_data && !empty($id)) {
    $json = fetchJson('../companies_data.json', 'https://laukaainfo.fi/companies_data.json');
    if ($json) {
        if (substr($json, 0, 3) === "\\xEF\\xBB\\xBF") $json = substr($json, 3);
        $data  = json_decode($json, true);
        $items = isset($data['results']) ? $data['results'] : (array)$data;
        foreach ($items as $item) {
            $slug = phpSlugify($item['nimi'] ?? '');
            $matchId = isset($item['id']) && ($item['id'] === $id || $item['id'] === 'company-' . $id);
            if ($slug === phpSlugify($id) || $matchId) {
                $company_data = $item;
                $found_company_id = $item['id'] ?? null;
                break;
            }
        }
    }
}

// 4. Haetaan täydet yritystiedot API:sta
if ($found_company_id) {
    $api_url = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php?id=' . urlencode($found_company_id);
    $api_json = @file_get_contents($api_url);
    if ($api_json) {
        $api_data = json_decode($api_json, true);
        if (is_array($api_data)) {
            $first = isset($api_data['results']) ? ($api_data['results'][0] ?? null)
                   : (isset($api_data[0]) ? $api_data[0] : $api_data);
            if ($first && isset($first['nimi'])) {
                $company_data = array_merge($company_data, $first);
            }
        }
    }
}

// 5. Fallback: kohteet.json / tarjoukset.json
if (!$company_data && !empty($id)) {
    $json = fetchJson('../kohdekortit/kohteet.json', 'https://laukaainfo.fi/kohdekortit/kohteet.json');
    if ($json) {
        foreach ((array)json_decode($json, true) as $item) {
            if (($item['id'] ?? '') === $id || phpSlugify($item['name'] ?? '') === phpSlugify($id)) {
                $company_data = $item;
                $company_data['nimi']      = $item['name'] ?? '';
                $company_data['logo']      = $item['images'][0] ?? '';
                $company_data['kategoria'] = $item['type'] ?? '';
                $company_data['puhelin']   = $item['contact']['phone'] ?? '';
                $company_data['nettisivu'] = $item['contact']['website'] ?? '';
                $company_data['is_kohde']  = true;
                $is_kohde = true;
                break;
            }
        }
    }
}

// 6. Fallback: suoraan annetuista URL-parametreista (kohdekortilta välitetyt tiedot)
if (!$company_data && (!empty($_GET['name']) || !empty($_GET['title']))) {
    $company_data = [
        'id'        => $id,
        'nimi'      => $_GET['name'] ?? $_GET['title'],
        'kategoria' => $_GET['cat'] ?? $_GET['category'] ?? '',
        'kuvaus'    => $_GET['desc'] ?? '',
        'puhelin'   => $_GET['phone'] ?? '',
        'nettisivu' => $_GET['web'] ?? '',
        'logo'      => $_GET['img'] ?? '',
        'is_kohde'  => true
    ];
    $is_kohde = true;
}

if (!$company_data) {
    die("Yritystä/kohdetta '" . htmlspecialchars($id) . "' ei löytynyt.");
}

// Kenttien purku
$nimi      = $company_data['nimi']      ?? 'Kohteen nimi';
$kategoria = $company_data['kategoria'] ?? '';
$puhelin   = $company_data['puhelin']   ?? '';
if ($puhelin === '-') $puhelin = '';

$nettisivu = $company_data['nettisivu'] ?? $company_data['website'] ?? '';
if ($nettisivu === '-') $nettisivu = '';
if ($nettisivu && !preg_match('/^https?:\\/\\//', $nettisivu)) $nettisivu = 'https://' . $nettisivu;

$kuvaus    = $company_data['kuvaus']    ?? $company_data['description'] ?? '';

$logo = $company_data['logo'] ?? '';
if ($logo === '-') $logo = '';
if ($logo && !preg_match('/^http/', $logo)) {
    $local = '../' . ltrim($logo, '/');
    $logo  = file_exists($local) ? $local : 'https://laukaainfo.fi/' . ltrim($logo, '/');
}
if (!$logo && !empty($company_data['media'])) {
    foreach ($company_data['media'] as $m) {
        if (($m['type'] ?? '') === 'image' && !empty($m['url'])) {
            $logo = $m['url'];
            break;
        }
    }
}
if (!$logo && !empty($company_data['images'][0])) {
    $logo = $company_data['images'][0];
}

function imageToBase64($url) {
    if (!$url) return '';
    $context = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 4]]);
    $data = @file_get_contents($url, false, $context);
    if ($data) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $type = $finfo->buffer($data) ?: 'image/png';
        return 'data:' . $type . ';base64,' . base64_encode($data);
    }
    return htmlspecialchars($url);
}

$nimi_safe      = htmlspecialchars($nimi);
$kategoria_safe = htmlspecialchars($kategoria);
$puhelin_safe   = htmlspecialchars($puhelin);
$nettisivu_safe = htmlspecialchars($nettisivu);
$kuvaus_safe    = htmlspecialchars(mb_substr($kuvaus, 0, 160));
$logo_safe      = imageToBase64($logo);
$web_display    = htmlspecialchars(preg_replace('#^https?:\\/\\/#', '', rtrim($nettisivu, '/')));

// Kohdekortille kohdekortti.html, yritykselle yrityskortti.html
if ($is_kohde) {
    $card_url = 'https://laukaainfo.fi/kohdekortti.html?id=' . urlencode($id ?: phpSlugify($nimi));
} else {
    $card_url = 'https://laukaainfo.fi/yrityskortti.html?id=' . urlencode($id);
}
$qr_src   = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($card_url);
$qr_safe  = imageToBase64($qr_src);
$li_logo_safe = './logo.png';

$tyypit = [
    'somekuva'      => '🖼️ Somekuva (1080×1080)',
    'flyer'         => '📄 A6 Flyer',
    'offer'         => '🏷️ Tarjouskortti',
    'qr'            => '📱 QR-juliste',
    'business_card' => '💳 Käyntikortti',
];
$title = $tyypit[$type] ?? 'Mainoskortti';
?>
`;

const finalFileContent = phpHeader + '\n' + bodyHtml;
fs.writeFileSync(targetFile, finalFileContent, 'utf8');
console.log('Successfully written mainoskortti.php! Total length:', finalFileContent.length);
