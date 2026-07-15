<?php

require_once __DIR__ . "/config.php";
require_once __DIR__ . "/token.php";

header("Content-Type: application/json");

$accessToken = getAccessToken();

$url = "https://desk.zoho.in/api/v1/articles";

$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Zoho-oauthtoken " . $accessToken,
    "orgId: " . ORG_ID
]);

$response = curl_exec($ch);

if (curl_errno($ch)) {
    echo json_encode(["error" => curl_error($ch)]);
    exit;
}

curl_close($ch);

echo $response;