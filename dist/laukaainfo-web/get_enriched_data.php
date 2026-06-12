<?php
// Salli pyynnöt ristiin (CORS)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$id = isset($_GET['id']) ? trim($_GET['id']) : '';

if (!$id) {
    echo json_encode(['error' => 'No ID provided', 'results' => null]);
    exit;
}

// Poistetaan mahdollinen "company-" etuliite vertailua varten
$rawId = str_replace('company-', '', $id);

// Luetaan JSON-tiedosto
$filePath = __DIR__ . '/enriched-data-clean.json';

if (!file_exists($filePath)) {
    echo json_encode(['error' => 'Data file not found', 'results' => null]);
    exit;
}

$jsonContent = file_get_contents($filePath);
$data = json_decode($jsonContent, true);

if (!$data) {
    echo json_encode(['error' => 'Invalid JSON data', 'results' => null]);
    exit;
}

// Etsitään yritys listasta
$companies = isset($data['companies']) ? $data['companies'] : (isset($data['results']) ? $data['results'] : $data);

if (is_array($companies)) {
    foreach ($companies as $company) {
        $compId = isset($company['id']) ? $company['id'] : '';
        $companyId = isset($company['results']['companyId']) ? $company['results']['companyId'] : $compId;
        
        // Verrataan rawId:tä ja alkuperäistä id:tä
        if ((string)$compId === (string)$rawId || (string)$companyId === (string)$rawId || 
            (string)$compId === (string)$id || (string)$companyId === (string)$id) {
            
            // Palautetaan pelkkä yksittäisen yrityksen results-osio
            $results = isset($company['results']) ? $company['results'] : $company;
            echo json_encode(['results' => $results]);
            exit;
        }
    }
}

// Ei löytynyt
echo json_encode(['error' => 'Company not found', 'results' => null]);
exit;
