<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$jsonFile = 'search_extras.json';

if (file_exists($jsonFile)) {
    $data = file_get_contents($jsonFile);
    echo $data;
} else {
    echo json_encode(new stdClass()); // Palautetaan tyhjä objekti, jos tiedostoa ei löydy
}
?>
