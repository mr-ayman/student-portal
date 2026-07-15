<?php

header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true);

$articleId = trim($input["articleId"] ?? "");
$helpful = trim($input["helpful"] ?? "");
$name = trim($input["name"] ?? "Student");
$comment = trim($input["comment"] ?? "");

if ($articleId === "" || ($helpful !== "yes" && $helpful !== "no")) {
    echo json_encode(["error" => "Invalid feedback data"]);
    exit;
}

$name = strip_tags($name);
$comment = strip_tags($comment);

$dir = __DIR__ . "/../data";

if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
}

$file = $dir . "/articleFeedback.json";

$feedback = [];

if (file_exists($file)) {
    $feedback = json_decode(file_get_contents($file), true);
    if (!is_array($feedback)) {
        $feedback = [];
    }
}

$feedback[] = [
    "id" => uniqid("fb_", true),
    "articleId" => $articleId,
    "helpful" => $helpful,
    "name" => $name === "" ? "Student" : $name,
    "comment" => $comment,
    "createdAt" => date("c")
];

file_put_contents($file, json_encode($feedback, JSON_PRETTY_PRINT), LOCK_EX);

echo json_encode([
    "success" => true,
    "message" => "Feedback saved"
]);