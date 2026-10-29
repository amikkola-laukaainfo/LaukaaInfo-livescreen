<?php
/**
 * Wonderin API – URL-resolver
 * Hakee jakolinkin takaa suoran kuva-URL:n (og:image) – esim. Google Kuvat -jakolinkit.
 * GET /api/resolve_url.php?url=<encoded-url>
 */
require_once dirname(__DIR__) . '/config.php';
session_start_secure();

// Kirjautuminen vaaditaan (estetään väärinkäyttö)
$auth = ['jwt' => get_session_jwt(), 'user' => get_session_user()];
if (!$auth['jwt']) {
    json_response(['ok' => false, 'error' => 'Kirjautuminen vaaditaan.'], 401);
}

$url = trim($_GET['url'] ?? '');
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    json_response(['ok' => false, 'error' => 'Virheellinen URL.'], 400);
}

// Salli vain https
if (!str_starts_with($url, 'https://')) {
    json_response(['ok' => false, 'error' => 'Vain HTTPS-osoitteet sallittuja.'], 400);
}

// Hae sivu seuraten uudelleenohjausta
$ctx = stream_context_create([
    'http' => [
        'method'          => 'GET',
        'header'          => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml',
            'Accept-Language: fi,en;q=0.8',
        ]),
        'follow_location' => 1,
        'max_redirects'   => 6,
        'timeout'         => 10,
        'ignore_errors'   => true,
    ],
    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
]);

$html = @file_get_contents($url, false, $ctx);

if (!$html) {
    json_response(['ok' => false, 'error' => 'URL ei ole saavutettavissa.'], 502);
}

// Etsi og:image (kaksi muotoa attribuuttijärjestyksen mukaan)
$image_url = null;
if (preg_match('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](https?[^"\']+)["\']/i', $html, $m)) {
    $image_url = html_entity_decode($m[1], ENT_QUOTES);
} elseif (preg_match('/<meta[^>]+content=["\'](https?[^"\']+)["\'][^>]+property=["\']og:image["\']/i', $html, $m)) {
    $image_url = html_entity_decode($m[1], ENT_QUOTES);
}

// Varajärjestelmä: twitter:image
if (!$image_url && preg_match('/<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\'](https?[^"\']+)["\']/i', $html, $m)) {
    $image_url = html_entity_decode($m[1], ENT_QUOTES);
}

if ($image_url) {
    // Siisti Google Kuvat -URL (poista \u003d-tyyppiset entiteetit)
    $image_url = preg_replace('/=w\d+-h\d+-[a-z-]+$/', '=w1200-h800-s-no', $image_url);
    json_response(['ok' => true, 'image_url' => $image_url]);
}

json_response(['ok' => false, 'error' => 'Suoraa kuvaa ei löydy tästä linkistä. Kopioi kuvan suora osoite Google Kuvista.'], 404);
