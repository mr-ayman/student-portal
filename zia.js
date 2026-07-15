// zia.js
const ZIA_API_BASE = "https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api";

document.addEventListener("DOMContentLoaded", function () {
    createZiaChatBox();

    const ziaBtn = document.getElementById("ziaAgentBtn");

    if (ziaBtn) {
        ziaBtn.addEventListener("click", function () {
            openCustomZia();
        });
    }
});

function createZiaChatBox() {
    if (document.getElementById("customZiaBox")) {
        return;
    }

    const box = document.createElement("div");
    box.id = "customZiaBox";
    box.className = "custom-zia-box";
    box.style.display = "none";

    box.innerHTML = `
        <div class="custom-zia-header">
            <div>
                <strong>Ask Zia</strong>
                <span>Community topics assistant</span>
            </div>

            <button type="button" class="custom-zia-close" id="closeZiaBtn">
                ×
            </button>
        </div>

        <div id="customZiaMessages" class="custom-zia-messages">
            <div class="zia-message zia-bot">
                Hi! Ask me about the latest community topics, Zoho Desk, Catalyst, APIs, authentication, OAuth, or deployment issues.
            </div>
        </div>

        <form id="customZiaForm" class="custom-zia-form">
            <input type="text" id="customZiaInput" placeholder="Type your question..." autocomplete="off">
            <button type="submit">Send</button>
        </form>
    `;

    document.body.appendChild(box);

    document.getElementById("closeZiaBtn").addEventListener("click", function () {
        box.style.display = "none";
    });

    document.getElementById("customZiaForm").addEventListener("submit", function (e) {
        e.preventDefault();
        sendZiaQuestion();
    });
}

function openCustomZia() {
    const box = document.getElementById("customZiaBox");

    if (box) {
        box.style.display = "flex";
    }
}

function sendZiaQuestion() {
    const input = document.getElementById("customZiaInput");
    const question = input.value.trim();

    if (!question) {
        return;
    }

    addZiaMessage(question, "user");
    input.value = "";

    addZiaMessage("Searching latest community topics...", "bot", "ziaLoadingMessage");

    fetch(ZIA_API_BASE + "/zia-chat", {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "text/plain"
        },
        body: JSON.stringify({
            question: question
        })
    })
        .then(async response => {
            const text = await response.text();

            let result;

            try {
                result = JSON.parse(text);
            } catch (error) {
                throw new Error(
                    "Backend did not return JSON. Status: " +
                    response.status +
                    ". Response starts with: " +
                    text.substring(0, 120)
                );
            }

            if (!response.ok) {
                throw new Error(
                    result.details
                        ? result.error + ": " + result.details
                        : result.error || "Backend request failed"
                );
            }

            return result;
        })
        .then(result => {
            removeZiaLoading();

            if (result.error) {
                addZiaMessage(
                    result.details
                        ? result.error + ": " + result.details
                        : result.error,
                    "bot"
                );
                return;
            }

if (!result.matches || result.matches.length === 0) {
    const answerOnly = result.answer || "I could not find enough information to answer this.";

    addZiaMessage(
        `<div class="zia-answer-text">${escapeZiaHTML(answerOnly)}</div>`,
        "bot",
        "",
        true
    );

    return;
}

let html = `<div class="zia-answer-text">Here are the related community topics I found.</div>`;
html += `<div class="zia-result-list">`;

result.matches.forEach(topic => {
    const topicId = topic.id || "";
    const topicTitle = topic.title || "Untitled community topic";
    const topicSummary = topic.summary || "Open this community topic for more details.";

    if (topicId) {
        const topicData = {
            id: topicId,
            title: topicTitle,
            summary: topicSummary,
            type: topic.type || "",
            label: topic.label || "",
            status: topic.status || "",
            likeCount: topic.likeCount || 0,
            commentCount: topic.commentCount || 0,
            viewCount: topic.viewCount || 0,
            createdTime: topic.createdTime || "",
            webUrl: topic.webUrl || topic.openUrl || topic.url || topic.link || topic.permalink || topic.href || ""
        };

        sessionStorage.setItem("communityTopic_" + topicId, JSON.stringify(topicData));

        html += `
            <div class="zia-topic-card">
                <a class="zia-result-link" href="community-topic.html?id=${encodeURIComponent(topicId)}">
                    ${escapeZiaHTML(topicTitle)}
                </a>

                <p>${escapeZiaHTML(topicSummary)}</p>

                <small>
                    Comments: ${escapeZiaHTML(topic.commentCount || 0)}
                    | Views: ${escapeZiaHTML(topic.viewCount || 0)}
                </small>

                <a class="zia-view-details" href="community-topic.html?id=${encodeURIComponent(topicId)}">
                    View details →
                </a>
            </div>
        `;
    }
});

html += `</div>`;

addZiaMessage(html, "bot", "", true);

            html += `</div>`;

            addZiaMessage(html, "bot", "", true);
        })
        .catch(error => {
            console.error(error);
            removeZiaLoading();
            addZiaMessage(error.message || "Unable to contact Zia right now. Please try again.", "bot");
        });
}

function addZiaMessage(text, sender, id, isHTML) {
    const messages = document.getElementById("customZiaMessages");

    const message = document.createElement("div");
    message.className = "zia-message zia-" + sender;

    if (id) {
        message.id = id;
    }

    if (isHTML) {
        message.innerHTML = text;
    } else {
        message.textContent = text;
    }

    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
}

function removeZiaLoading() {
    const loading = document.getElementById("ziaLoadingMessage");

    if (loading) {
        loading.remove();
    }
}

function escapeZiaHTML(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}