<?php
/**
 * kohtaamiset_api.php – Anonyymi viestijärjestelmä
 * Sijoita: https://mediazoo.fi/laukaainfo-web/kohtaamiset_api.php
 *
 * Toiminnot:
 *   POST ?action=start_conversation  – Luo keskustelu + ensimmäinen viesti
 *   POST ?action=reply               – Vastaa ketjuun (vaatii tokenin)
 *   GET  ?action=get_thread          – Palauttaa viestiketjun (vaatii tokenin)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ============================================================
// KONFIGURAATIO
// ============================================================
define('SUPABASE_URL', 'https://usswojtlvrnqtzwnffpg.supabase.co');
// Hae Supabase-konsolista: Settings → API → service_role (salainen, vain palvelimella!)
define('SUPABASE_SERVICE_KEY', 'TÄHÄN_SERVICE_ROLE_KEY');
define('BASE_URL', 'https://laukaainfo.fi');
define('FROM_EMAIL', 'noreply@laukaainfo.fi');

// ============================================================
// REITITYS
// ============================================================
$action = $_GET['action'] ?? $_POST['action'] ?? '';
switch ($action) {
    case 'start_conversation': requireMethod('POST'); handleStartConversation(); break;
    case 'reply':              requireMethod('POST'); handleReply();             break;
    case 'get_thread':         requireMethod('GET');  handleGetThread();         break;
    case 'report':             requireMethod('POST'); handleReport();            break;
    case 'resolve':            requireMethod('POST'); handleResolve();           break;
    default: jsonError('Tuntematon toiminto', 400);
}

// ============================================================
// TOIMINTO 1: Aloita uusi keskustelu
// ============================================================
function handleStartConversation() {
    // Honeypot – botti on täyttänyt kentän
    if (!empty($_POST['website'])) {
        jsonSuccess(['message' => 'Kiitos viestistäsi!']); // hiljainen hylkäys
    }

    $encounter_id = trim($_POST['encounter_id'] ?? '');
    $sender_name  = trim($_POST['sender_name']  ?? '');
    $sender_email = trim($_POST['sender_email'] ?? '');
    $msg_body     = trim($_POST['message_body'] ?? '');

    if (!$encounter_id || !$sender_name || !$sender_email || !$msg_body)
        jsonError('Kaikki kentät ovat pakollisia');
    if (!filter_var($sender_email, FILTER_VALIDATE_EMAIL))
        jsonError('Virheellinen sähköpostiosoite');
    if (!isValidUuid($encounter_id))
        jsonError('Virheellinen ilmoitustunniste');
    if (mb_strlen($msg_body) > 1000)
        jsonError('Viesti on liian pitkä (max 1000 merkkiä)');

    // Hae ilmoitus
    $encs = sbGet('/rest/v1/encounters?id=eq.' . urlencode($encounter_id)
        . '&status=eq.active&select=id,title,type,contact_email&limit=1');
    if (empty($encs)) jsonError('Ilmoitusta ei löytynyt tai se on vanhentunut');
    $enc = $encs[0];

    if (strtolower($enc['contact_email']) === strtolower($sender_email))
        jsonError('Et voi lähettää viestiä omaan ilmoitukseesi');

    // Rate limit: max 5 uutta keskustelua / encounter / tunti
    $recent = sbGet('/rest/v1/conversations?encounter_id=eq.' . urlencode($encounter_id)
        . '&created_at=gte.' . urlencode(date('c', strtotime('-1 hour')))
        . '&select=id');
    if (count($recent) >= 5)
        jsonError('Tähän ilmoitukseen on tullut liikaa yhteydenottoja. Yritä myöhemmin.');

    // Luo conversation
    $convData = sbPost('/rest/v1/conversations', [
        'encounter_id'   => $encounter_id,
        'initiator_email'=> $sender_email,
        'initiator_name' => $sender_name,
        'status'         => 'open',
    ], true);
    if (empty($convData) || isset($convData['code']))
        jsonError('Tallennus epäonnistui. Yritä uudelleen.');

    $conv = $convData[0];

    // Lisää ensimmäinen viesti
    sbPost('/rest/v1/messages', [
        'conversation_id'=> $conv['id'],
        'sender_role'    => 'initiator',
        'sender_name'    => $sender_name,
        'body'           => $msg_body,
    ]);

    // Sähköposti ilmoittajalle
    $ownerLink = BASE_URL . '/keskustelu.html?id=' . $conv['id'] . '&token=' . $conv['owner_token'];
    sendMail(
        $enc['contact_email'],
        'Uusi viesti ilmoitukseesi – ' . $enc['title'],
        emailOwnerNotify($sender_name, $msg_body, $enc['title'], $ownerLink)
    );

    // Vahvistus lähettäjälle
    $initLink = BASE_URL . '/keskustelu.html?id=' . $conv['id'] . '&token=' . $conv['initiator_token'];
    sendMail(
        $sender_email,
        'Viestisi on lähetetty – ' . $enc['title'],
        emailInitiatorConfirm($sender_name, $enc['title'], $initLink)
    );

    jsonSuccess([
        'message'          => 'Viesti lähetetty! Tarkista sähköpostisi – saat linkin keskusteluun.',
        'conversation_id'  => $conv['id'],
        'initiator_token'  => $conv['initiator_token'],
    ]);
}

// ============================================================
// TOIMINTO 2: Vastaa ketjuun
// ============================================================
function handleReply() {
    if (!empty($_POST['website'])) {
        jsonSuccess(['message' => 'Kiitos!']);
    }

    $conv_id  = trim($_POST['conversation_id'] ?? '');
    $token    = trim($_POST['token']           ?? '');
    $msg_body = trim($_POST['message_body']    ?? '');

    if (!$conv_id || !$token || !$msg_body) jsonError('Puuttuvia tietoja');
    if (!isValidUuid($conv_id) || !isValidUuid($token)) jsonError('Virheelliset tunnisteet', 400);
    if (mb_strlen($msg_body) > 1000) jsonError('Viesti on liian pitkä (max 1000 merkkiä)');

    $convs = sbGet('/rest/v1/conversations?id=eq.' . urlencode($conv_id) . '&select=*&limit=1');
    if (empty($convs)) jsonError('Keskustelua ei löytynyt', 404);
    $conv = $convs[0];

    if (strtotime($conv['expires_at']) < time()) jsonError('Tämä keskustelu on vanhentunut.');
    if ($conv['status'] !== 'open') jsonError('Tämä keskustelu on suljettu.');

    // Selvitä rooli tokenin perusteella
    if ($token === $conv['initiator_token']) {
        $role = 'initiator';
        $sender_name = $conv['initiator_name'];
        $encs = sbGet('/rest/v1/encounters?id=eq.' . urlencode($conv['encounter_id']) . '&select=contact_email,title&limit=1');
        $recipient_email = $encs[0]['contact_email'] ?? null;
        $enc_title       = $encs[0]['title']         ?? 'Ilmoitus';
        $recipient_token = $conv['owner_token'];
    } elseif ($token === $conv['owner_token']) {
        $role = 'owner';
        $sender_name     = 'Ilmoittaja';
        $recipient_email = $conv['initiator_email'];
        $encs = sbGet('/rest/v1/encounters?id=eq.' . urlencode($conv['encounter_id']) . '&select=title&limit=1');
        $enc_title       = $encs[0]['title'] ?? 'Ilmoitus';
        $recipient_token = $conv['initiator_token'];
    } else {
        jsonError('Virheellinen tunniste', 403);
    }

    // Tallenna viesti
    sbPost('/rest/v1/messages', [
        'conversation_id'=> $conv_id,
        'sender_role'    => $role,
        'sender_name'    => $sender_name,
        'body'           => $msg_body,
    ]);

    // Sähköposti vastaanottajalle
    if ($recipient_email) {
        $link = BASE_URL . '/keskustelu.html?id=' . $conv_id . '&token=' . $recipient_token;
        sendMail(
            $recipient_email,
            'Sinulle on tullut vastaus – ' . $enc_title,
            emailReplyNotify($sender_name, $msg_body, $enc_title, $link)
        );
    }

    jsonSuccess(['message' => 'Vastaus lähetetty!']);
}

// ============================================================
// TOIMINTO 3: Hae viestiketju
// ============================================================
function handleGetThread() {
    $conv_id = trim($_GET['id']    ?? '');
    $token   = trim($_GET['token'] ?? '');

    if (!$conv_id || !$token) jsonError('Puuttuvia tietoja', 400);
    if (!isValidUuid($conv_id) || !isValidUuid($token)) jsonError('Virheelliset tunnisteet', 400);

    $convs = sbGet('/rest/v1/conversations?id=eq.' . urlencode($conv_id) . '&select=*&limit=1');
    if (empty($convs)) jsonError('Keskustelua ei löytynyt', 404);
    $conv = $convs[0];

    // Validoi token → selvitä rooli
    if ($token === $conv['initiator_token'])      $role = 'initiator';
    elseif ($token === $conv['owner_token'])      $role = 'owner';
    else                                          jsonError('Virheellinen tunniste', 403);

    $encs = sbGet('/rest/v1/encounters?id=eq.' . urlencode($conv['encounter_id'])
        . '&select=id,title,type,location&limit=1');
    $encounter = $encs[0] ?? null;

    $messages = sbGet('/rest/v1/messages?conversation_id=eq.' . urlencode($conv_id)
        . '&order=created_at.asc&select=id,sender_role,sender_name,body,created_at');

    $is_expired = strtotime($conv['expires_at']) < time();
    $days_left  = max(0, (int)((strtotime($conv['expires_at']) - time()) / 86400));

    jsonSuccess([
        'role'         => $role,
        'conversation' => [
            'id'         => $conv['id'],
            'status'     => $conv['status'],
            'is_expired' => $is_expired,
            'days_left'  => $days_left,
        ],
        'encounter'    => $encounter,
        'messages'     => $messages,
    ]);
}

// ============================================================
// TOIMINTO 4: Raportoi asiaton sisältö
// ============================================================
function handleReport() {
    if (!empty($_POST['website'])) {
        jsonSuccess(['message' => 'Kiitos raportista.']); // Honeypot
    }

    $type   = trim($_POST['type'] ?? ''); // 'encounter' | 'conversation'
    $target_id = trim($_POST['target_id'] ?? '');
    $reason = trim($_POST['reason'] ?? '');

    if (!$type || !$target_id || !$reason) {
        jsonError('Kaikki kentät ovat pakollisia');
    }

    if (!isValidUuid($target_id)) {
        jsonError('Virheellinen tunniste');
    }

    $adminEmail = 'info@mediazoo.fi'; // Ylläpidon osoite
    $subject = "Ilmiannettu asiaton sisältö: $type";
    
    $body = "Hei ylläpito,\n\nKäyttäjä on ilmoittanut asiattomasta sisällöstä Kohtaamispaikassa.\n\n";
    $body .= "Tyyppi: $type\n";
    $body .= "Kohde ID: $target_id\n";
    $body .= "Syy:\n$reason\n\n";
    
    if ($type === 'encounter') {
        $body .= "Linkki ilmoitukseen: " . BASE_URL . "/ilmoituskortti.html?id=$target_id\n";
    }

    sendMail($adminEmail, $subject, $body);

    jsonSuccess(['message' => 'Raportti lähetetty onnistuneesti. Kiitos ilmoituksesta!']);
}

// ============================================================
// TOIMINTO 5: Merkitse asia valmiiksi (Ilmoittaja sulkee)
// ============================================================
function handleResolve() {
    $conv_id = trim($_POST['conversation_id'] ?? '');
    $token   = trim($_POST['token'] ?? '');

    if (!$conv_id || !$token) jsonError('Puuttuvia tietoja');
    if (!isValidUuid($conv_id) || !isValidUuid($token)) jsonError('Virheelliset tunnisteet', 400);

    // Tarkista keskustelu
    $convs = sbGet('/rest/v1/conversations?id=eq.' . urlencode($conv_id) . '&select=*&limit=1');
    if (empty($convs)) jsonError('Keskustelua ei löytynyt', 404);
    $conv = $convs[0];

    // Vain ilmoittaja (owner) voi päättää keskustelun ja ilmoituksen!
    if ($token !== $conv['owner_token']) {
        jsonError('Vain ilmoittaja voi merkitä asian valmiiksi.', 403);
    }

    if ($conv['status'] === 'resolved') {
        jsonSuccess(['message' => 'Asia on jo merkitty valmiiksi.']);
    }

    $tomorrow = date('c', strtotime('+24 hours'));

    // 1. Päivitä keskustelu: tila resolved ja vanhentuu 24h kuluttua
    sbPatch('/rest/v1/conversations?id=eq.' . urlencode($conv_id), [
        'status' => 'resolved',
        'expires_at' => $tomorrow
    ]);

    // 2. Hae alkuperäinen ilmoitus ja sen tagit
    $enc_id = $conv['encounter_id'];
    $encs = sbGet('/rest/v1/encounters?id=eq.' . urlencode($enc_id) . '&select=id,tags&limit=1');
    
    if (!empty($encs)) {
        $tags = $encs[0]['tags'] ?? [];
        if (!is_array($tags)) {
            // Jos Supabase palauttaa merkkijonona "{tag1,tag2}", parseroidaan tarvittaessa
            // Mutta json-muodossa API palauttaa taulukon.
            $tags = [];
        }
        
        if (!in_array('resolved', $tags)) {
            $tags[] = 'resolved';
        }

        // 3. Päivitä ilmoitus: lisää resolved-tag ja vanhentuu 24h kuluttua
        sbPatch('/rest/v1/encounters?id=eq.' . urlencode($enc_id), [
            'tags' => $tags,
            'expires_at' => $tomorrow
        ]);
    }

    // Tallenna systeemiviesti keskusteluun tiedoksi
    sbPost('/rest/v1/messages', [
        'conversation_id'=> $conv_id,
        'sender_role'    => 'owner',
        'sender_name'    => 'Järjestelmä',
        'body'           => '✅ Ilmoittaja on merkinnyt asian valmiiksi. Tämä keskustelu ja ilmoitus poistuvat järjestelmästä 24 tunnin kuluttua. Uusia viestejä ei voi enää lähettää.',
    ]);

    jsonSuccess(['message' => 'Asia merkitty valmiiksi! Ilmoitus poistuu vuorokauden kuluttua.']);
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
function sbGet(string $path): array {
    $ch = curl_init(SUPABASE_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'apikey: '         . SUPABASE_SERVICE_KEY,
            'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
            'Accept: application/json',
        ],
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($res, true);
    return is_array($data) ? $data : [];
}

function sbPost(string $path, array $body, bool $return = false): mixed {
    $ch = curl_init(SUPABASE_URL . $path);
    $headers = [
        'apikey: '         . SUPABASE_SERVICE_KEY,
        'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    if ($return) $headers[] = 'Prefer: return=representation';

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($res, true);
    return is_array($data) ? $data : [];
}

function sbPatch(string $path, array $body): mixed {
    $ch = curl_init(SUPABASE_URL . $path);
    $headers = [
        'apikey: '         . SUPABASE_SERVICE_KEY,
        'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
        'Prefer: return=minimal'
    ];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'PATCH',
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($res, true);
    return is_array($data) ? $data : [];
}

// ============================================================
// SÄHKÖPOSTIPOHJAT
// ============================================================
function emailOwnerNotify(string $name, string $preview, string $title, string $link): string {
    $p = mb_substr($preview, 0, 200) . (mb_strlen($preview) > 200 ? '…' : '');
    return "Hei,\n\nSinulle on tullut uusi viesti LaukaaInfo Kohtaamispaikassa ilmoitukseesi \"$title\".\n\n"
        . "Lähettäjä: $name\n"
        . "Viesti:\n\"$p\"\n\n"
        . "Vastaa viestiin turvallisesti – kummankaan sähköpostiosoite ei näy toiselle:\n$link\n\n"
        . "Linkki on voimassa 30 päivää.\n\n"
        . "Terveisin,\nLaukaaInfo";
}

function emailInitiatorConfirm(string $name, string $title, string $link): string {
    return "Hei $name,\n\nViestisi ilmoitukseen \"$title\" on lähetetty onnistuneesti!\n\n"
        . "Saat sähköpostiisi ilmoituksen, kun ilmoittaja vastaa. "
        . "Voit myös seurata keskustelua tällä linkillä:\n$link\n\n"
        . "Linkki on henkilökohtainen – älä jaa sitä muille.\n\n"
        . "Terveisin,\nLaukaaInfo";
}

function emailReplyNotify(string $name, string $preview, string $title, string $link): string {
    $p = mb_substr($preview, 0, 200) . (mb_strlen($preview) > 200 ? '…' : '');
    return "Hei,\n\nSinulle on tullut vastaus ilmoitukseen \"$title\".\n\n"
        . "Vastaaja: $name\n"
        . "Viesti:\n\"$p\"\n\n"
        . "Avaa keskustelu ja vastaa:\n$link\n\n"
        . "Terveisin,\nLaukaaInfo";
}

function sendMail(string $to, string $subject, string $body): void {
    $headers  = "From: LaukaaInfo <" . FROM_EMAIL . ">\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

// ============================================================
// APUFUNKTIOT
// ============================================================
function isValidUuid(string $s): bool {
    return (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $s);
}

function requireMethod(string $method): void {
    if ($_SERVER['REQUEST_METHOD'] !== $method)
        jsonError("Vain $method sallittu", 405);
}

function jsonSuccess(array $data): void {
    echo json_encode(['success' => true, ...$data], JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
