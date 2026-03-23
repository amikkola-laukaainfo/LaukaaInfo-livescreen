<?php
/**
 * LaukaaInfo OG Sharing Endpoint
 * Location: /laukaainfo-web/share.php
 * Usage: Accessed via /share/video/123456 (using .htaccess) or /share.php?id=123456
 */

// 1. Get the ID from URL rewriting or query string
$id = $_GET['id'] ?? '';

// Basic validation
if (empty($id) || !preg_match('/^[a-f0-9]+$/i', $id)) {
    header("HTTP/1.0 404 Not Found");
    exit("Item not found");
}

// 2. Read content.json
$jsonFile = __DIR__ . '/content.json';
$items = [];

if (file_exists($jsonFile)) {
    $items = json_decode(file_get_contents($jsonFile), true) ?: [];
}

// 3. Find the item
$contentItem = null;
foreach ($items as $item) {
    if ($item['id'] === $id) {
        $contentItem = $item;
        break;
    }
}

// 4. Default values if not found or no OG data
if (!$contentItem || empty($contentItem['og'])) {
    $ogTitle = "LaukaaInfo";
    $ogDesc = "Katso paikallisia uutisia ja videoita.";
    $ogImage = "https://laukaainfo.fi/assets/default-share-image.jpg";
    $ogUrl = "https://laukaainfo.fi";
    $redirectUrl = "https://laukaainfo.fi/";
} else {
    // Extract OG variables
    $rawTitle = $contentItem['og']['title'] ?? 'Julkaisu';
    // Lisätään LaukaaInfo.fi -tunniste loppuun, jotta mediazoo.fi-linkki ei hämää
    $ogTitle = htmlspecialchars($rawTitle) . " | LaukaaInfo.fi";
    $ogDesc  = htmlspecialchars($contentItem['og']['description']);
    $ogImage = htmlspecialchars($contentItem['og']['image']);
    
    // The actual frontend URL where the user should end up
    $type = $contentItem['type'] ?? 'video';
    $redirectUrl = "https://laukaainfo.fi/?filter={$type}&feed=open&id={$id}";
    
    // KORJAUS: Facebook on erittäin "tarkka" og:url-tagista. Jos kerromme sille, 
    // että "oikea osoite" on laukaainfo.fi/share/..., se menee katsomaan sitä 
    // osoitetta, saa GitHubilta 404:n ja vetää esiin LaukaaInfon yleiset tiedot!
    // Siksi og:url täytyy olla tarkalleen tämä MediaZoon URL, jota jaetaan.
    $ogUrl = "https://www.mediazoo.fi/laukaainfo-web/share.php?type={$type}&id={$id}";
}
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <title><?= $ogTitle ?></title>
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="<?= $ogTitle ?>" />
    <meta property="og:description" content="<?= $ogDesc ?>" />
    <meta property="og:image" content="<?= $ogImage ?>" />
    <meta property="og:url" content="<?= $ogUrl ?>" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="LaukaaInfo" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?= $ogTitle ?>" />
    <meta name="twitter:description" content="<?= $ogDesc ?>" />
    <meta name="twitter:image" content="<?= $ogImage ?>" />
    
    <script>
        // JS fallback redirect (some scrapers ignore JS, which is what we want!)
        window.location.replace("<?= $redirectUrl ?>");
    </script>
</head>
<body>
    <p>Uudelleenohjataan... Jos et siirry automaattisesti, <a href="<?= htmlspecialchars($redirectUrl) ?>">klikkaa tästä</a>.</p>
</body>
</html>
