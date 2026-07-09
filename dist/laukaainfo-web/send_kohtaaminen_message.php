<?php
/**
 * Lähettää viestin ilmoittajalle (Kohtaamispaikka)
 * Tämä skripti tulee sijoittaa osoitteeseen: https://mediazoo.fi/laukaainfo-web/send_kohtaaminen_message.php
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Salli kutsut LaukaaInfon domainista (esim. https://laukaainfo.fi)
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Vain POST sallittu']);
    exit;
}

// 1. Lue POST parametrit (HUOM: Vastaanotamme tässä vaiheessa vain datan. 
// Oikeassa tuotantoympäristössä skriptin pitäisi hakea ad_id perusteella 
// vastaanottajan sähköposti Supabasesta turvallisuuden vuoksi, 
// mutta yksinkertaisuuden vuoksi otetaan se tässä toteutuksessa oletuksena että se haetaan Supabasesta täällä.
// Koska minulla (PHP-skriptillä) ei ole Supabase-avaimia tässä, meidän täytyy joko:
// A) Pyytää frontendiltä kohdesähköposti (turvattomampi) tai
// B) Tehdä cURL-kutsu Supabasen REST API:in tässä (vaatii SUPABASE_URL ja SUPABASE_ANON_KEY).

$ad_id = $_POST['ad_id'] ?? '';
$sender_name = $_POST['sender_name'] ?? '';
$sender_email = $_POST['sender_email'] ?? '';
$message_body = $_POST['message'] ?? '';

if (empty($ad_id) || empty($sender_name) || empty($sender_email) || empty($message_body)) {
    echo json_encode(['success' => false, 'error' => 'Kaikki kentät ovat pakollisia']);
    exit;
}

// TODO: Aseta omat Supabase-tunnuksesi tähän hakeaksesi kohteen (ilmoituksen) sähköpostin
$supabase_url = 'TÄHÄN_SUPABASE_URL'; // Esim. 'https://xyz.supabase.co'
$supabase_key = 'TÄHÄN_SUPABASE_ANON_KEY'; // Anon key riittää, koska 'encounters' on julkisesti luettavissa

// Hae ilmoituksen tiedot Supabasesta
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $supabase_url . '/rest/v1/encounters?id=eq.' . urlencode($ad_id) . '&select=title,contact_email,email_public');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'apikey: ' . $supabase_key,
    'Authorization: Bearer ' . $supabase_key
]);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if (empty($data) || !isset($data[0])) {
    echo json_encode(['success' => false, 'error' => 'Ilmoitusta ei löytynyt']);
    exit;
}

$ad = $data[0];
$to_email = $ad['contact_email'];
$ad_title = $ad['title'];

if (empty($to_email)) {
    echo json_encode(['success' => false, 'error' => 'Ilmoituksella ei ole sähköpostiosoitetta']);
    exit;
}

// 2. Lähetä sähköposti
$subject = "LaukaaInfo Kohtaamiset: Uusi viesti ilmoitukseesi ($ad_title)";

$message = "Hei,\n\n";
$message .= "Olet saanut uuden viestin LaukaaInfon Kohtaamispaikka -palvelun kautta jättämääsi ilmoitukseen \"$ad_title\".\n\n";
$message .= "--------------------------------------------------\n";
$message .= "Lähettäjä: $sender_name\n";
$message .= "Lähettäjän sähköposti: $sender_email\n\n";
$message .= "Viesti:\n$message_body\n";
$message .= "--------------------------------------------------\n\n";
$message .= "Voit vastata tähän viestiin vastaamalla suoraan lähettäjän sähköpostiin ($sender_email).\n\n";
$message .= "Terveisin,\nLaukaaInfo";

$headers = "From: noreply@laukaainfo.fi\r\n";
$headers .= "Reply-To: $sender_email\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

$mail_sent = mail($to_email, $subject, $message, $headers);

if ($mail_sent) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Sähköpostin lähetys epäonnistui palvelimella']);
}
