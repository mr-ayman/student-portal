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
            if (this.dataset.tab === "tickets") {
    setupTicketSearch();
}
        });
    });
});

function loadArticles() {
    const status = document.getElementById("kbStatus");

    status.innerHTML = "Loading articles...";

    fetch("https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api/articles")
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

            result.data
    .filter(article => article.permission === "ALL")
    .forEach(article => {
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

let ticketSearchReady = false;

function setupTicketSearch() {
    if (ticketSearchReady) return;

    const form = document.getElementById("ticketSearchForm");

    if (!form) return;

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const email = document.getElementById("ticketEmail").value.trim();
        loadTickets(email);
    });

    ticketSearchReady = true;
}

function loadTickets(email) {
    const status = document.getElementById("ticketStatus");

    if (!email) {
        status.innerHTML = "Please enter your email address.";
        return;
    }

    status.innerHTML = "Loading your tickets...";

    fetch("https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api/tickets?email=" + encodeURIComponent(email))
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                status.innerHTML = "Error: " + result.error;
                return;
            }

            if (!result.data || result.data.length === 0) {
                status.innerHTML = "No tickets found for this email address.";
                return;
            }

            let html = "";

            result.data.forEach(ticket => {
                html += `
                    <div class="ticket-card">
                        <div class="ticket-top">
                            <strong>#${escapeHTML(ticket.ticketNumber)}</strong>
                            <span class="ticket-status">${escapeHTML(ticket.status)}</span>
                        </div>

                        <h3>${escapeHTML(ticket.subject)}</h3>

                        <div class="ticket-meta">
                            <span>Priority: ${escapeHTML(ticket.priority || "None")}</span>
                            <span>Channel: ${escapeHTML(ticket.channel || "N/A")}</span>
                        </div>

                        <small>Created: ${ticket.createdTime ? new Date(ticket.createdTime).toLocaleString() : "N/A"}</small>
                    </div>
                `;
            });

            status.innerHTML = html;
        })
        .catch(error => {
            console.error(error);
            status.innerHTML = "Unable to load tickets.";
        });
}


function escapeHTML(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}