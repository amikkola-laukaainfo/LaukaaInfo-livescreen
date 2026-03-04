<?php
/**
 * Cloudinary Signature Endpoint
 * Generates signatures for secure uploads to Cloudinary.
 * Place this file on your server (mediazoo.fi).
 */

// ===== CONFIG =====
// WARNING: Keep these secret on the server!
$api_secret = "zuTJ3g_sGUsfoYZVpl1yqqL9heE"; // Replace with actual API Secret
$api_key = "587859116131439";      // Replace with actual API Key

// ===== TOKEN-SUOJAUS (MVP) =====
// Simple lookup table for authorized companies and tokens
$allowed = [
    "yritys123" => "abc9K2pQ",
    "yritys456" => "Zx81Lm",
    "2" => "mz2026",    // Mediazoo
    "mediazoo" => "mz2026",
    "demo" => "demo",
    "test-yritys" => "secret123"
];

$yritys = $_GET['yritys'] ?? '';
$token = $_GET['token'] ?? '';
$slot = $_GET['slot'] ?? '1';

if (!isset($allowed[$yritys]) || $allowed[$yritys] !== $token) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(["error" => "Unauthorized"]);
    exit;
}

// ===== SIGNATURE =====
$timestamp = time();
$public_id = "mediazoo/offers/{$yritys}_{$slot}";

// Cloudinary signature parameters must be sorted alphabetically
// NOTE: We only include parameters that we pass to the widget
$params_to_sign = [
    "public_id=$public_id",
    "timestamp=$timestamp",
    "upload_preset=tarjoukset_signed"
];

sort($params_to_sign);
$string_to_sign = implode("&", $params_to_sign);

// SHA-1 hash of parameters + secret
$signature = sha1($string_to_sign . $api_secret);

// ===== RESPONSE =====
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    "timestamp" => $timestamp,
    "signature" => $signature,
    "apiKey" => $api_key,
    "cloudName" => "dfigif5il",
    "publicId" => $public_id,
    "uploadPreset" => "tarjoukset_signed"
]);