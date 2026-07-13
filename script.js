const API_BASE = "https://project-rainfall-60076674739.development.catalystserverless.in/server/helpcenter_api";

const LOGIN_URL = "https://project-rainfall-60076674739.development.catalystserverless.in/__catalyst/auth/login";
const SIGNUP_URL = "https://project-rainfall-60076674739.development.catalystserverless.in/__catalyst/auth/signup";
const PASSWORD_RESET_URL = "https://project-rainfall-60076674739.development.catalystserverless.in/__catalyst/auth/reset-password";

const AFTER_LOGOUT_URL = "https://project-rainfall-60076674739.development.catalystserverless.in/app/index.html";

let currentUser = null;

document.addEventListener("DOMContentLoaded", function () {
    setupTabs();
    setupGuestButtons();
    setupTicketForm();
    checkLoginStatus();
});

function setupGuestButtons() {
    const guestLoginBtn = document.getElementById("guestLoginBtn");
    const guestSignupBtn = document.getElementById("guestSignupBtn");

    if (guestLoginBtn) {
        guestLoginBtn.addEventListener("click", function () {
            window.location.href = LOGIN_URL;
        });
    }

    if (guestSignupBtn) {
        guestSignupBtn.addEventListener("click", function () {
            window.location.href = SIGNUP_URL;
        });
    }
}

function setupTabs() {
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
                loadMyTickets();
            }
        });
    });
}

function checkLoginStatus() {
    fetch(API_BASE + "/me", {
        method: "GET",
        credentials: "include"
    })
        .then(response => response.json())
        .then(result => {
            console.log("Login check result:", result);

            if (result.loggedIn) {
                currentUser = result.user;
                showLoggedInState(result.user);
            } else {
                showLoggedOutState();
            }
        })
        .catch(error => {
            console.error("Login check failed:", error);
            showLoggedOutState();
        });
}

function showLoggedOutState() {
    currentUser = null;

    const guestHero = document.getElementById("guestHero");
    const appArea = document.getElementById("appArea");
    const authNav = document.getElementById("authNav");

    if (guestHero) {
        guestHero.style.display = "block";
    }

    if (appArea) {
        appArea.style.display = "none";
    }

    if (authNav) {
        authNav.innerHTML = `
            <button type="button" class="auth-btn" onclick="window.location.href='${LOGIN_URL}'">
                Sign in
            </button>

            <button type="button" class="auth-btn secondary" onclick="window.location.href='${SIGNUP_URL}'">
                Sign up
            </button>
        `;
    }
}

function showLoggedInState(user) {
    const guestHero = document.getElementById("guestHero");
    const appArea = document.getElementById("appArea");
    const authNav = document.getElementById("authNav");
    const authBox = document.getElementById("authBox");

    if (guestHero) {
        guestHero.style.display = "none";
    }

    if (appArea) {
        appArea.style.display = "block";
    }

    if (authNav) {
        authNav.innerHTML = `
            <span class="signed-user">${escapeHTML(user.email)}</span>

            <button type="button" class="auth-btn secondary" onclick="window.location.href='${PASSWORD_RESET_URL}'">
                Reset password
            </button>

            <button type="button" class="auth-btn" onclick="logoutUser()">
                Logout
            </button>
        `;
    }

    if (authBox) {
        authBox.innerHTML = `
            <strong>Signed in as:</strong> ${escapeHTML(user.email)}
        `;
    }

    const message = document.getElementById("customTicketMessage");

    if (message) {
        message.textContent = "You are signed in. You can raise a ticket.";
    }

    loadMyTickets();
}

function logoutUser() {
    if (window.catalyst && catalyst.auth && catalyst.auth.signOut) {
        catalyst.auth.signOut(AFTER_LOGOUT_URL);
        return;
    }

    window.location.href = LOGIN_URL;
}

function loadArticles() {
    const status = document.getElementById("kbStatus");

    if (!status) return;

    if (!currentUser) {
        status.innerHTML = "Please sign in to view articles.";
        return;
    }

    status.innerHTML = "Loading articles...";

    fetch(API_BASE + "/articles", {
        method: "GET",
        credentials: "include"
    })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                status.innerHTML = "Error: " + escapeHTML(result.error);
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
                            <h3>${escapeHTML(article.title)}</h3>
                            <p>${escapeHTML(article.summary || "No summary available.")}</p>

                            <div class="article-meta">
                                <span>Views: ${escapeHTML(article.viewCount)}</span>
                                <span>Likes: ${escapeHTML(article.likeCount)}</span>
                            </div>

                            <a href="article.html?id=${encodeURIComponent(article.id)}" class="article-link">
                                Read article
                            </a>
                        </div>
                    `;
                });

            status.innerHTML = html || "No public articles found.";
        })
        .catch(error => {
            console.error(error);
            status.innerHTML = "Unable to load articles.";
        });
}

function setupTicketForm() {
    const customTicketForm = document.getElementById("customTicketForm");

    if (!customTicketForm) return;

    customTicketForm.addEventListener("submit", function (e) {
        e.preventDefault();
        submitCustomTicket();
    });
}

function submitCustomTicket() {
    const message = document.getElementById("customTicketMessage");

    if (!currentUser) {
        message.textContent = "Please sign in before raising a ticket.";
        return;
    }

    const subject = document.getElementById("ticketSubject").value.trim();
    const category = document.getElementById("ticketCategory").value;
    const description = document.getElementById("ticketDescription").value.trim();

    if (!subject || !description) {
        message.textContent = "Please fill all required fields.";
        return;
    }

    message.textContent = "Submitting your ticket...";

    fetch(API_BASE + "/create-ticket", {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "text/plain"
        },
        body: JSON.stringify({
            subject: subject,
            category: category,
            description: description
        })
    })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                message.textContent = "Error: " + result.error;
                console.error(result);
                return;
            }

            message.textContent = "Ticket submitted successfully. Ticket #" + result.ticketNumber;
            document.getElementById("customTicketForm").reset();
            loadMyTickets();
        })
        .catch(error => {
            console.error(error);
            message.textContent = "Unable to submit ticket.";
        });
}

function loadMyTickets() {
    const status = document.getElementById("ticketStatus");

    if (!status) return;

    if (!currentUser) {
        status.innerHTML = "Please sign in to view your tickets.";
        return;
    }

    status.innerHTML = "Loading your tickets...";

    fetch(API_BASE + "/my-tickets", {
        method: "GET",
        credentials: "include"
    })
        .then(response => response.json())
        .then(result => {
            if (result.error) {
                status.innerHTML = escapeHTML(result.error);
                return;
            }

            if (!result.data || result.data.length === 0) {
                status.innerHTML = "No tickets found for your account.";
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