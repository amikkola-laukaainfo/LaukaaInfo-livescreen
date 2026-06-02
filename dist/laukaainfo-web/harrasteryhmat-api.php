<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$file = 'harrasteryhmat.jsonl';

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
    // 1. POISTO
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
                    continue; 
                }
            }
            $newLines[] = $line;
        }

        if ($found) {
            file_put_contents($file, implode(PHP_EOL, $newLines) . PHP_EOL);
            echo "<h2>Harrasteryhmä poistettu onnistuneesti!</h2><p><a href='../index.html'>Palaa etusivulle</a></p>";
        } else {
            echo "<h2>Virhe: Ryhmää ei löytynyt tai token on virheellinen.</h2>";
        }
        exit;
    }

    // 2. LISTAUS
    if ($action === 'list') {
        header('Content-Type: application/json; charset=utf-8');
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $activeGroups = [];
        $tagCounts = [];

        foreach ($lines as $line) {
            $data = json_decode($line, true);
            if (!$data) continue;
            
            unset($data['delete_token']); 

            $activeGroups[] = $data;

            if (isset($data['tagit']) && is_array($data['tagit'])) {
                foreach ($data['tagit'] as $tag) {
                    if (!isset($tagCounts[$tag])) $tagCounts[$tag] = 0;
                    $tagCounts[$tag]++;
                }
            }
        }

        arsort($tagCounts);

        echo json_encode([
            "status" => "success",
            "ryhmat" => array_reverse($activeGroups),
            "sanapilvi" => $tagCounts
        ]);
        exit;
    }
}

// --- POST: Uuden ryhmän luonti ---
if ($method === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if (!$input) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Virheellinen data"]);
        exit;
    }

    $otsikko = isset($input['otsikko']) ? strip_tags($input['otsikko']) : '';
    $kuvaus = isset($input['kuvaus']) ? strip_tags($input['kuvaus']) : '';
    $nimi = isset($input['nimi']) ? strip_tags($input['nimi']) : '';
    $yhteys = isset($input['yhteys']) ? strip_tags($input['yhteys']) : '';
    $tagit = isset($input['tagit']) && is_array($input['tagit']) ? array_map('strip_tags', $input['tagit']) : [];

    if (empty($otsikko) || empty($nimi)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Ryhmän nimi (otsikko) ja yhteyshenkilön nimi ovat pakollisia."]);
        exit;
    }

    $id = uniqid('harr_');
    $deleteToken = bin2hex(random_bytes(16)); 

    $newItem = [
        "id" => $id,
        "otsikko" => $otsikko,
        "kuvaus" => $kuvaus,
        "nimi" => $nimi,
        "yhteys" => $yhteys,
        "tagit" => $tagit,
        "paivays" => date('Y-m-d H:i:s'),
        "delete_token" => $deleteToken
    ];

    file_put_contents($file, json_encode($newItem, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);

    $deleteUrl = "https://mediazoo.fi/laukaainfo-web/harrasteryhmat-api.php?action=delete&id={$id}&token={$deleteToken}";

    echo json_encode([
        "status" => "success",
        "message" => "Harrasteryhmä julkaistu onnistuneesti!",
        "delete_url" => $deleteUrl
    ]);
    exit;
}

http_response_code(404);
echo "API Endpoint";
?>
