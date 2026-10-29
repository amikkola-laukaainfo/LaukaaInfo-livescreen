<?php
/**
 * Wonderin Muistokartta – Päämuokkausnäkymä (editor)
 * mediazoo.fi/laukaainfo-web/wonderin/editor.php
 */
require_once __DIR__ . '/config.php';
session_start_secure();

// ── Auth ──────────────────────────────────────────────────────────────────────
// Tue myös URL-parametrina tuleva token (magic link callback)
if (isset($_GET['token']) && empty($_SESSION['user'])) {
    $token_res = supabase_request('GET', '/auth/v1/user', null, $_GET['token']);
    if ($token_res['status'] === 200 && !empty($token_res['data']['id'])) {
        $_SESSION['access_token'] = $_GET['token'];
        $_SESSION['user'] = $token_res['data'];
        header('Location: ' . APP_BASE_URL . '/editor.php');
        exit;
    }
}

$auth = require_auth();
$jwt  = $auth['jwt'];
$user = $auth['user'];

// ── Hae kaikki käyttäjän MEMORY-kartat ────────────────────────────────────────
$owner_param = empty($user['is_dev']) ? '&owner_id=eq.' . urlencode($user['id']) : '';
$maps_res = supabase_request('GET',
    '/rest/v1/routes?experience_type=eq.MEMORY' . $owner_param
    . '&select=id,title,description,edit_expires_at,view_expires_at,archive_until,share_token,view_pin,view_pin_hash,created_at&order=created_at.desc',
    null, $jwt
);
$maps = ($maps_res['status'] === 200 && is_array($maps_res['data'])) ? $maps_res['data'] : [];

// ── Aktiivinen kartta ─────────────────────────────────────────────────────────
$active_map_id = $_GET['map'] ?? ($_SESSION['active_map'] ?? ($maps[0]['id'] ?? null));
$active_map    = null;
$places        = [];
$is_new        = !empty($_GET['new']);
$new_map_pin   = '';

if ($active_map_id) {
    $_SESSION['active_map'] = $active_map_id;
    // Hae kartan tiedot
    foreach ($maps as $m) {
        if ($m['id'] === $active_map_id) { $active_map = $m; break; }
    }
    if (!$active_map) {
        // Voi olla, että listaus ei löytynyt – hae suoraan
        $mr = supabase_request('GET',
            '/rest/v1/routes?id=eq.' . urlencode($active_map_id)
            . $owner_param
            . '&select=id,title,description,edit_expires_at,view_expires_at,archive_until,share_token,view_pin,view_pin_hash,created_at',
            null, $jwt
        );
        if ($mr['status'] === 200 && !empty($mr['data'])) $active_map = $mr['data'][0];
    }
    // Hae kartan paikat memory_places-taulusta
    if ($active_map) {
        $ep_res = supabase_request('GET',
            '/rest/v1/memory_places?route_id=eq.' . urlencode($active_map_id)
            . '&select=*&order=sort_order.asc,created_at.asc',
            null, $jwt
        );
        $places = ($ep_res['status'] === 200 && is_array($ep_res['data'])) ? $ep_res['data'] : [];
        // Normalisoi 'title'-kenttä 'name'-kentästä editoria varten
        foreach ($places as &$p) { $p['title'] = $p['name'] ?? ''; }
        unset($p);
    }

    // Lue juuri luodun kartan PIN
    if ($is_new && !empty($_SESSION['new_map_pin'])) {
        $new_map_pin = $_SESSION['new_map_pin'];
        unset($_SESSION['new_map_pin']);
    }
}

$map_state = $active_map
    ? map_state($active_map['edit_expires_at'] ?? null, $active_map['view_expires_at'] ?? null, $active_map['archive_until'] ?? null)
    : 'DRAFT';

$can_edit = in_array($map_state, ['EDITABLE', 'DRAFT']);

// ── Badge-helper ──────────────────────────────────────────────────────────────
$state_labels = [
    'EDITABLE'        => ['🟢 Muokkattava',  'badge-editable'],
    'VIEW_ONLY'       => ['🔵 Vain katselu', 'badge-view-only'],
    'ARCHIVED'        => ['🟡 Arkistoitu',   'badge-archived'],
    'PENDING_DELETION'=> ['🔴 Poistumassa',  'badge-pending'],
    'PURGED'          => ['⬛ Poistettu',    'badge-draft'],
    'DRAFT'           => ['⚪ Luonnos',      'badge-draft'],
];
$state_info = $state_labels[$map_state] ?? ['Tuntematon', 'badge-draft'];
?>
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= $active_map ? h($active_map['title']) . ' – ' : '' ?>Wonderin Muistokartta-editori</title>
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css?v=<?= filemtime(__DIR__ . '/assets/style.css') ?: time() ?>">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</head>
<body>

<!-- Topbar -->
<nav class="topbar">
  <div class="topbar-brand">
    <div class="topbar-logo">W</div>
    <div>
      <div class="topbar-title">Wonderin</div>
      <div class="topbar-sub">Muistokartta-editori</div>
    </div>
  </div>
  <div class="topbar-nav">
    <?php if ($active_map): ?>
      <span class="badge <?= $state_info[1] ?>"><?= $state_info[0] ?></span>
    <?php endif; ?>
    <?php if ($active_map && $active_map['share_token']): ?>
      <a href="viewer.php?token=<?= urlencode($active_map['share_token']) ?>&amp;view=1" target="_blank"
         class="btn btn-outline btn-sm">👁 Katselunäkymä</a>
    <?php endif; ?>

    <a href="api/export.php?map=<?= urlencode($active_map_id ?? '') ?>" class="btn btn-outline btn-sm <?= !$active_map ? 'hidden' : '' ?>" id="btn-export">
      ⬇️ Vie CSV
    </a>
    <a href="api/auth.php?action=logout" class="btn btn-ghost btn-sm">Kirjaudu ulos</a>
  </div>
</nav>

<!-- Uuden kartan onnitteluviesti -->
<?php if ($is_new && $active_map): ?>
<div style="background:linear-gradient(135deg,rgba(232,184,75,.15),rgba(212,134,58,.1));border-bottom:1px solid rgba(232,184,75,.3);padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
  <span style="font-size:1.6rem;">🎉</span>
  <div>
    <strong>Muistokartallesi on luotu uusi kortti!</strong>
    <span class="text-muted text-sm"> – Muokkausaika päättyy <?= $active_map['edit_expires_at'] ? date('d.m.Y', strtotime($active_map['edit_expires_at'])) : '?' ?></span>
  </div>
  <?php if ($new_map_pin): ?>
  <div class="share-code" style="margin-left:auto;">
    <div style="font-size:.72rem;color:var(--text2);margin-bottom:4px;">KATSELUKOODI PERHEELLE</div>
    <div class="code"><?= h($new_map_pin) ?></div>
  </div>
  <?php endif; ?>
  <button onclick="this.parentElement.remove()" class="btn btn-ghost btn-sm">✕</button>
</div>
<?php endif; ?>

<!-- Pääasettelu -->
<div class="editor-layout" style="height:calc(100vh - 64px<?= ($is_new && $active_map) ? ' - 62px' : '' ?>);">

  <!-- Vasen sivupalkki: kartat ja paikat -->
  <aside class="editor-sidebar-left">

    <!-- Karttavalikko -->
    <div class="sidebar-section">
      <div class="flex items-center justify-between mb-8">
        <h4>Muistokartat</h4>
        <a href="redeem.php" class="btn btn-outline btn-sm" title="Lunasta uusi koodi">＋</a>
      </div>
      <?php if (empty($maps)): ?>
        <p class="text-muted text-sm">Ei vielä muistokarttoja.<br>
          <a href="redeem.php" class="text-gold">Lunasta aktivointikoodi →</a>
        </p>
      <?php else: ?>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <?php foreach ($maps as $m):
            $ms = map_state($m['edit_expires_at']??null,$m['view_expires_at']??null,$m['archive_until']??null);
            $mc = ['EDITABLE'=>'badge-editable','VIEW_ONLY'=>'badge-view-only','ARCHIVED'=>'badge-archived','PENDING_DELETION'=>'badge-pending','DRAFT'=>'badge-draft'][$ms] ?? 'badge-draft';
          ?>
          <a href="editor.php?map=<?= urlencode($m['id']) ?>"
             class="place-item <?= $m['id']===$active_map_id ? 'active' : '' ?>"
             style="text-decoration:none;display:flex;align-items:center;gap:10px;padding:10px 12px;">
            <div class="place-icon" style="width:30px;height:30px;font-size:.9rem;">🗺️</div>
            <div style="flex:1;min-width:0;">
              <div class="place-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><?= h($m['title']) ?></div>
              <span class="badge <?= $mc ?>" style="font-size:.65rem;padding:2px 7px;"><?= $ms ?></span>
            </div>
          </a>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </div>

    <!-- Paikkalista -->
    <?php if ($active_map): ?>
    <div class="sidebar-section" style="flex:1;">
      <div class="flex items-center justify-between mb-8">
        <h4>Paikat (<?= count($places) ?>)</h4>
        <?php if ($can_edit): ?>
        <button class="btn btn-outline btn-sm" onclick="openAddPlaceModal()" title="Lisää paikka">＋</button>
        <?php endif; ?>
      </div>

      <!-- Uusi paikka -lomake sivupalkissa (ei peitä karttaa) -->
      <?php if ($can_edit): ?>
      <div id="add-place-panel" style="display:none;background:var(--bg3);border:1px solid var(--gold);border-radius:var(--radius);padding:14px;margin-bottom:14px;box-shadow:0 4px 20px rgba(0,0,0,0.5);">
        <div class="flex items-center justify-between mb-8">
          <strong style="font-size:0.88rem;color:var(--gold);">📍 Lisää uusi paikka</strong>
          <button type="button" class="btn btn-ghost btn-sm" onclick="cancelAddPlace()" style="padding:2px 8px;font-size:0.8rem;">✕</button>
        </div>
        <div class="form-group mb-8">
          <label class="form-label text-xs">Paikan nimi</label>
          <input class="form-control" id="sidebar-place-name" placeholder="esim. Mummolan päärakennus" style="font-size:0.85rem;padding:7px 10px;" required>
        </div>
        <div class="form-group mb-8">
          <label class="form-label text-xs">Sijainti kartalla</label>
          <div style="font-size:0.78rem;background:var(--bg2);padding:7px 10px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
            <span id="sidebar-coords-display" style="font-family:monospace;color:var(--gold);font-weight:600;">62.26100, 26.20800</span>
            <span class="text-muted text-xs">🎯 Siirrä merkkiä</span>
          </div>
          <input type="hidden" id="sidebar-place-lat">
          <input type="hidden" id="sidebar-place-lng">
        </div>
        <div class="form-group mb-12">
          <label class="form-label text-xs">Kuvaus (valinnainen)</label>
          <textarea class="form-control" id="sidebar-place-desc" rows="2" placeholder="Lyhyt kuvaus paikasta…" style="font-size:0.82rem;padding:6px 10px;min-height:50px;"></textarea>
        </div>
        <div class="flex gap-8">
          <button type="button" class="btn btn-outline btn-sm" onclick="cancelAddPlace()" style="flex:1;">Peruuta</button>
          <button type="button" class="btn btn-gold btn-sm" onclick="savePlaceFromSidebar()" style="flex:1;">💾 Tallenna</button>
        </div>
      </div>
      <?php endif; ?>

      <div class="place-list" id="place-list">
        <?php foreach ($places as $i => $p): ?>
        <div class="place-item" data-id="<?= h($p['id']) ?>"
             data-lat="<?= h($p['lat']??0) ?>" data-lng="<?= h($p['lng']??0) ?>"
             onclick="selectPlace('<?= h($p['id']) ?>', <?= (float)($p['lat']??0) ?>, <?= (float)($p['lng']??0) ?>)"
             style="position:relative;">
          <div class="place-num" style="min-width:22px;height:22px;background:var(--gold);color:#1a1200;font-size:.72rem;font-weight:800;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><?= $i+1 ?></div>
          <div style="flex:1;min-width:0;">
            <div class="place-name"><?= h($p['title'] ?? $p['name'] ?? 'Nimetön paikka') ?></div>
            <div class="place-count text-xs"><?= h($p['description'] ? mb_substr($p['description'],0,40).'…' : 'Ei kuvausta') ?></div>
          </div>
          <?php if ($can_edit): ?>
          <div class="place-reorder" onclick="event.stopPropagation()" style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;">
            <button class="btn btn-ghost" style="padding:1px 5px;font-size:.7rem;line-height:1;" title="Siirrä ylös" onclick="reorderPlace('<?= h($p['id']) ?>','up')">▲</button>
            <button class="btn btn-ghost" style="padding:1px 5px;font-size:.7rem;line-height:1;" title="Siirrä alas" onclick="reorderPlace('<?= h($p['id']) ?>','down')">▼</button>
          </div>
          <?php endif; ?>
        </div>
        <?php endforeach; ?>
        <?php if (empty($places)): ?>
        <p class="text-muted text-sm" id="empty-places-msg">Ei vielä paikkoja.<br>
          <?php if ($can_edit): ?><button class="btn btn-outline btn-sm mt-8" onclick="openAddPlaceModal()">＋ Lisää ensimmäinen paikka</button><?php endif; ?>
        </p>
        <?php endif; ?>
      </div>
    </div>
    <?php endif; ?>
  </aside>

  <!-- Kartta + muistot -->
  <main class="editor-main" style="display:flex;flex-direction:column;overflow:hidden;">
    <?php if ($active_map): ?>

    <!-- Karttanimi-rivi -->
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <?php if ($can_edit): ?>
        <input id="map-title-input" class="form-control" style="font-size:1.05rem;font-weight:700;background:transparent;border-color:transparent;padding:6px 8px;"
               value="<?= h($active_map['title']) ?>"
               onchange="saveMapTitle(this.value)"
               placeholder="Muistokartan nimi…">
        <?php else: ?>
        <h2 style="padding:6px 0;"><?= h($active_map['title']) ?></h2>
        <?php endif; ?>
      </div>
      <div class="flex gap-8">
        <?php if (!$can_edit): ?>
        <div class="alert alert-warn" style="padding:8px 12px;font-size:.8rem;">
          🔒 Muokkausaika päättynyt <?= $active_map['edit_expires_at'] ? date('d.m.Y', strtotime($active_map['edit_expires_at'])) : '' ?>
          – <a href="redeem.php" class="text-gold">Uusi jakso</a>
        </div>
        <?php endif; ?>
      </div>
    </div>

    <!-- Kartta -->
    <div style="flex:0 0 auto;padding:16px 20px 0;position:relative;">
      <div id="map"></div>
      <div id="map-hint-pill" class="map-hint-pill" style="display:none;">
        <span>🎯 Klikkaa karttaa tai siirrä keltaista merkkiä valitaksesi sijainnin</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="cancelAddPlace()" style="padding:2px 8px;font-size:0.75rem;">✕ Sulje</button>
      </div>
    </div>

    <!-- Paikkakohtaiset muistot -->
    <div style="flex:1;overflow-y:auto;padding:16px 20px;" id="memory-panel">
      <div id="memory-placeholder" class="text-muted text-sm" style="padding:20px 0;">
        👆 Valitse paikka vasemmalta tai kartalta nähdäksesi muistot.
      </div>
      <div id="memory-content" style="display:none;">
        <div class="flex items-center justify-between mb-12">
          <h3 id="memory-place-title">Muistot</h3>
          <?php if ($can_edit): ?>
          <button class="btn btn-gold btn-sm" onclick="openAddMemoryModal()">＋ Lisää muisto</button>
          <?php endif; ?>
        </div>
        <div class="memory-timeline" id="memory-list"></div>
      </div>
    </div>

    <?php else: ?>
    <!-- Ei aktiivista karttaa -->
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px;">
      <div style="font-size:4rem;margin-bottom:20px;">🗺️</div>
      <h2>Tervetuloa, <?= h(explode('@', $user['email'] ?? 'käyttäjä')[0]) ?>!</h2>
      <p class="text-muted mt-8" style="max-width:380px;">
        Sinulla ei ole vielä muistokarttoja. Lunasta aktivointikoodi aloittaaksesi.
      </p>
      <a href="redeem.php" class="btn btn-gold btn-lg mt-20">🎁 Lunasta aktivointikoodi</a>
    </div>
    <?php endif; ?>
  </main>

  <!-- Oikea sivupalkki: tiedot ja jakaminen -->
  <?php if ($active_map): ?>
  <aside class="editor-sidebar-right">
    <!-- Elinkaari -->
    <div class="sidebar-section">
      <h4>Elinkaari</h4>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <?php
          $periods = [
            ['🖊', 'Muokkausaika', $active_map['edit_expires_at']],
            ['👁', 'Katseluaika',  $active_map['view_expires_at']],
            ['📦', 'Arkistointiaika', $active_map['archive_until']],
          ];
          foreach ($periods as [$icon, $label, $ts]):
            $past = $ts && strtotime($ts) < time();
        ?>
        <div style="display:flex;align-items:center;gap:8px;font-size:.82rem;">
          <span><?= $icon ?></span>
          <span class="text-muted" style="flex:1;"><?= $label ?></span>
          <span style="color:<?= $past ? 'var(--error)' : 'var(--success)' ?>;font-weight:600;">
            <?= $ts ? date('d.m.Y', strtotime($ts)) : '–' ?>
          </span>
        </div>
        <?php endforeach; ?>
      </div>
      <?php if (!$can_edit): ?>
      <a href="redeem.php" class="btn btn-gold w-full btn-sm mt-12">🔄 Osta uusi muokkausjakso</a>
      <?php endif; ?>
    </div>

    <!-- Jakaminen -->
    <div class="sidebar-section">
      <h4>Jaa perheelle</h4>
      <div id="share-section" class="mt-8">
        <div class="share-code">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:.72rem;color:var(--text2);font-weight:600;">KATSELUKOODI PERHEELLE</span>
            <button type="button" class="btn btn-ghost btn-sm" onclick="copyPin()" title="Kopioi katselukoodi" style="padding:2px 6px;font-size:0.75rem;">📋 Kopioi</button>
          </div>
          <div class="code" id="share-pin-display" style="font-size:1.5rem;letter-spacing:3px;">
            <?= !empty($active_map['view_pin']) ? h($active_map['view_pin']) : '······' ?>
          </div>
          <?php if ($can_edit): ?>
          <button type="button" class="btn btn-outline btn-sm mt-8 w-full" id="btn-toggle-pin" onclick="togglePin()">
            <?= !empty($active_map['view_pin']) ? '🙈 Piilota koodi' : '👁 Näytä koodi' ?>
          </button>
          <?php endif; ?>
        </div>

        <?php if ($active_map['share_token']): ?>
        <div class="mt-12">
          <div class="form-label mb-4">Suora linkki</div>
          <div class="share-link" id="share-link">
            <?= h(APP_BASE_URL . '/viewer.php?token=' . $active_map['share_token']) ?>
          </div>
          <button onclick="copyLink()" class="btn btn-outline btn-sm mt-6 w-full">📋 Kopioi linkki</button>
        </div>
        <?php endif; ?>

        <?php if ($can_edit): ?>
        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border);">
          <button onclick="regeneratePin()" class="btn btn-ghost btn-sm w-full text-muted" style="font-size:0.78rem;">
            🔄 Vaihda katselukoodi (luo uusi)
          </button>
          <div style="font-size:0.68rem;color:var(--text3);text-align:center;margin-top:2px;">
            Vanha koodi lakkaa toimimasta
          </div>
        </div>
        <?php endif; ?>
      </div>
    </div>

    <!-- Tilastot -->
    <div class="sidebar-section">
      <h4>Tilastot</h4>
      <div class="grid-2 mt-8">
        <div class="stat-chip"><div class="value" id="stat-places"><?= count($places) ?></div><div class="label">Paikkaa</div></div>
        <div class="stat-chip"><div class="value" id="stat-memories">–</div><div class="label">Muistoa</div></div>
      </div>
    </div>

    <!-- Tuonti / vienti -->
    <div class="sidebar-section">
      <h4>Tiedot</h4>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <a href="api/export.php?map=<?= urlencode($active_map_id) ?>" class="btn btn-outline btn-sm w-full">⬇️ Vie muistokartta (CSV)</a>
        <?php if ($can_edit): ?>
        <button onclick="openImportModal()" class="btn btn-outline btn-sm w-full">⬆️ Palauta CSV-tiedostosta</button>
        <?php endif; ?>
        <a href="viewer.php?token=<?= urlencode($active_map['share_token'] ?? '') ?>" target="_blank"
           class="btn btn-outline btn-sm w-full">🌐 Avaa katselunäkymä</a>
      </div>
    </div>

    <!-- Kartan asetukset -->
    <?php if ($can_edit): ?>
    <div class="sidebar-section">
      <h4>Asetukset</h4>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button onclick="openMapSettingsModal()" class="btn btn-outline btn-sm w-full">⚙️ Kartan asetukset</button>
        <button onclick="confirmDeleteMap()" class="btn btn-danger btn-sm w-full">🗑 Poista kartta</button>
      </div>
    </div>
    <?php endif; ?>
  </aside>
  <?php endif; ?>

</div><!-- /editor-layout -->

<!-- ══ Modaalit ══════════════════════════════════════════════════════════════ -->

<!-- Lisää paikka -->
<div class="modal-overlay" id="modal-place">
  <div class="modal">
    <div class="modal-title">
      📍 Lisää paikka
      <button class="modal-close" onclick="closePlaceModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Paikan nimi</label>
        <input class="form-control" id="place-name" placeholder="esim. Mummolan päärakennus" required>
      </div>

      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
        <div class="flex items-center justify-between mb-8">
          <span class="form-label mb-0" style="margin-bottom:0;font-weight:600;">Sijainti kartalla</span>
          <button type="button" class="btn btn-outline btn-sm" onclick="startPickingFromMap()" style="border-color:var(--gold);color:var(--gold);font-weight:600;padding:4px 12px;font-size:0.8rem;">
            🎯 Osoita kartalta
          </button>
        </div>
        <div class="grid-2">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.75rem;">Leveysaste (lat)</label>
            <input class="form-control" id="place-lat" type="number" step="0.000001" placeholder="62.2610">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.75rem;">Pituusaste (lng)</label>
            <input class="form-control" id="place-lng" type="number" step="0.000001" placeholder="26.2080">
          </div>
        </div>
        <div class="text-muted text-xs mt-8">
          💡 Vinkki: Voit myös suoraan napsauttaa karttaa milloin tahansa asettaaksesi paikan!
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Kuvaus (valinnainen)</label>
        <textarea class="form-control" id="place-desc" rows="2" placeholder="Lyhyt kuvaus paikasta…"></textarea>
      </div>
    </div>
    <div class="flex gap-8 mt-20">
      <button class="btn btn-outline" onclick="closePlaceModal()">Peruuta</button>
      <button class="btn btn-gold" onclick="savePlace()">💾 Tallenna paikka</button>
    </div>
  </div>
</div>

<!-- Lisää / muokkaa muisto -->
<div class="modal-overlay" id="modal-memory">
  <div class="modal" style="max-width:640px;">
    <div class="modal-title">
      🎞️ <span id="modal-memory-title">Lisää muisto</span>
      <button class="modal-close" onclick="closeModal('modal-memory')">✕</button>
    </div>
    <input type="hidden" id="memory-id">
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Otsikko</label>
        <input class="form-control" id="memory-title" placeholder="esim. Ensimmäinen kesä mummolassa" required>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Vuosi</label>
          <input class="form-control" id="memory-year" type="number" min="1800" max="2100" placeholder="1964">
        </div>
        <div class="form-group">
          <label class="form-label">Mediatyyppi</label>
          <select class="form-control" id="memory-media-type">
            <option value="">Ei mediaa</option>
            <option value="IMAGE">📷 Kuva</option>
            <option value="VIDEO">🎬 Video</option>
            <option value="AUDIO">🎵 Ääni</option>
            <option value="DOCUMENT">📄 Asiakirja</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="media-url-group">
        <label class="form-label">Media-URL</label>
        <input class="form-control" id="memory-media-url" placeholder="https://…">
        <span class="form-hint">Linkki kuvaan, videoon tai äänitallenteeseen (esim. Google Drive, YouTube, Dropbox)</span>
      </div>
      <div class="form-group">
        <label class="form-label">Tarina</label>
        <textarea class="form-control" id="memory-story" rows="5" placeholder="Kerro muiston tarina…"></textarea>
      </div>
    </div>
    <div class="flex gap-8 mt-20">
      <button class="btn btn-outline" onclick="closeModal('modal-memory')">Peruuta</button>
      <button class="btn btn-gold" onclick="saveMemory()">💾 Tallenna muisto</button>
    </div>
  </div>
</div>

<!-- CSV-tuonti -->
<div class="modal-overlay" id="modal-import">
  <div class="modal" style="max-width:600px;">
    <div class="modal-title">
      ⬆️ Palauta muistokartta CSV:stä
      <button class="modal-close" onclick="closeModal('modal-import')">✕</button>
    </div>
    <div id="import-step-upload">
      <p class="text-muted text-sm mb-16">
        Lataa aiemmin viemäsi <code>muistokartta.csv</code>-tiedosto. Editori tarkistaa sisällön ennen tuontia.
      </p>
      <div class="upload-area" id="import-dropzone" onclick="document.getElementById('import-file').click()">
        <div class="icon">📂</div>
        <div class="fw-600">Napsauta tai pudota CSV-tiedosto tähän</div>
        <div class="text-muted text-sm mt-4">schema_version 1.0 – Wonderin muistokartta</div>
      </div>
      <input type="file" id="import-file" accept=".csv,text/csv" style="display:none" onchange="handleImportFile(this)">
    </div>
    <div id="import-step-preview" style="display:none;">
      <div id="import-preview-content"></div>
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label">Tuontitapa</label>
        <select class="form-control" id="import-mode">
          <option value="new">Luo uutena muistokarttana</option>
          <option value="merge">Yhdistä tähän muistokarttaan</option>
        </select>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-outline" onclick="resetImport()">← Takaisin</button>
        <button class="btn btn-gold" onclick="executeImport()">✅ Tuo muistokartta</button>
      </div>
    </div>
  </div>
</div>

<!-- Kartan asetukset -->
<div class="modal-overlay" id="modal-settings">
  <div class="modal">
    <div class="modal-title">
      ⚙️ Kartan asetukset
      <button class="modal-close" onclick="closeModal('modal-settings')">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">Kartan nimi</label>
        <input class="form-control" id="settings-title" value="<?= h($active_map['title'] ?? '') ?>">
      </div>
      <div class="form-group">
        <label class="form-label">Kuvaus</label>
        <textarea class="form-control" id="settings-desc" rows="3"><?= h($active_map['description'] ?? '') ?></textarea>
      </div>
    </div>
    <div class="flex gap-8 mt-20">
      <button class="btn btn-outline" onclick="closeModal('modal-settings')">Peruuta</button>
      <button class="btn btn-gold" onclick="saveMapSettings()">💾 Tallenna</button>
    </div>
  </div>
</div>

<!-- Toast-alue -->
<div id="toast-area"></div>

<!-- ══ JavaScript ══════════════════════════════════════════════════════════════ -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
// ── Globaalit tilat ──────────────────────────────────────────────────────────
const MAP_ID    = <?= json_encode($active_map_id) ?>;
const CAN_EDIT  = <?= $can_edit ? 'true' : 'false' ?>;
const PLACES    = <?= json_encode($places) ?>;

let selectedPlaceId = null;
let leafletMap = null;
let markers    = {};
let tempMarker = null;
let pickMode   = false;

// ── Leaflet-kartta ───────────────────────────────────────────────────────────
<?php if ($active_map): ?>
(function initMap() {
  const center = PLACES.length
    ? [PLACES[0].lat || 62.26, PLACES[0].lng || 26.19]
    : [62.26, 26.19];

  leafletMap = L.map('map', { zoomControl: true }).setView(center, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(leafletMap);

  // Lisää olemassa olevat paikat
  PLACES.forEach(p => addMarker(p));

  // Karttaklikkauksella valitaan sijainti tai aloitetaan uusi paikka
  leafletMap.on('click', e => {
    if (!CAN_EDIT) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (isAddingPlace) {
      updatePlaceCoords(lat, lng);
      setDraggableTempMarker(lat, lng);
    } else {
      openAddPlaceModal(lat, lng);
      toast('Sijainti valittu kartalta. Anna paikalle nimi vasemmalla.', 'info');
    }
  });
})();
<?php endif; ?>

function addMarker(place) {
  if (!place.lat || !place.lng) return;
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:linear-gradient(135deg,#e8b84b,#d4863a);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);">
      <span style="display:block;transform:rotate(45deg);text-align:center;line-height:28px;font-size:.8rem;">📍</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32]
  });
  const marker = L.marker([place.lat, place.lng], { icon })
    .addTo(leafletMap)
    .bindPopup(`<strong>${escHtml(place.title || place.name || 'Paikka')}</strong>`);
  marker.on('click', () => selectPlace(place.id, place.lat, place.lng));
  markers[place.id] = marker;
}

// ── Paikka-valinta ───────────────────────────────────────────────────────────
function selectPlace(id, lat, lng) {
  selectedPlaceId = id;
  document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.place-item[data-id="${id}"]`);
  if (el) el.classList.add('active');
  if (lat && lng && leafletMap) leafletMap.panTo([lat, lng]);
  if (markers[id]) markers[id].openPopup();

  const place = PLACES.find(p => p.id === id);
  if (place) {
    document.getElementById('memory-place-title').textContent = (place.title || place.name || 'Muistot');
    document.getElementById('modal-memory-title') && (document.getElementById('modal-memory-title').textContent = 'Lisää muisto');
  }
  loadMemories(id);
}

// ── Muistojen lataus ─────────────────────────────────────────────────────────
async function loadMemories(placeId) {
  document.getElementById('memory-placeholder').style.display = 'none';
  document.getElementById('memory-content').style.display = 'block';
  document.getElementById('memory-list').innerHTML = '<div class="spinner"></div>';

  const res = await apiGet(`api/memories.php?place_id=${encodeURIComponent(placeId)}`);
  const memories = (res && Array.isArray(res.data)) ? res.data : [];

  // Päivitä tilasto
  document.getElementById('stat-memories').textContent = memories.length;

  if (memories.length === 0) {
    document.getElementById('memory-list').innerHTML =
      `<p class="text-muted text-sm">Ei muistoja tässä paikassa vielä.<br>
       ${CAN_EDIT ? '<button class="btn btn-outline btn-sm mt-8" onclick="openAddMemoryModal()">＋ Lisää ensimmäinen muisto</button>' : ''}</p>`;
    return;
  }

  document.getElementById('memory-list').innerHTML = memories.map(m => renderMemoryCard(m)).join(
    '<div class="timeline-connector"></div>'
  );
}

function renderMemoryCard(m) {
  const title = m.title || m.memory_title || 'Nimetön muisto';
  const year  = m.year || m.memory_year || '';
  const story = m.description || m.story_text || '';

  const mediaHtml = m.media_url ? (() => {
    if (m.media_type === 'IMAGE') return `<img src="${escHtml(m.media_url)}" class="memory-media" alt="${escHtml(title)}" referrerpolicy="no-referrer" loading="lazy">`;
    if (m.media_type === 'VIDEO') return `<a href="${escHtml(m.media_url)}" target="_blank" class="btn btn-outline btn-sm mt-8">▶ Katso video</a>`;
    if (m.media_type === 'AUDIO') return `<audio controls src="${escHtml(m.media_url)}" style="width:100%;margin-top:8px;"></audio>`;
    return `<a href="${escHtml(m.media_url)}" target="_blank" class="btn btn-outline btn-sm mt-8">📄 Avaa</a>`;
  })() : '';

  const actions = CAN_EDIT ? `
    <div class="memory-actions">
      <button class="btn btn-outline btn-sm" onclick="editMemory(${JSON.stringify(m).replace(/"/g,'&quot;')})">✏️ Muokkaa</button>
      <button class="btn btn-danger btn-sm" onclick="deleteMemory('${escHtml(m.id)}')">🗑</button>
    </div>` : '';

  return `<div class="memory-card" id="mem-${escHtml(m.id)}">
    ${year ? `<div class="memory-year">${escHtml(year)}</div>` : ''}
    <div class="memory-title">${escHtml(title)}</div>
    ${story ? `<div class="memory-text">${escHtml(story)}</div>` : ''}
    ${mediaHtml}
    ${actions}
  </div>`;
}

// ── Paikan lisäys ja sijainnin valinta ───────────────────────────────────────
let isAddingPlace = false;

function openAddPlaceModal(lat = null, lng = null) {
  if (!CAN_EDIT) return;

  isAddingPlace = true;
  const panel = document.getElementById('add-place-panel');
  if (panel) panel.style.display = 'block';

  const hint = document.getElementById('map-hint-pill');
  if (hint) hint.style.display = 'flex';

  const nameEl = document.getElementById('sidebar-place-name');
  const descEl = document.getElementById('sidebar-place-desc');
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';

  // Jos koordinaatteja ei annettu, otetaan nykyisen karttanäkymän keskipiste
  if (lat == null || lng == null) {
    if (leafletMap) {
      const c = leafletMap.getCenter();
      lat = c.lat;
      lng = c.lng;
    } else {
      lat = 62.26;
      lng = 26.19;
    }
  }

  updatePlaceCoords(lat, lng);
  setDraggableTempMarker(lat, lng);

  if (leafletMap) {
    leafletMap.getContainer().style.cursor = 'crosshair';
  }

  const sidebar = document.querySelector('.editor-sidebar-left');
  if (sidebar) sidebar.scrollTop = 0;
  if (nameEl) setTimeout(() => nameEl.focus(), 150);
}

function updatePlaceCoords(lat, lng) {
  const fLat = parseFloat(lat);
  const fLng = parseFloat(lng);
  const latStr = fLat.toFixed(5);
  const lngStr = fLng.toFixed(5);

  const latInput = document.getElementById('sidebar-place-lat');
  const lngInput = document.getElementById('sidebar-place-lng');
  const disp = document.getElementById('sidebar-coords-display');

  if (latInput) latInput.value = latStr;
  if (lngInput) lngInput.value = lngStr;
  if (disp) disp.textContent = `${latStr}, ${lngStr}`;
}

function setDraggableTempMarker(lat, lng) {
  if (!leafletMap) return;
  if (tempMarker) leafletMap.removeLayer(tempMarker);

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 0 24px rgba(245,158,11,1);animation:pulse-marker 1.6s infinite;cursor:move;">
      <span style="display:block;transform:rotate(45deg);text-align:center;line-height:30px;font-size:1.05rem;">📍</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });

  tempMarker = L.marker([lat, lng], { icon, draggable: true })
    .addTo(leafletMap)
    .bindTooltip('🎯 Siirrä merkkiä raahaamalla tai napsauta karttaa', { permanent: true, direction: 'top', offset: [0, -32] })
    .openTooltip();

  tempMarker.on('drag', e => {
    const pos = (e && e.target && e.target.getLatLng) ? e.target.getLatLng() : tempMarker.getLatLng();
    if (pos) updatePlaceCoords(pos.lat, pos.lng);
  });
  tempMarker.on('dragend', e => {
    const pos = (e && e.target && e.target.getLatLng) ? e.target.getLatLng() : tempMarker.getLatLng();
    if (pos) updatePlaceCoords(pos.lat, pos.lng);
  });
}

function cancelAddPlace() {
  isAddingPlace = false;
  const panel = document.getElementById('add-place-panel');
  if (panel) panel.style.display = 'none';

  const hint = document.getElementById('map-hint-pill');
  if (hint) hint.style.display = 'none';

  if (tempMarker && leafletMap) {
    leafletMap.removeLayer(tempMarker);
    tempMarker = null;
  }
  if (leafletMap) {
    leafletMap.getContainer().style.cursor = '';
  }
}

async function savePlaceFromSidebar() {
  const nameEl = document.getElementById('sidebar-place-name');
  const latEl  = document.getElementById('sidebar-place-lat');
  const lngEl  = document.getElementById('sidebar-place-lng');
  const descEl = document.getElementById('sidebar-place-desc');

  const name = nameEl ? nameEl.value.trim() : '';
  const lat  = latEl ? parseFloat(latEl.value) : null;
  const lng  = lngEl ? parseFloat(lngEl.value) : null;
  const desc = descEl ? descEl.value.trim() : '';

  if (!name) {
    toast('Anna paikan nimi.', 'error');
    if (nameEl) nameEl.focus();
    return;
  }
  if (!lat || !lng) {
    toast('Valitse sijainti kartalta klikkaamalla tai siirtämällä merkkiä.', 'error');
    return;
  }

  const res = await apiPost('api/places.php', {
    action: 'create', map_id: MAP_ID, name, lat, lng, description: desc
  });

  if (res.ok && res.place) {
    const place = res.place;
    PLACES.push(place);
    addMarker(place);
    appendPlaceToList(place);
    document.getElementById('stat-places').textContent = PLACES.length;
    const emptyMsg = document.getElementById('empty-places-msg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    cancelAddPlace();
    selectPlace(place.id, place.lat, place.lng);
    toast('Paikka lisätty onnistuneesti!', 'success');
  } else {
    toast(res.error || 'Virhe tallennuksessa.', 'error');
  }
}

function appendPlaceToList(p) {
  const list = document.getElementById('place-list');
  const num  = list.querySelectorAll('.place-item').length + 1;
  const el   = document.createElement('div');
  el.className   = 'place-item';
  el.style.position = 'relative';
  el.dataset.id  = p.id;
  el.dataset.lat = p.lat || 0;
  el.dataset.lng = p.lng || 0;
  el.onclick = () => selectPlace(p.id, p.lat, p.lng);
  el.innerHTML = `
    <div class="place-num" style="min-width:22px;height:22px;background:var(--gold);color:#1a1200;font-size:.72rem;font-weight:800;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${num}</div>
    <div style="flex:1;min-width:0;">
      <div class="place-name">${escHtml(p.title||p.name||'Paikka')}</div>
      <div class="place-count text-xs">${escHtml(p.description ? p.description.substr(0,40)+'…' : '')}</div>
    </div>
    ${CAN_EDIT ? `<div class="place-reorder" onclick="event.stopPropagation()" style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;">
      <button class="btn btn-ghost" style="padding:1px 5px;font-size:.7rem;line-height:1;" onclick="reorderPlace('${escHtml(p.id)}','up')">▲</button>
      <button class="btn btn-ghost" style="padding:1px 5px;font-size:.7rem;line-height:1;" onclick="reorderPlace('${escHtml(p.id)}','down')">▼</button>
    </div>` : ''}`;
  list.appendChild(el);
  refreshPlaceNumbers();
}

// Päivitä numeroinnit koko listan mukaan
function refreshPlaceNumbers() {
  document.querySelectorAll('#place-list .place-item').forEach((el, i) => {
    const n = el.querySelector('.place-num');
    if (n) n.textContent = i + 1;
  });
}

async function reorderPlace(id, dir) {
  const res = await apiPost('api/places.php', { action: 'reorder', map_id: MAP_ID, id, direction: dir });
  if (!res.ok) { toast(res.error || 'Järjestystä ei voitu muuttaa.', 'error'); return; }

  // Päivitä PLACES-taulukko ja DOM paikallisesti
  const list = document.getElementById('place-list');
  const items = Array.from(list.querySelectorAll('.place-item'));
  const idx   = items.findIndex(el => el.dataset.id === id);
  if (idx < 0) return;
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return;

  // DOM-vaihto
  if (dir === 'up') {
    list.insertBefore(items[idx], items[swapIdx]);
  } else {
    list.insertBefore(items[swapIdx], items[idx]);
  }
  refreshPlaceNumbers();

  // Päivitä PLACES-muistutus
  const pi = PLACES.findIndex(p => p.id === id);
  if (pi >= 0) {
    const si = dir === 'up' ? pi - 1 : pi + 1;
    if (si >= 0 && si < PLACES.length) {
      [PLACES[pi], PLACES[si]] = [PLACES[si], PLACES[pi]];
    }
  }
}

function openAddMemoryModal() {
  if (!CAN_EDIT || !selectedPlaceId) { toast('Valitse ensin paikka.', 'error'); return; }
  clearForm(['memory-id','memory-title','memory-year','memory-media-url','memory-story']);
  document.getElementById('memory-media-type').value = '';
  document.getElementById('modal-memory-title').textContent = 'Lisää muisto';
  openModal('modal-memory');
}

function editMemory(m) {
  if (!CAN_EDIT) return;
  document.getElementById('memory-id').value           = m.id || '';
  document.getElementById('memory-title').value        = m.title || m.memory_title || '';
  document.getElementById('memory-year').value         = m.year || m.memory_year || '';
  document.getElementById('memory-media-type').value   = m.media_type || '';
  document.getElementById('memory-media-url').value    = m.media_url || '';
  document.getElementById('memory-story').value        = m.description || m.story_text || '';
  document.getElementById('modal-memory-title').textContent = 'Muokkaa muistoa';
  openModal('modal-memory');
}

async function saveMemory() {
  const id    = document.getElementById('memory-id').value;
  const title = document.getElementById('memory-title').value.trim();
  const year  = document.getElementById('memory-year').value;
  let   mtype = document.getElementById('memory-media-type').value;
  let   murl  = document.getElementById('memory-media-url').value.trim();
  const story = document.getElementById('memory-story').value.trim();

  if (!title) { toast('Anna muiston otsikko.', 'error'); return; }
  if (!selectedPlaceId) { toast('Valitse ensin paikka.', 'error'); return; }

  // ── Google Kuvat -jakolinkin automaattinen ratkaisu ─────────────────────────
  if (murl && (murl.includes('photos.app.goo.gl') || murl.includes('photos.google.com'))) {
    toast('🔍 Ratkaistaan Google Kuvat -linkkiä…', 'info');
    const resolveRes = await apiGet(`api/resolve_url.php?url=${encodeURIComponent(murl)}`);
    if (resolveRes && resolveRes.ok && resolveRes.image_url) {
      murl  = resolveRes.image_url;
      mtype = 'IMAGE';
      document.getElementById('memory-media-url').value = murl;
      toast('✅ Google Kuvat -linkki ratkaistu!', 'success');
    } else {
      toast((resolveRes && resolveRes.error) || 'Linkkiä ei voitu ratkaista. Kopioi kuvan suora osoite.', 'error');
      return;
    }
  }

  // ── Automaattinen mediatyypintunnistus ───────────────────────────────────────
  if (murl && !mtype) {
    if (murl.includes('googleusercontent.com') || murl.includes('photos.fife') ||
        murl.includes('lh3.google') || /\.(jpg|jpeg|png|gif|webp|bmp)($|\?)/i.test(murl)) {
      mtype = 'IMAGE';
    } else if (murl.includes('youtube.com') || murl.includes('youtu.be') || /\.(mp4|webm|mov)($|\?)/i.test(murl)) {
      mtype = 'VIDEO';
    } else if (/\.(mp3|wav|ogg|m4a)($|\?)/i.test(murl)) {
      mtype = 'AUDIO';
    }
  }

  const payload = { place_id: selectedPlaceId, title, year: year || null,
                    media_type: mtype || null, media_url: murl || null, description: story };

  const res = id
    ? await apiPost('api/memories.php', { action: 'update', id, ...payload })
    : await apiPost('api/memories.php', { action: 'create', ...payload });

  if (res.ok) {
    closeModal('modal-memory');
    toast(id ? 'Muisto päivitetty!' : 'Muisto lisätty!', 'success');
    loadMemories(selectedPlaceId);
  } else {
    toast(res.error || 'Virhe tallennuksessa.', 'error');
  }
}

async function deleteMemory(id) {
  if (!confirm('Poistetaanko tämä muisto?')) return;
  const res = await apiPost('api/memories.php', { action: 'delete', id });
  if (res.ok) {
    toast('Muisto poistettu.', 'success');
    loadMemories(selectedPlaceId);
  } else toast(res.error || 'Virhe.', 'error');
}

async function saveMapTitle(val) {
  if (!val.trim() || !MAP_ID) return;
  await apiPost('api/maps.php', { action: 'update_title', map_id: MAP_ID, title: val.trim() });
}

function openMapSettingsModal() {
  document.getElementById('settings-title').value = document.getElementById('map-title-input')?.value || '';
  openModal('modal-settings');
}

async function saveMapSettings() {
  const title = document.getElementById('settings-title').value.trim();
  const desc  = document.getElementById('settings-desc').value.trim();
  if (!title) { toast('Anna kartalle nimi.', 'error'); return; }
  const res = await apiPost('api/maps.php', { action: 'update_settings', map_id: MAP_ID, title, description: desc });
  if (res.ok) {
    closeModal('modal-settings');
    toast('Asetukset tallennettu!', 'success');
    if (document.getElementById('map-title-input')) document.getElementById('map-title-input').value = title;
  } else toast(res.error || 'Virhe.', 'error');
}

async function confirmDeleteMap() {
  const name = document.getElementById('settings-title')?.value || 'kartta';
  if (!confirm(`Haluatko varmasti poistaa "${name}"? Tätä ei voi peruuttaa.`)) return;
  const res = await apiPost('api/maps.php', { action: 'delete', map_id: MAP_ID });
  if (res.ok) { toast('Kartta poistettu.', 'success'); setTimeout(() => location.href = 'editor.php', 1200); }
  else toast(res.error || 'Virhe.', 'error');
}

// ── Jakaminen ────────────────────────────────────────────────────────────────
let currentPin = <?= json_encode($active_map['view_pin'] ?? '') ?>;
let pinVisible = Boolean(currentPin);

async function togglePin() {
  const disp = document.getElementById('share-pin-display');
  const btn = document.getElementById('btn-toggle-pin');
  if (!currentPin) {
    if (btn) btn.textContent = 'Haetaan...';
    const res = await apiGet('api/maps.php?action=get_pin&map_id=' + MAP_ID);
    if (res.pin) {
      currentPin = res.pin;
      pinVisible = true;
      if (disp) disp.textContent = currentPin;
      if (btn) btn.textContent = '🙈 Piilota koodi';
    } else {
      toast('Ei voitu hakea katselukoodia.', 'error');
      if (btn) btn.textContent = '👁 Näytä koodi';
    }
    return;
  }

  if (pinVisible) {
    if (disp) disp.textContent = '······';
    pinVisible = false;
    if (btn) btn.textContent = '👁 Näytä koodi';
  } else {
    if (disp) disp.textContent = currentPin;
    pinVisible = true;
    if (btn) btn.textContent = '🙈 Piilota koodi';
  }
}

async function copyPin() {
  if (!currentPin) {
    const res = await apiGet('api/maps.php?action=get_pin&map_id=' + MAP_ID);
    if (res.pin) {
      currentPin = res.pin;
      pinVisible = true;
      const disp = document.getElementById('share-pin-display');
      if (disp) disp.textContent = currentPin;
      const btn = document.getElementById('btn-toggle-pin');
      if (btn) btn.textContent = '🙈 Piilota koodi';
      navigator.clipboard.writeText(currentPin).then(() => toast('Katselukoodi kopioitu!', 'success'));
    } else {
      toast('Katselukoodin nouto epäonnistui.', 'error');
    }
  } else {
    navigator.clipboard.writeText(currentPin).then(() => toast('Katselukoodi kopioitu: ' + currentPin, 'success'));
  }
}

async function regeneratePin() {
  if (!confirm('Haluatko varmasti vaihtaa koodin ja luoda uuden? Vanha katselukoodi lakkaa heti toimimasta perheelle.')) return;
  const res = await apiPost('api/maps.php', { action: 'regenerate_pin', map_id: MAP_ID });
  if (res.ok && res.pin) {
    currentPin = res.pin;
    pinVisible = true;
    const disp = document.getElementById('share-pin-display');
    if (disp) disp.textContent = currentPin;
    const btn = document.getElementById('btn-toggle-pin');
    if (btn) btn.textContent = '🙈 Piilota koodi';
    toast('Uusi katselukoodi luotu: ' + res.pin, 'success');
  } else {
    toast(res.error || 'Virhe luotaessa uutta koodia.', 'error');
  }
}

function copyLink() {
  const link = document.getElementById('share-link')?.textContent?.trim();
  if (link) { navigator.clipboard.writeText(link).then(() => toast('Linkki kopioitu!', 'success')); }
}

// ── CSV-tuonti ───────────────────────────────────────────────────────────────
let importData = null;

function openImportModal() { resetImport(); openModal('modal-import'); }

function resetImport() {
  importData = null;
  document.getElementById('import-step-upload').style.display = '';
  document.getElementById('import-step-preview').style.display = 'none';
  document.getElementById('import-file').value = '';
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      importData = parseCSV(e.target.result);
      showImportPreview(importData);
    } catch(err) {
      toast('CSV-tiedoston lukeminen epäonnistui: ' + err.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  // Yksinkertainen RFC-4180-jäsennin
  const rows = []; let cur = ''; let inQ = false; let cols = [];
  for (let i=0; i<text.length; i++) {
    const c=text[i], n=text[i+1];
    if (inQ) { if(c==='"'&&n==='"'){cur+='"';i++;} else if(c==='"'){inQ=false;} else cur+=c; }
    else if(c==='"'){inQ=true;}
    else if(c===','){cols.push(cur);cur='';}
    else if(c==='\r'&&n==='\n'||c==='\n'){cols.push(cur);rows.push(cols);cols=[];cur='';}
    else cur+=c;
  }
  if(cur||cols.length){cols.push(cur);if(cols.some(v=>v))rows.push(cols);}
  if(rows.length<2)throw new Error('Tiedosto on tyhjä tai vääränmuotoinen.');
  const headers=rows[0].map(h=>h.trim().toLowerCase());
  return rows.slice(1).filter(r=>r.some(v=>v)).map(r=>{
    const obj={};headers.forEach((h,i)=>obj[h]=r[i]?.trim()||'');
    return obj;
  });
}

function showImportPreview(rows) {
  const version = rows[0]?.schema_version || '?';
  const mapTitle = rows[0]?.map_title || '?';
  const places = [...new Set(rows.map(r=>r.place_export_id).filter(Boolean))];
  const mediaCount = rows.filter(r=>r.media_url).length;

  document.getElementById('import-preview-content').innerHTML = `
    <div class="alert alert-info mb-12">
      📋 Löytyi: <strong>${rows.length}</strong> muistoa,
      <strong>${places.length}</strong> paikkaa,
      <strong>${mediaCount}</strong> medialinkkiä<br>
      Kartta: <strong>${escHtml(mapTitle)}</strong> | Schema: ${escHtml(version)}
    </div>
    ${version !== '1.0' ? '<div class="alert alert-warn mb-8">⚠️ Tuntematon schema-versio – tuonti voi epäonnistua.</div>' : ''}`;

  document.getElementById('import-step-upload').style.display = 'none';
  document.getElementById('import-step-preview').style.display = '';
}

async function executeImport() {
  if (!importData) return;
  const mode = document.getElementById('import-mode').value;
  const res = await apiPost('api/import.php', { map_id: MAP_ID, mode, rows: importData });
  if (res.ok) {
    closeModal('modal-import');
    toast(`Tuonti onnistui! ${res.created_places||0} paikkaa, ${res.created_memories||0} muistoa.`, 'success');
    setTimeout(() => location.reload(), 1500);
  } else toast(res.error || 'Tuontivirhe.', 'error');
}

// ── Apufunktiot ──────────────────────────────────────────────────────────────
async function apiGet(path) {
  const cleanPath = path.replace(/^\/+/, '');
  const r = await fetch(cleanPath);
  return r.json().catch(() => ({ ok: false, error: 'Virhe' }));
}
async function apiPost(path, data) {
  const cleanPath = path.replace(/^\/+/, '');
  const r = await fetch(cleanPath, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  return r.json().catch(() => ({ ok: false, error: 'Virhe' }));
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function clearForm(ids) { ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); }

function toast(msg, type='info') {
  const area = document.getElementById('toast-area');
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Sulje modaali ESC:llä tai taustaklikkaamalla
document.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(el=>el.classList.remove('open')); });
document.querySelectorAll('.modal-overlay').forEach(el => el.addEventListener('click', e => { if(e.target===el) el.classList.remove('open'); }));

// Drag-drop tuontialue
const dz = document.getElementById('import-dropzone');
if (dz) {
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) { document.getElementById('import-file').files = e.dataTransfer.files; handleImportFile({files:[file]}); }
  });
}
</script>
</body>
</html>
