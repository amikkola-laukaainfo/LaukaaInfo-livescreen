<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQOeSATLK40yZBE5ewH2XlezaT87TTdD6uermPX-D7OQ_Snc6jGRL79kxkH8m5Z8qm1sGzo3b6icgQe/pub?output=csv';
$jsonFile = 'search_extras.json';
$cacheTime = 3600; // 1 tunti

// Jos välimuistitiedosto on olemassa ja tarpeeksi uusi, käytetään sitä
if (file_exists($jsonFile) && (time() - filemtime($jsonFile)) < $cacheTime) {
    echo file_get_contents($jsonFile);
    exit;
}

$result = new stdClass();

if (($handle = @fopen($csvUrl, "r")) !== FALSE) {
    $headers = fgetcsv($handle, 10000, ",");
    
    $rowidIndex = array_search('rowid', $headers);
    $searchTextIndex = array_search('search_text', $headers);
    
    if ($rowidIndex !== false && $searchTextIndex !== false) {
        while (($data = fgetcsv($handle, 10000, ",")) !== FALSE) {
            $rowid = $data[$rowidIndex];
            $searchText = isset($data[$searchTextIndex]) ? $data[$searchTextIndex] : '';
            if (!empty($rowid) && is_numeric($rowid)) {
                $result->$rowid = $searchText;
            }
        }
    }
    fclose($handle);
    
    $jsonOutput = json_encode($result);
    // Tallennetaan välimuistiin
    file_put_contents($jsonFile, $jsonOutput);
    echo $jsonOutput;
} else {
    // Jos Google Sheetsin lataus epäonnistuu, yritetään käyttää vanhaa välimuistia jos sellainen on
    if (file_exists($jsonFile)) {
        echo file_get_contents($jsonFile);
    } else {
        echo json_encode(new stdClass());
    }
}
?>
