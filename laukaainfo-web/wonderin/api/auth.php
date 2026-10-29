<?php
/**
 * Wonderin API – Auth (session-hallinta)
 * /api/auth.php
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

// ── Logout ────────────────────────────────────────────────────────────────────
if (($_GET['action'] ?? '') === 'logout') {
    session_destroy();
    setcookie(session_name(), '', time() - 3600, '/', '', isset($_SERVER['HTTPS']), true);
    header('Location: ' . APP_BASE_URL . '/index.php');
    exit;
}

// ── API-pyynnöt ────────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $body['action'] ?? ($_GET['action'] ?? '');

// set_session: magic link callback asettaa JWT:n sessio-talteen
if ($action === 'set_session') {
    $token = $body['access_token'] ?? '';
    if (!$token) json_response(['ok' => false, 'error' => 'No token'], 400);

    // Tarkista token Supabasessa
    $user_res = supabase_request('GET', '/auth/v1/user', null, $token);
    if ($user_res['status'] !== 200 || empty($user_res['data']['id'])) {
        json_response(['ok' => false, 'error' => 'Invalid token'], 401);
    }

    $_SESSION['access_token'] = $token;
    $_SESSION['user']         = $user_res['data'];
    json_response(['ok' => true, 'user' => ['email' => $user_res['data']['email']]]);
}

// get_session: palauta istunnon käyttäjätiedot
if ($action === 'get_session') {
    $user = get_session_user();
    if (!$user) json_response(['ok' => false, 'error' => 'Not authenticated'], 401);
    json_response(['ok' => true, 'user' => ['id' => $user['id'], 'email' => $user['email']]]);
}

json_response(['ok' => false, 'error' => 'Unknown action'], 400);
