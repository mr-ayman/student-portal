'use strict';

const express = require('express');
const https = require('https');
const querystring = require('querystring');
const catalyst = require("zcatalyst-sdk-node");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: "text/plain" }));

function setCorsHeaders(req, res) {
    const allowedOrigin = req.headers.origin || "*";

    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
    res.setHeader("Access-Control-Max-Age", "86400");
}

app.use(function (req, res, next) {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
        return res.status(200).send("");
    }

    next();
});

app.options("*", function (req, res) {
    setCorsHeaders(req, res);
    return res.status(200).send("");
});

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const ORG_ID = process.env.ORG_ID || "60076426050";
const DEPARTMENT_ID = process.env.DEPARTMENT_ID || "268212000000010772";

let cachedAccessToken = null;
let cachedAccessTokenTime = 0;
const ticketCache = {};

function request(method, hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            path: path,
            method: method,
            headers: headers || {}
        };

        const apiReq = https.request(options, (apiRes) => {
            let data = "";

            apiRes.on("data", chunk => {
                data += chunk;
            });

            apiRes.on("end", () => {
                let parsedData = data;

                try {
                    parsedData = JSON.parse(data);
                } catch (e) {
                    parsedData = data;
                }

                resolve({
                    statusCode: apiRes.statusCode,
                    data: parsedData
                });
            });
        });

        apiReq.on("error", reject);

        if (body) {
            apiReq.write(body);
        }

        apiReq.end();
    });
}

async function getAccessToken() {
    const now = Date.now();

    if (cachedAccessToken && now - cachedAccessTokenTime < 45 * 60 * 1000) {
        return cachedAccessToken;
    }

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        throw new Error("Missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN environment variable");
    }

    const postData = querystring.stringify({
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token"
    });

    const tokenResult = await request(
        "POST",
        "accounts.zoho.in",
        "/oauth/v2/token",
        {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData)
        },
        postData
    );

    const response = tokenResult.data;

    if (!response.access_token) {
        throw new Error("Unable to get Zoho access token: " + JSON.stringify(response));
    }

    cachedAccessToken = response.access_token;
    cachedAccessTokenTime = now;

    return cachedAccessToken;
}

async function getLoggedInUser(req) {
    const catalystApp = catalyst.initialize(req);
    const currentUser = await catalystApp.userManagement().getCurrentUser();

    const userData = currentUser.content || currentUser;

    const email = String(
        userData.email_id ||
        userData.email ||
        ""
    ).trim().toLowerCase();

    const firstName = String(
        userData.first_name ||
        userData.firstName ||
        "Student"
    ).trim();

    const lastName = String(
        userData.last_name ||
        userData.lastName ||
        ""
    ).trim();

    if (!email) {
        throw new Error("Logged-in user email not found");
    }

    return {
        email: email,
        firstName: firstName,
        lastName: lastName,
        name: (firstName + " " + lastName).trim() || "Student"
    };
}

async function findDeskContactByEmail(email, accessToken) {
    const result = await request(
        "GET",
        "desk.zoho.in",
        "/api/v1/contacts/search?email=" + encodeURIComponent(email),
        {
            "Authorization": "Zoho-oauthtoken " + accessToken,
            "orgId": ORG_ID
        }
    );

    const response = result.data;

    if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data[0];
    }

    return null;
}

async function ensureDeskContact(user) {
    const accessToken = await getAccessToken();

    const existingContact = await findDeskContactByEmail(user.email, accessToken);

    if (existingContact && existingContact.id) {
        return existingContact;
    }

    const contactBody = JSON.stringify({
        firstName: user.firstName || "",
        lastName: user.lastName || user.firstName || "Student",
        email: user.email
    });

    const result = await request(
        "POST",
        "desk.zoho.in",
        "/api/v1/contacts",
        {
            "Authorization": "Zoho-oauthtoken " + accessToken,
            "orgId": ORG_ID,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(contactBody)
        },
        contactBody
    );

    const response = result.data;

    if (response.error || response.errorCode || response.status === "failure") {
        throw new Error("Zoho Desk contact creation failed: " + JSON.stringify(response));
    }

    return response;
}

async function getTicketsByEmail(email) {
    const now = Date.now();

    if (ticketCache[email] && now - ticketCache[email].time < 60 * 1000) {
        return ticketCache[email].data;
    }

    const accessToken = await getAccessToken();

    const result = await request(
        "GET",
        "desk.zoho.in",
        "/api/v1/tickets?include=contacts&limit=100",
        {
            "Authorization": "Zoho-oauthtoken " + accessToken,
            "orgId": ORG_ID
        }
    );

    const response = result.data;

    if (response.error || response.error_description || response.status === "failure") {
        throw new Error("Unable to fetch tickets: " + JSON.stringify(response));
    }

    const allTickets = Array.isArray(response.data) ? response.data : [];

    const matchedTickets = allTickets.filter(ticket => {
        const ticketEmail = String(
            ticket.email ||
            ticket.contactEmail ||
            ticket.contact?.email ||
            ""
        ).trim().toLowerCase();

        return ticketEmail === email;
    });

    const tickets = matchedTickets.map(ticket => {
        return {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber || ticket.id,
            subject: ticket.subject || "No subject",
            status: ticket.status || "Unknown",
            priority: ticket.priority || "None",
            channel: ticket.channel || "",
            createdTime: ticket.createdTime || "",
            modifiedTime: ticket.modifiedTime || ""
        };
    });

    const finalResult = {
        data: tickets,
        matched: tickets.length
    };

    ticketCache[email] = {
        time: now,
        data: finalResult
    };

    return finalResult;
}

app.get("/", function (req, res) {
    res.json({
        success: true,
        message: "Helpcenter Catalyst API is running"
    });
});

app.get("/me", async function (req, res) {
    try {
        const user = await getLoggedInUser(req);
        const contact = await ensureDeskContact(user);

        res.json({
            loggedIn: true,
            user: user,
            deskContactId: contact.id || ""
        });

    } catch (error) {
        res.status(401).json({
            loggedIn: false,
            error: "Login required",
            details: error.message
        });
    }
});

app.get("/articles", async function (req, res) {
    try {
        await getLoggedInUser(req);

        const accessToken = await getAccessToken();

        const result = await request(
            "GET",
            "desk.zoho.in",
            "/api/v1/articles",
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID
            }
        );

        res.json(result.data);

    } catch (error) {
        res.status(401).json({
            error: "Please sign in to view articles",
            details: error.message
        });
    }
});

app.get("/article", async function (req, res) {
    try {
        await getLoggedInUser(req);

        const articleId = req.query.id;

        if (!articleId) {
            return res.status(400).json({
                error: "Article ID is required"
            });
        }

        const accessToken = await getAccessToken();

        const result = await request(
            "GET",
            "desk.zoho.in",
            "/api/v1/articles/" + encodeURIComponent(articleId),
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID
            }
        );

        res.json(result.data);

    } catch (error) {
        res.status(401).json({
            error: "Please sign in to view this article",
            details: error.message
        });
    }
});

app.get("/my-tickets", async function (req, res) {
    try {
        const user = await getLoggedInUser(req);

        await ensureDeskContact(user);

        const result = await getTicketsByEmail(user.email);

        res.json(result);

    } catch (error) {
        res.status(401).json({
            error: "Please sign in to view your tickets",
            details: error.message
        });
    }
});

app.post("/create-ticket", async function (req, res) {
    try {
        const user = await getLoggedInUser(req);

        await ensureDeskContact(user);

        let bodyData = req.body || {};

        if (typeof bodyData === "string") {
            try {
                bodyData = JSON.parse(bodyData);
            } catch (e) {
                bodyData = {};
            }
        }

        const subject = String(bodyData.subject || "").trim();
        const category = String(bodyData.category || "General").trim();
        const description = String(bodyData.description || "").trim();

        if (!subject || !description) {
            return res.status(400).json({
                error: "Subject and description are required"
            });
        }

        const accessToken = await getAccessToken();

        const ticketBody = JSON.stringify({
            subject: subject,
            departmentId: DEPARTMENT_ID,
            contact: {
                lastName: user.name,
                email: user.email
            },
            description: "Category: " + category + "\n\n" + description,
            channel: "Web"
        });

        const result = await request(
            "POST",
            "desk.zoho.in",
            "/api/v1/tickets",
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(ticketBody)
            },
            ticketBody
        );

        const response = result.data;

        if (response.error || response.errorCode || response.status === "failure") {
            return res.status(500).json({
                error: "Zoho Desk ticket creation failed",
                details: response
            });
        }

        delete ticketCache[user.email];

        res.json({
            success: true,
            id: response.id,
            ticketNumber: response.ticketNumber || response.id,
            subject: response.subject,
            status: response.status
        });

    } catch (error) {
        res.status(401).json({
            error: "Please sign in before raising a ticket",
            details: error.message
        });
    }
});

app.post("/zia-chat", async function (req, res) {
    try {
        await getLoggedInUser(req);

        let bodyData = req.body || {};

        if (typeof bodyData === "string") {
            try {
                bodyData = JSON.parse(bodyData);
            } catch (e) {
                bodyData = {};
            }
        }

        const question = String(bodyData.question || "").trim();

        if (!question) {
            return res.status(400).json({
                error: "Question is required"
            });
        }

        const accessToken = await getAccessToken();

        const result = await request(
            "GET",
            "desk.zoho.in",
            "/api/v1/articles",
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID
            }
        );

        const response = result.data || result;
        const articles = Array.isArray(response.data) ? response.data : [];

        const words = question
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(word => word.length > 2);

        const scoredArticles = articles.map(article => {
            const title = String(article.title || "").toLowerCase();
            const summary = String(article.summary || "").toLowerCase();
            const combinedText = title + " " + summary;

            let score = 0;

            words.forEach(word => {
                if (title.includes(word)) {
                    score += 3;
                }

                if (summary.includes(word)) {
                    score += 2;
                }

                if (combinedText.includes(word)) {
                    score += 1;
                }
            });

            return {
                id: article.id,
                title: article.title || "Untitled article",
                summary: article.summary || "",
                score: score
            };
        });

        const matches = scoredArticles
            .filter(article => article.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        if (matches.length === 0) {
            return res.json({
                answer: "I could not find a matching article.",
                matches: []
            });
        }

        res.json({
            answer: "I found these help articles that may answer your question:",
            matches: matches
        });

    } catch (error) {
        res.status(401).json({
            error: "Please sign in to use Zia assistant",
            details: error.message
        });
    }
});

module.exports = app;