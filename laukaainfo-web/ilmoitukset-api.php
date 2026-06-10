<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Kaikki data tallennetaan yhteen verkosto.json -tiedostoon
$file = 'verkosto.json';

// Luodaan tyhjä rakenne jos tiedosto puuttuu
if (!file_exists($file)) {
    file_put_contents($file, json_encode([
        'entities'   => (object)[],
        'verkosto'   => (object)[],
        'ilmoitukset'=> []
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

$method  = $_SERVER['REQUEST_METHOD'];
$action  = isset($_GET['action']) ? $_GET['action'] : '';

// --- OPTIONS: CORS Preflight ---
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Apufunktio: lue koko verkosto.json
function readVerkosto($file) {
    $json = file_get_contents($file);
    $data = json_decode($json, true);
    if (!$data) $data = ['entities'=>[], 'verkosto'=>[], 'ilmoitukset'=>[]];
    if (!isset($data['ilmoitukset'])) $data['ilmoitukset'] = [];
    return $data;
}

// Apufunktio: kirjoita koko verkosto.json
function writeVerkosto($file, $data) {
    file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

// --- GET ---
if ($method === 'GET') {

    // 1. POISTO
    if ($action === 'delete') {
        $id    = isset($_GET['id'])    ? $_GET['id']    : '';
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($id) || empty($token)) {
            die("Virhe: Puuttuva ID tai token.");
        }

        $data  = readVerkosto($file);
        $found = false;
        $data['ilmoitukset'] = array_values(array_filter($data['ilmoitukset'], function($ilm) use ($id, $token, &$found) {
            if ($ilm['id'] === $id && isset($ilm['delete_token']) && $ilm['delete_token'] === $token) {
                $found = true;
                return false; // poistetaan
            }
            return true;
        }));

        if ($found) {
            writeVerkosto($file, $data);
            echo "<h2>Ilmoitus poistettu onnistuneesti!</h2><p><a href='../index.html'>Palaa etusivulle</a></p>";
        } else {
            echo "<h2>Virhe: Ilmoitusta ei löytynyt tai token on virheellinen.</h2>";
        }
        exit;
    }

    // 2. LISTAUS
    if ($action === 'list') {
        header('Content-Type: application/json; charset=utf-8');

        $data        = readVerkosto($file);
        $ilmoitukset = $data['ilmoitukset'];
        $activePosts = [];
        $tagCounts   = [];

        foreach ($ilmoitukset as $item) {
            // 21 päivän vanhentuminen (ohitetaan demo-ilmoituksille joilla ei ole delete_token)
            if (isset($item['paivays']) && isset($item['delete_token'])) {
                $postDate  = strtotime($item['paivays']);
                $ageInDays = (time() - $postDate) / (60 * 60 * 24);
                if ($ageInDays > 21) continue;
            }

            // Ei ikinä palauteta delete_tokenia listauksessa
            unset($item['delete_token']);
            $activePosts[] = $item;

            // Sanapilvi
            if (isset($item['tagit']) && is_array($item['tagit'])) {
                foreach ($item['tagit'] as $tag) {
                    $tagCounts[$tag] = ($tagCounts[$tag] ?? 0) + 1;
                }
            }
        }

        arsort($tagCounts);

        echo json_encode([
            "status"      => "success",
            "ilmoitukset" => array_reverse($activePosts), // Uusin ensin
            "sanapilvi"   => $tagCounts
        ]);
        exit;
    }
}

// --- POST: Uuden ilmoituksen luonti ---
if ($method === 'POST') {
    header('Content-Type: application/json; charset=utf-8');

    $rawInput = file_get_contents('php://input');
    $input    = json_decode($rawInput, true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Virheellinen data"]);
        exit;
    }

    $tyyppi      = isset($input['tyyppi'])      ? strip_tags($input['tyyppi'])      : 'tarjoan';
    $otsikko     = isset($input['otsikko'])     ? strip_tags($input['otsikko'])     : '';
    $kuvaus      = isset($input['kuvaus'])      ? strip_tags($input['kuvaus'])      : '';
    $nimi        = isset($input['nimi'])        ? strip_tags($input['nimi'])        : '';
    $yhteys      = isset($input['yhteys'])      ? strip_tags($input['yhteys'])      : '';
    $tagit       = isset($input['tagit']) && is_array($input['tagit']) ? array_map('strip_tags', $input['tagit']) : [];
    $intent      = isset($input['intent'])      ? strip_tags($input['intent'])      : '';
    $category    = isset($input['category'])    ? strip_tags($input['category'])    : '';
    $subCategory = isset($input['subCategory']) ? strip_tags($input['subCategory']) : '';
    $actionParam = isset($input['action'])      ? strip_tags($input['action'])      : '';

    if (empty($otsikko) || empty($nimi)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Otsikko ja nimi ovat pakollisia."]);
        exit;
    }

    $id          = uniqid('ilm_');
    $deleteToken = bin2hex(random_bytes(16));

    $newItem = [
        "id"          => $id,
        "tyyppi"      => $tyyppi,
        "intent"      => $intent,
        "category"    => $category,
        "subCategory" => $subCategory,
        "action"      => $actionParam,
        "otsikko"     => $otsikko,
        "kuvaus"      => $kuvaus,
        "nimi"        => $nimi,
        "yhteys"      => $yhteys,
        "tagit"       => $tagit,
        "paivays"     => date('Y-m-d H:i:s'),
        "delete_token"=> $deleteToken
    ];

    // Lisätään verkosto.json:n ilmoitukset-listaan
    $data = readVerkosto($file);
    $data['ilmoitukset'][] = $newItem;
    writeVerkosto($file, $data);

    $deleteUrl = "https://mediazoo.fi/laukaainfo-web/ilmoitukset-api.php?action=delete&id={$id}&token={$deleteToken}";

    echo json_encode([
        "status"     => "success",
        "message"    => "Ilmoitus julkaistu onnistuneesti!",
        "delete_url" => $deleteUrl
    ]);
    exit;
}

http_response_code(404);
echo "API Endpoint";
?>
