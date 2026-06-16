<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Käsitellään OPTIONS-pyynnöt CORS:ia varten
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Oletustagi on "tietokoneet", jos mitään ei anneta
$tagi = isset($_GET['tag']) ? htmlspecialchars($_GET['tag']) : 'tietokoneet';

$jsonFile = "verkosto.json";

if (!file_exists($jsonFile)) {
    http_response_code(404);
    echo json_encode([
        "status" => "error", 
        "message" => "Datalähdettä ei löytynyt (verkosto.json puuttuu)."
    ]);
    exit;
}

$jsonData = file_get_contents($jsonFile);
$verkosto = json_decode($jsonData, true);

if ($verkosto === null) {
    http_response_code(500);
    echo json_encode([
        "status" => "error", 
        "message" => "Datalähteen lukeminen epäonnistui (JSON virheellinen)."
    ]);
    exit;
}

// Palautetaan pelkkä verkostodata tietyllä tagilla ja entities kokonaisuudessaan
if (isset($verkosto['verkosto'][$tagi])) {
    echo json_encode([
        "status" => "success", 
        "verkosto" => [
            $tagi => $verkosto['verkosto'][$tagi]
        ],
        "kaikki_tagit" => $verkosto['verkosto'], // Palautetaan myös kaikki jotta napit voidaan luoda UI:ssa
        "entities" => $verkosto['entities']
    ]);
} else {
    http_response_code(404);
    echo json_encode([
        "status" => "error", 
        "message" => "Tagia ei löytynyt."
    ]);
}
?>
