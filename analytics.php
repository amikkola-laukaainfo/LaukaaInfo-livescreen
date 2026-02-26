<?php
/**
 * LaukaaInfo Analytics Tracker
 * Tracks page loads and sends a weekly summary email to info@mediazoo.fi.
 */

// Basic security and CORS (although it's intended to be called from the same-origin)
$allowed_origins = [
    'https://laukaainfo.fi',
    'https://www.laukaainfo.fi',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim($_SERVER['HTTP_ORIGIN'], '/') : '';
if ($origin && in_array($origin, $allowed_origins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}

$dataFile = 'analytics_data.json';
$reportEmail = 'info@mediazoo.fi';
$reportInterval = 7 * 24 * 60 * 60; // 7 days in seconds

// Load existing data or initialize
if (file_exists($dataFile)) {
    $data = json_decode(file_get_contents($dataFile), true);
} else {
    $data = [
        'total_visits' => 0,
        'weekly_visits' => 0,
        'last_report_time' => time(),
        'history' => []
    ];
}

// Update counters
$data['total_visits']++;
$data['weekly_visits']++;

// Check if it's time to send a report
$currentTime = time();
if (($currentTime - $data['last_report_time']) >= $reportInterval) {
    $totalWeekly = $data['weekly_visits'];
    $startDate = date('d.m.Y', $data['last_report_time']);
    $endDate = date('d.m.Y', $currentTime);

    $subject = "LaukaaInfo: Viikoittainen kävijäraportti ($startDate - $endDate)";
    $message = "Hei,\n\n";
    $message .= "LaukaaInfo-sivuston kävijämäärä välillä $startDate - $endDate:\n\n";
    $message .= "Viikon kävijät: $totalWeekly\n";
    $message .= "Kaikkien aikojen kävijät: " . $data['total_visits'] . "\n\n";
    $message .= "Tämä on automaattinen viesti LaukaaInfo-taustajärjestelmästä.";

    $headers = "From: no-reply@mediazoo.fi\r\n";
    $headers .= "Reply-To: no-reply@mediazoo.fi\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    // Attempt to send email
    if (mail($reportEmail, $subject, $message, $headers)) {
        // Record history and reset weekly counter
        $data['history'][] = [
            'range' => "$startDate - $endDate",
            'count' => $totalWeekly,
            'sent_at' => $currentTime
        ];
        $data['weekly_visits'] = 0;
        $data['last_report_time'] = $currentTime;

        // Keep only last 10 reports in history to keep file small
        if (count($data['history']) > 10) {
            array_shift($data['history']);
        }
    }
}

// Save updated data
file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));

// Return 204 No Content to be as fast as possible
http_response_code(204);
exit;
?>