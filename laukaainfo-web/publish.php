<?php
/**
 * LaukaaInfo Content Publisher (publish.php)
 * ───────────────────────────────────────
 * Location: /laukaainfo-web/publish.php
 * Generates: content.json
 */

date_default_timezone_set('Europe/Helsinki');

// --- CONFIGURATION ---
// IMPORTANT: Update these with your ImageKit keys
$imagekitId   = 'vowzx8znjs'; 
$publicKey    = 'YOUR_PUBLIC_KEY'; 
$privateKey   = 'YOUR_PRIVATE_KEY';
$jsonFile     = 'content.json';
$tokenFile    = 'tokens.json';
$maxItems     = 100;
$companyApi   = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php';

// --- URL PARAMETERS (PRE-FILL) ---
$prefillId    = $_GET['business_id'] ?? '';
$prefillToken = $_GET['token'] ?? '';

// --- UTILITIES ---
function sanitize($str) {
    return htmlspecialchars(trim($str), ENT_QUOTES, 'UTF-8');
}

function generateId() {
    return bin2hex(random_bytes(6));
}

/**
 * Resize and compress image using GD
 */
function processImage($tempPath, $targetWidth = 1200, $quality = 75) {
    list($width, $height, $type) = getimagesize($tempPath);
    
    switch ($type) {
        case IMAGETYPE_JPEG: $src = imagecreatefromjpeg($tempPath); break;
        case IMAGETYPE_PNG:  $src = imagecreatefrompng($tempPath);  break;
        case IMAGETYPE_WEBP: $src = imagecreatefromwebp($tempPath); break;
        default: return false;
    }

    if (!$src) return false;

    // Calculate new dimensions
    if ($width > $targetWidth) {
        $ratio = $targetWidth / $width;
        $newWidth = $targetWidth;
        $newHeight = (int)($height * $ratio);
    } else {
        $newWidth = $width;
        $newHeight = $height;
    }

    $dst = imagecreatetruecolor($newWidth, $newHeight);
    
    // Preserve transparency for PNG/WEBP
    if ($type == IMAGETYPE_PNG || $type == IMAGETYPE_WEBP) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
    }

    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

    // Save to memory as JPEG (ImageKit likes JPEG/PNG/WEBP)
    ob_start();
    imagejpeg($dst, null, $quality);
    $data = ob_get_clean();

    imagedestroy($src);
    imagedestroy($dst);

    return $data;
}

/**
 * Upload to ImageKit via cURL
 */
function uploadToImageKit($imageData, $fileName, $publicKey, $privateKey) {
    $url = 'https://upload.imagekit.io/api/v1/files/upload';
    
    $postFields = [
        'file' => base64_encode($imageData),
        'fileName' => $fileName,
        'folder' => '/laukaainfo-web/content'
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Basic " . base64_encode($privateKey . ":")
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $res = json_decode($response, true);
        return $res['url'] ?? false;
    }
    return false;
}

// --- MAIN LOGIC ---
$message = '';
$previewJson = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $business_id = (int)($_POST['business_id'] ?? 0);
    $sentToken   = trim($_POST['publish_token'] ?? '');
    $title       = sanitize($_POST['title'] ?? '');
    $short_desc  = sanitize($_POST['short_description'] ?? '');
    $type        = $_POST['type'] ?? 'maksu';
    $publish_at  = $_POST['publish_at'] ?? date('Y-m-d\TH:i');
    $website_url = sanitize($_POST['website_url'] ?? '');
    $facebook_url = sanitize($_POST['facebook_url'] ?? '');
    $instagram_url = sanitize($_POST['instagram_url'] ?? '');
    $youtube_url = sanitize($_POST['youtube_url'] ?? '');
    $is_promoted = isset($_POST['is_promoted']) || ($type === 'maksu');
    $image_url_input = sanitize($_POST['image_url'] ?? '');

    // Validation
    if (empty($business_id) || empty($sentToken)) {
        $message = "Virhe: Business ID ja Token vaaditaan.";
    } elseif (empty($_FILES['image']['tmp_name']) && empty($image_url_input)) {
        $message = "Virhe: Kuva tai kuvan URL vaaditaan.";
    } else {
        // --- TOKEN VALIDATION ---
        $isTokenValid = false;
        if (file_exists($tokenFile)) {
            $tokensData = json_decode(file_get_contents($tokenFile), true) ?: [];
            foreach ($tokensData as $tData) {
                if ($tData['business_id'] == $business_id && $tData['publish_token'] === $sentToken) {
                    $isTokenValid = true;
                    break;
                }
            }
        }

        if (!$isTokenValid) {
            $message = "Virhe: Unauthorized (Pääsy estetty). Token ei täsmää.";
        } else {
            // --- COMPANY REGISTRY CHECK (Optional extra) ---
            $isValidCompany = false;
            $companyList = json_decode(file_get_contents($companyApi . "?t=" . time()), true);
            $companies = is_array($companyList) ? $companyList : ($companyList['results'] ?? []);
            
            foreach ($companies as $comp) {
                $compId = str_replace('company-', '', $comp['id'] ?? '');
                if ($compId == $business_id) {
                    if (($comp['tyyppi'] ?? '') === 'maksu') {
                        $isValidCompany = true;
                        break;
                    } else {
                        $message = "Virhe: Yrityksellä ei ole 'maksu'-oikeutta julkaisuun.";
                    }
                }
            }

            if (!$isValidCompany && empty($message)) {
                $message = "Virhe: Yritystä ei löytynyt rekisteristä tai tilaus on päättynyt.";
            }

            if ($isValidCompany) {
                $final_image_url = '';

                // Handle Image Upload
                if (!empty($_FILES['image']['tmp_name'])) {
                    if ($privateKey === 'YOUR_PRIVATE_KEY') {
                        $message = "Virhe: ImageKit API-avaimia ei ole määritetty.";
                    } else {
                        $processedData = processImage($_FILES['image']['tmp_name']);
                        if ($processedData) {
                            $fileName = 'feed_' . time() . '_' . generateId() . '.jpg';
                            $uploadedUrl = uploadToImageKit($processedData, $fileName, $publicKey, $privateKey);
                            if ($uploadedUrl) {
                                $final_image_url = $uploadedUrl;
                            } else {
                                $message = "Virhe: Kuvan lataus ImageKit-palveluun epäonnistui.";
                            }
                        } else {
                            $message = "Virhe: Kuvan käsittely epäonnistui.";
                        }
                    }
                } else {
                    $final_image_url = $image_url_input;
                }

                if ($final_image_url) {
                    // Storage
                    $feedData = [];
                    if (file_exists($jsonFile)) {
                        $feedData = json_decode(file_get_contents($jsonFile), true) ?: [];
                    }

                    $newItem = [
                        'id' => generateId(),
                        'business_id' => $business_id,
                        'type' => $type,
                        'title' => $title,
                        'description' => $short_desc,
                        'image' => $final_image_url,
                        'publish_at' => date('c', strtotime($publish_at)),
                        'is_promoted' => $is_promoted,
                        'created_at' => date('c')
                    ];

                    if ($website_url)   $newItem['website_url'] = $website_url;
                    if ($facebook_url)  $newItem['facebook_url'] = $facebook_url;
                    if ($instagram_url) $newItem['instagram_url'] = $instagram_url;
                    if ($youtube_url)   $newItem['youtube_url'] = $youtube_url;

                    array_unshift($feedData, $newItem);
                    $feedData = array_slice($feedData, 0, $maxItems);
                    file_put_contents($jsonFile, json_encode($feedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                    
                    $message = "Sisältö julkaistu onnistuneesti! ✅";
                    $previewJson = json_encode($newItem, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LaukaaInfo — Julkaisutyökalu</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0056b3;
            --bg: #f4f7fb;
            --card: #ffffff;
            --text: #333;
            --border: #e1e8f0;
        }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
        .container { max-width: 600px; margin: 0 auto; background: var(--card); padding: 2.5rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; color: var(--primary); font-size: 1.8rem; }
        label { display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; }
        input, select, textarea { width: 100%; padding: 0.8rem; margin-bottom: 1.2rem; border: 2px solid var(--border); border-radius: 10px; box-sizing: border-box; font-family: inherit; font-size: 1rem; }
        input:focus { border-color: var(--primary); outline: none; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .checkbox-group { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.2rem; }
        .checkbox-group input { width: auto; margin-bottom: 0; }
        button { background: var(--primary); color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 1rem; width: 100%; transition: opacity 0.2s; }
        button:hover { opacity: 0.9; }
        .alert { padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem; font-weight: 600; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 10px; font-size: 0.85rem; overflow-x: auto; margin-top: 1rem; }
        .hidden { display: none; }
    </style>
</head>
<body>

<div class="container">
    <h1>📢 Julkaise sisältöä</h1>
    
    <?php if ($message): ?>
        <div class="alert <?= strpos($message, 'Virhe') !== false ? 'alert-error' : 'alert-success' ?>">
            <?= $message ?>
        </div>
    <?php endif; ?>

    <form method="POST" enctype="multipart/form-data">
        <div class="row">
            <div>
                <label for="business_id">Yritys ID (rowid)</label>
                <input type="number" id="business_id" name="business_id" required value="<?= sanitize($prefillId) ?>" placeholder="Esim. 123">
            </div>
            <div>
                <label for="type">Tyyppi</label>
                <select id="type" name="type">
                    <option value="maksu">Ilmainen maksu (Nostettu)</option>
                    <option value="event" selected>Tapahtuma</option>
                    <option value="story">Tarina</option>
                    <option value="offer">Tarjous</option>
                </select>
            </div>
        </div>

        <div class="<?= !empty($prefillToken) ? 'hidden' : '' ?>">
            <label for="publish_token">Julkaisu-token</label>
            <input type="password" id="publish_token" name="publish_token" required value="<?= sanitize($prefillToken) ?>" placeholder="Syötä turva-token">
        </div>

        <label for="title">Otsikko</label>
        <input type="text" id="title" name="title" required placeholder="Esim. Kevätmyyjäiset Laukaassa">

        <label for="short_description">Lyhyt kuvaus</label>
        <textarea id="short_description" name="short_description" rows="3" placeholder="Lyhyt teksti korttiin..."></textarea>

        <label for="image">Lataa kuva (Skaalataan max 1200px)</label>
        <input type="file" id="image" name="image" accept="image/*">

        <label for="image_url">TAI kuvan URL-osoite</label>
        <input type="url" id="image_url" name="image_url" placeholder="https://esimerkki.com/kuva.jpg">

        <div class="row">
            <div>
                <label for="publish_at">Julkaisuaika</label>
                <input type="datetime-local" id="publish_at" name="publish_at" value="<?= date('Y-m-d\TH:i') ?>">
            </div>
            <div class="checkbox-group" style="padding-top: 1.5rem;">
                <input type="checkbox" id="is_promoted" name="is_promoted">
                <label for="is_promoted" style="margin-bottom:0;">⭐ NOSTETTU (Nosto)</label>
            </div>
        </div>

        <hr style="border:0; border-top:1px solid #eee; margin: 1rem 0 1.5rem;">
        <p style="font-size:0.8rem; color:#666; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Some-linkit (Valinnainen)</p>
        
        <div class="row">
            <input type="url" name="website_url" placeholder="Verkkosivut">
            <input type="url" name="facebook_url" placeholder="Facebook">
        </div>
        <div class="row">
            <input type="url" name="instagram_url" placeholder="Instagram">
            <input type="url" name="youtube_url" placeholder="YouTube">
        </div>

        <button type="submit">Julkaise tiedote 🚀</button>
    </form>

    <?php if ($previewJson): ?>
        <h3>JSON Esikatselu:</h3>
        <pre><?= $previewJson ?></pre>
    <?php endif; ?>
</div>

</body>
</html>
