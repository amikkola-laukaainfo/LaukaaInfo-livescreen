<?php
/**
 * Wonderin Muistokartta – Kirjautuminen & Aktivointikoodi
 * mediazoo.fi/laukaainfo-web/wonderin/index.php
 */
require_once __DIR__ . '/config.php';
session_start_secure();

// Jos jo kirjautunut, ohjaa editoriin
if (!empty($_SESSION['user'])) {
    header('Location: ' . APP_BASE_URL . '/editor.php');
    exit;
}

$error = '';
$info  = '';
$step  = 'start'; // 'start' | 'magic_sent'

// ── POST: Lähetä magic link ──────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'magic_link') {
        $email = trim($_POST['email'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Tarkista sähköpostiosoite.';
        } else {
            // Lähetä magic link Supabasen kautta
            $redirect_url = APP_BASE_URL . '/index.php';

            // Kokeillaan ensin Admin API:lla (ohittaa sähköpostirajoitukset ja mixonet:// -ongelman kokonaan)
            $admin_res = supabase_request('POST', '/auth/v1/admin/generate_link', [
                'type'        => 'magiclink',
                'email'       => $email,
                'redirect_to' => $redirect_url,
            ], null, true);

            $token_hash = $admin_res['data']['hashed_token']
                ?? ($admin_res['data']['properties']['hashed_token'] ?? null);

            if ($token_hash) {
                $verify_res = supabase_request('POST', '/auth/v1/verify', [
                    'type'       => 'email',
                    'token_hash' => $token_hash,
                ]);
                if ($verify_res['status'] === 200 && !empty($verify_res['data']['access_token'])) {
                    $_SESSION['access_token'] = $verify_res['data']['access_token'];
                    $_SESSION['user']         = $verify_res['data']['user'];
                    header('Location: ' . APP_BASE_URL . '/editor.php');
                    exit;
                }
            }

            $action_link = $admin_res['data']['action_link']
                ?? ($admin_res['data']['properties']['action_link'] ?? null);

            if ($action_link && !str_contains($action_link, 'mixonet://')) {
                header('Location: ' . $action_link);
                exit;
            }

            // Fallback: tavallinen OTP sähköpostilla
            $res = supabase_request('POST', '/auth/v1/otp?redirect_to=' . urlencode($redirect_url), [
                'email'       => $email,
                'create_user' => true,
            ]);
            if ($res['status'] === 200 || $res['status'] === 204) {
                $step = 'magic_sent';
                $info = 'Kirjautumislinkki lähetetty osoitteeseen ' . htmlspecialchars($email, ENT_QUOTES) . '. Tarkista sähköpostisi.';
            } else {
                $err_msg = '';
                if (!empty($res['data'])) {
                    if (is_array($res['data'])) {
                        $err_msg = $res['data']['msg'] ?? ($res['data']['message'] ?? ($res['data']['error_description'] ?? json_encode($res['data'], JSON_UNESCAPED_UNICODE)));
                    } else {
                        $err_msg = (string)$res['data'];
                    }
                }
                $error = 'Virhe linkin lähetyksessä' . ($res['status'] ? ' (HTTP ' . $res['status'] . ($err_msg ? ': ' . $err_msg : '') . ')' : '') . '. Yritä uudelleen.';
            }
        }
    }

    // Aktivointikoodi (katselu-PIN-koodilla suoraan katselijaksi)
    if ($action === 'viewer_pin') {
        $pin = strtoupper(trim($_POST['pin'] ?? ''));
        // Etsi kartta view_pin_hash-arvon perusteella (SHA-256)
        $pin_hash = hash('sha256', $pin);
        $res = supabase_request('GET',
            '/rest/v1/routes?view_pin_hash=eq.' . urlencode($pin_hash)
            . '&experience_type=eq.MEMORY&select=id,title,share_token,view_expires_at',
            null, null, true
        );
        if ($res['status'] === 200 && !empty($res['data'])) {
            $map = $res['data'][0];
            $_SESSION['viewer_token'] = $pin;
            $_SESSION['viewer_map_id'] = $map['id'];
            header('Location: ' . APP_BASE_URL . '/viewer.php?id=' . urlencode($map['id']));
            exit;
        } else {
            $error = 'Katselukoodi ei löydy tai se on vanhentunut.';
        }
    }
}

// ── Käsittele magic link callback (token URL:ssa) ─────────────────────────
$auth_message = $_GET['auth'] ?? '';
if ($auth_message === 'required') $error = 'Kirjaudu sisään jatkaaksesi.';
?>
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wonderin – Muistokartta</title>
  <meta name="description" content="Luo henkilökohtainen muistokartta perheesi tarinoista. Wonderin Muistokartta-palvelu Mediazoon digitointipalveluiden rinnalla.">
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>

<!-- Topbar -->
<nav class="topbar">
  <div class="topbar-brand">
    <div class="topbar-logo">W</div>
    <div>
      <div class="topbar-title">Wonderin</div>
      <div class="topbar-sub">Henkilökohtaiset muistokartat</div>
    </div>
  </div>
  <div class="topbar-nav">
    <a href="viewer.php" class="btn btn-outline btn-sm">🔍 Katselukoodi</a>
  </div>
</nav>

<!-- Landing hero -->
<main class="landing-hero">
  <div class="hero-icon">🗺️</div>

  <h1 style="max-width:600px;">
    <span class="text-gold">Perheesi muistot</span><br>kartalla – ikuisesti
  </h1>
  <p class="text-muted mt-8" style="max-width:480px; font-size:1.05rem;">
    Rakenna digitaalinen muistokartta, johon yhdistyvät vanhat valokuvat, kaitafilmit,
    äänitteet ja tarinat – paikkoihin sidottuna.
  </p>

  <div class="card card-gold mt-24" style="max-width:460px; width:100%;">

    <?php if ($step === 'magic_sent'): ?>
      <div class="alert alert-success">
        <span>✉️</span>
        <div><?= $info ?></div>
      </div>
      <p class="text-muted text-sm mt-12">
        Napsauta sähköpostissa olevaa linkkiä – sinut ohjataan automaattisesti muistokartallesi.
      </p>
      <div class="mt-16">
        <a href="index.php" class="btn btn-outline w-full">← Palaa</a>
      </div>

    <?php else: ?>

      <?php if ($error): ?>
        <div class="alert alert-error mb-16">⚠️ <?= h($error) ?></div>
      <?php endif; ?>

      <!-- Kirjautuminen omistajana -->
      <h2 class="mb-4">Kirjaudu muistokartallesi</h2>
      <p class="text-muted text-sm mb-16">Saat kirjautumislinkin sähköpostiisi – ei salasanaa tarvita.</p>

      <form method="POST" action="index.php" id="form-magic">
        <input type="hidden" name="action" value="magic_link">
        <div class="form-group">
          <label class="form-label" for="email">Sähköpostiosoite</label>
          <input class="form-control" type="email" name="email" id="email"
                 placeholder="oma@sahkoposti.fi" required autocomplete="email">
        </div>
        <button type="submit" class="btn btn-gold w-full mt-12" id="btn-magic">
          📨 Lähetä kirjautumislinkki
        </button>
      </form>

      <div class="divider"></div>

      <!-- Katselukoodi -->
      <h3 class="mb-4">Sinulle on jaettu muistokartta?</h3>
      <p class="text-muted text-sm mb-12">Syötä 6-merkkinen katselukoodi, jonka sait omistajalta.</p>
      <form method="POST" action="index.php" id="form-pin">
        <input type="hidden" name="action" value="viewer_pin">
        <div class="form-group">
          <label class="form-label" for="pin">Katselukoodi</label>
          <input class="code-input form-control" type="text" name="pin" id="pin"
                 placeholder="MUMMO7" maxlength="6" autocomplete="off"
                 oninput="this.value=this.value.toUpperCase()">
        </div>
        <button type="submit" class="btn btn-outline w-full mt-10">
          👁 Avaa muistokartta
        </button>
      </form>

    <?php endif; ?>
  </div>

  <!-- Aktivointikoodin lunastus -->
  <div class="card mt-16" style="max-width:460px; width:100%; text-align:center;">
    <p class="text-muted text-sm">
      Oletko ostanut Mediazoon digitointipalvelun?
      <a href="redeem.php" class="text-gold">Lunasta aktivointikoodi →</a>
    </p>
  </div>

  <!-- Ominaisuudet -->
  <div class="grid-3 mt-32" style="max-width:860px; width:100%;">
    <div class="card" style="text-align:center;">
      <div style="font-size:2rem; margin-bottom:10px;">📍</div>
      <h4>Paikkoihin sidottu</h4>
      <p class="text-muted text-sm mt-4">Kiinnitä muistot kartalle – talvisodan mökki, mummon synnyinkoti, häiden kirkko.</p>
    </div>
    <div class="card" style="text-align:center;">
      <div style="font-size:2rem; margin-bottom:10px;">🎞️</div>
      <h4>Multimedia</h4>
      <p class="text-muted text-sm mt-4">Kuvat, videot, äänitteet ja kaitafilmit – kaikki samassa paikassa.</p>
    </div>
    <div class="card" style="text-align:center;">
      <div style="font-size:2rem; margin-bottom:10px;">👨‍👩‍👧‍👦</div>
      <h4>Jaa perheelle</h4>
      <p class="text-muted text-sm mt-4">Lähetä katselukoodi sisaruksille – ei rekisteröitymistä, vain suora pääsy.</p>
    </div>
  </div>
</main>

<script>
// Käsittele Supabase magic link callback (#access_token=...)
(function() {
  const hash = window.location.hash;
  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('access_token');
    const type  = params.get('type');
    if (token && (type === 'magiclink' || type === 'signup' || type === 'recovery')) {
      // Lähetä token PHP:lle session-tallennusta varten
      fetch('api/auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'set_session', access_token: token})
      }).then(r => r.json()).then(d => {
        if (d.ok) window.location.href = 'editor.php';
        else {
          document.body.innerHTML = '<div style="text-align:center;padding:40px;color:#f87171;">Kirjautumisvirhe: ' + (d.error||'tuntematon') + '</div>';
        }
      }).catch(() => {
        window.location.href = 'editor.php?token=' + encodeURIComponent(token);
      });
    }
  }
})();
</script>
</body>
</html>
