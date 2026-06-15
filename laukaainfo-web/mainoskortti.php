<?php
header('Content-Type: text/html; charset=utf-8');

$id = isset($_GET['id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id']) : '';
$type = isset($_GET['type']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['type']) : 'somekuva';

if (empty($id)) {
    die("Virhe: Yrityksen tai kohteen ID puuttuu.");
}

// Haetaan data (ensisijaisesti paikallisesta tiedostosta, toissijaisesti tuotantopalvelimelta laukaainfo.fi)
$companies_file = '../companies_data.json';
$companies_url = 'https://laukaainfo.fi/companies_data.json';
$places_file = '../kohdekortit/kohteet.json';
$places_url = 'https://laukaainfo.fi/kohdekortit/kohteet.json';

$company_data = null;

if (file_exists($companies_file)) {
    $json = file_get_contents($companies_file);
} else {
    // Mediazoo.fi:ssa haetaan suoraan laukaainfo.fi:stä
    $json = @file_get_contents($companies_url);
}

if ($json) {
    $data = json_decode($json, true);
    $items = isset($data['results']) ? $data['results'] : $data;
    
    foreach ($items as $item) {
        $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $item['nimi'])));
        if ($slug === strtolower($id) || (isset($item['id']) && $item['id'] === $id)) {
            $company_data = $item;
            break;
        }
    }
}

if (!$company_data) {
    if (file_exists($places_file)) {
        $json = file_get_contents($places_file);
    } else {
        $json = @file_get_contents($places_url);
    }
    
    if ($json) {
        $data = json_decode($json, true);
        
        foreach ($data as $item) {
            if ($item['id'] === $id) {
                $company_data = $item;
                // Yhdenmukaistetaan kohdekortin data yrityskortin datan kanssa
                $company_data['nimi'] = $item['name'];
                $company_data['logo'] = isset($item['images']) && count($item['images']) > 0 ? $item['images'][0] : '';
                $company_data['kategoria'] = $item['type'];
                $company_data['puhelin'] = isset($item['contact']['phone']) ? $item['contact']['phone'] : '';
                $company_data['osoite'] = isset($item['location']['address']) ? $item['location']['address'] : '';
                break;
            }
        }
    }
}

if (!$company_data) {
    die("Virhe: Yritystä tai kohdetta tunnisteella '" . htmlspecialchars($id) . "' ei löytynyt.");
}

$nimi = isset($company_data['nimi']) ? $company_data['nimi'] : 'Yrityksen nimi';
$logo = isset($company_data['logo']) && $company_data['logo'] !== '-' ? $company_data['logo'] : '';
$puhelin = isset($company_data['puhelin']) ? $company_data['puhelin'] : '';
$kategoria = isset($company_data['kategoria']) ? $company_data['kategoria'] : '';

// Varmista logon polku (paikallinen dev vs tuotanto mediazoo.fi)
if ($logo && !preg_match('/^http/', $logo)) {
    if (file_exists('../' . ltrim($logo, '/'))) {
        $logo = '../' . ltrim($logo, '/');
    } else {
        $logo = 'https://laukaainfo.fi/' . ltrim($logo, '/');
    }
}

$qr_url = "https://laukaainfo.fi/yrityskortti.html?id=" . urlencode($id);

$tyypit = [
    'somekuva' => 'Somekuva (Instagram/Facebook)',
    'flyer' => 'A6 Flyer',
    'offer' => 'Tarjouskortti',
    'qr' => 'QR-mainosjuliste',
    'business_card' => 'Käyntikortti PDF'
];

$title = isset($tyypit[$type]) ? $tyypit[$type] : 'Mainoskortti';
?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title) ?> – <?= htmlspecialchars($nimi) ?></title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Outfit:wght@700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0056b3;
            --secondary: #003366;
            --accent: #ff9900;
            --bg: #f8fafc;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            margin: 0;
            padding: 2rem;
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        h1 {
            font-family: 'Outfit', sans-serif;
            color: var(--secondary);
            margin-bottom: 2rem;
        }
        .container {
            display: flex;
            gap: 2rem;
            max-width: 1200px;
            width: 100%;
            flex-wrap: wrap;
        }
        .sidebar {
            flex: 1;
            min-width: 300px;
            background: white;
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        .preview-area {
            flex: 2;
            min-width: 400px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }
        .tool-link {
            display: block;
            padding: 1rem;
            margin-bottom: 1rem;
            background: #f1f5f9;
            color: #333;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            transition: all 0.2s;
            border: 2px solid transparent;
        }
        .tool-link:hover {
            background: #e2e8f0;
        }
        .tool-link.active {
            background: #e0f2fe;
            border-color: var(--primary);
            color: var(--primary);
        }
        
        /* Canvas styles */
        .canvas-container {
            background: white;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            position: relative;
            overflow: hidden;
        }
        
        /* Somekuva 1080x1080 */
        .canvas-somekuva {
            width: 500px;
            height: 500px;
            border-radius: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--secondary), var(--primary));
            color: white;
            text-align: center;
            padding: 2rem;
            box-sizing: border-box;
        }
        
        /* Flyer A6 Portrait */
        .canvas-flyer {
            width: 400px;
            height: 566px;
            background: white;
            border: 1px solid #ccc;
            padding: 2rem;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        
        .c-logo {
            max-width: 150px;
            max-height: 150px;
            background: white;
            padding: 10px;
            border-radius: 12px;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .c-name {
            font-family: 'Outfit', sans-serif;
            font-size: 2.5rem;
            font-weight: 900;
            margin: 0 0 1rem 0;
            line-height: 1.1;
        }
        .canvas-flyer .c-name {
            color: var(--secondary);
        }
        .c-cat {
            background: var(--accent);
            color: white;
            padding: 5px 15px;
            border-radius: 50px;
            font-size: 0.9rem;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 1rem;
        }
        .c-phone {
            font-size: 1.2rem;
            font-weight: bold;
            margin-top: 1rem;
        }
        .canvas-flyer .c-phone {
            color: #333;
        }
        
        .btn-download {
            display: block;
            width: 100%;
            padding: 1rem;
            background: var(--primary);
            color: white;
            text-align: center;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            margin-top: 2rem;
            transition: background 0.2s;
        }
        .btn-download:hover {
            background: var(--secondary);
        }
        
        #qr-placeholder {
            margin-top: auto;
            width: 120px;
            height: 120px;
            background: #eee;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            color: #999;
            border: 2px dashed #ccc;
        }
        
        @media (max-width: 768px) {
            .container { flex-direction: column; }
            .preview-area { min-width: 100%; }
        }
    </style>
</head>
<body>

    <h1>LaukaaInfo Markkinointityökalut</h1>
    
    <div class="container">
        <div class="sidebar">
            <h3>Valitse pohja:</h3>
            <?php foreach($tyypit as $t => $label): ?>
                <a href="?id=<?= urlencode($id) ?>&type=<?= $t ?>" class="tool-link <?= $type === $t ? 'active' : '' ?>">
                    <?= htmlspecialchars($label) ?>
                </a>
            <?php endforeach; ?>
            
            <hr style="border:none; border-top:1px solid #e2e8f0; margin: 2rem 0;">
            
            <button class="btn-download" onclick="alert('Latausominaisuus tulossa! Voit ottaa kuvakaappauksen tästä näkymästä toistaiseksi.')">
                ⬇ Lataa kuva (PNG)
            </button>
            <button class="btn-download" style="background:#fff; color:var(--primary); border:2px solid var(--primary); margin-top:1rem;" onclick="window.print()">
                🖨 Tulosta PDF
            </button>
        </div>
        
        <div class="preview-area">
            <?php if($type === 'somekuva'): ?>
            
            <div class="canvas-container canvas-somekuva" id="export-canvas">
                <?php if($logo): ?>
                    <img src="<?= htmlspecialchars($logo) ?>" alt="Logo" class="c-logo">
                <?php endif; ?>
                <div class="c-cat"><?= htmlspecialchars($kategoria) ?></div>
                <h2 class="c-name"><?= htmlspecialchars($nimi) ?></h2>
                <div class="c-phone">📞 <?= htmlspecialchars($puhelin) ?></div>
                <div style="margin-top: 2rem; font-weight:bold; opacity:0.8;">📍 LaukaaInfo.fi</div>
            </div>
            
            <?php elseif($type === 'flyer' || $type === 'qr'): ?>
            
            <div class="canvas-container canvas-flyer" id="export-canvas">
                <?php if($logo): ?>
                    <img src="<?= htmlspecialchars($logo) ?>" alt="Logo" class="c-logo">
                <?php endif; ?>
                <div class="c-cat"><?= htmlspecialchars($kategoria) ?></div>
                <h2 class="c-name"><?= htmlspecialchars($nimi) ?></h2>
                
                <?php if($type === 'offer'): ?>
                    <div style="background:var(--accent); color:white; padding:1rem; border-radius:12px; font-weight:bold; font-size:1.5rem; margin:1rem 0; width:100%; box-sizing:border-box;">
                        ERIKOISTARJOUS!
                    </div>
                <?php endif; ?>
                
                <p style="color:#666;">Tutustu meihin LaukaaInfossa ja katso yhteystietomme sekä palvelumme!</p>
                <div class="c-phone">📞 <?= htmlspecialchars($puhelin) ?></div>
                
                <div id="qr-placeholder">
                    LaukaaInfo<br>QR-koodi
                </div>
                <div style="margin-top: 1rem; font-weight:bold; color:var(--primary);">laukaainfo.fi</div>
            </div>
            
            <?php else: ?>
            
            <div class="canvas-container canvas-somekuva" style="background: white; color: #333; border: 1px solid #ccc;">
                <h2>Työkalu rakenteilla</h2>
                <p>Tätä mallipohjaa päivitetään.</p>
            </div>
            
            <?php endif; ?>
        </div>
    </div>
    
</body>
</html>
