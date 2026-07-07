document.addEventListener("DOMContentLoaded", function () {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".panelview");

    tabs.forEach(tab => {
        tab.addEventListener("click", function () {
            tabs.forEach(t => t.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));

            this.classList.add("active");

            const panel = document.getElementById("tab-" + this.dataset.tab);

            if (panel) {
                panel.classList.add("active");
            }

            if (this.dataset.tab === "articles") {
                loadArticles();
            }
        });
    });
});

function loadArticles() {
    const status = document.getElementById("kbStatus");

    status.innerHTML = "Loading articles...";

    fetch("api/getArticles.php")
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                status.innerHTML = "Error: " + result.error;
                return;
            }

            if (!result.data || result.data.length === 0) {
                status.innerHTML = "No articles found.";
                return;
            }

            let html = "";

            result.data.forEach(article => {
                html += `
                    <div class="article-card">
                        <h3>${article.title}</h3>
                        <p>${article.summary || "No summary available."}</p>

                        <div class="article-meta">
                            <span>Views: ${article.viewCount}</span>
                            <span>Likes: ${article.likeCount}</span>
                        </div>

                        <a href="article.html?id=${article.id}" class="article-link">
                            Read article
                        </a>
                    </div>
                `;
            });

            status.innerHTML = html;
        })
        .catch(error => {
            console.error(error);
            status.innerHTML = "Unable to load articles.";
        });
}