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

        // Make sure we have enough columns (Slug, Nimi, Esittelyteksti, Lat, Lon, BloggerID)
        if (count($data) >= 5) {
            $slug = strtolower(trim($data[0]));
            if (empty($slug))
                continue;

            $regions[$slug] = [
                'name' => trim($data[1]),
                'desc' => trim($data[2]),
                'lat' => floatval(trim($data[3])),
                'lon' => floatval(trim($data[4])),
                'bloggerId' => isset($data[5]) ? trim($data[5]) : null
            ];
        }
    }
}

// Return JSON
echo json_encode($regions, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>