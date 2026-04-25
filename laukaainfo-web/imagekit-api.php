<?php
/**
 * imagekit-api.php - Yhdistetty versio
 * Hallitsee sekä yritysten mainoskuvia että reittien valokuvia.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); 
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- CONFIGURATION ---
$imagekitId = 'vowzx8znjs';
$urlEndpoint = "https://ik.imagekit.io/$imagekitId";
$publicKey  = 'public_VBhN2mN1kVwQQ+MFI+iRSr9U+44='; // Sinun oikea avain
$privateKey = 'private_ylLMZcvm5t75vYRBq75lcpQZOf8='; // Sinun oikea avain
$folder = '/mediazoo/offers';
$salt = "LaukaaInfo2026!Secret"; 

// --- INPUT VALIDATION ---
$yritysId = $_GET['yritys'] ?? '';
$token    = $_GET['token'] ?? '';
$action   = $_GET['action'] ?? 'auth'; 
$slot     = $_GET['slot'] ?? '1';

if (empty($yritysId) || empty($token)) {
    http_response_code(400);
    echo json_encode(['error' => 'Puuttuvat parametrit.']);
    exit;
}

// --- TOKEN VERIFICATION ---
// UUSI: Admin-tarkistus reittieditorille
$isAdmin = ($yritysId === '99' && $token === 'ADMIN-99-LPS');

// Yritysten tarkistus mainostyökalulle
$expected = substr(hash('sha256', $yritysId . $salt), 0, 8);
$legacy = ['2' => 'mz2026', 'demo' => 'demo'];
$isLegacy = isset($legacy[$yritysId]) && $legacy[$yritysId] === $token;

if (!$isAdmin && $token !== $expected && !$isLegacy) {
    http_response_code(403);
    echo json_encode(['error' => 'Virheellinen koodi.']);
    exit;
}

// --- ACTION ROUTING ---

// UUSI: GeoJSON tallennus (Vain Admin)
if ($action === 'save_geojson') {
    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Vain admin voi tallentaa reittejä.']);
        exit;
    }

    $jsonPath = $_POST['path'] ?? ''; 
    $jsonData = $_POST['data'] ?? '';

    if (empty($jsonPath) || empty($jsonData)) {
        http_response_code(400);
        echo json_encode(['error' => 'Polku tai data puuttuu.']);
        exit;
    }

    // Turvatarkistus: sallitaan vain reitix/*.geojson
    if (strpos($jsonPath, 'reitix/') !== 0 || substr($jsonPath, -8) !== '.geojson') {
         http_response_code(403);
         echo json_encode(['error' => 'Tallennus sallittu vain reitix/ kansioon.']);
         exit;
    }

    if (file_put_contents($jsonPath, $jsonData)) {
        echo json_encode(['result' => 'ok', 'message' => 'Reitti tallennettu.']);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Kirjoitusvirhe. Tarkista kansion oikeudet.']);
    }
    exit;
}

// Mainostyökalun DELETE toiminto
if ($action === 'delete') {
    $fileNamePrefix = "{$yritysId}_{$slot}";
    $searchQuery = "name:\"$fileNamePrefix*\"";
    
    $url = "https://api.imagekit.io/v1/files?searchQuery=" . urlencode($searchQuery) . "&path=" . urlencode($folder);
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Basic " . base64_encode($privateKey . ":")]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 200 && $httpCode < 300) {
        $files = json_decode($response, true);
        if (is_array($files) && count($files) > 0) {
            foreach ($files as $file) {
                $fileId = $file['fileId'];
                $delUrl = "https://api.imagekit.io/v1/files/$fileId";
                $delCh = curl_init($delUrl);
                curl_setopt($delCh, CURLOPT_CUSTOMREQUEST, "DELETE");
                curl_setopt($delCh, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($delCh, CURLOPT_HTTPHEADER, ["Authorization: Basic " . base64_encode($privateKey . ":")]);
                curl_exec($delCh);
                curl_close($delCh);
            }
            echo json_encode(['result' => 'ok', 'message' => 'Kuva poistettu.']);
        } else {
            echo json_encode(['result' => 'not found']);
        }
    } else {
        http_response_code($httpCode);
        echo json_encode(['error' => 'Virhe haettaessa kuvaa.']);
    }
    exit;
}

// Yhteinen AUTH (käytössä molemmissa työkaluissa)
if ($action === 'auth') {
    $tokenParam = bin2hex(random_bytes(16));
    $expire = time() + (60 * 30); 
    $signature = hash_hmac('sha1', $tokenParam . $expire, $privateKey);

    echo json_encode([
        'token' => $tokenParam,
        'expire' => $expire,
        'signature' => $signature,
        'publicKey' => $publicKey,
        'urlEndpoint' => $urlEndpoint
    ]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Tuntematon toiminto.']);
exit;
