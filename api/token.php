<?php

require_once __DIR__ . "/config.php";

function getAccessToken()
{
    $url = "https://accounts.zoho.in/oauth/v2/token";

    $postData = [
        "refresh_token" => trim(REFRESH_TOKEN),
        "client_id" => trim(CLIENT_ID),
        "client_secret" => trim(CLIENT_SECRET),
        "grant_type" => "refresh_token"
    ];

    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        die(json_encode(["error" => curl_error($ch)]));
    }

    curl_close($ch);

    $data = json_decode($response, true);

    if (!isset($data["access_token"])) {
        die($response);
    }

    return $data["access_token"];
}