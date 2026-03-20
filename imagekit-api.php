<?php
/**
 * imagekit-api.php
 * Handles secure signature generation for ImageKit.
 * Validates the business token using a Secret Salt.
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
$publicKey  = 'YOUR_PUBLIC_KEY'; // REQUIRED: Add your valid ImageKit Public Key here
$privateKey = 'YOUR_PRIVATE_KEY'; // REQUIRED: Add your valid ImageKit Private Key here
$folder = '/mediazoo/offers';
$salt = "LaukaaInfo2026!Secret"; // MUST match the salt in upload.html

// --- INPUT VALIDATION ---
$yritysId = $_GET['yritys'] ?? '';
$token    = $_GET['token'] ?? '';
$action   = $_GET['action'] ?? 'auth'; // 'auth', 'delete'
$slot     = $_GET['slot'] ?? '1';

if (empty($yritysId) || empty($token)) {
    http_response_code(400);
    echo json_encode(['error' => 'Puuttuvat parametrit.']);
    exit;
}

// --- TOKEN VERIFICATION ---
$expected = substr(hash('sha256', $yritysId . $salt), 0, 8);
$legacy = ['2' => 'mz2026', 'demo' => 'demo'];
$isLegacy = isset($legacy[$yritysId]) && $legacy[$yritysId] === $token;

if ($token !== $expected && !$isLegacy) {
    http_response_code(403);
    echo json_encode(['error' => 'Virheellinen koodi.']);
    exit;
}

// Block usage if API keys are not yet configured on the server
if ($publicKey === 'YOUR_PUBLIC_KEY' || $privateKey === 'YOUR_PRIVATE_KEY') {
    http_response_code(500);
    echo json_encode(['error' => 'ImageKit API avaimia ei ole määritetty serverillä. (imagekit-api.php)']);
    exit;
}

// --- ACTION ROUTING ---
if ($action === 'delete') {
    // 1. Search for the file to get its fileId
    // Filename in ImageKit might have different extensions, so we search by name and path
    $fileNamePrefix = "{$yritysId}_{$slot}";
    $searchQuery = "name:\"$fileNamePrefix*\""; // imagekit search query syntax
    
    $url = "https://api.imagekit.io/v1/files?searchQuery=" . urlencode($searchQuery) . "&path=" . urlencode($folder);
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Basic " . base64_encode($privateKey . ":")
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 200 && $httpCode < 300) {
        $files = json_decode($response, true);
        if (is_array($files) && count($files) > 0) {
            // Found the file(s), let's delete them
            $deletedAny = false;
            foreach ($files as $file) {
                $fileId = $file['fileId'];
                
                $delUrl = "https://api.imagekit.io/v1/files/$fileId";
                $delCh = curl_init($delUrl);
                curl_setopt($delCh, CURLOPT_CUSTOMREQUEST, "DELETE");
                curl_setopt($delCh, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($delCh, CURLOPT_HTTPHEADER, [
                    "Authorization: Basic " . base64_encode($privateKey . ":")
                ]);
                
                $delResponse = curl_exec($delCh);
                $delHttpCode = curl_getinfo($delCh, CURLINFO_HTTP_CODE);
                curl_close($delCh);
                
                if ($delHttpCode === 204) {
                    $deletedAny = true;
                }
            }
            
            if ($deletedAny) {
                echo json_encode(['result' => 'ok', 'message' => 'Kuva poistettu.']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Kuvan poisto epäonnistui.']);
            }
        } else {
            echo json_encode(['result' => 'not found', 'message' => 'Kuvaa ei löytynyt tai se on jo poistettu.']);
        }
    } else {
        http_response_code($httpCode);
        echo json_encode(['error' => 'Virhe haettaessa kuvaa.', 'details' => $response]);
    }
    
    exit;
}

if ($action === 'auth') {
    // Generate auth parameters for client-side upload
    // A dynamically generated token, expire, and signature
    $tokenParam = bin2hex(random_bytes(16));
    $expire = time() + (60 * 30); // 30 mins
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
