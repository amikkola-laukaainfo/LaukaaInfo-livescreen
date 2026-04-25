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

$action = $_GET['action'] ?? 'auth'; 

// --- PUBLIC ACTIONS (Ei vaadi tokenia) ---

// Sallitaan GeoJSON luku julkisesti (tarinakartta.html käyttöön)
if ($action === 'get_geojson') {
    $jsonPath = $_GET['path'] ?? 'reitix/route.geojson';
    $searchPaths = [$jsonPath, '../' . $jsonPath];
    $found = false;
    foreach ($searchPaths as $path) {
        if (file_exists($path)) {
            header('Content-Type: application/json');
            echo file_get_contents($path);
            $found = true;
            break;
        }
    }
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'Tiedostoa ei löytynyt.']);
    }
    exit;
}

// --- SECURE ACTIONS (Vaatii tokenin) ---

$yritysId = $_GET['yritys'] ?? '';
$token    = $_GET['token'] ?? '';
$slot     = $_GET['slot'] ?? '1';

if (empty($yritysId) || empty($token)) {
    http_response_code(400);
    echo json_encode(['error' => 'Puuttuvat parametrit.']);
    exit;
}

$isAdmin = ($yritysId === '99' && $token === 'ADMIN-99-LPS');
$expected = substr(hash('sha256', $yritysId . $salt), 0, 8);
$legacy = ['2' => 'mz2026', 'demo' => 'demo'];
$isLegacy = isset($legacy[$yritysId]) && $legacy[$yritysId] === $token;

if (!$isAdmin && $token !== $expected && !$isLegacy) {
    http_response_code(403);
    echo json_encode(['error' => 'Virheellinen koodi.']);
    exit;
}

// GeoJSON tallennus (Vain Admin)
if ($action === 'save_geojson') {
    if (!$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Vain admin voi tallentaa reittejä.']);
        exit;
    }
    $jsonPath = $_POST['path'] ?? ''; 
    $jsonData = $_POST['data'] ?? '';
    if (empty($jsonPath) || empty($jsonData)) {
        http_response_code(400); exit;
    }
    $targetPath = '';
    if (file_exists($jsonPath)) $targetPath = $jsonPath;
    elseif (file_exists('../' . $jsonPath)) $targetPath = '../' . $jsonPath;
    else {
        if (is_dir('reitix/')) $targetPath = $jsonPath;
        elseif (is_dir('../reitix/')) $targetPath = '../' . $jsonPath;
    }
    if (!$targetPath) {
        http_response_code(404); echo json_encode(['error' => 'Kohdetta ei löytynyt.']); exit;
    }
    if (file_put_contents($targetPath, $jsonData)) {
        echo json_encode(['result' => 'ok', 'message' => 'Tallennettu.']);
    } else {
        http_response_code(500);
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
            echo json_encode(['result' => 'ok']);
        }
    }
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
