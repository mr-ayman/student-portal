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
                <span>Article help assistant</span>
            </div>

            <button type="button" class="custom-zia-close" id="closeZiaBtn">
                ×
            </button>
        </div>

        <div id="customZiaMessages" class="custom-zia-messages">
            <div class="zia-message zia-bot">
                Hi! Ask me about attendance, fees, exams, technical issues, or any support question.
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

    addZiaMessage("Searching help articles...", "bot", "ziaLoadingMessage");

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
        .then(response => response.json())
        .then(result => {
            removeZiaLoading();

            if (result.error) {
                addZiaMessage(result.error, "bot");
                return;
            }

            if (!result.matches || result.matches.length === 0) {
                addZiaMessage("I could not find a matching article. Please raise a ticket for help.", "bot");
                return;
            }

            let html = `<strong>${escapeZiaHTML(result.answer)}</strong>`;

            html += `<div class="zia-result-list">`;

            result.matches.forEach(article => {
                html += `
                    <a class="zia-result-link" href="article.html?id=${encodeURIComponent(article.id)}">
                        ${escapeZiaHTML(article.title)}
                    </a>
                    <p>${escapeZiaHTML(article.summary || "Open this article for more details.")}</p>
                `;
            });

            html += `</div>`;

            addZiaMessage(html, "bot", "", true);
        })
        .catch(error => {
            console.error(error);
            removeZiaLoading();
            addZiaMessage("Unable to contact Zia right now. Please try again.", "bot");
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