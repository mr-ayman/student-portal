document.addEventListener("DOMContentLoaded", function () {
    loadArticle();
});

function loadArticle() {
    const articleStatus = document.getElementById("articleStatus");

    const params = new URLSearchParams(window.location.search);
    const articleId = params.get("id");

    if (!articleId) {
        articleStatus.innerHTML = "Article ID missing.";
        return;
    }

    fetch("https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api/article?id=" + encodeURIComponent(articleId))
        .then(response => response.json())
        .then(article => {
            if (article.error) {
                articleStatus.innerHTML = "Error: " + article.error;
                return;
            }

            const title = article.title || "Untitled Article";
            const summary = article.summary || "";

            const content =
                article.answer ||
                article.content ||
                article.description ||
                article.summary ||
                "No article content available.";

            articleStatus.innerHTML = `
                <div class="eyebrow">Knowledge base</div>

                <h1>${title}</h1>

                ${summary ? `<p class="article-summary">${summary}</p>` : ""}

                <div class="article-content">
                    ${content}
                </div>

                <div class="feedback-box">
                    <h2>Was this article useful?</h2>

                    <form id="feedbackForm">
                        <div class="feedback-options">
                            <label>
                                <input type="radio" name="helpful" value="yes" required>
                                👍 Yes, useful
                            </label>

                            <label>
                                <input type="radio" name="helpful" value="no">
                                👎 Not useful
                            </label>
                        </div>

                        <input type="text" id="feedbackName" placeholder="Your name optional">

                        <textarea id="feedbackComment" placeholder="Write a comment optional"></textarea>

                        <button type="submit" class="feedback-btn">Submit feedback</button>
                    </form>

                    <p id="feedbackMessage"></p>

                    <div class="feedback-counts">
                        <span>Useful: <strong id="usefulCount">0</strong></span>
                        <span>Not useful: <strong id="notUsefulCount">0</strong></span>
                    </div>

                    <div class="comments-section">
                        <h2>Comments</h2>
                        <div id="commentsList">Loading comments...</div>
                    </div>
                </div>
            `;

            setupFeedbackForm(articleId);
            loadFeedback(articleId);
        })
        .catch(error => {
            console.error(error);
            articleStatus.innerHTML = "Unable to load article.";
        });
}

function setupFeedbackForm(articleId) {
    const form = document.getElementById("feedbackForm");

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const helpful = document.querySelector('input[name="helpful"]:checked')?.value;
        const name = document.getElementById("feedbackName").value;
        const comment = document.getElementById("feedbackComment").value;
        const message = document.getElementById("feedbackMessage");

        fetch("api/saveArticleFeedback.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                articleId: articleId,
                helpful: helpful,
                name: name,
                comment: comment
            })
        })
            .then(response => response.json())
            .then(result => {
                if (result.error) {
                    message.textContent = result.error;
                    return;
                }

                message.textContent = "Thank you for your feedback.";
                form.reset();
                loadFeedback(articleId);
            })
            .catch(error => {
                console.error(error);
                message.textContent = "Unable to save feedback.";
            });
    });
}

function loadFeedback(articleId) {
    fetch("api/getArticleFeedback.php?id=" + encodeURIComponent(articleId))
        .then(response => response.json())
        .then(data => {
            document.getElementById("usefulCount").textContent = data.useful || 0;
            document.getElementById("notUsefulCount").textContent = data.notUseful || 0;

            const commentsList = document.getElementById("commentsList");

            if (!data.comments || data.comments.length === 0) {
                commentsList.innerHTML = "No comments yet.";
                return;
            }

            let html = "";

            data.comments.reverse().forEach(comment => {
                html += `
                    <div class="comment-card">
                        <strong>${escapeHTML(comment.name)}</strong>
                        <p>${escapeHTML(comment.comment)}</p>
                        <small>${new Date(comment.createdAt).toLocaleString()}</small>
                    </div>
                `;
            });

            commentsList.innerHTML = html;
        })
        .catch(error => {
            console.error(error);
        });
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}