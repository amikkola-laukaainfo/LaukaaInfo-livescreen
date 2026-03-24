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
$csvCacheFile = 'advertisers_cache.csv';
$csvUrl       = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSV1-67oQMZmF0talwT6HXNg01NP0YA5XCNpKJsrTQ2RHQNQhEL6dySYicrfM1pnIU6Z41UqpzQdtdz/pub?output=csv';
$cacheTtl     = 600; // 10 minutes
$maxItems     = 100;

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

function extractYouTubeId($url) {
    if (!$url) return false;
    $pattern = '/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^#&?]{11})/';
    if (preg_match($pattern, $url, $match)) {
        return $match[1];
    }
    return false;
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
        if (isset($res['url'])) {
            return [
                'url' => $res['url'],
                'fileId' => $res['fileId'] ?? null
            ];
        }
    }
    return false;
}

/**
 * Delete from ImageKit via cURL
 */
function deleteFromImageKit($fileId, $privateKey) {
    if (!$fileId) return false;
    $url = "https://api.imagekit.io/v1/files/$fileId";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "DELETE");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Basic " . base64_encode($privateKey . ":")
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($httpCode >= 200 && $httpCode < 300);
}

// --- MAIN LOGIC ---
$message = '';
$previewJson = '';

// Determine current IDs and tokens (favor POST, fallback to pre-fill/GET)
$business_id = (int)($_POST['business_id'] ?? $prefillId);
$sentToken   = trim($_POST['publish_token'] ?? $prefillToken);

$advertiser = null;
$curLimits = ['posts' => 2, 'promotions' => 0];
$countMonth = 0;
$countPromotedMonth = 0;
$remPosts = 0;
$remPromos = 0;

// --- ADVERTISER VALIDATION (Always run if we have credentials) ---
if (!empty($business_id) && !empty($sentToken)) {
    // Fetch and Cache CSV
    if (!file_exists($csvCacheFile) || (time() - filemtime($csvCacheFile) > $cacheTtl)) {
        $csvData = @file_get_contents($csvUrl);
        if ($csvData) {
            file_put_contents($csvCacheFile, $csvData);
        }
    }

    if (file_exists($csvCacheFile)) {
        $handle = fopen($csvCacheFile, "r");
        $headers = fgetcsv($handle);
        while (($row = fgetcsv($handle)) !== FALSE) {
            if (count($row) < 5) continue;
            if ($row[0] == $business_id && $row[2] === $sentToken) {
                $advertiser = [
                    'id' => $row[0],
                    'nimi' => $row[1],
                    'paketti' => strtolower(trim($row[3])),
                    'voimassa' => trim($row[4])
                ];
                break;
            }
        }
        fclose($handle);
    }

    if ($advertiser) {
        // Check Expiration
        $today = date('Y-m-d');
        // Parse voimassa: try Finnish format "d.m.Y" first, then ISO "Y-m-d"
        $voimassaTs = false;
        if (!empty($advertiser['voimassa'])) {
            $d = \DateTime::createFromFormat('d.m.Y', $advertiser['voimassa']);
            if (!$d) $d = \DateTime::createFromFormat('Y-m-d', $advertiser['voimassa']);
            if ($d) $voimassaTs = $d->setTime(23, 59, 59)->getTimestamp();
        }
        if ($voimassaTs !== false && $voimassaTs < time()) {
            $message = "Virhe: Julkaisuoikeuden voimassaolo on päättynyt (" . $advertiser['voimassa'] . ").";
            $advertiser = null; // Invalidate if expired
        } else {
            $feedData = [];
            if (file_exists($jsonFile)) {
                $feedData = json_decode(file_get_contents($jsonFile), true) ?: [];
            }
            
            // --- ACTION HANDLERS ---
            $action = $_POST['action'] ?? '';
            $target_id = $_POST['target_id'] ?? '';
            if ($action === 'delete' && $target_id) {
                foreach ($feedData as $index => $item) {
                    if ($item['id'] === $target_id && $item['business_id'] == $business_id) {
                        $created = strtotime($item['created_at'] ?? '0');
                        if (time() - $created <= 900) { // 15 min window
                            if (!empty($item['imagekit_file_id']) && $privateKey !== 'YOUR_PRIVATE_KEY') {
                                deleteFromImageKit($item['imagekit_file_id'], $privateKey);
                            }
                            array_splice($feedData, $index, 1);
                            file_put_contents($jsonFile, json_encode($feedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                            $message = "Julkaisu poistettu onnistuneesti! 🗑️";
                            // Redirect to prevent form resubmission
                            header("Location: ?business_id=" . urlencode($business_id) . "&token=" . urlencode($sentToken));
                            exit;
                        } else {
                            $message = "Virhe: Julkaisun poistoaika (15 min) on umpeutunut.";
                        }
                        break;
                    }
                }
            }

            // --- PLAN LIMITS & USAGE ---

            $countTotal = 0;
            $countMonth = 0;
            $countDay = 0;
            $countPromotedMonth = 0;
            
            $now = time();
            $oneDayAgo   = $now - (24 * 3600);
            $oneMonthAgo = $now - (30 * 24 * 3600);

            foreach ($feedData as $item) {
                if ($item['business_id'] == $business_id) {
                    $pubTime = strtotime($item['publish_at'] ?? '');
                    $countTotal++;
                    
                    if ($pubTime > $oneMonthAgo) {
                        $countMonth++;
                        if (!empty($item['is_promoted'])) {
                            $countPromotedMonth++;
                        }
                    }
                    if ($pubTime > $oneDayAgo) {
                        $countDay++;
                    }
                }
            }

            $plan = $advertiser['paketti'];
            $limits = [
                'free'        => ['posts' => 1, 'promotions' => 0], // Default 1/mo, but overridden by starter logic below
                'basic'       => ['posts' => 2, 'promotions' => 0],
                'plus'        => ['posts' => 5, 'promotions' => 1],
                'pro'         => ['posts' => 10, 'promotions' => 3],
                'starter'     => ['posts' => 1, 'promotions' => 0],
                'event_boost' => ['posts' => 1, 'promotions' => 1]
            ];
            
            $curLimits = $limits[$plan] ?? ['posts' => 2, 'promotions' => 0];
            
            // Special Freemium/Free logic
            if ($plan === 'free') {
                // If they have used less than 3 total, they can still post (starter pack)
                if ($countTotal < 3) {
                    $remPosts = 3 - $countTotal;
                } else {
                    $remPosts = max(0, 1 - $countMonth);
                }
                
                // Rate limit: 1 per day
                if ($countDay >= 1) {
                    $remPosts = 0;
                }
            } else {
                $remPosts = max(0, $curLimits['posts'] - $countMonth);
            }
            
            $remPromos = max(0, $curLimits['promotions'] - $countPromotedMonth);
        }
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $message = "Virhe: Pääsy estetty. Token tai ID virheellinen.";
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') !== 'delete') {
    $title       = sanitize($_POST['title'] ?? '');
    $short_desc  = sanitize($_POST['short_description'] ?? '');
    $type        = $_POST['type'] ?? 'maksu';
    $publish_at  = $_POST['publish_at'] ?? date('Y-m-d\TH:i');
    $website_url = sanitize($_POST['website_url'] ?? '');
    $facebook_url = sanitize($_POST['facebook_url'] ?? '');
    $instagram_url = sanitize($_POST['instagram_url'] ?? '');
    $youtube_url = sanitize($_POST['youtube_url'] ?? '');
    
    // Auto-detect YouTube Video ID and Shorts status
    // Auto-detect YouTube Video ID and Shorts status
    $video_id = extractYouTubeId($youtube_url);
    if (!$video_id && !empty($image_url_input)) {
        $video_id = extractYouTubeId($image_url_input);
        if ($video_id) {
            $youtube_url = $image_url_input; // Treat it as youtube_url too
        }
    }
    
    $is_shorts = false;
    if ($video_id && $youtube_url && strpos($youtube_url, '/shorts/') !== false) {
        $is_shorts = true;
    }

    $is_promoted = isset($_POST['is_promoted']) || ($type === 'maksu');
    $image_url_input = sanitize($_POST['image_url'] ?? '');

    // Validation
    if (!$advertiser) {
        $message = $message ?: "Virhe: Kirjautuminen vaaditaan.";
    } elseif (empty($_FILES['image']['tmp_name']) && empty($image_url_input) && $type !== 'video' && empty($video_id)) {
        $message = "Virhe: Kuva tai kuvan URL vaaditaan (paitsi videoissa tai YouTube-linkin sisältävissä).";
    } else {
        // --- FINAL LIMIT CHECK ---
        $limitError = '';
        if ($countMonth >= $curLimits['posts'] && $curLimits['posts'] > 0) {
            $limitError = "Kuukausiraja (" . $curLimits['posts'] . " julkaisua/kk) on täynnä.";
        } elseif ($curLimits['posts'] == 0 && $advertiser['paketti'] === 'free') {
            $limitError = "Ilmais-paketti ei sisällä feed-julkaisuoikeutta.";
        } elseif ($type === 'maksu' && $remPromos <= 0) {
            $limitError = "Kuukauden nostokiintiö (" . $curLimits['promotions'] . ") on jo käytetty.";
        }

        if ($limitError) {
            $message = "Virhe: " . $limitError;
        } else {
                    // --- SUCCESS: PROCEED TO IMAGE UPLOAD AND SAVE ---
                    $final_image_url = '';

                    if (!empty($_FILES['image']['tmp_name'])) {
                        if ($privateKey === 'YOUR_PRIVATE_KEY') {
                            $message = "Virhe: ImageKit API-avaimia ei ole määritetty.";
                        } else {
                            $processedData = processImage($_FILES['image']['tmp_name']);
                            if ($processedData) {
                                $fileName = 'feed_' . time() . '_' . generateId() . '.jpg';
                                $uploadResult = uploadToImageKit($processedData, $fileName, $publicKey, $privateKey);
                                if ($uploadResult && is_array($uploadResult)) {
                                    $final_image_url = $uploadResult['url'];
                                    $imagekit_file_id = $uploadResult['fileId'];
                                } else {
                                    $message = "Virhe: Kuvan lataus ImageKit-palveluun epäonnistui.";
                                }
                            } else {
                            }
                        }
                    } else {
                        $final_image_url = $image_url_input;
                        
                        // If no image but we have a video ID, use YouTube thumbnail
                        if (!$final_image_url && $video_id) {
                            $final_image_url = "https://img.youtube.com/vi/$video_id/hqdefault.jpg";
                        }
                        
                        // If the provided image_url IS a YouTube link, convert it to a thumbnail
                        if ($final_image_url && extractYouTubeId($final_image_url)) {
                            $vid = extractYouTubeId($final_image_url);
                            $final_image_url = "https://img.youtube.com/vi/$vid/hqdefault.jpg";
                        }
                    }

                        if ($final_image_url) {
                            $new_id = generateId();
                            $edit_id = $_POST['edit_id'] ?? '';
                            $og_image = $final_image_url;
                            
                            $newItem = [
                                'id' => $new_id,
                                'business_id' => $business_id,
                                'type' => $type,
                                'title' => $title,
                                'description' => $short_desc,
                                'image' => $final_image_url,
                                'publish_at' => date('c', strtotime($publish_at)),
                                'is_promoted' => $is_promoted,
                                'created_at' => date('c'),
                                'imagekit_file_id' => $imagekit_file_id ?? null,
                                'og' => [
                                    'title' => $title,
                                    'description' => $short_desc ?: 'Katso sisältö LaukaaInfo-palvelussa',
                                    'image' => $og_image,
                                    'url' => 'https://laukaainfo.fi/share/' . $type . '/' . $new_id
                                ]
                            ];

                            if ($website_url)   $newItem['website_url'] = $website_url;
                            if ($facebook_url)  $newItem['facebook_url'] = $facebook_url;
                            if ($instagram_url) $newItem['instagram_url'] = $instagram_url;
                            if ($youtube_url)   $newItem['youtube_url'] = $youtube_url;
                            if ($video_id)      $newItem['video_id'] = $video_id;
                            if ($is_shorts)     $newItem['is_shorts'] = true;

                            $is_edit_successful = false;
                            if ($edit_id) {
                                foreach ($feedData as $index => $oldItem) {
                                    if ($oldItem['id'] === $edit_id && $oldItem['business_id'] == $business_id) {
                                        $created = strtotime($oldItem['created_at'] ?? '0');
                                        if (time() - $created <= 900) {
                                            $newItem['id'] = $oldItem['id'];
                                            $newItem['created_at'] = $oldItem['created_at'];
                                            $newItem['og']['url'] = 'https://laukaainfo.fi/share/' . $type . '/' . $oldItem['id'];
                                            
                                            // Handle ImageKit file persistence / deletion
                                            if (empty($imagekit_file_id) && empty($_FILES['image']['tmp_name'])) {
                                                $newItem['imagekit_file_id'] = $oldItem['imagekit_file_id'] ?? null;
                                            } elseif (!empty($oldItem['imagekit_file_id']) && !empty($_FILES['image']['tmp_name']) && $privateKey !== 'YOUR_PRIVATE_KEY') {
                                                deleteFromImageKit($oldItem['imagekit_file_id'], $privateKey);
                                            }
                                            
                                            $feedData[$index] = $newItem;
                                            $is_edit_successful = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (!$is_edit_successful) {
                                array_unshift($feedData, $newItem);
                            }
                            
                            $feedData = array_slice($feedData, 0, $maxItems);
                            file_put_contents($jsonFile, json_encode($feedData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                            
                            // Links for sharing and feedback
                            $feedUrl      = "https://laukaainfo.fi/?business_id=" . $business_id . "&feed=open";
                            $directUrl    = "https://laukaainfo.fi/?business_id=" . $business_id . "&item=" . $new_id . "&feed=open";
                            $facebookUrl  = "https://www.mediazoo.fi/laukaainfo-web/share.php?id=" . $new_id;

                            $message  = "Sisältö julkaistu onnistuneesti! ✅<br><br>";
                            $message .= "<div style='background:#f8f9fa; padding:1rem; border-radius:10px; border:1px solid #ddd; font-size:0.9rem; line-height:1.5;'>";
                            $message .= "<strong>1. Linkki yritysfeediin:</strong><br>";
                            $message .= "<a href='$feedUrl' target='_blank' style='color:#0056b3;'>$feedUrl</a><br><br>";
                            $message .= "<strong>2. Suora linkki julkaisuun (Laukaainfo.fi):</strong><br>";
                            $message .= "<a href='$directUrl' target='_blank' style='color:#0056b3;'>$directUrl</a><br><br>";
                            $message .= "<strong>3. Facebook- / Some-jakolinkki (Mediazoo.fi):</strong><br>";
                            $message .= "<a href='$facebookUrl' target='_blank' style='color:#0056b3; font-weight:bold;'>$facebookUrl</a><br>";
                            $message .= "<small style='color:#666; display:block; margin-top:0.4rem;'>";
                            $message .= "💡 <em>Käytä tätä Facebookissa / Somessa. Linkissä näkyy kuva ja viesti, ja linkki on ohjattu Mediazoo.fi:n kautta takaisin LaukaaInfo.fi-palveluun.</em>";
                            $message .= "</small>";
                            $message .= "</div>";
                            $previewJson = json_encode($newItem, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                            
                            // Update counts for UI reflecting the new post
                            $countMonth++;
                            if ($is_promoted) $countPromotedMonth++;
                            $remPosts = max(0, $curLimits['posts'] - $countMonth);
                            $remPromos = max(0, $curLimits['promotions'] - $countPromotedMonth);
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
        .info-box { background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; font-size: 0.9rem; }
        .info-box h4 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #0284c7; }
        .info-box ul { margin: 0; padding-left: 1.2rem; }
        .limit-alert { color: #dc2626; font-weight: bold; }
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

    <?php if (isset($advertiser)): ?>
        <div class="info-box">
            <h4>Tilaustiedot: <?= htmlspecialchars(strtoupper($advertiser['paketti'])) ?></h4>
            <ul>
                <?php if ($plan === 'free'): ?>
                    <li>Julkaisuja käytettävissä: <strong><?= $remPosts ?> kpl</strong></li>
                    <li>Julkaisuja yhteensä: <strong><?= $countTotal ?> kpl</strong></li>
                    <?php if ($countDay >= 1): ?>
                        <li class="limit-alert">Päivän julkaisuraja täynnä. Voit julkaista taas huomenna.</li>
                    <?php elseif ($countTotal >= 3 && $countMonth >= 1): ?>
                        <li class="limit-alert">Ilmaisjulkaisu tälle kuukaudelle käytetty (1/kk).</li>
                    <?php endif; ?>
                <?php else: ?>
                    <li>Julkaisuja jäljellä (30 pv): <strong><?= $remPosts ?> kpl</strong> (Käytetty <?= $countMonth ?>/<?= $curLimits['posts'] ?>)</li>
                    <li>Nostoja jäljellä (30 pv): <strong><?= $remPromos ?> kpl</strong> (Käytetty <?= $countPromotedMonth ?>/<?= $curLimits['promotions'] ?>)</li>
                <?php endif; ?>
            </ul>
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
                    <option value="maksu">Ilmoituksen nosto (⭐)</option>
                    <option value="event" selected>Tapahtuma</option>
                    <option value="video">🎥 Videoleike (YouTube)</option>
                    <option value="story">Tarina</option>
                    <option value="offer">Tarjous</option>
                    <option value="notice">Ilmoitus</option>
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
    
    <?php if (isset($advertiser)): ?>
        <hr style="border:0; border-top:1px solid #eee; margin: 2rem 0;">
        <h3>✏️ Omat viimeisimmät julkaisut (Muokattavissa 15 min ajan)</h3>
        <?php
        $now = time();
        $recent_items = [];
        if (!empty($feedData)) {
            foreach ($feedData as $item) {
                if ($item['business_id'] == $business_id && ($now - strtotime($item['created_at'] ?? '0')) <= 900) {
                    $recent_items[] = $item;
                }
            }
        }
        
        if (empty($recent_items)) {
            echo "<p style='color:#666; font-size:0.9rem;'>Ei muokattavia julkaisuja.</p>";
        } else {
            foreach ($recent_items as $rItem) {
                $minsLeft = floor(15 - ($now - strtotime($rItem['created_at']))/60);
                ?>
                <div style="background:#fff; border:1px solid #cbe4f9; padding:1rem; border-radius:8px; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                    <div style="min-width:200px;">
                        <strong><?= htmlspecialchars($rItem['title']) ?></strong><br>
                        <small style="color:#e67e22; font-weight:bold;">Aikaa jäljellä: <?= $minsLeft ?> min</small>
                    </div>
                    <form method="POST" style="margin:0; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <input type="hidden" name="business_id" value="<?= sanitize($business_id) ?>">
                        <input type="hidden" name="publish_token" value="<?= sanitize($sentToken) ?>">
                        <input type="hidden" name="target_id" value="<?= $rItem['id'] ?>">
                        <button type="button" onclick='editItem(<?= json_encode($rItem, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?>)' style="width:auto; padding:0.5rem 1rem; background:#f39c12; margin-bottom:0; font-size:0.9rem;">Muokkaa ✏️</button>
                        <button type="submit" name="action" value="delete" onclick="return confirm('Haluatko varmasti poistaa julkaisun lopullisesti?')" style="width:auto; padding:0.5rem 1rem; background:#e74c3c; margin-bottom:0; font-size:0.9rem;">Poista 🗑️</button>
                    </form>
                </div>
                <?php
            }
        }
        ?>
    <?php endif; ?>
</div>

<script>
function editItem(item) {
    document.getElementById('title').value = item.title || '';
    document.getElementById('short_description').value = item.description || '';
    document.getElementById('type').value = item.type || 'event';
    
    if (item.publish_at) {
        document.getElementById('publish_at').value = item.publish_at.substring(0, 16);
    }
    
    document.getElementById('is_promoted').checked = item.is_promoted || false;
    document.querySelector('input[name="website_url"]').value = item.website_url || '';
    document.querySelector('input[name="facebook_url"]').value = item.facebook_url || '';
    document.querySelector('input[name="instagram_url"]').value = item.instagram_url || '';
    document.querySelector('input[name="youtube_url"]').value = item.youtube_url || '';
    
    // Put current image url in field so they don't lose it if they don't upload a new one
    document.getElementById('image_url').value = item.image || '';
    
    // Add hidden edit_id field
    let editInput = document.getElementById('edit_id');
    if (!editInput) {
        editInput = document.createElement('input');
        editInput.type = 'hidden';
        editInput.id = 'edit_id';
        editInput.name = 'edit_id';
        document.querySelector('form').appendChild(editInput);
    }
    editInput.value = item.id;
    
    // Change submit button to indicate edit mode
    const submitBtn = document.querySelector('form button[type="submit"]');
    submitBtn.innerHTML = 'Tallenna muutokset ✏️';
    submitBtn.style.background = '#f39c12';
    
    // Scroll to top
    window.scrollTo({top: 0, behavior: 'smooth'});
}
</script>

</body>
</html>
