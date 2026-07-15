<?php

header("Content-Type: application/json");

$articleId = trim($_GET["id"] ?? "");

if ($articleId === "") {
    echo json_encode(["error" => "Article ID is required"]);
    exit;
}

$file = __DIR__ . "/../data/articleFeedback.json";

$feedback = [];

if (file_exists($file)) {
    $feedback = json_decode(file_get_contents($file), true);
    if (!is_array($feedback)) {
        $feedback = [];
    }
}

$articleFeedback = array_values(array_filter($feedback, function ($item) use ($articleId) {
    return $item["articleId"] === $articleId;
}));

$useful = 0;
$notUseful = 0;
$comments = [];

foreach ($articleFeedback as $item) {
    if ($item["helpful"] === "yes") {
        $useful++;
    }

    if ($item["helpful"] === "no") {
        $notUseful++;
    }

    if (!empty($item["comment"])) {
        $comments[] = $item;
    }
}

echo json_encode([
    "useful" => $useful,
    "notUseful" => $notUseful,
    "comments" => $comments
]);