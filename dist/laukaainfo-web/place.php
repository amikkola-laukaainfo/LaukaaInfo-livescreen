<?php
/**
 * LaukaaInfo Place.php – Server-Side Rendered Place ID -sivu
 * 
 * Tarkoitus: Tarjoaa Googlelle ja muille crawlereille valmiin HTML:n,
 * jossa paikan nimi, kuvaus ja metatiedot ovat jo ensimmäisessä HTTP-vastauksessa.
 * 
 * Käyttö: https://www.mediazoo.fi/laukaainfo-web/place.php?id=<place_id>
 * 
 * Sijoitetaan: mediazoo.fi/laukaainfo-web/place.php
 */

// ── Supabase REST API -asetukset ──────────────────────────────────────────────
// AI Supabase (paikat, AI-sisältö)
define('AI_SB_URL',  'https://duxluwyqxvbmkkjzuzkz.supabase.co');
define('AI_SB_KEY',  'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu');

// ── Apufunktiot ───────────────────────────────────────────────────────────────

/**
 * Hakee dataa Supabase REST API:sta.
 * Palauttaa taulukon tai null virheen sattuessa.
 */
function supabase_get(string $table, array $params = [], ?string $select = null): ?array {
    $url = AI_SB_URL . '/rest/v1/' . $table;
    $query = [];
    if ($select) $query['select'] = $select;
    foreach ($params as $k => $v) $query[$k] = $v;
    if (!empty($query)) $url .= '?' . http_build_query($query);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_USERAGENT      => 'LaukaaInfo-SSR/1.0',
        CURLOPT_SSL_VERIFYPEER => false, // Välttää CA-varmenneongelmat jaetuilla palvelimilla
        CURLOPT_HTTPHEADER     => [
            'apikey: '        . AI_SB_KEY,
            'Authorization: Bearer ' . AI_SB_KEY,
            'Accept: application/json'
        ]
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400) return null;
    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : null;
}

/**
 * Typistää tekstin enintään $max merkkiin sanasta katkaisten.
 */
function truncate(string $text, int $max = 160): string {
    if (mb_strlen($text) <= $max) return $text;
    return mb_substr($text, 0, mb_strrpos(mb_substr($text, 0, $max), ' ')) . '…';
}

/**
 * Palauttaa paikan tyypin suomenkielisen nimen.
 */
function get_type_label(string $type): string {
    $labels = [
        'BEACH'          => 'Uimaranta',
        'PARK'           => 'Puisto',
        'NATURE_AREA'    => 'Luontoalue',
        'SPORT'          => 'Liikuntapaikka',
        'HISTORICAL'     => 'Historiallinen kohde',
        'VILLAGE'        => 'Kylä',
        'DISTRICT'       => 'Alue',
        'TRAIL'          => 'Reitti',
        'HARBOR'         => 'Satama',
        'OUTDOOR_AREA'   => 'Ulkoilualue',
        'ATTRACTION'     => 'Nähtävyys',
        'CAMPING'        => 'Leirintäalue',
        'EVENT_VENUE'    => 'Tapahtumapaikka',
        'SCHOOL'         => 'Koulu',
        'LIBRARY'        => 'Kirjasto',
        'HEALTH'         => 'Terveyspalvelut',
        'ADMINISTRATIVE' => 'Hallinto',
        'RECREATION'     => 'Virkistysalue',
        'CULTURE'        => 'Kulttuuri',
        'FISHING'        => 'Kalastuspaikka',
        'SKI'            => 'Hiihtokeskus',
    ];
    return $labels[$type] ?? 'Paikka';
}

// ── 1. Hae parametrit URL:sta ─────────────────────────────────────────────────
$placeId   = isset($_GET['id'])   ? trim(preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['id']))   : '';
$placeName = isset($_GET['name']) ? trim(strip_tags($_GET['name'])) : '';

// Vaaditaan vähintään id tai name
if (empty($placeId) && empty($placeName)) {
    header('Location: https://laukaainfo.fi/karttakohteet.html');
    exit;
}

// ── 2. Hae paikan perustiedot Supabasesta ─────────────────────────────────────
$place = null;

if (!empty($placeId)) {
    $rows = supabase_get('places',
        ['place_id' => 'eq.' . $placeId, 'limit' => '1'],
        'place_id,name,canonical_name,description,municipality,type,lat,lon,status,importance,parent_place_id'
    );
    if ($rows && !isset($rows['_debug_error'])) $place = $rows[0] ?? null;
}

// Fallback: hae nimellä
if (!$place && !empty($placeName)) {
    $decodedName = urldecode($placeName);
    $rows = supabase_get('places',
        ['name' => 'ilike.' . $decodedName, 'status' => 'eq.ACTIVE', 'limit' => '1'],
        'place_id,name,canonical_name,description,municipality,type,lat,lon,status,importance,parent_place_id'
    );
    if ($rows && !isset($rows['_debug_error'])) {
        $place = $rows[0] ?? null;
        if ($place) $placeId = $place['place_id'];
    }
}

// ── 3. Hae AI-tuotettu sisältö (summary, themes, activities, faq) ─────────────
$aiSummary    = '';
$aiThemes     = [];
$aiActivities = [];
$aiFaq        = [];

if ($place && !empty($placeId)) {
    $aiRows = supabase_get('organization_ai_content',
        [
            'organization_id' => 'eq.' . $placeId,
            'content_type'    => 'eq.place_profile',
            'order'           => 'created_at.desc',
            'limit'           => '1'
        ],
        'content'
    );
    if ($aiRows && isset($aiRows[0]['content'])) {
        $aiData = json_decode($aiRows[0]['content'], true);
        if ($aiData) {
            $aiSummary    = $aiData['summary']    ?? '';
            $aiThemes     = $aiData['themes']     ?? [];
            $aiActivities = $aiData['activities'] ?? [];
            $aiFaq        = $aiData['faq']        ?? [];
        }
    }
}

// ── 4. Hae alakohteet ────────────────────────────────────────────────────────
$subPlaces = [];
if ($place && !empty($placeId)) {
    $spRows = supabase_get('places',
        ['parent_place_id' => 'eq.' . $placeId, 'status' => 'eq.ACTIVE', 'order' => 'importance.desc', 'limit' => '12'],
        'place_id,name,canonical_name,type,description'
    );
    if ($spRows) $subPlaces = $spRows;
}

// ── 5. Rakenna metatiedot ─────────────────────────────────────────────────────
$siteName  = 'LaukaaInfo';
$pageUrl   = 'https://www.mediazoo.fi/laukaainfo-web/place.php?id=' . urlencode($placeId);
$jsPageUrl = 'https://laukaainfo.fi/tietoa-paikasta.html?id=' . urlencode($placeId);
$ogImage   = 'https://laukaainfo.fi/hero-kuva.webp';

if ($place) {
    $placeLongName = $place['name'] ?? $place['canonical_name'] ?? 'Paikka';
    $municipality  = $place['municipality'] ?? 'Laukaa';
    $typeLabel     = get_type_label($place['type'] ?? '');
    $title         = $placeLongName . ' – ' . $municipality . ' | ' . $siteName;

    // Kuvaus: AI-yhteenveto → places.description → geneerinen
    if (!empty($aiSummary)) {
        $rawDesc = $aiSummary;
    } elseif (!empty($place['description'])) {
        $rawDesc = $place['description'];
    } else {
        $rawDesc = $placeLongName . ' on ' . mb_strtolower($typeLabel) . ' Laukaan kunnassa. '
                 . 'Tutustu kohteeseen LaukaaInfo-tietopankissa.';
    }

    $metaDescription = truncate(strip_tags($rawDesc), 160);

    $schemaType = 'LandmarksOrHistoricalBuildings';
    if (in_array($place['type'] ?? '', ['BEACH', 'PARK', 'NATURE_AREA', 'OUTDOOR_AREA', 'TRAIL', 'RECREATION'])) {
        $schemaType = 'Park';
    }

} else {
    $placeLongName   = 'Paikka';
    $municipality    = 'Laukaa';
    $typeLabel       = 'Paikka';
    $title           = 'Paikka ei löytynyt – ' . $siteName;
    $metaDescription = 'Haettua paikkaa ei löytynyt LaukaaInfo-tietopankista.';
    $rawDesc         = '';
    $schemaType      = 'Place';
}
?>
<!DOCTYPE html>
<html lang="fi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($title); ?></title>

    <!-- SEO metatiedot -->
    <meta name="description" content="<?php echo htmlspecialchars($metaDescription); ?>">
    <meta name="robots" content="index, follow">
    <?php if ($place): ?>
    <link rel="canonical" href="<?php echo htmlspecialchars($pageUrl); ?>">
    <?php endif; ?>

    <!-- Open Graph -->
    <meta property="og:title"       content="<?php echo htmlspecialchars($title); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($metaDescription); ?>">
    <meta property="og:image"       content="<?php echo $ogImage; ?>">
    <meta property="og:url"         content="<?php echo htmlspecialchars($pageUrl); ?>">
    <meta property="og:type"        content="website">
    <meta property="og:site_name"   content="LaukaaInfo">
    <meta property="og:locale"      content="fi_FI">

    <!-- Twitter Card -->
    <meta name="twitter:card"        content="summary_large_image">
    <meta name="twitter:title"       content="<?php echo htmlspecialchars($title); ?>">
    <meta name="twitter:description" content="<?php echo htmlspecialchars($metaDescription); ?>">
    <meta name="twitter:image"       content="<?php echo $ogImage; ?>">

    <?php if ($place): ?>
    <!-- JSON-LD strukturoitu data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "<?php echo $schemaType; ?>",
        "name": "<?php echo addslashes($placeLongName); ?>",
        "description": "<?php echo addslashes(strip_tags($rawDesc)); ?>",
        "url": "<?php echo $pageUrl; ?>",
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "<?php echo addslashes($municipality); ?>",
            "addressCountry": "FI"
        }
        <?php if (!empty($place['lat']) && !empty($place['lon'])): ?>
        ,"geo": {
            "@type": "GeoCoordinates",
            "latitude": <?php echo (float)$place['lat']; ?>,
            "longitude": <?php echo (float)$place['lon']; ?>
        }
        <?php endif; ?>
    }
    </script>
    <?php endif; ?>

    <link rel="icon" href="https://laukaainfo.fi/logo.png">

    <!-- Fontit -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">

    <!-- Leaflet karttaa varten -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">

    <!-- LaukaaInfo tyylit -->
    <link rel="stylesheet" href="https://laukaainfo.fi/style.css">
    <link rel="stylesheet" href="https://laukaainfo.fi/modal.css">

    <style>
        :root {
            --bg-color: #f8fafc;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --accent: #10b981;
            --accent-hover: #059669;
            --radius-lg: 32px;
            --radius-md: 24px;
            --radius-sm: 16px;
            --shadow-sm: 0 4px 20px rgba(0,0,0,0.03);
            --shadow-md: 0 12px 40px rgba(0,0,0,0.06);
            --shadow-hover: 0 20px 40px rgba(0,0,0,0.1);
        }
        body {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            min-height: 100vh;
            font-family: 'Inter', sans-serif;
            color: var(--text-main);
            margin: 0; padding: 0;
            line-height: 1.6;
            overflow-x: hidden;
        }
        /* Hero */
        .hero-section {
            width: 100%; min-height: 320px; padding-top: 7rem;
            background: url('https://images.unsplash.com/photo-1542314831-c53cd4b85ca4?auto=format&fit=crop&w=1920&q=80') center/cover no-repeat;
            position: relative; display: flex; align-items: flex-end; padding-bottom: 3rem;
        }
        .hero-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(to top, rgba(248,250,252,1) 0%, rgba(248,250,252,0.7) 50%, rgba(255,255,255,0.4) 100%);
        }
        .hero-content {
            position: relative; z-index: 10; max-width: 1200px;
            margin: 0 auto; width: 100%; padding: 0 2rem;
            display: flex; flex-direction: column; gap: 1rem;
        }
        .badge {
            display: inline-block; background: rgba(0,0,0,0.05);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            padding: 0.4rem 1rem; border-radius: 50px;
            font-size: 0.85rem; font-weight: 700;
            color: var(--text-main); text-transform: uppercase;
            letter-spacing: 1px; width: fit-content;
        }
        .hero-title {
            font-family: 'Outfit', sans-serif;
            font-size: clamp(2.2rem, 5vw, 4rem);
            font-weight: 800; line-height: 1.1;
            margin: 0; letter-spacing: -1px;
            word-break: break-word; hyphens: auto;
        }
        .hero-meta { display: flex; align-items: center; gap: 1rem; font-size: 1.1rem; opacity: 0.9; }
        .action-buttons { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
        .btn {
            display: inline-flex; align-items: center; gap: 0.5rem;
            padding: 0.8rem 1.5rem; border-radius: 50px;
            font-weight: 600; font-size: 0.95rem; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            border: none; text-decoration: none;
            backdrop-filter: blur(10px);
        }
        .btn-primary { background: var(--text-main); color: #fff; }
        .btn-primary:hover { background: #000; transform: translateY(-2px); }
        .btn-light { background: rgba(0,0,0,0.05); color: var(--text-main); border: 1px solid rgba(0,0,0,0.1); }
        .btn-light:hover { background: rgba(0,0,0,0.08); transform: translateY(-2px); }

        /* Layout */
        .page-container {
            max-width: 1200px; margin: 3rem auto; padding: 0 2rem;
            display: grid; grid-template-columns: 1.5fr 1fr; gap: 4rem;
        }
        @media (max-width: 992px) {
            .page-container { grid-template-columns: 1fr; gap: 2rem; }
            .hero-title { font-size: 2.5rem; }
        }
        @media (max-width: 768px) {
            .hero-section { padding-top: 4rem; padding-bottom: 2rem; }
            .page-container { padding: 0 1.5rem; margin: 2rem auto; }
        }

        .content-block { margin-bottom: 3.5rem; }
        .content-block h2 {
            font-family: 'Outfit', sans-serif; font-size: 1.75rem; font-weight: 700;
            margin-bottom: 1.5rem; color: var(--text-main);
            display: flex; align-items: center; gap: 0.5rem;
        }

        /* SEO tekstikortit */
        .seo-card {
            background: white; border-radius: var(--radius-md);
            padding: 2rem; box-shadow: var(--shadow-sm);
            border: 1px solid #f1f5f9;
        }
        .seo-card p {
            font-size: 1.1rem; line-height: 1.75; color: var(--text-main); margin: 0;
        }
        .activity-card {
            background: white; border-radius: var(--radius-sm);
            padding: 1rem 1.5rem; box-shadow: var(--shadow-sm);
            border: 1px solid #f1f5f9; margin-bottom: 0.75rem;
        }
        .activity-card strong { font-size: 1rem; color: var(--text-main); }
        .activity-card p { font-size: 0.9rem; color: var(--text-muted); margin: 0.4rem 0 0; }

        /* Teemat */
        .tag-pill {
            display: inline-block;
            background: #f0fdf4; color: #15803d;
            border: 1px solid #bbf7d0;
            padding: 0.35rem 0.9rem; border-radius: 50px;
            font-size: 0.85rem; font-weight: 600;
            margin: 0.25rem; text-decoration: none;
            transition: background 0.2s;
        }
        .tag-pill:hover { background: #dcfce7; }

        /* FAQ */
        .faq-item {
            background: white; border-radius: var(--radius-sm);
            border: 1px solid #f1f5f9; margin-bottom: 1rem;
            overflow: hidden; box-shadow: var(--shadow-sm);
        }
        .faq-q {
            font-weight: 700; padding: 1.25rem 1.5rem; font-size: 1rem;
            color: var(--text-main); background: #f8fafc;
            border-bottom: 1px solid #f1f5f9;
        }
        .faq-a { padding: 1.25rem 1.5rem; color: var(--text-muted); font-size: 0.95rem; line-height: 1.7; }

        /* Alakohteet */
        .subplace-link {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.9rem 1.25rem;
            background: white; border: 1px solid #f1f5f9;
            border-radius: var(--radius-sm); text-decoration: none;
            color: var(--text-main); transition: all 0.25s ease;
            box-shadow: var(--shadow-sm); margin-bottom: 0.6rem;
        }
        .subplace-link:hover { box-shadow: var(--shadow-md); transform: translateX(4px); border-color: var(--accent); }
        .subplace-name { font-weight: 700; font-size: 1rem; }
        .subplace-type { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.15rem; }

        /* Sidebar */
        .sidebar { display: flex; flex-direction: column; gap: 2.5rem; }
        .info-card {
            background: white; border-radius: var(--radius-md);
            padding: 1.75rem; box-shadow: var(--shadow-sm); border: 1px solid #f1f5f9;
        }
        .info-card h3 {
            font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 700;
            margin: 0 0 1.25rem; color: var(--text-main);
        }
        .info-row { display: flex; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #f8fafc; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: var(--text-muted); font-size: 0.9rem; }
        .info-value { font-weight: 600; font-size: 0.9rem; }

        /* JS-hydraatioilmoitus */
        #js-loading-notice {
            background: #fffbeb; border: 1px solid #fde68a;
            border-radius: 12px; padding: 0.75rem 1.25rem;
            font-size: 0.9rem; color: #92400e;
            margin-bottom: 1.5rem;
        }
    </style>
</head>

<body>
    <!-- Navigaatio (JS täyttää) -->
    <nav></nav>

    <?php if (!$place): ?>
    <!-- Paikka ei löytynyt -->
    <div style="height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;text-align:center;padding:2rem;">
        <span style="font-size:4rem;">🗺️</span>
        <h1 style="font-size:2rem;color:var(--text-main);margin:0;">Paikkaa ei löytynyt</h1>
        <p style="color:var(--text-muted);margin:0;">Tarkista place_id tai palaa karttakohteisiin.</p>
        <a href="https://laukaainfo.fi/karttakohteet.html" class="btn btn-primary">Avaa kartta</a>
    </div>

    <?php else: ?>

    <!-- 1. HERO – SSR-renderöity (Google indeksoi tämän) -->
    <section class="hero-section" id="hero-section">
        <div class="hero-overlay"></div>
        <div class="hero-content">
            <div id="parent-navigation" style="display:none;"></div>
            <span class="badge" id="place-type"><?php echo htmlspecialchars($typeLabel); ?></span>
            <h1 class="hero-title" id="place-name"><?php echo htmlspecialchars($placeLongName); ?></h1>
            <div class="hero-meta" id="place-municipality">
                <span>📍 <?php echo htmlspecialchars($municipality); ?></span>
            </div>
            <div class="action-buttons">
                <a href="https://laukaainfo.fi/" class="btn btn-primary">🏠 Etusivu</a>
                <a href="<?php echo htmlspecialchars($jsPageUrl); ?>" class="btn btn-light" id="btn-interactive">
                    ⚡ Interaktiivinen versio
                </a>
                <button id="btn-route" class="btn btn-light"
                    onclick="window.open('https://maps.google.com/?q=<?php echo urlencode($placeLongName . ', ' . $municipality); ?>', '_blank')">
                    🗺️ Reitti
                </button>
                <button id="share-place-btn" class="btn btn-light"
                    onclick="if(navigator.share){navigator.share({title:'<?php echo addslashes(htmlspecialchars($placeLongName)); ?>',url:window.location.href})}else{navigator.clipboard.writeText(window.location.href);alert('Linkki kopioitu!')}">
                    🔗 Jaa
                </button>
            </div>
        </div>
    </section>

    <!-- 2. PÄÄSISÄLTÖ (Google indeksoi tämän) -->
    <div class="page-container" id="place-content">

        <!-- Vasen palsta -->
        <main class="left-col">

            <!-- Käyttäjälle: linkki interaktiiviseen versioon -->
            <div id="js-loading-notice">
                ⏳ Ladataan interaktiivista sisältöä...
                <a href="<?php echo htmlspecialchars($jsPageUrl); ?>" style="color:#d97706;font-weight:700;margin-left:0.5rem;">
                    Avaa laukaainfo.fi-versio →
                </a>
            </div>

            <?php if (!empty($subPlaces)): ?>
            <!-- Alakohteet -->
            <section class="content-block" id="subplaces-section">
                <h2>📍 Tähän paikkaan kuuluu</h2>
                <div id="subplaces-list">
                    <?php foreach ($subPlaces as $sp): ?>
                    <a href="https://www.mediazoo.fi/laukaainfo-web/place.php?id=<?php echo urlencode($sp['place_id']); ?>"
                       class="subplace-link">
                        <div>
                            <div class="subplace-name"><?php echo htmlspecialchars($sp['name'] ?? $sp['canonical_name'] ?? ''); ?></div>
                            <div class="subplace-type"><?php echo htmlspecialchars(get_type_label($sp['type'] ?? '')); ?></div>
                        </div>
                        <span style="margin-left:auto;color:var(--text-muted);">→</span>
                    </a>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endif; ?>

            <!-- Kuvaus (SSR – Google indeksoi) -->
            <section class="content-block" id="intro-section">
                <h2>📖 Tietoa paikasta</h2>
                <div class="seo-card" id="display-description">
                    <?php if (!empty($aiSummary)): ?>
                    <p><?php echo nl2br(htmlspecialchars($aiSummary)); ?></p>
                    <?php elseif (!empty($place['description'])): ?>
                    <p><?php echo nl2br(htmlspecialchars($place['description'])); ?></p>
                    <?php else: ?>
                    <p>
                        <strong><?php echo htmlspecialchars($placeLongName); ?></strong> on
                        <?php echo htmlspecialchars(mb_strtolower($typeLabel)); ?> Laukaan kunnassa.
                        Tutustu kohteeseen, sen lähipalveluihin ja tapahtumiin LaukaaInfo-tietopankissa.
                    </p>
                    <?php endif; ?>
                </div>
            </section>

            <?php if (!empty($aiThemes)): ?>
            <!-- Teemat (SEO-arvoinen) -->
            <section class="content-block" id="themes-section">
                <h2>🏷️ Teemat</h2>
                <div>
                    <?php foreach ($aiThemes as $theme): ?>
                    <?php $t = is_array($theme) ? ($theme['label'] ?? $theme['id'] ?? '') : (string)$theme; ?>
                    <?php if (!empty($t)): ?>
                    <a href="https://laukaainfo.fi/teema.html?tag=<?php echo urlencode(mb_strtolower($t)); ?>"
                       class="tag-pill"><?php echo htmlspecialchars($t); ?></a>
                    <?php endif; ?>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endif; ?>

            <?php if (!empty($aiActivities)): ?>
            <!-- Aktiviteetit -->
            <section class="content-block" id="activities-section">
                <h2>🎯 Aktiviteetit ja tekeminen</h2>
                <?php foreach ($aiActivities as $act): ?>
                <div class="activity-card">
                    <?php if (is_array($act)): ?>
                    <strong><?php echo htmlspecialchars($act['name'] ?? $act['title'] ?? ''); ?></strong>
                    <?php if (!empty($act['description'])): ?>
                    <p><?php echo htmlspecialchars($act['description']); ?></p>
                    <?php endif; ?>
                    <?php else: ?>
                    <strong><?php echo htmlspecialchars((string)$act); ?></strong>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </section>
            <?php endif; ?>

            <?php if (!empty($aiFaq)): ?>
            <!-- FAQ -->
            <section class="content-block" id="faq-section">
                <h2>❓ Usein kysyttyä</h2>
                <?php foreach ($aiFaq as $item): ?>
                <div class="faq-item">
                    <div class="faq-q"><?php echo htmlspecialchars($item['question'] ?? $item['q'] ?? ''); ?></div>
                    <div class="faq-a"><?php echo htmlspecialchars($item['answer'] ?? $item['a'] ?? ''); ?></div>
                </div>
                <?php endforeach; ?>
            </section>
            <?php endif; ?>

            <!-- JS-täytetyt osiot (kartta, kohtaamiset, yritykset...) -->
            <section class="content-block" id="map-section"           style="display:none;"></section>
            <section class="content-block" id="media-section"         style="display:none;"></section>
            <section class="content-block" id="services-main-section" style="display:none;"></section>
            <section class="content-block" id="events-section"        style="display:none;"></section>
            <section class="content-block" id="timeline-section"      style="display:none;"></section>
            <section class="content-block" id="encounters-section"    style="display:none;"></section>
            <section class="content-block" id="memories-section"      style="display:none;"></section>
        </main>

        <!-- Sivupalsta -->
        <aside class="sidebar">
            <!-- Perustiedot (SSR) -->
            <div class="info-card">
                <h3>📋 Perustiedot</h3>
                <div class="info-row">
                    <span class="info-label">Tyyppi</span>
                    <span class="info-value"><?php echo htmlspecialchars($typeLabel); ?></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Kunta</span>
                    <span class="info-value"><?php echo htmlspecialchars($municipality); ?></span>
                </div>
                <?php if (!empty($place['lat']) && !empty($place['lon'])): ?>
                <div class="info-row">
                    <span class="info-label">Sijainti</span>
                    <span class="info-value">
                        <a href="https://maps.google.com/?q=<?php echo (float)$place['lat'] . ',' . (float)$place['lon']; ?>"
                           target="_blank" style="color:var(--accent);text-decoration:none;">
                            <?php printf('%.4f°N, %.4f°E', $place['lat'], $place['lon']); ?>
                        </a>
                    </span>
                </div>
                <?php endif; ?>
            </div>

            <!-- Kartta (JS täyttää) -->
            <div id="map-container" style="display:none; background:white; border-radius:var(--radius-md); overflow:hidden; box-shadow:var(--shadow-sm); border:1px solid #f1f5f9;">
                <div id="map" style="height:280px;width:100%;"></div>
            </div>

            <!-- JS-täytetyt sivupalstan osiot -->
            <div id="nearby-places-section"  class="content-block" style="display:none;"></div>
            <div id="network-stats"           class="network-stats" style="display:none;"></div>
            <div id="participate-section"     class="content-block" style="display:none;"></div>
        </aside>
    </div><!-- /page-container -->

    <?php endif; ?>

    <footer></footer>

    <!-- Globaalit skriptit -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://code.iconify.design/3/3.1.0/iconify.min.js"></script>
    <script src="https://laukaainfo.fi/translations.js"></script>
    <script src="https://laukaainfo.fi/supabase-config.js"></script>
    <script src="https://laukaainfo.fi/nav-sync.js"></script>

    <?php if ($place): ?>
    <script>
        // PHP syöttää place_id:n suoraan JS:lle – tietoa-paikasta.js käyttää tätä
        window.__PHP_PLACE_ID   = <?php echo json_encode($placeId); ?>;
        window.__PHP_PLACE_DATA = <?php echo json_encode([
            'place_id'       => $place['place_id']       ?? '',
            'name'           => $place['name']           ?? '',
            'canonical_name' => $place['canonical_name'] ?? '',
            'description'    => $place['description']    ?? '',
            'municipality'   => $place['municipality']   ?? 'Laukaa',
            'type'           => $place['type']           ?? '',
            'lat'            => $place['lat']            ?? null,
            'lon'            => $place['lon']            ?? null,
        ]); ?>;

        // Varmistetaan, että URL:ssa on id-parametri niin tietoa-paikasta.js toimii
        (function() {
            var params = new URLSearchParams(window.location.search);
            if (!params.has('id') && window.__PHP_PLACE_ID) {
                history.replaceState(null, '', '?id=' + encodeURIComponent(window.__PHP_PLACE_ID));
            }
        })();

        // Piilotetaan JS-latausilmoitus heti kun JS on valmis
        document.addEventListener('DOMContentLoaded', function() {
            var n = document.getElementById('js-loading-notice');
            if (n) n.style.display = 'none';
        });
    </script>
    <?php endif; ?>

    <!-- Paikkasivu JS: hydratoi kartan, yritykset, kohtaamiset jne. -->
    <script src="https://laukaainfo.fi/tietoa-paikasta.js"></script>

</body>
</html>
