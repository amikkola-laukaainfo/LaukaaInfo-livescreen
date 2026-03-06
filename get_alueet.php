<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// URL to the Region CSV file
$csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTCqIQKTFGT4X5hHP448ytZx0z5FsmONjzFNr4fpabkZ6BjIuit8B8eqZbv7_VTte_4EZFQt7Fxoemk/pub?output=csv";

// Fetch the CSV file contents using cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $csvUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
// Disable SSL verification for compatibility
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$csvData = curl_exec($ch);

if (curl_errno($ch)) {
    echo json_encode(["error" => "cURL Error: " . curl_error($ch)]);
    curl_close($ch);
    exit;
}
curl_close($ch);

// Set up array for JSON encoding
$regions = [];

if ($csvData) {
    // Parse CSV data
    $lines = explode(PHP_EOL, $csvData);
    $headerParsed = false;

    foreach ($lines as $line) {
        // Skip empty lines
        if (trim($line) === '')
            continue;

        // Parse line respecting quotes
        $data = str_getcsv($line);

        // Skip header
        if (!$headerParsed) {
            $headerParsed = true;
            continue;
        }

        // Make sure we have enough columns (Slug, Nimi, Esittelyteksti, Lat, Lon, BloggerID, BloggerURL)
        if (count($data) >= 5) {
            $slug = strtolower(trim($data[0]));
            if (empty($slug))
                continue;

            // BloggerID saattaa tulla Excelistä tieteellisenä notaationa (esim. 7,14827E+18)
            // tai normaalina kokonaislukuna. Käsitellään aina merkkijonona tarkkuuden säilyttämiseksi.
            $rawBloggerId = isset($data[5]) ? trim($data[5]) : '';
            // Jos tieteellinen notaatio (esim. 7.14827E+18), muunnetaan sprintf:llä (ei number_format,
            // koska float-pyöristys voi vioittaa 19-numeroisen luvun)
            if (!empty($rawBloggerId) && preg_match('/[eE]/', $rawBloggerId)) {
                $rawBloggerId = str_replace(',', '.', $rawBloggerId);
                $rawBloggerId = sprintf('%.0f', (float) $rawBloggerId);
            }

            // BloggerURL: suora blogspot-osoite (esim. https://lievestuore.blogspot.com/)
            // Luotettavampi kuin numerinen ID, koska suuria lukuja ei tarvita
            $bloggerUrl = isset($data[6]) ? trim($data[6]) : '';

            $regions[$slug] = [
                'slug' => $slug,
                'name' => trim($data[1]),
                'desc' => trim($data[2]),
                'lat' => floatval(trim($data[3])),
                'lon' => floatval(trim($data[4])),
                'bloggerId' => $rawBloggerId ?: null,
                'bloggerUrl' => $bloggerUrl ?: null
            ];
        }
    }
}

// Return JSON
echo json_encode($regions, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>