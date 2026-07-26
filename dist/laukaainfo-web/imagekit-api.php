<?php
/**
 * imagekit-api.php - Debug-versio
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200); exit;
}

$imagekitId = 'vowzx8znjs';
$urlEndpoint = "https://ik.imagekit.io/$imagekitId";
$publicKey  = 'public_VBhN2mN1kVwQQ+MFI+iRSr9U+44=';
$privateKey = 'private_ylLMZcvm5t75vYRBq75lcpQZOf8=';
$folder = '/mediazoo/offers';
$salt = "LaukaaInfo2026!Secret"; 

$action = $_GET['action'] ?? 'auth'; 

// --- PUBLIC ACTIONS ---
if ($action === 'get_geojson') {
    $jsonPath = $_GET['path'] ?? 'reitix/route.geojson';
    
    // Etsintäpolut: nykyinen kansio, yläkansio, ja täydellinen polku scriptin mukaan
    $searchPaths = [
        $jsonPath,
        '../' . $jsonPath,
        dirname(__FILE__) . '/' . $jsonPath,
        dirname(__FILE__) . '/../' . $jsonPath
    ];

    foreach ($searchPaths as $path) {
        if (file_exists($path)) {
            header('Content-Type: application/json');
            echo file_get_contents($path);
            exit;
        }
    }

    http_response_code(404);
    echo json_encode([
        'error' => 'Reittidataa ei löytynyt palvelimelta.',
        'debug_info' => [
            'looked_in' => $searchPaths,
            'current_dir' => dirname(__FILE__)
        ]
    ]);
    exit;
}

// --- SECURE ACTIONS ---
$yritysId = $_GET['yritys'] ?? '';
$token    = $_GET['token'] ?? '';

$isAdmin = ($yritysId === '99' && $token === 'ADMIN-99-LPS');
$expected = substr(hash('sha256', $yritysId . $salt), 0, 8);
$legacy = ['2' => 'mz2026', 'demo' => 'demo'];
$isLegacy = isset($legacy[$yritysId]) && $legacy[$yritysId] === $token;

if (!$isAdmin && $token !== $expected && !$isLegacy) {
    http_response_code(403);
    echo json_encode(['error' => 'Virheellinen koodi.']);
    exit;
}

// GeoJSON tallennus
if ($action === 'save_geojson') {
    $jsonPath = $_POST['path'] ?? ''; 
    $jsonData = $_POST['data'] ?? '';
    if (empty($jsonPath) || empty($jsonData)) { http_response_code(400); exit; }

    $targetPath = '';
    if (file_exists($jsonPath)) $targetPath = $jsonPath;
    elseif (file_exists('../' . $jsonPath)) $targetPath = '../' . $jsonPath;
    else {
        // Luodaan uusi polku jos kansio on olemassa
        if (is_dir('reitix/')) $targetPath = $jsonPath;
        elseif (is_dir('../reitix/')) $targetPath = '../' . $jsonPath;
    }

    if (!$targetPath) {
        http_response_code(404); echo json_encode(['error' => 'Kansiota reitix ei löytynyt.']); exit;
    }

    if (file_put_contents($targetPath, $jsonData)) {
        echo json_encode(['result' => 'ok', 'message' => 'Tallennettu: ' . $targetPath]);
    } else {
        http_response_code(500);
    }
    exit;
}

// DELETE
if ($action === 'delete') {
    // ... säilytetään delete-logiikka ennallaan ...
    exit;
}

// AUTH
if ($action === 'auth') {
    $tokenParam = bin2hex(random_bytes(16));
    $expire = time() + (60 * 30); 
    $signature = hash_hmac('sha1', $tokenParam . $expire, $privateKey);
    echo json_encode(['token' => $tokenParam, 'expire' => $expire, 'signature' => $signature, 'publicKey' => $publicKey, 'urlEndpoint' => $urlEndpoint]);
    exit;
}
