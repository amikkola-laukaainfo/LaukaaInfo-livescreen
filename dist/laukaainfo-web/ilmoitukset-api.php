<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$file = 'ilmoitukset.jsonl';

// Luodaan tiedosto jos ei ole
if (!file_exists($file)) {
    touch($file);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// --- OPTIONS: CORS Preflight ---
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- GET: Listaus tai Poisto ---
if ($method === 'GET') {
    // 1. POISTO (Käyttäjä klikkaa sähköpostissa tai ruudulla olevaa linkkiä)
    if ($action === 'delete') {
        $id = isset($_GET['id']) ? $_GET['id'] : '';
        $token = isset($_GET['token']) ? $_GET['token'] : '';
        
        if (empty($id) || empty($token)) {
            die("Virhe: Puuttuva ID tai token.");
        }

        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $newLines = [];
        $found = false;

        foreach ($lines as $line) {
            $data = json_decode($line, true);
            if ($data && isset($data['id']) && $data['id'] === $id) {
                if (isset($data['delete_token']) && $data['delete_token'] === $token) {
                    $found = true;
                    continue; // Skipataan tämä rivi -> poistetaan
                }
            }
            $newLines[] = $line;
        }

        if ($found) {
            file_put_contents($file, implode(PHP_EOL, $newLines) . PHP_EOL);
            echo "<h2>Ilmoitus poistettu onnistuneesti!</h2><p><a href='../index.html'>Palaa etusivulle</a></p>";
        } else {
            echo "<h2>Virhe: Ilmoitusta ei löytynyt tai token on virheellinen.</h2>";
        }
        exit;
    }

    // 2. LISTAUS (Haetaan JSON-data sanapilveä ja listausta varten)
    if ($action === 'list') {
        header('Content-Type: application/json; charset=utf-8');
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $activePosts = [];
        $tagCounts = [];

        foreach ($lines as $line) {
            $data = json_decode($line, true);
            if (!$data) continue;
            
            // Tässä voisi tarkistaa 7 päivän vanhentumisen, jätetään nyt yksinkertaiseksi (kaikki näytetään ellei poistettu)
            
            // Piilotetaan sähköpostit listauksesta paitsi ehkä yhdellä napilla JS-puolella
            unset($data['delete_token']); // Ei ikinä palauteta tokenia listauksessa!

            $activePosts[] = $data;

            // Lasketaan sanapilveä varten
            if (isset($data['tagit']) && is_array($data['tagit'])) {
                foreach ($data['tagit'] as $tag) {
                    if (!isset($tagCounts[$tag])) $tagCounts[$tag] = 0;
                    $tagCounts[$tag]++;
                }
            }
        }

        // Lajitellaan tagit suosituimmasta alkaen
        arsort($tagCounts);

        echo json_encode([
            "status" => "success",
            "ilmoitukset" => array_reverse($activePosts), // Uusin ensin
            "sanapilvi" => $tagCounts
        ]);
        exit;
    }
}

// --- POST: Uuden ilmoituksen luonti ---
if ($method === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Virheellinen data"]);
        exit;
    }

    // Perusvalidoinnit ja puhdistus
    $tyyppi = isset($input['tyyppi']) ? strip_tags($input['tyyppi']) : 'tarjoan';
    $otsikko = isset($input['otsikko']) ? strip_tags($input['otsikko']) : '';
    $kuvaus = isset($input['kuvaus']) ? strip_tags($input['kuvaus']) : '';
    $nimi = isset($input['nimi']) ? strip_tags($input['nimi']) : '';
    $yhteys = isset($input['yhteys']) ? strip_tags($input['yhteys']) : '';
    $tagit = isset($input['tagit']) && is_array($input['tagit']) ? array_map('strip_tags', $input['tagit']) : [];

    // Uudet rakenteiset kentät (Wizard)
    $intent = isset($input['intent']) ? strip_tags($input['intent']) : '';
    $category = isset($input['category']) ? strip_tags($input['category']) : '';
    $subCategory = isset($input['subCategory']) ? strip_tags($input['subCategory']) : '';
    $actionParam = isset($input['action']) ? strip_tags($input['action']) : '';

    if (empty($otsikko) || empty($nimi)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Otsikko ja nimi ovat pakollisia."]);
        exit;
    }

    $id = uniqid('ilm_');
    $deleteToken = bin2hex(random_bytes(16)); // Turvallinen satunnainen token

    $newItem = [
        "id" => $id,
        "tyyppi" => $tyyppi,
        "intent" => $intent,
        "category" => $category,
        "subCategory" => $subCategory,
        "action" => $actionParam,
        "otsikko" => $otsikko,
        "kuvaus" => $kuvaus,
        "nimi" => $nimi,
        "yhteys" => $yhteys,
        "tagit" => $tagit,
        "paivays" => date('Y-m-d H:i:s'),
        "delete_token" => $deleteToken
    ];

    // Tallennetaan JSON Lines -tiedostoon
    file_put_contents($file, json_encode($newItem, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);

    $deleteUrl = "https://mediazoo.fi/laukaainfo-web/ilmoitukset-api.php?action=delete&id={$id}&token={$deleteToken}";

    echo json_encode([
        "status" => "success",
        "message" => "Ilmoitus julkaistu onnistuneesti!",
        "delete_url" => $deleteUrl
    ]);
    exit;
}

http_response_code(404);
echo "API Endpoint";
?>
