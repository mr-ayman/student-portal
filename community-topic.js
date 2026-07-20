const COMMUNITY_API_BASE = "https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api";

document.addEventListener("DOMContentLoaded", function () {
    loadCommunityTopic();
});

function loadCommunityTopic() {

    const params = new URLSearchParams(window.location.search);
    const topicId = params.get("id");

    const titleBox = document.getElementById("topicTitle");
    const metaBox = document.getElementById("topicMeta");
    const contentBox = document.getElementById("topicContent");

    if (!topicId) {
        titleBox.textContent = "Topic not found";
        contentBox.textContent = "No community topic ID was provided.";
        return;
    }

    const savedTopic = sessionStorage.getItem("communityTopic_" + topicId);

    if (savedTopic) {
        try {
            const topic = JSON.parse(savedTopic);
            showTopic(topic);
            return;
        } catch (error) {
            console.error("Saved topic parse failed:", error);
        }
    }

    fetch(COMMUNITY_API_BASE + "/community-topic?id=" + encodeURIComponent(topicId), {
        method: "GET",
        credentials: "include"
    })
        .then(response => response.json())
        .then(topic => {
            if (topic.error) {
                titleBox.textContent = "Unable to load topic";
                contentBox.textContent = topic.error;
                return;
            }

            showTopic(topic);
        })
        .catch(error => {
            console.error(error);
            titleBox.textContent = "Unable to load topic";
            contentBox.textContent = "Something went wrong while loading this community topic.";
        });
}

function showTopic(topic) {
    window.currentCommunityTopic = topic;
    const titleBox = document.getElementById("topicTitle");
    const metaBox = document.getElementById("topicMeta");
    const contentBox = document.getElementById("topicContent");

    titleBox.textContent = topic.title || "Untitled community topic";

    metaBox.textContent =
        "Type: " + (topic.type || "Community") +
        " | Comments: " + (topic.commentCount || 0) +
        " | Likes: " + (topic.likeCount || 0);

    contentBox.innerHTML = `
        <p>${escapeCommunityHTML(topic.summary || "No content available.")}</p>
    `;
}

function escapeCommunityHTML(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}