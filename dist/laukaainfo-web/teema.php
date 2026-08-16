<?php
/**
 * LaukaaInfo Teema.php – Server-Side Rendered Teema-sivu
 * 
 * Tarkoitus: Tarjoaa Googlelle valmiin HTML:n teema-sivuille.
 * Hakee teeman nimen ja kuvauksen theme_taxonomy.json:sta.
 * 
 * Käyttö: https://www.mediazoo.fi/laukaainfo-web/teema.php?tag=kalastus
 * 
 * Sijoitetaan: mediazoo.fi/laukaainfo-web/teema.php
 */

// ── Supabase REST API -asetukset ──────────────────────────────────────────────
define('AI_SB_URL2', 'https://duxluwyqxvbmkkjzuzkz.supabase.co');
define('AI_SB_KEY2', 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu');

// ── Apufunktiot ───────────────────────────────────────────────────────────────

function supabase_get2(string $table, array $params = [], ?string $select = null): ?array {
    $url = AI_SB_URL2 . '/rest/v1/' . $table;
    $query = [];
    if ($select) $query['select'] = $select;
    foreach ($params as $k => $v) $query[$k] = $v;
    if (!empty($query)) $url .= '?' . http_build_query($query);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_USERAGENT      => 'LaukaaInfo-SSR/1.0',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => [
            'apikey: '        . AI_SB_KEY2,
            'Authorization: Bearer ' . AI_SB_KEY2,
            'Accept: application/json',
        ]
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $status >= 400) return null;
    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : null;
}

function truncate2(string $text, int $max = 160): string {
    if (mb_strlen($text) <= $max) return $text;
    $sub = mb_substr($text, 0, $max);
    $pos = mb_strrpos($sub, ' ');
    return ($pos !== false ? mb_substr($sub, 0, $pos) : $sub) . '…';
}

/**
 * Etsii teeman tiedot theme_taxonomy.json:sta.
 * Palauttaa ['label' => '...', 'category' => '...', 'synonyms' => [...], 'description' => '...'] tai null.
 */
function find_theme_in_taxonomy(array $taxonomy, string $tagParam): ?array {
    $tagLower = mb_strtolower(trim($tagParam));

    // Tarkistaa pääryhmät (main_groups)
    if (!empty($taxonomy['main_groups'])) {
        foreach ($taxonomy['main_groups'] as $main) {
            $mainId    = mb_strtolower($main['id']    ?? '');
            $mainLabel = mb_strtolower($main['label'] ?? '');
            if ($mainId === $tagLower || $mainLabel === $tagLower) {
                return [
                    'label'       => $main['label'] ?? $tagParam,
                    'category'    => $main['category'] ?? 'THEME',
                    'icon'        => $main['icon'] ?? '',
                    'synonyms'    => [],
                    'description' => 'Selaa Laukaan ' . ($main['label'] ?? $tagParam) . '-kohteita, palveluita ja tapahtumia.',
                    'groups'      => $main['groups'] ?? [],
                    'type'        => 'main',
                ];
            }
            // Tarkistaa aliryhmät ja yksittäiset tagit
            if (!empty($main['groups'])) {
                foreach ($main['groups'] as $group) {
                    $groupId    = mb_strtolower($group['id']    ?? '');
                    $groupLabel = mb_strtolower($group['label'] ?? '');
                    if ($groupId === $tagLower || $groupLabel === $tagLower) {
                        return [
                            'label'       => $group['label'] ?? $tagParam,
                            'category'    => 'GROUP',
                            'icon'        => $main['icon'] ?? '',
                            'synonyms'    => [],
                            'description' => ($group['label'] ?? $tagParam) . ' Laukaassa – paikat, palvelut ja tapahtumat.',
                            'parent'      => $main['label'] ?? '',
                            'tags'        => $group['tags'] ?? [],
                            'type'        => 'group',
                        ];
                    }
                    if (!empty($group['tags'])) {
                        foreach ($group['tags'] as $tag) {
                            $tagId    = mb_strtolower($tag['id']    ?? '');
                            $tagLabel = mb_strtolower($tag['label'] ?? '');
                            $synonyms = array_map('mb_strtolower', $tag['synonyms'] ?? []);
                            if ($tagId === $tagLower || $tagLabel === $tagLower || in_array($tagLower, $synonyms)) {
                                return [
                                    'label'       => $tag['label'] ?? $tagParam,
                                    'category'    => $tag['category'] ?? 'TAG',
                                    'icon'        => $main['icon'] ?? '',
                                    'synonyms'    => $tag['synonyms'] ?? [],
                                    'description' => ($tag['label'] ?? $tagParam) . ' Laukaassa – löydä paikat, yritykset ja tapahtumat LaukaaInfo-tietopankista.',
                                    'parent'      => $main['label'] ?? '',
                                    'parent_group' => $group['label'] ?? '',
                                    'type'        => 'tag',
                                ];
                            }
                        }
                    }
                }
            }
        }
    }

    // Tarkistaa kohderyhmät, sesongit ja ominaisuudet
    foreach (['target_groups', 'seasons', 'features'] as $section) {
        if (!empty($taxonomy[$section])) {
            foreach ($taxonomy[$section] as $item) {
                $itemId    = mb_strtolower($item['id']    ?? '');
                $itemLabel = mb_strtolower($item['label'] ?? '');
                $synonyms  = array_map('mb_strtolower', $item['synonyms'] ?? []);
                if ($itemId === $tagLower || $itemLabel === $tagLower || in_array($tagLower, $synonyms)) {
                    return [
                        'label'       => $item['label'] ?? $tagParam,
                        'category'    => $item['category'] ?? $section,
                        'icon'        => $item['icon'] ?? '',
                        'synonyms'    => $item['synonyms'] ?? [],
                        'description' => ($item['label'] ?? $tagParam) . ' Laukaassa – löydä soveltuvat paikat ja palvelut.',
                        'type'        => $section,
                    ];
                }
            }
        }
    }

    return null;
}

// ── 1. Hae parametrit URL:sta ─────────────────────────────────────────────────
$tagParam = isset($_GET['tag']) ? trim(strip_tags(urldecode($_GET['tag']))) : '';

if (empty($tagParam)) {
    header('Location: https://laukaainfo.fi/karttakohteet.html');
    exit;
}

// ── 2. Lue theme_taxonomy.json ────────────────────────────────────────────────
$taxonomyFile = __DIR__ . '/../theme_taxonomy.json';
// Fallback: taxonomy samassa kansiossa
if (!file_exists($taxonomyFile)) {
    $taxonomyFile = __DIR__ . '/theme_taxonomy.json';
}

$taxonomy     = [];
$themeInfo    = null;

if (file_exists($taxonomyFile)) {
    $raw = file_get_contents($taxonomyFile);
    if ($raw) {
        $taxonomy = json_decode($raw, true) ?? [];
        $themeInfo = find_theme_in_taxonomy($taxonomy, $tagParam);
    }
}

// ── 3. Hae paikat Supabasesta tämän teeman perusteella (entity_tags) ──────────
$themePlaces = [];
if (!empty($tagParam)) {
    // Hae paikat joilla on tämä tagi
    $tagRows = supabase_get2('entity_tags',
        [
            'tag'         => 'eq.' . mb_strtolower($tagParam),
            'entity_type' => 'eq.PLACE',
            'limit'       => '20',
            'order'       => 'created_at.desc'
        ],
        'entity_id,tag'
    );
    
    if ($tagRows && count($tagRows) > 0) {
        $placeIds = array_column($tagRows, 'entity_id');
        // Hae paikkojen nimet
        if (!empty($placeIds)) {
            $placeRows = supabase_get2('places',
                [
                    'place_id' => 'in.(' . implode(',', array_map('urlencode', $placeIds)) . ')',
                    'status'   => 'eq.ACTIVE',
                    'limit'    => '20'
                ],
                'place_id,name,canonical_name,type,municipality'
            );
            if ($placeRows) $themePlaces = $placeRows;
        }
    }
}

// ── 4. Rakenna metatiedot ─────────────────────────────────────────────────────
$siteName   = 'LaukaaInfo';
$pageUrl    = 'https://www.mediazoo.fi/laukaainfo-web/teema.php?tag=' . urlencode($tagParam);
$jsPageUrl  = 'https://laukaainfo.fi/teema.html?tag=' . urlencode($tagParam);
$ogImage    = 'https://laukaainfo.fi/hero-kuva.webp';

$themeLabel = $themeInfo ? $themeInfo['label'] : ucfirst($tagParam);
$title      = $themeLabel . ' Laukaassa – ' . $siteName;
$rawDesc    = $themeInfo ? $themeInfo['description'] : ($themeLabel . ' – löydä paikat, palvelut ja tapahtumat Laukaan kunnassa LaukaaInfo-tietopankista.');
$metaDesc   = truncate2($rawDesc, 160);

$placeTypeLabel = '';
if ($themeInfo && !empty($themeInfo['category'])) {
    $catMap = [
        'THEME' => 'Teema', 'SECTOR' => 'Toimiala', 'SERVICE' => 'Palvelu',
        'ACTIVITY' => 'Aktiviteetti', 'PLACE_TYPE' => 'Paikkatyyppi',
        'EVENT_TYPE' => 'Tapahtumatyyppi', 'TARGET_GROUP' => 'Kohderyhmä',
        'SEASON' => 'Sesonki', 'FEATURE' => 'Ominaisuus', 'GROUP' => 'Teemaryhmä'
    ];
    $placeTypeLabel = $catMap[$themeInfo['category']] ?? $themeInfo['category'];
}

function get_place_type_label2(string $type): string {
    $labels = [
        'BEACH' => 'Uimaranta', 'PARK' => 'Puisto', 'NATURE_AREA' => 'Luontoalue',
        'SPORT' => 'Liikuntapaikka', 'HISTORICAL' => 'Historiallinen kohde',
        'VILLAGE' => 'Kylä', 'DISTRICT' => 'Alue', 'TRAIL' => 'Reitti',
        'HARBOR' => 'Satama', 'OUTDOOR_AREA' => 'Ulkoilualue',
        'ATTRACTION' => 'Nähtävyys', 'CAMPING' => 'Leirintäalue',
        'EVENT_VENUE' => 'Tapahtumapaikka', 'RECREATION' => 'Virkistysalue',
        'CULTURE' => 'Kulttuuri', 'FISHING' => 'Kalastuspaikka',
    ];
    return $labels[$type] ?? 'Paikka';
}
?>
<!DOCTYPE html>
<html lang="fi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($title); ?></title>

    <!-- SEO metatiedot -->
    <meta name="description" content="<?php echo htmlspecialchars($metaDesc); ?>">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="<?php echo htmlspecialchars($pageUrl); ?>">

    <!-- Open Graph -->
    <meta property="og:title"       content="<?php echo htmlspecialchars($title); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($metaDesc); ?>">
    <meta property="og:image"       content="<?php echo $ogImage; ?>">
    <meta property="og:url"         content="<?php echo htmlspecialchars($pageUrl); ?>">
    <meta property="og:type"        content="website">
    <meta property="og:site_name"   content="LaukaaInfo">
    <meta property="og:locale"      content="fi_FI">

    <!-- Twitter Card -->
    <meta name="twitter:card"        content="summary_large_image">
    <meta name="twitter:title"       content="<?php echo htmlspecialchars($title); ?>">
    <meta name="twitter:description" content="<?php echo htmlspecialchars($metaDesc); ?>">
    <meta name="twitter:image"       content="<?php echo $ogImage; ?>">

    <!-- JSON-LD -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "<?php echo addslashes($themeLabel); ?> Laukaassa",
        "description": "<?php echo addslashes($rawDesc); ?>",
        "url": "<?php echo $pageUrl; ?>",
        "about": {
            "@type": "Thing",
            "name": "<?php echo addslashes($themeLabel); ?>"
        },
        "provider": {
            "@type": "Organization",
            "name": "LaukaaInfo",
            "url": "https://laukaainfo.fi"
        }
    }
    </script>

    <link rel="icon" href="https://laukaainfo.fi/logo.png">

    <!-- Fontit -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">

    <!-- LaukaaInfo tyylit -->
    <link rel="stylesheet" href="https://laukaainfo.fi/style.css">

    <style>
        :root {
            --bg-color: #f8fafc;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --accent: #10b981;
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
        .hero-section {
            width: 100%; min-height: 300px; padding-top: 7rem;
            background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #10b981 100%);
            position: relative; display: flex; align-items: flex-end; padding-bottom: 3rem;
        }
        .hero-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(to top, rgba(248,250,252,1) 0%, rgba(248,250,252,0.5) 60%, transparent 100%);
        }
        .hero-content {
            position: relative; z-index: 10; max-width: 1200px;
            margin: 0 auto; width: 100%; padding: 0 2rem;
            display: flex; flex-direction: column; gap: 1rem;
        }
        .badge {
            display: inline-block; background: rgba(255,255,255,0.9);
            padding: 0.4rem 1rem; border-radius: 50px;
            font-size: 0.85rem; font-weight: 700;
            color: #065f46; text-transform: uppercase;
            letter-spacing: 1px; width: fit-content;
        }
        .hero-title {
            font-family: 'Outfit', sans-serif;
            font-size: clamp(2.2rem, 5vw, 4rem);
            font-weight: 800; line-height: 1.1;
            margin: 0; letter-spacing: -1px;
            color: var(--text-main);
        }
        .action-buttons { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
        .btn {
            display: inline-flex; align-items: center; gap: 0.5rem;
            padding: 0.8rem 1.5rem; border-radius: 50px;
            font-weight: 600; font-size: 0.95rem; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            border: none; text-decoration: none;
        }
        .btn-primary { background: var(--text-main); color: #fff; }
        .btn-primary:hover { background: #000; transform: translateY(-2px); }
        .btn-light { background: rgba(0,0,0,0.05); color: var(--text-main); border: 1px solid rgba(0,0,0,0.1); }
        .btn-light:hover { background: rgba(0,0,0,0.08); transform: translateY(-2px); }

        .page-container {
            max-width: 1200px; margin: 3rem auto; padding: 0 2rem;
            display: grid; grid-template-columns: 1.5fr 1fr; gap: 4rem;
        }
        @media (max-width: 992px) {
            .page-container { grid-template-columns: 1fr; gap: 2rem; }
        }
        @media (max-width: 768px) {
            .hero-section { padding-top: 4rem; padding-bottom: 2rem; }
            .page-container { padding: 0 1.5rem; }
            .hero-title {
                font-size: 2.5rem;
                word-break: normal;
                overflow-wrap: normal;
                hyphens: none;
            }
        }

        .content-block { margin-bottom: 3.5rem; }
        .content-block h2 {
            font-family: 'Outfit', sans-serif; font-size: 1.75rem; font-weight: 700;
            margin-bottom: 1.5rem; color: var(--text-main);
        }

        .seo-card {
            background: white; border-radius: var(--radius-md);
            padding: 2rem; box-shadow: var(--shadow-sm); border: 1px solid #f1f5f9;
        }
        .seo-card p { font-size: 1.1rem; line-height: 1.75; color: var(--text-main); margin: 0; }

        /* Paikkakortit */
        .place-card {
            display: flex; align-items: center; gap: 1rem;
            padding: 1rem 1.25rem;
            background: white; border: 1px solid #f1f5f9;
            border-radius: var(--radius-sm); text-decoration: none;
            color: var(--text-main); transition: all 0.25s ease;
            box-shadow: var(--shadow-sm); margin-bottom: 0.75rem;
        }
        .place-card:hover { box-shadow: var(--shadow-md); transform: translateX(4px); border-color: var(--accent); }
        .place-icon { font-size: 1.5rem; flex-shrink: 0; }
        .place-name { font-weight: 700; font-size: 1rem; }
        .place-type { font-size: 0.82rem; color: var(--text-muted); }

        /* Synonyymit / aiheeseen liittyvät */
        .synonym-pill {
            display: inline-block;
            background: #f1f5f9; color: #334155;
            padding: 0.3rem 0.8rem; border-radius: 50px;
            font-size: 0.85rem; font-weight: 600;
            margin: 0.25rem; text-decoration: none;
            transition: background 0.2s;
        }
        .synonym-pill:hover { background: #e2e8f0; }

        /* Ryhmässä olevat tagit */
        .group-tag-link {
            display: inline-flex; align-items: center; gap: 0.4rem;
            background: #f0fdf4; color: #15803d;
            border: 1px solid #bbf7d0;
            padding: 0.35rem 0.9rem; border-radius: 50px;
            font-size: 0.85rem; font-weight: 600;
            margin: 0.25rem; text-decoration: none;
            transition: background 0.2s;
        }
        .group-tag-link:hover { background: #dcfce7; }

        /* Sidebar */
        .sidebar { display: flex; flex-direction: column; gap: 2.5rem; }
        .info-card {
            background: white; border-radius: var(--radius-md);
            padding: 1.75rem; box-shadow: var(--shadow-sm); border: 1px solid #f1f5f9;
        }
        .info-card h3 {
            font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 700;
            margin: 0 0 1rem; color: var(--text-main);
        }

        #js-loading-notice {
            background: #fffbeb; border: 1px solid #fde68a;
            border-radius: 12px; padding: 0.75rem 1.25rem;
            font-size: 0.9rem; color: #92400e; margin-bottom: 1.5rem;
        }
    </style>
</head>

<body>
    <nav></nav>

    <!-- 1. HERO – SSR (Google indeksoi) -->
    <section class="hero-section">
        <div class="hero-overlay"></div>
        <div class="hero-content">
            <span class="badge" id="theme-badge"><?php echo htmlspecialchars($placeTypeLabel ?: 'Teema'); ?></span>
            <h1 class="hero-title" id="theme-name"><?php echo htmlspecialchars($themeLabel); ?></h1>
            <div class="action-buttons">
                <a href="https://laukaainfo.fi/" class="btn btn-primary">🏠 Etusivu</a>
                <a href="https://laukaainfo.fi/karttakohteet.html" class="btn btn-light" id="btn-map">🗺️ Näytä kartalla</a>
                <a href="<?php echo htmlspecialchars($jsPageUrl); ?>" class="btn btn-light">⚡ Interaktiivinen</a>
            </div>
        </div>
    </section>

    <!-- 2. PÄÄSISÄLTÖ (Google indeksoi) -->
    <div class="page-container">
        <main class="left-col">

            <div id="js-loading-notice">
                ⏳ Ladataan interaktiivista sisältöä...
                <a href="<?php echo htmlspecialchars($jsPageUrl); ?>" style="color:#d97706;font-weight:700;margin-left:0.5rem;">
                    Avaa laukaainfo.fi-versio →
                </a>
            </div>

            <!-- Kuvaus (SSR) -->
            <section class="content-block">
                <h2>🏷️ <?php echo htmlspecialchars($themeLabel); ?> Laukaassa</h2>
                <div class="seo-card">
                    <p><?php echo htmlspecialchars($rawDesc); ?></p>
                    <?php if ($themeInfo && !empty($themeInfo['synonyms'])): ?>
                    <div style="margin-top: 1.25rem;">
                        <strong style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Aiheeseen liittyen:</strong><br>
                        <div style="margin-top: 0.5rem;">
                            <?php foreach ($themeInfo['synonyms'] as $syn): ?>
                            <a href="<?php echo 'https://laukaainfo.fi/teema.html?tag=' . urlencode(mb_strtolower($syn)); ?>"
                               class="synonym-pill"><?php echo htmlspecialchars($syn); ?></a>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>
            </section>

            <?php if ($themeInfo && !empty($themeInfo['groups'])): ?>
            <!-- Aliryhmät (jos pääteema) -->
            <section class="content-block">
                <h2>📂 Aiheeseen kuuluvat teemat</h2>
                <div>
                    <?php foreach ($themeInfo['groups'] as $g): ?>
                    <?php if (!empty($g['tags'])): ?>
                    <div style="margin-bottom: 1.5rem;">
                        <strong style="font-size:0.9rem; color:var(--text-muted);"><?php echo htmlspecialchars($g['label'] ?? ''); ?></strong>
                        <div style="margin-top:0.5rem;">
                            <?php foreach ($g['tags'] as $t): ?>
                            <a href="https://laukaainfo.fi/teema.html?tag=<?php echo urlencode(mb_strtolower($t['id'] ?? '')); ?>"
                               class="group-tag-link"><?php echo htmlspecialchars($t['label'] ?? ''); ?></a>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endif; ?>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endif; ?>

            <?php if ($themeInfo && !empty($themeInfo['tags'])): ?>
            <!-- Aliryhmän tagit -->
            <section class="content-block">
                <h2>🔍 Tähän aiheeseen liittyy</h2>
                <div>
                    <?php foreach ($themeInfo['tags'] as $t): ?>
                    <a href="https://laukaainfo.fi/teema.html?tag=<?php echo urlencode(mb_strtolower($t['id'] ?? '')); ?>"
                       class="group-tag-link"><?php echo htmlspecialchars($t['label'] ?? ''); ?></a>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endif; ?>

            <?php if (!empty($themePlaces)): ?>
            <!-- Paikat Supabasesta -->
            <section class="content-block" id="places-section">
                <h2>📍 Paikat</h2>
                <?php foreach ($themePlaces as $p): ?>
                <a href="https://www.mediazoo.fi/laukaainfo-web/place.php?id=<?php echo urlencode($p['place_id']); ?>"
                   class="place-card">
                    <div class="place-icon">📍</div>
                    <div>
                        <div class="place-name"><?php echo htmlspecialchars($p['name'] ?? $p['canonical_name'] ?? ''); ?></div>
                        <div class="place-type"><?php echo htmlspecialchars(get_place_type_label2($p['type'] ?? '')); ?> · <?php echo htmlspecialchars($p['municipality'] ?? 'Laukaa'); ?></div>
                    </div>
                    <span style="margin-left:auto;color:var(--text-muted);">→</span>
                </a>
                <?php endforeach; ?>
            </section>
            <?php endif; ?>

            <!-- JS täyttää nämä -->
            <section class="content-block" id="events-section"     style="display:none;"></section>
            <section class="content-block" id="companies-section"  style="display:none;"></section>
            <section class="content-block" id="encounters-section" style="display:none;"></section>
        </main>

        <aside class="sidebar">
            <div class="info-card">
                <h3>ℹ️ Teema</h3>
                <div style="font-size:0.9rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f8fafc;">
                        <span style="color:var(--text-muted);">Teema</span>
                        <strong><?php echo htmlspecialchars($themeLabel); ?></strong>
                    </div>
                    <?php if ($placeTypeLabel): ?>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f8fafc;">
                        <span style="color:var(--text-muted);">Kategoria</span>
                        <strong><?php echo htmlspecialchars($placeTypeLabel); ?></strong>
                    </div>
                    <?php endif; ?>
                    <?php if ($themeInfo && !empty($themeInfo['parent'])): ?>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;">
                        <span style="color:var(--text-muted);">Pääteema</span>
                        <a href="https://laukaainfo.fi/teema.html?tag=<?php echo urlencode(mb_strtolower($themeInfo['parent'])); ?>"
                           style="color:var(--accent);font-weight:600;text-decoration:none;">
                            <?php echo htmlspecialchars($themeInfo['parent']); ?>
                        </a>
                    </div>
                    <?php endif; ?>
                </div>
            </div>

            <?php if (!empty($themePlaces)): ?>
            <div class="info-card">
                <h3>📊 Tilastot</h3>
                <div style="font-size:0.9rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;">
                        <span style="color:var(--text-muted);">Paikkoja</span>
                        <strong><?php echo count($themePlaces); ?></strong>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <!-- Linkki laukaainfo.fi:n teema-sivulle -->
            <div class="info-card" style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-color: #bbf7d0;">
                <h3 style="color: #065f46;">🔗 Interaktiivinen versio</h3>
                <p style="font-size:0.9rem;color:#065f46;margin:0 0 1rem;">
                    Laukaainfo.fi:ssä näet myös yritykset, tapahtumat ja kohtaamiset reaaliajassa.
                </p>
                <a href="<?php echo htmlspecialchars($jsPageUrl); ?>" class="btn btn-primary" style="width:100%;justify-content:center;">
                    Avaa laukaainfo.fi →
                </a>
            </div>
        </aside>
    </div>

    <footer></footer>

    <!-- Globaalit skriptit -->
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://code.iconify.design/3/3.1.0/iconify.min.js"></script>
    <script src="https://laukaainfo.fi/translations.js"></script>
    <script src="https://laukaainfo.fi/supabase-config.js"></script>
    <script src="https://laukaainfo.fi/nav-sync.js"></script>

    <script>
        window.__PHP_THEME_TAG = <?php echo json_encode($tagParam); ?>;
        // Piilotetaan JS-latausilmoitus
        document.addEventListener('DOMContentLoaded', function() {
            var n = document.getElementById('js-loading-notice');
            if (n) n.style.display = 'none';
        });
    </script>

    <!-- Teema JS hydratoi yritykset, tapahtumat, kohtaamiset -->
    <script src="https://laukaainfo.fi/teema.js?v=2"></script>

</body>
</html>
