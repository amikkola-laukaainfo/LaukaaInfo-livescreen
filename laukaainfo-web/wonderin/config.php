<?php
/**
 * Wonderin Muistokartta-editori – Supabase-konfiguraatio
 * mediazoo.fi/laukaainfo-web/wonderin/
 */

define('SUPABASE_URL',      'https://duxluwyqxvbmkkjzuzkz.supabase.co');
define('SUPABASE_ANON_KEY', 'sb_publishable_HgfWyipuSO7gvsVUR1smNQ_aXox2OPu');
// 🔒 Tietoturvallinen arkkitehtuuri:
// service_role-avainta EI tarvita eikä tallenneta palvelimelle lainkaan.
// Koodien tarkistus ja lunastus hoidetaan Supabasen RPC-tietokantafunktion (SECURITY DEFINER) kautta.
// Kaikki pyynnöt kulkevat julkisen SUPABASE_ANON_KEY:n tai kirjautuneen käyttäjän JWT-tokenin kautta.

$is_https = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
$proto = $is_https ? 'https' : 'http';
$host  = $_SERVER['HTTP_HOST'] ?? 'mediazoo.fi';

$script_path = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
if (preg_match('#^(.*?/wonderin)#', $script_path, $m)) {
    $base_path = $m[1];
} else {
    $base_path = '/laukaainfo-web/wonderin';
}
define('APP_BASE_URL', getenv('APP_BASE_URL') ?: ($proto . '://' . $host . $base_path));

define('SESSION_COOKIE', 'wonderin_session');
define('SESSION_LIFETIME', 60 * 60 * 24 * 7); // 7 päivää

// ── Supabase REST-apupyyntö ──────────────────────────────────────────────────

/**
 * @param string $method   GET | POST | PATCH | DELETE
 * @param string $path     esim. "/rest/v1/routes?select=*"
 * @param array|null $body JSON-runko
 * @param string|null $jwt Bearer-token (null = anon)
 * @param bool $service    (valinnainen / taaksepäinyhteensopivuus, käyttää aina anon-avainta)
 * @return array ['status' => int, 'data' => mixed]
 */
function supabase_request(string $method, string $path, ?array $body = null, ?string $jwt = null, bool $service = false): array {
    $url = SUPABASE_URL . $path;
    $key = SUPABASE_ANON_KEY;

    $headers = [
        'apikey: ' . $key,
        'Content-Type: application/json',
        'Accept: application/json',
        'Prefer: return=representation',
    ];
    if ($jwt) {
        $headers[] = 'Authorization: Bearer ' . $jwt;
    } else {
        $headers[] = 'Authorization: Bearer ' . $key;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => strtoupper($method),
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $raw    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $data = json_decode($raw, true);
    return ['status' => $status, 'data' => $data ?? $raw];
}

// ── Sessio ───────────────────────────────────────────────────────────────────

function session_start_secure(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => SESSION_LIFETIME,
            'path'     => '/',
            'secure'   => isset($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function get_session_jwt(): ?string {
    session_start_secure();
    return $_SESSION['access_token'] ?? null;
}

function get_session_user(): ?array {
    session_start_secure();
    return $_SESSION['user'] ?? null;
}

function require_auth(): array {
    $jwt  = get_session_jwt();
    $user = get_session_user();
    if (!$jwt || !$user) {
        header('Location: ' . APP_BASE_URL . '/index.php?auth=required');
        exit;
    }
    return ['jwt' => $jwt, 'user' => $user];
}

// ── JSON-vastaus ─────────────────────────────────────────────────────────────

function json_response(mixed $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Apufunktiot ──────────────────────────────────────────────────────────────

function h(mixed $v): string {
    return htmlspecialchars((string)($v ?? ''), ENT_QUOTES, 'UTF-8');
}

function generate_share_token(int $len = 32): string {
    return bin2hex(random_bytes($len));
}

function generate_pin(int $len = 6): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $pin   = '';
    for ($i = 0; $i < $len; $i++) {
        $pin .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $pin;
}

/**
 * Laskee muistokartan tilan aikaleimojen perusteella.
 * @return 'EDITABLE'|'VIEW_ONLY'|'ARCHIVED'|'PENDING_DELETION'|'PURGED'|'DRAFT'
 */
function map_state(?string $edit_expires_at, ?string $view_expires_at, ?string $archive_until): string {
    if (!$edit_expires_at) return 'DRAFT';
    $now = time();
    $edit   = strtotime($edit_expires_at);
    $view   = $view_expires_at   ? strtotime($view_expires_at)   : 0;
    $arc    = $archive_until     ? strtotime($archive_until)     : 0;

    if ($now <= $edit)                   return 'EDITABLE';
    if ($view && $now <= $view)          return 'VIEW_ONLY';
    if ($arc  && $now <= $arc)           return 'ARCHIVED';
    if ($arc  && $now <= $arc + 30*86400) return 'PENDING_DELETION';
    return 'PURGED';
}
