<?php
/**
 * Wonderin – Muistokartan katselunäkymä (perheelle / kutsutuille)
 * Pääsy: suora linkki share_token:lla tai 6-merkkinen katselukoodi
 * mediazoo.fi/laukaainfo-web/wonderin/viewer.php
 */
require_once __DIR__ . '/config.php';
session_start_secure();

$error   = '';
$map     = null;
$places  = [];

// ── Pääsy share_token:lla ─────────────────────────────────────────────────────
$token = $_GET['token'] ?? '';
if ($token) {
    $res = supabase_request('GET',
        '/rest/v1/routes?share_token=eq.' . urlencode($token)
        . '&experience_type=eq.MEMORY&select=id,title,description,view_expires_at,share_token',
        null, null, true
    );
    if ($res['status'] === 200 && !empty($res['data'])) {
        $map = $res['data'][0];
        // Tarkista katseluaika
        if ($map['view_expires_at'] && strtotime($map['view_expires_at']) < time()) {
            $error = 'Katseluaika on päättynyt (' . date('d.m.Y', strtotime($map['view_expires_at'])) . '). Ota yhteyttä kartan omistajaan.';
            $map   = null;
        }
    } else {
        $error = 'Linkkiä ei löydy tai se on vanhentunut.';
    }
}

// ── Pääsy katselukoodilla (aiempi sessio) ─────────────────────────────────────
$map_id_param = $_GET['id'] ?? '';
if (!$map && !empty($_SESSION['viewer_map_id']) && !$error) {
    $target_id = $map_id_param ?: $_SESSION['viewer_map_id'];
    if ($target_id === $_SESSION['viewer_map_id']) {
        $res = supabase_request('GET',
            '/rest/v1/routes?id=eq.' . urlencode($target_id)
            . '&experience_type=eq.MEMORY&select=id,title,description,view_expires_at,share_token',
            null, null, true
        );
        if ($res['status'] === 200 && !empty($res['data'])) {
            $map = $res['data'][0];
            if ($map['view_expires_at'] && strtotime($map['view_expires_at']) < time()) {
                $error = 'Katseluaika on päättynyt.'; $map = null;
            }
        }
    }
}

// ── Jos omistaja on kirjautunut, ohjaa editoriin (ellei pyydetty esikatselu) ──
// ?view=1 tai ?preview=1 pakottaa katselijanäkymän myös omistajalle
$force_view = !empty($_GET['view']) || !empty($_GET['preview']);
$owner = get_session_user();
if ($owner && $map && !$error && !$force_view) {
    // Tarkista, onko tämä omistajan oma kartta
    $ocheck = supabase_request('GET',
        '/rest/v1/routes?id=eq.' . urlencode($map['id'])
        . '&owner_id=eq.' . urlencode($owner['id']) . '&select=id',
        null, get_session_jwt()
    );
    if ($ocheck['status'] === 200 && !empty($ocheck['data'])) {
        // Ohjaa editoriin, mutta lisää preview-linkki mukaan
        header('Location: ' . APP_BASE_URL . '/editor.php?map=' . urlencode($map['id']));
        exit;
    }
}

// ── Hae paikat + muistot jos kartta löytyi ────────────────────────────────────
if ($map) {
    $ep_res = supabase_request('GET',
        '/rest/v1/memory_places?route_id=eq.' . urlencode($map['id']) . '&select=*&order=sort_order.asc,created_at.asc',
        null, null, true
    );
    $raw_places = ($ep_res['status'] === 200 && is_array($ep_res['data'])) ? $ep_res['data'] : [];

    foreach ($raw_places as $p) {
        $p['title'] = $p['name'] ?? ''; // normalisoi
        $mr = supabase_request('GET',
            '/rest/v1/memories?place_id=eq.' . urlencode($p['id'])
            . '&select=*&order=created_at.asc',
            null, null, true
        );
        $p['memories'] = ($mr['status'] === 200 && is_array($mr['data'])) ? $mr['data'] : [];
        $places[] = $p;
    }
}

$total_memories = array_sum(array_map(fn($p) => count($p['memories'] ?? []), $places));
?>
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= $map ? h($map['title']) . ' – Wonderin Muistokartta' : 'Muistokartta – Wonderin' ?></title>
  <meta name="description" content="<?= $map ? h(mb_substr($map['description'] ?? 'Henkilökohtainen muistokartta.', 0, 140)) : 'Wonderin muistokartta' ?>">
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    .viewer-hero {
      background: linear-gradient(135deg, var(--bg2), var(--bg3));
      border-bottom: 1px solid var(--border);
      padding: 22px 20px 18px;
      text-align: center;
    }
    .viewer-stats { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; margin-top: 14px; }
    .viewer-stat  { text-align: center; }
    .viewer-stat .n { font-size: 1.8rem; font-weight: 800; color: var(--gold); }
    .viewer-stat .l { font-size: .8rem;  color: var(--text2); }
    .viewer-media img {
      width: 100%; border-radius: 10px; margin-top: 10px;
      max-height: 280px; object-fit: contain;
      background: rgba(0,0,0,.25);
      cursor: zoom-in;
      transition: opacity .15s, transform .15s;
    }
    .viewer-media img:hover { opacity: .88; transform: scale(1.01); }
    .img-zoom-hint {
      font-size: .72rem; color: var(--text2); text-align: center;
      margin-top: 4px; opacity: .7;
    }
    /* ── Lightbox ──────────────────────────────────────────────── */
    #lightbox-overlay {
      display: none;
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(0,0,0,.88);
      backdrop-filter: blur(6px);
      align-items: center; justify-content: center;
      padding: 20px;
      animation: lb-in .2s ease;
    }
    #lightbox-overlay.open { display: flex; }
    @keyframes lb-in {
      from { opacity: 0; } to { opacity: 1; }
    }
    #lightbox-box {
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      max-width: min(860px, 95vw);
      width: 100%;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: 0 24px 80px rgba(0,0,0,.7);
      animation: lb-slide .22s ease;
    }
    @keyframes lb-slide {
      from { transform: translateY(18px) scale(.97); opacity: 0; }
      to   { transform: none; opacity: 1; }
    }
    #lightbox-img {
      width: 100%;
      max-height: 65vh;
      object-fit: contain;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      background: #000;
      display: block;
    }
    #lightbox-body {
      padding: 20px 24px 24px;
    }
    #lightbox-close {
      position: absolute; top: 12px; right: 16px;
      background: rgba(0,0,0,.6); border: none;
      color: #fff; font-size: 1.4rem; line-height: 1;
      width: 36px; height: 36px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    #lightbox-close:hover { background: rgba(220,50,50,.7); }
    .viewer-story { font-size: .9rem; line-height: 1.7; color: var(--text2); white-space: pre-line; }
    #viewer-map { height: 360px; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border2); margin: 20px 20px 0; }
    .place-toggle { background: none; border: none; cursor: pointer; font-size: 1.2rem; color: var(--text2); transition: transform .2s; }
    .place-toggle.open { transform: rotate(180deg); }
    /* ── Navigointibaari ────────────────────────────────────────────────── */
    #place-nav {
      position: sticky; top: 64px; z-index: 800;
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    #place-nav .nav-label {
      flex: 1; text-align: center;
      font-weight: 700; font-size: .95rem; color: var(--gold);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #place-nav select {
      background: var(--bg3); color: var(--text1); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 5px 10px; font-size: .82rem;
      max-width: 180px; cursor: pointer;
    }
    .viewer-place { scroll-margin-top: 110px; }
  </style>
</head>
<body>

<!-- Topbar -->
<nav class="topbar">
  <div class="topbar-brand">
    <div class="topbar-logo">W</div>
    <div>
      <div class="topbar-title">Wonderin</div>
      <div class="topbar-sub">Muistokartta</div>
    </div>
  </div>
  <div class="topbar-nav">
    <?php if (!$owner): ?>
    <a href="index.php" class="btn btn-outline btn-sm">🔑 Kirjaudu sisään</a>
    <?php else: ?>
    <a href="editor.php" class="btn btn-gold btn-sm">✏️ Editori</a>
    <?php endif; ?>
  </div>
</nav>

<?php if ($error): ?>
<!-- Virheviesti -->
<div class="landing-hero" style="min-height:calc(100vh - 64px);">
  <div class="hero-icon" style="background:rgba(248,113,113,.2);font-size:2rem;">🔒</div>
  <h1 style="max-width:500px;text-align:center;"><?= h($error) ?></h1>
  <p class="text-muted mt-8">Muistokartan katseluoikeus saattaa olla päättynyt tai linkki on virheellinen.</p>
  <a href="index.php" class="btn btn-outline mt-20">← Etusivulle</a>
</div>

<?php elseif (!$map): ?>
<!-- Syötä katselukoodi -->
<div class="landing-hero" style="min-height:calc(100vh - 64px);">
  <div class="hero-icon">🎞️</div>
  <h1>Avaa muistokartta</h1>
  <p class="text-muted mt-8">Syötä saamasi 6-merkkinen katselukoodi.</p>
  <div class="card card-gold mt-20" style="max-width:380px;width:100%;">
    <form method="POST" action="index.php">
      <input type="hidden" name="action" value="viewer_pin">
      <div class="form-group">
        <label class="form-label">Katselukoodi</label>
        <input class="code-input form-control" type="text" name="pin" maxlength="6"
               placeholder="MUMMO7" oninput="this.value=this.value.toUpperCase()" required>
      </div>
      <button type="submit" class="btn btn-gold w-full mt-12">👁 Avaa muistokartta</button>
    </form>
  </div>
</div>

<?php else: ?>
<!-- Muistokartta löytyi – näytä se -->

<!-- Hero -->
<div class="viewer-hero">
  <h1 style="font-size:clamp(1.4rem,4vw,2rem);"><?= h($map['title']) ?></h1>
  <?php if (!empty($map['description'])): ?>
  <p class="text-muted mt-8" style="max-width:500px;margin:8px auto 0;"><?= h($map['description']) ?></p>
  <?php endif; ?>
  <div class="viewer-stats">
    <div class="viewer-stat"><div class="n"><?= count($places) ?></div><div class="l">Paikkaa</div></div>
    <div class="viewer-stat"><div class="n"><?= $total_memories ?></div><div class="l">Muistoa</div></div>
    <?php
      $years = array_filter(array_merge(...array_map(fn($p)=>array_column($p['memories']??[],'memory_year'),$places)));
      if ($years): sort($years);
    ?>
    <div class="viewer-stat"><div class="n"><?= h(min($years)) ?>–<?= h(max($years)) ?></div><div class="l">Vuodet</div></div>
    <?php endif; ?>
  </div>
</div>

<?php if ($places): ?>
<!-- Navigointibaari -->
<div id="place-nav">
  <button class="btn btn-outline btn-sm" onclick="navigateTo(0)" title="Ensimmäinen paikka">⏮</button>
  <button class="btn btn-outline btn-sm" id="btn-prev" onclick="navigatePrev()">◄ Edellinen</button>
  <div class="nav-label" id="nav-label"><?= h($places[0]['title'] ?? $places[0]['name'] ?? 'Paikka 1') ?></div>
  <select id="place-jump" onchange="navigateTo(parseInt(this.value))" title="Hyppää paikkaan">
    <?php foreach ($places as $pi => $p): ?>
    <option value="<?= $pi ?>"><?= $pi+1 ?>. <?= h(mb_substr($p['title'] ?? $p['name'] ?? 'Paikka', 0, 30)) ?></option>
    <?php endforeach; ?>
  </select>
  <button class="btn btn-outline btn-sm" id="btn-next" onclick="navigateNext()">Seuraava ►</button>
</div>

<div id="viewer-map"></div>
<?php endif; ?>

<!-- Paikat ja muistot -->
<div class="viewer-wrap">
  <?php foreach ($places as $pi => $place): ?>
  <div class="viewer-place">
    <div class="viewer-place-header" onclick="navigateTo(<?= $pi ?>)">
      <div style="min-width:26px;height:26px;background:var(--gold);color:#1a1200;font-size:.8rem;font-weight:800;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><?= $pi+1 ?></div>
      <div style="flex:1;">
        <div class="place-name"><?= h($place['title'] ?? $place['name'] ?? 'Paikka') ?></div>
        <?php if ($place['lat'] && $place['lng']): ?>
        <div class="text-muted text-xs"><?= number_format((float)$place['lat'], 4) ?>, <?= number_format((float)$place['lng'], 4) ?></div>
        <?php endif; ?>
      </div>
      <span class="badge badge-editable" style="font-size:.72rem;"><?= count($place['memories']) ?> muistoa</span>
      <button class="place-toggle <?= $pi === 0 ? 'open' : '' ?>" id="toggle-<?= $pi ?>">▼</button>
    </div>
    <div class="viewer-place-body" id="place-body-<?= $pi ?>" <?= $pi === 0 ? '' : 'style="display:none;"' ?>>
      <?php if (empty($place['memories'])): ?>
        <p class="text-muted text-sm">Ei muistoja tässä paikassa.</p>
      <?php else: ?>
        <div class="memory-timeline">
          <?php foreach ($place['memories'] as $mi => $m): ?>
          <div class="memory-card">
            <?php $my = $m['year'] ?? ($m['memory_year'] ?? ''); if (!empty($my)): ?>
            <div class="memory-year">📅 <?= h($my) ?></div>
            <?php endif; ?>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <div class="memory-title"><?= h($m['title'] ?? ($m['memory_title'] ?? 'Muisto')) ?></div>
              <?php $speech_text = h($m['title'] ?? '') . (!empty($my) ? ('. Vuosi ' . h($my)) : '') . '. ' . h($m['description'] ?? ($m['story_text'] ?? '')); ?>
              <button type="button" class="btn btn-outline btn-sm tts-btn" style="font-size:.76rem;padding:3px 10px;"
                      onclick="toggleSpeech(this, `<?= addslashes($speech_text) ?>`)" title="Kuuntele puheteksti">
                🔊 Kuuntele
              </button>
            </div>
            <?php $st = $m['description'] ?? ($m['story_text'] ?? ''); if (!empty($st)): ?>
            <div class="viewer-story mt-8"><?= h($st) ?></div>
            <?php endif; ?>
            <?php if (!empty($m['media_url'])): ?>
            <div class="viewer-media">
              <?php if (($m['media_type'] ?? '') === 'IMAGE'): ?>
                <?php
                  $lt = h($m['title'] ?? ($m['memory_title'] ?? ''));
                  $ls = h($m['description'] ?? ($m['story_text'] ?? ''));
                  $lu = h($m['media_url']);
                ?>
                <div style="position:relative;">
                  <img src="<?= $lu ?>" alt="<?= $lt ?>"
                       loading="lazy" referrerpolicy="no-referrer"
                       onclick="openLightbox('<?= $lu ?>','<?= $lt ?>',`<?= addslashes($ls) ?>`)"
                       title="Klikkaa suurentaaksesi">
                  <div class="img-zoom-hint">🔍 Klikkaa suurentaaksesi</div>
                </div>
              <?php elseif (($m['media_type'] ?? '') === 'VIDEO'): ?>
                <?php
                  $vu  = $m['media_url'];
                  $vt  = h($m['title'] ?? ($m['memory_title'] ?? ''));
                  $vs  = h($m['description'] ?? ($m['story_text'] ?? ''));
                  $ytid = null;
                  $is_google_photos = false;
                  if (preg_match('/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/', $vu, $ym)) {
                      $ytid = $ym[1];
                  } elseif (preg_match('#(photos\.app\.goo\.gl|photos\.google\.com|lh3\.googleusercontent\.com)#i', $vu)) {
                      $is_google_photos = true;
                  }
                ?>
                <?php if ($ytid): ?>
                <!-- YouTube thumbnail + play-painike kortissa -->
                <div class="yt-thumb-wrap" onclick="openVideoLightbox('<?= h($ytid) ?>','<?= $vt ?>',`<?= addslashes($vs) ?>`)"
                     style="position:relative;margin-top:10px;border-radius:10px;overflow:hidden;cursor:pointer;aspect-ratio:16/9;background:#000;">
                  <img src="https://img.youtube.com/vi/<?= h($ytid) ?>/hqdefault.jpg"
                       alt="<?= $vt ?>" loading="lazy"
                       style="width:100%;height:100%;object-fit:cover;opacity:.85;display:block;">
                  <!-- Play-nappi -->
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                    <div style="width:60px;height:60px;background:rgba(255,0,0,.88);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:transform .15s;">
                      <svg viewBox="0 0 24 24" fill="#fff" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div style="position:absolute;bottom:8px;left:10px;font-size:.72rem;color:rgba(255,255,255,.75);">▶ Katso video</div>
                </div>
                <div class="img-zoom-hint">▶ Klikkaa katsoaksesi YouTube-videota</div>
                <?php elseif ($is_google_photos): ?>
                <!-- Google Kuvat -video: avautuu uuteen välilehteen -->
                <a href="<?= h($vu) ?>" target="_blank" rel="noopener noreferrer"
                   style="display:flex;align-items:center;gap:12px;margin-top:10px;padding:16px 20px;border-radius:12px;
                          background:linear-gradient(135deg, rgba(66,133,244,.15), rgba(219,68,55,.10));
                          border:1px solid rgba(66,133,244,.35);text-decoration:none;transition:all .2s;cursor:pointer;"
                   onmouseover="this.style.borderColor='rgba(66,133,244,.7)';this.style.transform='translateY(-1px)'"
                   onmouseout="this.style.borderColor='rgba(66,133,244,.35)';this.style.transform='none'">
                  <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#4285F4,#EA4335);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(66,133,244,.4);">
                    <svg viewBox="0 0 24 24" fill="#fff" width="22" height="22"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                  <div>
                    <div style="font-weight:700;font-size:.9rem;color:var(--text1);">▶ Avaa video Google Kuvissa</div>
                    <div style="font-size:.72rem;color:var(--text2);margin-top:2px;">Videoleike avautuu uudelle välilehdelle</div>
                  </div>
                </a>
                <?php else: ?>
                <!-- Muu video-tiedosto -->
                <div style="margin-top:10px;border-radius:10px;overflow:hidden;background:var(--bg3);cursor:pointer;padding:16px;text-align:center;"
                     onclick="openVideoLightbox(null,'<?= $vt ?>',`<?= addslashes($vs) ?>`, '<?= h($vu) ?>')">
                  <span style="font-size:2rem;">🎬</span>
                  <div class="img-zoom-hint mt-4">▶ Klikkaa toistaaksesi video</div>
                </div>
                <?php endif; ?>
              <?php elseif (($m['media_type'] ?? '') === 'AUDIO'): ?>
                <audio controls src="<?= h($m['media_url']) ?>" style="width:100%;margin-top:8px;"></audio>
              <?php else: ?>
                <a href="<?= h($m['media_url']) ?>" target="_blank" class="btn btn-outline btn-sm mt-8">📄 Avaa liite</a>
              <?php endif; ?>
            </div>
            <?php endif; ?>
          </div>
          <?php if ($mi < count($place['memories']) - 1): ?>
          <div class="timeline-connector"></div>
          <?php endif; ?>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </div>
  </div>
  <?php endforeach; ?>

  <?php if (empty($places)): ?>
  <div style="text-align:center;padding:60px 20px;">
    <p class="text-muted">Muistokartalla ei ole vielä paikkoja tai muistoja.</p>
  </div>
  <?php endif; ?>

  <!-- Footer -->
  <div class="divider mt-32 mb-16"></div>
  <div style="text-align:center;" class="text-muted text-sm">
    <p>Muistokartta on luotu <strong>Wonderin</strong>-palvelulla · <a href="https://mediazoo.fi" target="_blank" class="text-gold">Mediazoo.fi</a></p>
    <p class="mt-4">Katseluoikeus: <?= $map['view_expires_at'] ? date('d.m.Y', strtotime($map['view_expires_at'])) : 'jatkuva' ?></p>
  </div>
</div>

<!-- Lightbox (kuva + video) -->
<div id="lightbox-overlay" onclick="closeLightbox(event)">
  <div id="lightbox-box" role="dialog" aria-modal="true">
    <button id="lightbox-close" onclick="closeLightbox()" aria-label="Sulje">&times;</button>
    <!-- Kuvatila -->
    <img id="lightbox-img" src="" alt="" referrerpolicy="no-referrer" style="display:none;">
    <!-- Videotila -->
    <div id="lightbox-video-wrap" style="display:none;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:#000;">
      <iframe id="lightbox-iframe" src="" allowfullscreen allow="autoplay"
              style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe>
      <video id="lightbox-video" src="" controls
             style="position:absolute;top:0;left:0;width:100%;height:100%;"></video>
    </div>
    <div id="lightbox-body">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <div id="lightbox-title" style="font-weight:700;font-size:1.1rem;"></div>
        <button id="lightbox-tts-btn" class="btn btn-outline btn-sm" onclick="toggleLightboxSpeech()" style="font-size:.78rem;padding:3px 10px;flex-shrink:0;">
          🔊 Kuuntele
        </button>
      </div>
      <div id="lightbox-story" class="viewer-story"></div>
    </div>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const PLACES = <?= json_encode($places) ?>;
let viewerMap  = null;
let placeMarkers = []; // indeksoitu samoin kuin PLACES
let currentIdx   = 0;
let currentTtsBtn = null;
let cachedVoices = [];

// Esilataa äänet (Chrome lataa asynkronisesti)
if ('speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

// ── Puhesynteesi (TTS) ─────────────────────────────────────────────────────────
function toggleSpeech(btn, text) {
  if (!('speechSynthesis' in window)) {
    alert('Puhesynteesiä ei tueta tässä selaimessa.');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (currentTtsBtn) {
      currentTtsBtn.innerHTML = '🔊 Kuuntele';
      currentTtsBtn.classList.remove('btn-gold');
      currentTtsBtn.classList.add('btn-outline');
    }
    if (currentTtsBtn === btn) {
      currentTtsBtn = null;
      return;
    }
  }

  const clean = (text || '').trim();
  if (!clean) return;

  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'fi-FI';
  utter.rate = 0.95;

  // Käytä esiladattuja ääniä tai hae uudelleen
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
  const fiVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('fi'));
  if (fiVoice) utter.voice = fiVoice;

  utter.onstart = () => {
    btn.innerHTML = '⏹ Pysäytä puhe';
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-gold');
    currentTtsBtn = btn;
  };

  utter.onend = utter.onerror = () => {
    btn.innerHTML = '🔊 Kuuntele';
    btn.classList.remove('btn-gold');
    btn.classList.add('btn-outline');
    if (currentTtsBtn === btn) currentTtsBtn = null;
  };

  currentTtsBtn = btn;
  window.speechSynthesis.speak(utter);
}

function toggleLightboxSpeech() {
  const title = document.getElementById('lightbox-title')?.textContent || '';
  const story = document.getElementById('lightbox-story')?.textContent || '';
  const btn = document.getElementById('lightbox-tts-btn');
  if (btn) toggleSpeech(btn, title + '. ' + story);
}

// ── Lightbox: kuva ─────────────────────────────────────────────────────────────
function openLightbox(url, title, story) {
  _lightboxSetMeta(title, story);
  document.getElementById('lightbox-img').src     = url;
  document.getElementById('lightbox-img').alt     = title;
  document.getElementById('lightbox-img').style.display = '';
  document.getElementById('lightbox-video-wrap').style.display = 'none';
  document.getElementById('lightbox-iframe').src  = '';
  document.getElementById('lightbox-video').src   = '';
  _lightboxOpen();
}

// ── Lightbox: video (YouTube tai tiedosto) ─────────────────────────────────
function openVideoLightbox(ytid, title, story, videoUrl) {
  _lightboxSetMeta(title, story);
  document.getElementById('lightbox-img').style.display        = 'none';
  document.getElementById('lightbox-video-wrap').style.display = '';
  if (ytid) {
    document.getElementById('lightbox-iframe').src  = `https://www.youtube.com/embed/${ytid}?autoplay=1&rel=0`;
    document.getElementById('lightbox-video').style.display    = 'none';
    document.getElementById('lightbox-iframe').style.display   = '';
  } else {
    document.getElementById('lightbox-video').src   = videoUrl || '';
    document.getElementById('lightbox-video').style.display    = '';
    document.getElementById('lightbox-iframe').style.display   = 'none';
  }
  _lightboxOpen();
}

function _lightboxSetMeta(title, story) {
  document.getElementById('lightbox-title').textContent        = title || '';
  document.getElementById('lightbox-story').textContent        = story  || '';
  document.getElementById('lightbox-story').style.display      = story  ? '' : 'none';
  const lbBtn = document.getElementById('lightbox-tts-btn');
  if (lbBtn) {
    lbBtn.innerHTML = '🔊 Kuuntele';
    lbBtn.classList.remove('btn-gold');
    lbBtn.classList.add('btn-outline');
  }
}
function _lightboxOpen() {
  document.getElementById('lightbox-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox-overlay') &&
          e.target !== document.getElementById('lightbox-close')) return;
  document.getElementById('lightbox-overlay').classList.remove('open');
  // Pysäytä mahdollinen puhe
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (currentTtsBtn) {
      currentTtsBtn.innerHTML = '🔊 Kuuntele';
      currentTtsBtn.classList.remove('btn-gold');
      currentTtsBtn.classList.add('btn-outline');
      currentTtsBtn = null;
    }
  }
  // Pysäytä video/iframe
  document.getElementById('lightbox-img').src    = '';
  document.getElementById('lightbox-iframe').src = '';
  document.getElementById('lightbox-video').src  = '';
  document.getElementById('lightbox-img').style.display        = 'none';
  document.getElementById('lightbox-video-wrap').style.display = 'none';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('lightbox-overlay').classList.contains('open')) {
    closeLightbox({target: document.getElementById('lightbox-overlay')});
  }
});

// ── Leaflet-kartta ────────────────────────────────────────────────────────────
(function initViewerMap() {
  if (!PLACES.length) return;
  const geoPlaces = PLACES.filter(p => p.lat && p.lng);
  if (!geoPlaces.length) { document.getElementById('viewer-map').style.display = 'none'; return; }

  const center = [PLACES[0].lat || geoPlaces[0].lat, PLACES[0].lng || geoPlaces[0].lng];
  viewerMap = L.map('viewer-map').setView(center, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(viewerMap);

  const bounds = [];
  PLACES.forEach((p, i) => {
    if (!p.lat || !p.lng) { placeMarkers.push(null); return; }
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:34px;height:34px;background:linear-gradient(135deg,#e8b84b,#d4863a);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
               <span style="transform:rotate(45deg);font-size:.85rem;font-weight:800;">${i+1}</span></div>`,
      iconSize: [34,34], iconAnchor: [17,34]
    });
    const marker = L.marker([p.lat, p.lng], { icon })
      .addTo(viewerMap)
      .bindPopup(`<strong>${p.title||p.name||'Paikka'}</strong><br><small>${p.memories?.length||0} muistoa</small>`);
    marker.on('click', () => navigateTo(i));
    placeMarkers.push(marker);
    bounds.push([p.lat, p.lng]);
  });

  if (bounds.length > 1) viewerMap.fitBounds(bounds, { padding: [40, 40] });
})();

// ── Päänavigointifunktio ──────────────────────────────────────────────────────
function navigateTo(idx) {
  if (idx < 0 || idx >= PLACES.length) return;
  currentIdx = idx;

  // Avaa kohde, sulje muut
  PLACES.forEach((_, i) => {
    const body   = document.getElementById('place-body-' + i);
    const toggle = document.getElementById('toggle-' + i);
    if (!body) return;
    const open = (i === idx);
    body.style.display  = open ? '' : 'none';
    if (toggle) toggle.classList.toggle('open', open);
  });

  // Päivitä navigointibaari
  const p = PLACES[idx];
  const label = document.getElementById('nav-label');
  if (label) label.textContent = `${idx+1} / ${PLACES.length} – ${p.title || p.name || 'Paikka'}`;

  const jump = document.getElementById('place-jump');
  if (jump) jump.value = idx;

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  if (btnPrev) btnPrev.disabled = idx === 0;
  if (btnNext) btnNext.disabled = idx === PLACES.length - 1;

  // Kartta seuraa
  if (viewerMap && p.lat && p.lng) {
    viewerMap.flyTo([p.lat, p.lng], Math.max(viewerMap.getZoom(), 13), { duration: 0.8 });
    if (placeMarkers[idx]) placeMarkers[idx].openPopup();
  }

  // Vieritä paikkaan
  const el = document.querySelector(`.viewer-place:nth-child(${idx + 1})`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigatePrev() { navigateTo(currentIdx - 1); }
function navigateNext() { navigateTo(currentIdx + 1); }

// Näppäimistöohjaus: nuolinäppäimet
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigateNext(); }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigatePrev(); }
  if (e.key === 'Home') { e.preventDefault(); navigateTo(0); }
});

// Näytä ensimmäinen paikka heti
navigateTo(0);
</script>
<?php endif; ?>
</body>
</html>

