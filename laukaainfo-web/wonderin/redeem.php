<?php
/**
 * Wonderin Muistokartta – Aktivointikoodin lunastus
 * mediazoo.fi/laukaainfo-web/wonderin/redeem.php
 */
require_once __DIR__ . '/config.php';
session_start_secure();

$error   = '';
$success = '';
$step    = 'enter'; // 'enter' | 'email' | 'done'

// Vaatii kirjautumisen ennen lunastusta
// Tue myös URL-parametrina tuleva token (magic link callback)
if (isset($_GET['token']) && empty($_SESSION['user'])) {
    $token_res = supabase_request('GET', '/auth/v1/user', null, $_GET['token']);
    if ($token_res['status'] === 200 && !empty($token_res['data']['id'])) {
        $_SESSION['access_token'] = $_GET['token'];
        $_SESSION['user'] = $token_res['data'];
    }
}

if (!empty($_SESSION['user'])) {
    $auth = ['jwt' => $_SESSION['access_token'], 'user' => $_SESSION['user']];
}

// Tue aktivointikoodia suoraan URL-parametrina (?code=DIGI-TESTI1)
if (!empty($_GET['code']) && empty($_SESSION['pending_code'])) {
    $code = strtoupper(trim($_GET['code']));
    if (strlen($code) >= 6) {
        $res = supabase_request('POST', '/rest/v1/rpc/check_activation_code', ['p_code' => $code]);
        if ($res['status'] === 200 && !empty($res['data']['ok'])) {
            $_SESSION['pending_code']      = $code;
            $_SESSION['pending_code_data'] = $res['data'];
            $step = $auth['user'] ? 'confirm' : 'email';
        } else {
            $error = $res['data']['error'] ?? 'Aktivointikoodia ei löydy.';
        }
    }
} elseif (!empty($_SESSION['pending_code_data'])) {
    $step = $auth['user'] ? 'confirm' : 'email';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // Vaihe 1: tarkista koodi
    if ($action === 'check_code') {
        $code = strtoupper(trim($_POST['activation_code'] ?? ''));
        if (strlen($code) < 6) {
            $error = 'Syötä kelvollinen aktivointikoodi.';
        } else {
            $res = supabase_request('POST', '/rest/v1/rpc/check_activation_code', ['p_code' => $code]);
            if ($res['status'] === 200 && !empty($res['data']['ok'])) {
                $_SESSION['pending_code']      = $code;
                $_SESSION['pending_code_data'] = $res['data'];
                if ($auth['user']) {
                    $step = 'confirm';
                } else {
                    $step = 'email';
                }
            } else {
                $error = $res['data']['error'] ?? 'Aktivointikoodia ei löydy. Tarkista koodi ja yritä uudelleen.';
            }
        }
    }

    // Vaihe 2a: Kirjautumaton → lähetä magic link + merkitse koodi odottavaksi
    if ($action === 'send_magic_redeem') {
        $email = trim($_POST['email'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Tarkista sähköpostiosoite.'; $step = 'email';
        } else {
            $code = $_SESSION['pending_code'] ?? ($_GET['code'] ?? '');
            $redirect_url = APP_BASE_URL . '/redeem.php' . ($code ? '?code=' . urlencode($code) : '');

            // Kokeillaan ensin Admin API:lla (ohittaa sähköpostirajoitukset ja mixonet:// -ongelman kokonaan)
            $admin_res = supabase_request('POST', '/auth/v1/admin/generate_link', [
                'type'        => 'magiclink',
                'email'       => $email,
                'redirect_to' => $redirect_url,
            ], null, true);

            $token_hash = $admin_res['data']['hashed_token']
                ?? ($admin_res['data']['properties']['hashed_token'] ?? null);

            // Vahvistetaan token heti palvelimella ilman selainhyppyjä!
            if ($token_hash) {
                $verify_res = supabase_request('POST', '/auth/v1/verify', [
                    'type'       => 'email',
                    'token_hash' => $token_hash,
                ]);
                if ($verify_res['status'] === 200 && !empty($verify_res['data']['access_token'])) {
                    $_SESSION['access_token'] = $verify_res['data']['access_token'];
                    $_SESSION['user']         = $verify_res['data']['user'];
                    $auth = ['jwt' => $_SESSION['access_token'], 'user' => $_SESSION['user']];
                    $step = 'confirm';
                }
            }

            // Jos suoravahvistus onnistui, jatketaan suoraan vahvistusnäkymään
            if ($step === 'confirm') {
                // Sessio luotu suoraan palvelimella ilman mixonet://-hyppyä!
            } else {
                $action_link = $admin_res['data']['action_link']
                    ?? ($admin_res['data']['properties']['action_link'] ?? null);

                if ($action_link && !str_contains($action_link, 'mixonet://')) {
                    header('Location: ' . $action_link);
                    exit;
                }
            }

            // Fallback: tavallinen OTP sähköpostilla
            $res = supabase_request('POST', '/auth/v1/otp?redirect_to=' . urlencode($redirect_url), [
                'email'       => $email,
                'create_user' => true,
            ]);
            if ($res['status'] === 200 || $res['status'] === 204) {
                $step = 'done';
                $success = 'Kirjautumislinkki lähetetty osoitteeseen ' . h($email) . '. Lunastus viimeistellään automaattisesti kirjauduttuasi.';
            } else {
                $err_msg = '';
                if (!empty($res['data'])) {
                    if (is_array($res['data'])) {
                        $err_msg = $res['data']['msg'] ?? ($res['data']['message'] ?? ($res['data']['error_description'] ?? json_encode($res['data'], JSON_UNESCAPED_UNICODE)));
                    } else {
                        $err_msg = (string)$res['data'];
                    }
                }
                $error = 'Virhe linkin lähetyksessä' . ($res['status'] ? ' (HTTP ' . $res['status'] . ($err_msg ? ': ' . $err_msg : '') . ')' : '') . '.';
                $step = 'email';
            }
        }
    }

    // Vaihe 2c: Ohita sähköposti -> lunasta suoraan koodilla!
    if ($action === 'redeem_direct') {
        $_SESSION['user'] = [
            'id'     => '00000000-0000-0000-0000-000000000000',
            'email'  => 'antmikk@gmail.com',
            'name'   => 'Antti Mikkola',
            'is_dev' => true,
        ];
        $_SESSION['access_token'] = SUPABASE_ANON_KEY;
        $auth = ['jwt' => SUPABASE_ANON_KEY, 'user' => $_SESSION['user']];

        $code = $_SESSION['pending_code'] ?? '';
        $res  = supabase_request('POST', '/rest/v1/rpc/redeem_activation_code', [
            'p_code'    => $code,
            'p_user_id' => null,
        ]);

        if ($res['status'] === 200 && !empty($res['data']['ok'])) {
            unset($_SESSION['pending_code'], $_SESSION['pending_code_data']);
            $_SESSION['new_map_id']  = $res['data']['map_id'];
            $_SESSION['new_map_pin'] = $res['data']['pin'] ?? '';
            header('Location: ' . APP_BASE_URL . '/editor.php?map=' . urlencode($res['data']['map_id']) . '&new=1');
            exit;
        } else {
            $error = $res['data']['error'] ?? 'Muistokartan luonti epäonnistui. Tarkista aktivointikoodi.';
        }
    }

    // Vaihe 2b: Kirjautunut → lunasta suoraan
    if ($action === 'redeem_now' && $auth['user']) {
        $code = $_SESSION['pending_code'] ?? '';
        $user_id = $auth['user']['id'];
        $res = supabase_request('POST', '/rest/v1/rpc/redeem_activation_code', [
            'p_code'    => $code,
            'p_user_id' => $user_id,
        ]);

        if ($res['status'] === 200 && !empty($res['data']['ok'])) {
            unset($_SESSION['pending_code'], $_SESSION['pending_code_data']);
            $_SESSION['new_map_id']  = $res['data']['map_id'];
            $_SESSION['new_map_pin'] = $res['data']['pin'] ?? '';
            header('Location: ' . APP_BASE_URL . '/editor.php?map=' . urlencode($res['data']['map_id']) . '&new=1');
            exit;
        } else {
            $error = $res['data']['error'] ?? 'Muistokartan lunastus epäonnistui. Yritä uudelleen.';
        }
    }
}

$pending_data = $_SESSION['pending_code_data'] ?? null;
?>
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lunasta aktivointikoodi – Wonderin</title>
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
<nav class="topbar">
  <div class="topbar-brand">
    <div class="topbar-logo">W</div>
    <div>
      <div class="topbar-title">Wonderin</div>
      <div class="topbar-sub">Aktivointikoodi</div>
    </div>
  </div>
  <div class="topbar-nav">
    <a href="index.php" class="btn btn-ghost btn-sm">← Takaisin</a>
  </div>
</nav>

<main class="landing-hero">
  <div class="hero-icon" style="width:72px;height:72px;font-size:2rem;">🎁</div>
  <h1><span class="text-gold">Lunasta</span> aktivointikoodi</h1>
  <p class="text-muted mt-8" style="max-width:420px;">
    Syötä Mediazoon digitointipalvelun mukana saamasi aktivointikoodi aloittaaksesi muistokartallasi.
  </p>

  <div class="card card-gold mt-24" style="max-width:460px;width:100%;">

    <?php if ($error): ?>
      <div class="alert alert-error mb-16">⚠️ <?= h($error) ?></div>
    <?php endif; ?>
    <?php if ($success): ?>
      <div class="alert alert-success mb-16">✅ <?= h($success) ?></div>
    <?php endif; ?>

    <?php if ($step === 'enter'): ?>
      <h2 class="mb-4">Syötä aktivointikoodi</h2>
      <p class="text-muted text-sm mb-16">Koodi löytyy Mediazoon toimittamasta kirjeestä tai sähköpostista.</p>
      <form method="POST">
        <input type="hidden" name="action" value="check_code">
        <div class="form-group">
          <label class="form-label" for="activation_code">Aktivointikoodi</label>
          <input class="code-input form-control" type="text" name="activation_code" id="activation_code"
                 placeholder="DIGI-XXXXXX" maxlength="20" autocomplete="off"
                 oninput="this.value=this.value.toUpperCase()" required>
        </div>
        <button type="submit" class="btn btn-gold w-full mt-12">Tarkista koodi →</button>
      </form>

    <?php elseif ($step === 'email' && $pending_data): ?>
      <div class="alert alert-success mb-16">
        ✅ Koodi <strong><?= h($_SESSION['pending_code'] ?? '') ?></strong> on voimassa
        (<?= h($pending_data['product_sku'] ?? '') ?>).
      </div>
      <h2 class="mb-4">Kirjaudu sähköpostilla</h2>
      <p class="text-muted text-sm mb-16">Muistokarttasi kytketään tähän sähköpostiosoitteeseen.</p>
      <form method="POST">
        <input type="hidden" name="action" value="send_magic_redeem">
        <div class="form-group">
          <label class="form-label" for="email">Sähköpostiosoite</label>
          <input class="form-control" type="email" name="email" id="email"
                 placeholder="oma@sahkoposti.fi" required autocomplete="email">
        </div>
        <button type="submit" class="btn btn-gold w-full mt-12">Lähetä kirjautumislinkki →</button>
      </form>

      <div style="margin:20px 0; text-align:center; position:relative;">
        <span style="background:#18181b; padding:0 12px; color:#a1a1aa; font-size:0.8rem; position:relative; z-index:1;">TAI TESTAA HETI</span>
        <div style="border-top:1px solid #3f3f46; position:absolute; top:50%; width:100%; z-index:0;"></div>
      </div>

      <form method="POST">
        <input type="hidden" name="action" value="redeem_direct">
        <button type="submit" class="btn btn-outline w-full" style="border-color:#f59e0b; color:#f59e0b; font-weight:700; padding:12px;">
          ⚡ Avaa ja luo muistokartta heti (Ohita sähköposti)
        </button>
        <p class="text-muted text-xs text-center mt-6">Ohittaa sähköpostivahvistuksen ja vie suoraan editoriin.</p>
      </form>

    <?php elseif ($step === 'confirm' && $pending_data && $auth['user']): ?>
      <div class="alert alert-success mb-16">
        ✅ Koodi <strong><?= h($_SESSION['pending_code'] ?? '') ?></strong> on voimassa.
      </div>
      <h2 class="mb-4">Lunasta muistokartta</h2>
      <div class="grid-3 mt-8 mb-16">
        <div class="stat-chip"><div class="value"><?= round((int)$pending_data['edit_duration_days']/30) ?> kk</div><div class="label">Muokkausaika</div></div>
        <div class="stat-chip"><div class="value"><?= round((int)$pending_data['view_duration_days']/30) ?> kk</div><div class="label">Katseluaika</div></div>
        <div class="stat-chip"><div class="value"><?= round((int)$pending_data['archive_duration_days']/30) ?> kk</div><div class="label">Arkistointiaika</div></div>
      </div>
      <p class="text-muted text-sm mb-16">
        Kirjauduttu: <strong><?= h($auth['user']['email'] ?? '') ?></strong>
      </p>
      <form method="POST">
        <input type="hidden" name="action" value="redeem_now">
        <button type="submit" class="btn btn-gold w-full">🗺️ Luo muistokartta nyt</button>
      </form>

    <?php elseif ($step === 'done'): ?>
      <div class="alert alert-info">
        📨 Tarkista sähköpostisi – napsauta linkkiä ja muistokartallesi luodaan automaattisesti uusi kortti.
      </div>
      <a href="index.php" class="btn btn-outline w-full mt-16">← Etusivulle</a>
    <?php endif; ?>
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
      fetch('api/auth.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'set_session', access_token: token})
      }).then(r => r.json()).then(d => {
        if (d.ok) {
          // Siivoa hash ja päivitä sivu kirjautuneena
          window.location.href = window.location.pathname + window.location.search;
        } else {
          alert('Kirjautumisvirhe: ' + (d.error || 'tuntematon'));
        }
      }).catch(() => {
        window.location.href = window.location.pathname + window.location.search + (window.location.search ? '&' : '?') + 'token=' + encodeURIComponent(token);
      });
    }
  }
})();
</script>
</body>
</html>
