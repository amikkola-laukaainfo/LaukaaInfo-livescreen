<?php
header('Content-Type: text/html; charset=utf-8');

$id   = isset($_GET['id'])   ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id'])   : '';
$type = isset($_GET['type']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['type']) : 'somekuva';

if (empty($id)) die('Virhe: ID puuttuu.');

// PHP-version of JS slugify (handles Finnish ä/ö/å)
function phpSlugify($text) {
    $text = mb_strtolower(trim($text), 'UTF-8');
    $map = ['ä'=>'a','ö'=>'o','å'=>'a','Ä'=>'a','Ö'=>'o','Å'=>'a','à'=>'a','á'=>'a','â'=>'a','ã'=>'a','è'=>'e','é'=>'e','ê'=>'e','ë'=>'e','ì'=>'i','í'=>'i','î'=>'i','ï'=>'i','ò'=>'o','ó'=>'o','ô'=>'o','õ'=>'o','ø'=>'o','ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u'];
    $text = strtr($text, $map);
    $text = preg_replace('/[^a-z0-9\s-]/', '', $text);
    $text = preg_replace('/[\s-]+/', '-', $text);
    return trim($text, '-');
}

// Fetch from local file or remote URL
function fetchJson($file, $url) {
    if (file_exists($file)) return file_get_contents($file);
    return @file_get_contents($url);
}

$company_data = null;
$found_company_id = null;

// Step 1: Find company in slim JSON (for ID resolution)
$json = fetchJson('../companies_data.json', 'https://laukaainfo.fi/companies_data.json');
if ($json) {
    // Strip BOM if present
    if (substr($json, 0, 3) === "\xEF\xBB\xBF") $json = substr($json, 3);
    $data  = json_decode($json, true);
    $items = isset($data['results']) ? $data['results'] : (array)$data;
    foreach ($items as $item) {
        $slug = phpSlugify($item['nimi'] ?? '');
        $matchId = isset($item['id']) && ($item['id'] === $id || $item['id'] === 'company-' . $id);
        if ($slug === phpSlugify($id) || $matchId) {
            $company_data = $item;
            $found_company_id = $item['id'] ?? null;
            break;
        }
    }
}

// Step 2: Fetch full company data from API (has phone, website etc.)
if ($found_company_id) {
    $api_url = 'https://www.mediazoo.fi/laukaainfo-web/get_companies.php?id=' . urlencode($found_company_id);
    $api_json = @file_get_contents($api_url);
    if ($api_json) {
        $api_data = json_decode($api_json, true);
        // API may return array or {results:[...]} or single object
        if (is_array($api_data)) {
            $first = isset($api_data['results']) ? ($api_data['results'][0] ?? null)
                   : (isset($api_data[0]) ? $api_data[0] : $api_data);
            if ($first && isset($first['nimi'])) {
                // Merge API data over slim data (API has more fields)
                $company_data = array_merge($company_data, $first);
            }
        }
    }
}

// Step 3: Fallback – check kohdekortti data
if (!$company_data) {
    $json = fetchJson('../kohdekortit/kohteet.json', 'https://laukaainfo.fi/kohdekortit/kohteet.json');
    if ($json) {
        foreach ((array)json_decode($json, true) as $item) {
            if (($item['id'] ?? '') === $id || phpSlugify($item['name'] ?? '') === phpSlugify($id)) {
                $company_data = $item;
                $company_data['nimi']      = $item['name'] ?? '';
                $company_data['logo']      = $item['images'][0] ?? '';
                $company_data['kategoria'] = $item['type'] ?? '';
                $company_data['puhelin']   = $item['contact']['phone'] ?? '';
                $company_data['nettisivu'] = $item['contact']['website'] ?? '';
                break;
            }
        }
    }
}

if (!$company_data) die("Yritystä/kohdetta '" . htmlspecialchars($id) . "' ei löytynyt.");

// Extract fields
$nimi      = $company_data['nimi']      ?? 'Yrityksen nimi';
$kategoria = $company_data['kategoria'] ?? '';
$puhelin   = $company_data['puhelin']   ?? '';
if ($puhelin === '-') $puhelin = '';

$nettisivu = $company_data['nettisivu'] ?? $company_data['website'] ?? '';
if ($nettisivu === '-') $nettisivu = '';
if ($nettisivu && !preg_match('/^https?:\/\//', $nettisivu)) $nettisivu = 'https://' . $nettisivu;

$logo = $company_data['logo'] ?? '';
if ($logo === '-') $logo = '';
// Normalise logo URL
if ($logo && !preg_match('/^http/', $logo)) {
    $local = '../' . ltrim($logo, '/');
    $logo  = file_exists($local) ? $local : 'https://laukaainfo.fi/' . ltrim($logo, '/');
}
// If media array has images, use first as fallback for logo
if (!$logo && !empty($company_data['media'])) {
    foreach ($company_data['media'] as $m) {
        if (($m['type'] ?? '') === 'image' && !empty($m['url'])) {
            $logo = $m['url'];
            break;
        }
    }
}
if (!$logo && !empty($company_data['images'][0])) {
    $logo = $company_data['images'][0];
}

// Function to convert image to base64 data URI (solves html2canvas CORS issues)
function imageToBase64($url) {
    if (!$url) return '';
    $context = stream_context_create(['http' => ['ignore_errors' => true]]);
    $data = @file_get_contents($url, false, $context);
    if ($data) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $type = $finfo->buffer($data) ?: 'image/png';
        return 'data:' . $type . ';base64,' . base64_encode($data);
    }
    return htmlspecialchars($url); // Fallback to raw URL
}

$nimi_safe      = htmlspecialchars($nimi);
$kategoria_safe = htmlspecialchars($kategoria);
$puhelin_safe   = htmlspecialchars($puhelin);
$nettisivu_safe = htmlspecialchars($nettisivu);
$logo_safe      = imageToBase64($logo);
$web_display    = htmlspecialchars(preg_replace('#^https?://#', '', rtrim($nettisivu, '/')));

// Use yrityskortti URL (slug-based) for QR, as that's what works on live site
$card_url = 'https://laukaainfo.fi/yrityskortti.html?id=' . urlencode($id);
$qr_src   = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($card_url);
$qr_safe  = imageToBase64($qr_src);
$li_logo_safe = './logo.png';

$tyypit = [
    'somekuva'      => '📸 Somekuva (1080×1080)',
    'flyer'         => '📄 A6 Flyer',
    'offer'         => '🏷 Tarjouskortti',
    'qr'            => '📌 QR-juliste',
    'business_card' => '🪪 Käyntikortti',
];
$title = $tyypit[$type] ?? 'Mainoskortti';
?>
<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= $title ?> – <?= $nimi ?></title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@700;900&display=swap" rel="stylesheet">
<style>
:root{--blue:#0056b3;--navy:#003366;--accent:#ff9900;--green:#10b981;--bg:#f1f5f9;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;background:var(--bg);padding:2rem;color:#1e293b;display:flex;flex-direction:column;align-items:center;}
h1{font-family:'Outfit',sans-serif;color:var(--navy);margin-bottom:2rem;font-size:1.8rem;text-align:center;}
.layout{display:flex;gap:2rem;max-width:1100px;width:100%;flex-wrap:wrap;}

/* SIDEBAR */
.sidebar{flex:0 0 260px;background:#fff;border-radius:16px;padding:1.5rem;box-shadow:0 4px 20px rgba(0,0,0,.07);}
.sidebar h3{font-family:'Outfit',sans-serif;color:var(--navy);margin-bottom:1rem;font-size:1rem;}
.tool-link{display:block;padding:.75rem 1rem;margin-bottom:.6rem;border-radius:10px;font-weight:600;font-size:.9rem;text-decoration:none;color:#334155;background:#f8fafc;border:2px solid transparent;transition:all .2s;}
.tool-link:hover{background:#e0f2fe;}
.tool-link.active{background:#dbeafe;border-color:var(--blue);color:var(--blue);}
hr{border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0;}
.btn{display:block;width:100%;padding:.9rem;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;transition:all .2s;margin-bottom:.75rem;}
.btn-primary{background:var(--blue);color:#fff;}
.btn-primary:hover{background:var(--navy);}
.btn-outline{background:#fff;color:var(--blue);border:2px solid var(--blue);}
.btn-outline:hover{background:#dbeafe;}
.info-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:.75rem;font-size:.82rem;color:#166534;margin-top:.5rem;}

/* PREVIEW */
.preview-area{flex:1;min-width:320px;display:flex;flex-direction:column;align-items:center;gap:1rem;}
.canvas-wrap{background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.12);position:relative;overflow:hidden;}

/* ===== CARD TYPES ===== */

/* Somekuva 1:1 */
.card-somekuva{width:500px;height:500px;background:linear-gradient(145deg,var(--navy),var(--blue));color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2.5rem;text-align:center;gap:.75rem;}
.card-somekuva .logo{width:110px;height:110px;object-fit:contain;background:#fff;border-radius:16px;padding:10px;box-shadow:0 6px 20px rgba(0,0,0,.15);}
.card-somekuva .cat{background:var(--accent);color:#fff;padding:4px 16px;border-radius:50px;font-size:.8rem;font-weight:800;text-transform:uppercase;}
.card-somekuva .name{font-family:'Outfit',sans-serif;font-size:2.2rem;font-weight:900;line-height:1.1;}
.card-somekuva .phone{font-size:1.1rem;font-weight:700;opacity:.9;}
.card-somekuva .web{font-size:.9rem;opacity:.75;}
.card-somekuva .footer-bar{margin-top:auto;font-size:.85rem;font-weight:700;opacity:.7;border-top:1px solid rgba(255,255,255,.2);padding-top:.75rem;width:100%;text-align:center;}

/* Flyer */
.card-flyer{width:380px;height:540px;background:#fff;border:1px solid #e2e8f0;padding:2rem;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.6rem;}
.card-flyer .top-bar{width:100%;height:8px;background:linear-gradient(90deg,var(--navy),var(--blue));border-radius:4px;margin-bottom:.5rem;}
.card-flyer .logo{width:90px;height:90px;object-fit:contain;border:1px solid #edf2f7;border-radius:12px;padding:8px;}
.card-flyer .cat{background:#e0f2fe;color:var(--blue);padding:3px 14px;border-radius:50px;font-size:.75rem;font-weight:800;text-transform:uppercase;}
.card-flyer .name{font-family:'Outfit',sans-serif;font-size:1.8rem;font-weight:900;color:var(--navy);line-height:1.1;}
.card-flyer .desc{font-size:.9rem;color:#64748b;line-height:1.5;}
.card-flyer .contact{margin-top:auto;width:100%;background:#f8fafc;border-radius:10px;padding:.75rem;font-size:.9rem;}
.card-flyer .phone{font-weight:700;color:#1e293b;}
.card-flyer .web-link{color:var(--blue);font-weight:600;text-decoration:none;word-break:break-all;}
.card-flyer .qr-row{display:flex;align-items:center;gap:1rem;margin-top:.5rem;}
.card-flyer .qr-row img{width:80px;height:80px;}
.card-flyer .laukaainfo{font-size:.8rem;color:var(--blue);font-weight:700;text-align:left;}

/* Tarjouskortti */
.card-offer{width:440px;height:260px;background:linear-gradient(135deg,#fff9e6,#fffbf0);border:3px solid var(--accent);border-radius:16px;display:flex;padding:1.5rem;gap:1.5rem;align-items:center;}
.card-offer .left{flex:1;display:flex;flex-direction:column;gap:.5rem;}
.card-offer .badge{background:var(--accent);color:#fff;padding:4px 12px;border-radius:50px;font-size:.75rem;font-weight:800;text-transform:uppercase;display:inline-block;width:fit-content;}
.card-offer .name{font-family:'Outfit',sans-serif;font-size:1.6rem;font-weight:900;color:var(--navy);}
.card-offer .offer-text{background:var(--accent);color:#fff;font-size:1.4rem;font-weight:900;padding:.5rem 1rem;border-radius:10px;text-align:center;}
.card-offer .phone{font-size:.9rem;font-weight:700;color:#334155;}
.card-offer .web-link{font-size:.8rem;color:var(--blue);font-weight:600;text-decoration:none;}
.card-offer .right{display:flex;flex-direction:column;align-items:center;gap:.5rem;}
.card-offer .right img.logo{width:80px;height:80px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px;padding:6px;}
.card-offer .right img.qr{width:90px;height:90px;}
.card-offer .li-tag{font-size:.7rem;color:var(--blue);font-weight:700;}

/* QR juliste */
.card-qr{width:400px;height:566px;background:#fff;border:1px solid #e2e8f0;padding:2rem;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.75rem;}
.card-qr .top-accent{width:100%;height:12px;background:linear-gradient(90deg,var(--green),var(--blue));border-radius:6px;}
.card-qr .logo{width:80px;height:80px;object-fit:contain;border:1px solid #edf2f7;border-radius:12px;padding:8px;}
.card-qr .name{font-family:'Outfit',sans-serif;font-size:1.7rem;font-weight:900;color:var(--navy);}
.card-qr .cat{background:#dcfce7;color:var(--green);padding:3px 14px;border-radius:50px;font-size:.75rem;font-weight:800;text-transform:uppercase;}
.card-qr .qr-big{width:180px;height:180px;margin:auto;}
.card-qr .scan-text{font-size:.85rem;color:#64748b;}
.card-qr .phone{font-weight:700;font-size:1rem;color:#1e293b;}
.card-qr .web-link{color:var(--blue);font-weight:600;font-size:.9rem;text-decoration:none;}
.card-qr .li-footer{margin-top:auto;font-size:.8rem;color:var(--blue);font-weight:700;border-top:1px dashed #cbd5e1;padding-top:.75rem;width:100%;}

/* Käyntikortti */
.card-biz{width:500px;height:280px;background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff;border-radius:16px;display:flex;padding:2rem;gap:2rem;align-items:center;}
.card-biz .left{flex:1;display:flex;flex-direction:column;gap:.5rem;}
.card-biz .logo{width:80px;height:80px;object-fit:contain;background:#fff;border-radius:12px;padding:8px;}
.card-biz .cat{font-size:.75rem;font-weight:700;text-transform:uppercase;opacity:.7;letter-spacing:.5px;}
.card-biz .name{font-family:'Outfit',sans-serif;font-size:1.8rem;font-weight:900;line-height:1.1;}
.card-biz .phone{font-size:1rem;font-weight:700;margin-top:auto;}
.card-biz .web-link{font-size:.85rem;opacity:.85;color:#fff;text-decoration:none;}
.card-biz .li-link{font-size:.75rem;opacity:.65;color:#fff;text-decoration:none;}
.card-biz .right{display:flex;flex-direction:column;align-items:center;gap:.5rem;}
.card-biz .right img.qr{width:120px;height:120px;background:#fff;padding:6px;border-radius:10px;}
.card-biz .scan{font-size:.7rem;opacity:.7;text-align:center;}

/* PRINT */
@media print {
  body{padding:0;background:#fff;}
  .layout .sidebar{display:none!important;}
  .layout{display:block;}
  .preview-area{display:block;}
  .print-hint{display:none!important;}
  .canvas-wrap{box-shadow:none!important;page-break-inside:avoid;}
  a{color:inherit;}
}
</style>
</head>
<body>

<h1>🎨 LaukaaInfo Markkinointityökalut</h1>

<div class="layout">
  <!-- SIDEBAR -->
  <div class="sidebar">
    <h3>Valitse pohja:</h3>
    <?php foreach($tyypit as $t => $label): ?>
      <a href="?id=<?= urlencode($id) ?>&type=<?= $t ?>" class="tool-link <?= $type===$t?'active':'' ?>">
        <?= htmlspecialchars($label) ?>
      </a>
    <?php endforeach; ?>

    <hr>

    <button class="btn btn-primary" id="btn-download" onclick="downloadCard()">⬇ Lataa PNG-kuva</button>
    <button class="btn btn-outline" onclick="window.print()">🖨 Tulosta / Tallenna PDF</button>

    <div class="info-box">
      💡 PDF:ssä kaikki linkit ovat klikattavia. Tulosta tai käytä "Tallenna PDF"-toimintoa selaimessa.
    </div>

    <hr>
    <div style="font-size:.8rem;color:#64748b;line-height:1.6;">
      <strong>Yritys:</strong> <?= $nimi_safe ?><br>
      <?php if($puhelin): ?><strong>Puhelin:</strong> <?= $puhelin_safe ?><br><?php endif; ?>
      <?php if($nettisivu): ?><strong>Nettisivu:</strong> <a href="<?= $nettisivu_safe ?>" style="color:var(--blue);"><?= $web_display ?></a><br><?php endif; ?>
    </div>
  </div>

  <!-- PREVIEW -->
  <div class="preview-area">
    <div class="canvas-wrap" id="export-canvas">

    <?php if($type === 'somekuva'): ?>
      <div class="card-somekuva">
        <?php if($logo): ?><img crossorigin="anonymous" src="<?= $logo_safe ?>" alt="Logo" class="logo"><?php endif; ?>
        <?php if($kategoria): ?><div class="cat"><?= $kategoria_safe ?></div><?php endif; ?>
        <div class="name"><?= $nimi_safe ?></div>
        <?php if($puhelin): ?><div class="phone">📞 <?= $puhelin_safe ?></div><?php endif; ?>
        <?php if($nettisivu): ?><a href="<?= $nettisivu_safe ?>" class="web" style="color:rgba(255,255,255,.8);text-decoration:none;">🌐 <?= $web_display ?></a><?php endif; ?>
        <div class="footer-bar">
          <div style="display:inline-flex; align-items:center; background:white; padding:2px; border-radius:4px; margin-right:6px;">
            <img crossorigin="anonymous" src="<?= $li_logo_safe ?>" alt="LaukaaInfo" style="height:1.1em;vertical-align:middle;">
          </div>
          Tutustu: <a href="https://laukaainfo.fi" style="color:rgba(255,255,255,.9);text-decoration:none;">laukaainfo.fi</a>
        </div>
      </div>

    <?php elseif($type === 'flyer'): ?>
      <div class="card-flyer">
        <div class="top-bar"></div>
        <?php if($logo): ?><img crossorigin="anonymous" src="<?= $logo_safe ?>" alt="Logo" class="logo"><?php endif; ?>
        <?php if($kategoria): ?><div class="cat"><?= $kategoria_safe ?></div><?php endif; ?>
        <div class="name"><?= $nimi_safe ?></div>
        <div class="desc">Tutustu meihin LaukaaInfo-matkailuportaalissa ja katso yhteystietomme!</div>
        <div class="contact">
          <?php if($puhelin): ?><div class="phone">📞 <?= $puhelin_safe ?></div><?php endif; ?>
          <?php if($nettisivu): ?><div style="margin-top:.3rem;"><a href="<?= $nettisivu_safe ?>" class="web-link">🌐 <?= $web_display ?></a></div><?php endif; ?>
        </div>
        <div class="qr-row">
          <a href="<?= htmlspecialchars($card_url) ?>"><img crossorigin="anonymous" src="<?= $qr_safe ?>" alt="QR"></a>
          <div class="laukaainfo">
            Skannaa QR tai käy:<br>
            <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
              <img crossorigin="anonymous" src="<?= $li_logo_safe ?>" alt="LaukaaInfo" style="height:16px;width:auto;flex-shrink:0;object-fit:contain;">
              <a href="<?= htmlspecialchars($card_url) ?>" style="color:var(--blue);font-weight:700;text-decoration:none;">laukaainfo.fi</a>
            </div>
          </div>
        </div>
      </div>

    <?php elseif($type === 'offer'): ?>
      <div class="card-offer">
        <div class="left">
          <div class="badge">Tutustu:</div>
          <div class="name"><?= $nimi_safe ?></div>
          <div class="offer-text">ERIKOISTARJOUS!</div>
          <?php if($puhelin): ?><div class="phone">📞 <?= $puhelin_safe ?></div><?php endif; ?>
          <?php if($nettisivu): ?><a href="<?= $nettisivu_safe ?>" class="web-link">🌐 <?= $web_display ?></a><?php endif; ?>
          <a href="https://laukaainfo.fi" style="font-size:.75rem;color:var(--blue);font-weight:700;text-decoration:none;display:flex;align-items:center;gap:4px;margin-top:auto;">
            <img crossorigin="anonymous" src="<?= $li_logo_safe ?>" alt="LaukaaInfo" style="height:16px;vertical-align:middle;">
            laukaainfo.fi
          </a>
        </div>
        <div class="right">
          <?php if($logo): ?><img crossorigin="anonymous" src="<?= $logo_safe ?>" alt="Logo" class="logo"><?php endif; ?>
          <a href="<?= htmlspecialchars($card_url) ?>"><img crossorigin="anonymous" src="<?= $qr_safe ?>" alt="QR" class="qr"></a>
          <div class="li-tag">Skannaa yrityskortti</div>
        </div>
      </div>

    <?php elseif($type === 'qr'): ?>
      <div class="card-qr">
        <div class="top-accent"></div>
        <?php if($logo): ?><img crossorigin="anonymous" src="<?= $logo_safe ?>" alt="Logo" class="logo"><?php endif; ?>
        <?php if($kategoria): ?><div class="cat"><?= $kategoria_safe ?></div><?php endif; ?>
        <div class="name"><?= $nimi_safe ?></div>
        <a href="<?= htmlspecialchars($card_url) ?>"><img crossorigin="anonymous" src="<?= $qr_safe ?>" alt="QR" class="qr-big"></a>
        <div class="scan-text">Skannaa QR-koodi ja tutustu yrityskorttiin</div>
        <?php if($puhelin): ?><div class="phone">📞 <?= $puhelin_safe ?></div><?php endif; ?>
        <?php if($nettisivu): ?><a href="<?= $nettisivu_safe ?>" class="web-link">🌐 <?= $web_display ?></a><?php endif; ?>
        <div class="li-footer">
          <img crossorigin="anonymous" src="<?= $li_logo_safe ?>" alt="LaukaaInfo" style="height:18px;vertical-align:middle;margin-right:5px;">
          Tutustu: <a href="https://laukaainfo.fi" style="color:var(--blue);text-decoration:none;font-weight:700;">laukaainfo.fi</a>
        </div>
      </div>

    <?php else: /* business_card */ ?>
      <div class="card-biz">
        <div class="left">
          <?php if($logo): ?><img crossorigin="anonymous" src="<?= $logo_safe ?>" alt="Logo" class="logo"><?php endif; ?>
          <?php if($kategoria): ?><div class="cat"><?= $kategoria_safe ?></div><?php endif; ?>
          <div class="name"><?= $nimi_safe ?></div>
          <div style="flex:1;"></div>
          <?php if($puhelin): ?><div class="phone">📞 <?= $puhelin_safe ?></div><?php endif; ?>
          <?php if($nettisivu): ?><a href="<?= $nettisivu_safe ?>" class="web-link">🌐 <?= $web_display ?></a><?php endif; ?>
          <a href="https://laukaainfo.fi" class="li-link" style="display:flex;align-items:center;gap:5px;">
            <div style="display:inline-flex; align-items:center; background:white; padding:2px; border-radius:4px;">
              <img crossorigin="anonymous" src="<?= $li_logo_safe ?>" alt="LaukaaInfo" style="height:16px;">
            </div>
            laukaainfo.fi
          </a>
        </div>
        <div class="right">
          <a href="<?= htmlspecialchars($card_url) ?>"><img crossorigin="anonymous" src="<?= htmlspecialchars($qr_src) ?>" alt="QR" class="qr"></a>
          <div class="scan">Skannaa yrityskortti</div>
        </div>
      </div>

    <?php endif; ?>

    </div><!-- /canvas-wrap -->

    <p class="print-hint" style="font-size:.8rem;color:#94a3b8;margin-top:.75rem;text-align:center;">
      💡 PNG-lataus vaatii html2canvas. Linkit ovat klikattavia PDF:ssä.
    </p>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
function downloadCard() {
  const el = document.getElementById('export-canvas');
  const btn = document.getElementById('btn-download');
  btn.textContent = '⏳ Luodaan kuvaa...';
  btn.disabled = true;

  html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'laukaainfo-mainos-<?= htmlspecialchars($id) ?>-<?= $type ?>.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.textContent = '⬇ Lataa PNG-kuva';
    btn.disabled = false;
  }).catch(err => {
    alert('Kuvan luonti epäonnistui. Voit ottaa kuvakaappauksen manuaalisesti.');
    btn.textContent = '⬇ Lataa PNG-kuva';
    btn.disabled = false;
    console.error(err);
  });
}
</script>
</body>
</html>
