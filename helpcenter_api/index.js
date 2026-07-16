// index.js
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

const ZIA_CLIENT_ID = process.env.ZIA_CLIENT_ID;
const ZIA_CLIENT_SECRET = process.env.ZIA_CLIENT_SECRET;
const ZIA_REFRESH_TOKEN = process.env.ZIA_REFRESH_TOKEN;
const ZIA_AGENT_ORG = process.env.ZIA_AGENT_ORG || "60078188853";
const ZIA_AGENT_ID = process.env.ZIA_AGENT_ID || "8696000000002061";
const ZIA_AGENT_VERSION_ID = process.env.ZIA_AGENT_VERSION_ID || "8696000000002275";

let cachedZiaAccessToken = null;
let cachedZiaAccessTokenTime = 0;
let cachedAccessToken = null;
let cachedAccessTokenTime = 0;
const ticketCache = {};
let cachedCommunityTopics = null;
let cachedCommunityTopicsTime = 0;

const COMMUNITY_CACHE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_COMMUNITY_TOPICS = 300;
const COMMUNITY_PAGE_LIMIT = 50;

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

function formatPublicCommunityTopic(topic) {
    const permalink = String(topic.permalink || "").trim();

    const webUrl = permalink
        ? "https://help.zoho.com/portal/en/community/topic/" + permalink
        : "";

    return {
        id: topic.id || permalink,
        title: topic.subject || "Untitled community topic",
        summary: topic.content || "No summary available.",
        type: topic.type || "COMMUNITY",
        label: topic.label || "",
        status: topic.status || "",
        likeCount: topic.likeCount || 0,
        commentCount: topic.commentCount || 0,
        viewCount: topic.viewCount || 0,
        createdTime: topic.createdTime || "",
        latestCommentTime: topic.latestCommentTime || "",
        webUrl: webUrl,
        openUrl: webUrl
    };
}

async function fetchHelpZohoCommunityTopics() {
    const now = Date.now();

    if (
        cachedCommunityTopics &&
        now - cachedCommunityTopicsTime < COMMUNITY_CACHE_MS
    ) {
        return cachedCommunityTopics;
    }

    const portalId = "edbsn3857479fd7bb83e29368ff05a1860319f4481b7f04184d0e9b6e93712995a590";

    async function fetchPage(from) {
        const apiPath =
            "/portal/api/communityTopics" +
            "?portalId=" + encodeURIComponent(portalId) +
            "&from=" + from +
            "&limit=" + COMMUNITY_PAGE_LIMIT +
            "&sortBy=createdTime" +
            "&isDescending=true";

        const result = await request(
            "GET",
            "help.zoho.com",
            apiPath,
            {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 StudentSupportPortal/1.0",
                "Referer": "https://help.zoho.com/portal/en/community"
            }
        );

        if (result.statusCode < 200 || result.statusCode >= 300) {
            throw new Error(
                "help.zoho.com communityTopics endpoint failed. Status: " +
                result.statusCode +
                ". Response: " +
                JSON.stringify(result.data)
            );
        }

        const response = result.data || {};
        return Array.isArray(response.data) ? response.data : [];
    }

    let allTopics = [];

    for (let from = 1; from <= MAX_COMMUNITY_TOPICS; from += COMMUNITY_PAGE_LIMIT) {
        const pageTopics = await fetchPage(from);

        if (!pageTopics || pageTopics.length === 0) {
            break;
        }

        allTopics = allTopics.concat(pageTopics);

        if (pageTopics.length < COMMUNITY_PAGE_LIMIT) {
            break;
        }
    }

    cachedCommunityTopics = allTopics
        .slice(0, MAX_COMMUNITY_TOPICS)
        .map(formatPublicCommunityTopic);

    cachedCommunityTopicsTime = now;

    return cachedCommunityTopics;
}


async function getZiaAgentAccessToken() {
    const now = Date.now();

    if (cachedZiaAccessToken && now - cachedZiaAccessTokenTime < 45 * 60 * 1000) {
        return cachedZiaAccessToken;
    }

    if (!ZIA_CLIENT_ID || !ZIA_CLIENT_SECRET || !ZIA_REFRESH_TOKEN) {
        throw new Error("Missing ZIA_CLIENT_ID, ZIA_CLIENT_SECRET, or ZIA_REFRESH_TOKEN environment variable");
    }

    const postData = querystring.stringify({
        refresh_token: ZIA_REFRESH_TOKEN,
        client_id: ZIA_CLIENT_ID,
        client_secret: ZIA_CLIENT_SECRET,
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
        throw new Error("Unable to get Zia Agent access token: " + JSON.stringify(response));
    }

    cachedZiaAccessToken = response.access_token;
    cachedZiaAccessTokenTime = now;

    return cachedZiaAccessToken;
}

async function triggerZiaAgent(question) {
    const accessToken = await getZiaAgentAccessToken();

    const body = JSON.stringify({
        query: question,
        reasoning: false,
        attachments: [],
        systemArgs: {}
    });

    const result = await request(
        "POST",
        "ziaagents.zoho.in",
        "/ziaagents/api/v1/agents/query",
        {
            "Authorization": "Zoho-oauthtoken " + accessToken,
            "X-ZIAAGENTS-ORG": ZIA_AGENT_ORG,
            "X-ZIAAGENTS-AGENT-ID": ZIA_AGENT_ID,
            "X-ZIAAGENTS-AGENT-VERSION-ID": ZIA_AGENT_VERSION_ID,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
        },
        body
    );

    if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(
            "Zia Agent API failed. Status: " +
            result.statusCode +
            ". Response: " +
            JSON.stringify(result.data)
        );
    }

    return extractZiaAgentAnswer(result.data);
}

function extractZiaAgentAnswer(response) {
    if (!response) return "";

    if (typeof response === "string") {
        return response;
    }

    const possibleAnswers = [
        response.answer,
        response.response,
        response.message,
        response.content,

        response.data?.answer,
        response.data?.response,
        response.data?.message,
        response.data?.content,
        response.data?.output,

        response.output?.answer,
        response.output?.text,
        response.output,

        response.result?.answer,
        response.result?.response,
        response.result?.message
    ];

    for (const value of possibleAnswers) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return JSON.stringify(response);
}


function cleanTopicText(value) {
    return String(value || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(value) {
    return cleanTopicText(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function safeNumber(value) {
    const numberValue = Number(value || 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function isSummaryQuestion(question) {
    const text = normalizeText(question);

    return (
        text.includes("summarize") ||
        text.includes("summary") ||
        text.includes("overview") ||
        text.includes("brief") ||
        text.includes("main themes") ||
        text.includes("main things discussed") ||
        text.includes("currently discussed") ||
        text.includes("what are they discussing")
    );
}

function isMostDiscussedQuestion(question) {
    const text = normalizeText(question);

    return (
        text.includes("most discussed") ||
        text.includes("highly discussed") ||
        text.includes("more discussed") ||
        text.includes("active discussions") ||
        text.includes("discussion activity")
    );
}

function isMostViewedQuestion(question) {
    const text = normalizeText(question);

    return (
        text.includes("most viewed") ||
        text.includes("highest views") ||
        text.includes("top viewed") ||
        text.includes("viewed topics")
    );
}

function isMostLikedQuestion(question) {
    const text = normalizeText(question);

    return (
        text.includes("most liked") ||
        text.includes("highest likes") ||
        text.includes("top liked")
    );
}

function isPopularQuestion(question) {
    const text = normalizeText(question);

    return (
        text.includes("popular") ||
        text.includes("trending") ||
        text.includes("treding") ||
        text.includes("top topics") ||
        text.includes("active topics") ||
        isMostDiscussedQuestion(question) ||
        isMostViewedQuestion(question) ||
        isMostLikedQuestion(question)
    );
}

function shouldShowTopicLinks(question) {
    const text = normalizeText(question);

    // Summary questions should not show cards.
    if (isSummaryQuestion(question)) {
        return false;
    }

    const asksToShowOrList =
        text.includes("show") ||
        text.includes("list") ||
        text.includes("give me") ||
        text.includes("display");

    const asksForTopicCards =
        text.includes("topic") ||
        text.includes("topics") ||
        text.includes("community topic") ||
        text.includes("community topics") ||
        text.includes("source") ||
        text.includes("sources") ||
        text.includes("reference") ||
        text.includes("references") ||
        text.includes("links") ||
        text.includes("related");

    // This fixes:
    // "list most discussed topics"
    // "show most viewed topics"
    // "list popular topics"
    // "show trending topics"
    if (asksToShowOrList && (asksForTopicCards || isPopularQuestion(question))) {
        return true;
    }

    return (
        text.includes("show related") ||
        text.includes("show popular") ||
        text.includes("show trending") ||
        text.includes("source topics") ||
        text.includes("reference topics") ||
        text.includes("related topics")
    );
}

function getProductKeywords(question) {
    const text = normalizeText(question);

    const productMap = {
        "zoho recruit": ["zoho recruit", "recruit", "recruitment", "recruiter", "hiring", "recruite", "recuruite", "recurit"],
        "zoho desk": ["zoho desk", "desk", "support", "ticket", "tickets", "desk ai"],
        "zoho crm": ["zoho crm", "crm", "lead", "leads", "deal", "deals"],
        "zia": ["zia", "ai", "agent", "agents", "desk ai", "automation"],
        "zoho creator": ["zoho creator", "creator", "deluge", "app builder"],
        "zoho catalyst": ["zoho catalyst", "catalyst", "serverless", "function"],
        "zoho books": ["zoho books", "books", "accounting"],
        "zoho billing": ["zoho billing", "billing", "subscription", "subscriptions"],
        "zoho inventory": ["zoho inventory", "inventory", "stock", "warehouse"],
        "zoho projects": ["zoho projects", "projects", "task", "tasks", "milestone"],
        "zoho mail": ["zoho mail", "mail", "email"],
        "api": ["api", "apis", "oauth", "integration", "integrations", "developer", "developers", "webhook", "webhooks"]
    };

    let keywords = [];

    Object.keys(productMap).forEach(productName => {
        const normalizedProductName = normalizeText(productName);
        const normalizedWords = productMap[productName].map(normalizeText);

        const matched = text.includes(normalizedProductName) ||
            normalizedWords.some(word => text.includes(word));

        if (matched) {
            keywords = keywords.concat(normalizedWords);
        }
    });

    return [...new Set(keywords.filter(Boolean))];
}

function getImportantQuestionWords(question) {
    const stopWords = [
        "what", "why", "how", "can", "could", "would", "should",
        "the", "and", "for", "with", "from", "about", "tell",
        "explain", "please", "need", "want", "using", "does",
        "this", "that", "are", "you", "your", "give", "me",
        "show", "latest", "lately", "latestly", "recent", "community",
        "topics", "topic", "summarize", "summary", "overview",
        "brief", "all", "currently", "discussed", "discussing",
        "new", "most", "popular", "trending", "treding", "viewed",
        "active", "related", "source", "sources", "links", "list",
        "zoho"
    ];

    const importantShortWords = ["ai"];

    return normalizeText(question)
        .split(/\s+/)
        .filter(word => {
            if (!word) return false;
            if (stopWords.includes(word)) return false;
            if (importantShortWords.includes(word)) return true;
            return word.length > 2;
        });
}

function getTopicSearchText(topic) {
    return normalizeText(
        [
            topic.title,
            topic.summary,
            topic.type,
            topic.label,
            topic.status
        ].join(" ")
    );
}

function getTopicPopularityScore(topic, question) {
    const comments = safeNumber(topic.commentCount);
    const views = safeNumber(topic.viewCount);
    const likes = safeNumber(topic.likeCount);

    if (isMostDiscussedQuestion(question)) {
        return comments * 1000 + views * 2 + likes * 10;
    }

    if (isMostViewedQuestion(question)) {
        return views * 100 + comments * 20 + likes * 10;
    }

    if (isMostLikedQuestion(question)) {
        return likes * 1000 + comments * 20 + views;
    }

    return comments * 50 + likes * 20 + views;
}

function getTopicRelevanceScore(question, topic) {
    const fullQuestion = normalizeText(question);
    const title = normalizeText(topic.title);
    const summary = normalizeText(topic.summary);
    const combinedText = getTopicSearchText(topic);

    const words = getImportantQuestionWords(question);
    const productKeywords = getProductKeywords(question);

    let score = 0;

    if (fullQuestion && title.includes(fullQuestion)) score += 80;
    if (fullQuestion && summary.includes(fullQuestion)) score += 50;

    productKeywords.forEach(keyword => {
        if (title.includes(keyword)) score += 45;
        if (summary.includes(keyword)) score += 30;
        if (combinedText.includes(keyword)) score += 12;
    });

    words.forEach(word => {
        if (title.includes(word)) score += 16;
        if (summary.includes(word)) score += 10;
        if (combinedText.includes(word)) score += 3;
    });

    const wantsZiaAi =
        fullQuestion.includes("zia") ||
        fullQuestion.includes("ai") ||
        fullQuestion.includes("agent") ||
        fullQuestion.includes("agents");

    if (wantsZiaAi) {
        if (title.includes("zia")) score += 35;
        if (summary.includes("zia")) score += 25;
        if (title.includes("ai")) score += 25;
        if (summary.includes("ai")) score += 18;
        if (title.includes("agent")) score += 18;
        if (summary.includes("agent")) score += 12;
        if (title.includes("desk")) score += 8;
        if (summary.includes("desk")) score += 5;
    }

    if (isPopularQuestion(question)) {
        score += Math.min(getTopicPopularityScore(topic, question) / 25, 100);
    }

    return score;
}

function findBestCommunityTopicMatches(question, topics, limit) {
    const scoredTopics = topics.map(topic => {
        return {
            ...topic,
            score: getTopicRelevanceScore(question, topic)
        };
    });

    return scoredTopics
        .filter(topic => topic.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return String(b.createdTime || "").localeCompare(String(a.createdTime || ""));
        })
        .slice(0, limit);
}

function findPopularCommunityTopics(question, topics, limit) {
    const productKeywords = getProductKeywords(question);

    let filteredTopics = topics;

    if (productKeywords.length > 0) {
        const productMatches = topics.filter(topic => {
            const text = getTopicSearchText(topic);

            return productKeywords.some(keyword => {
                return text.includes(keyword);
            });
        });

        if (productMatches.length > 0) {
            filteredTopics = productMatches;
        }
    }

    return filteredTopics
        .slice()
        .sort((a, b) => {
            const scoreB = getTopicPopularityScore(b, question);
            const scoreA = getTopicPopularityScore(a, question);

            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            return String(b.createdTime || "").localeCompare(String(a.createdTime || ""));
        })
        .slice(0, limit);
}

function selectCommunityTopics(question, topics, limit) {
    if (isPopularQuestion(question)) {
        return findPopularCommunityTopics(question, topics, limit);
    }

    return findBestCommunityTopicMatches(question, topics, limit);
}

async function handleZiaChat(req, res) {
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

        const ziaAnswer = await triggerZiaAgent(question);

        let sourceMatches = [];

        if (shouldShowTopicLinks(question)) {
            try {
                const topics = await fetchHelpZohoCommunityTopics();

                sourceMatches = selectCommunityTopics(question, topics, 5);

                if (!sourceMatches || sourceMatches.length === 0) {
                    sourceMatches = topics.slice(0, 5);
                }
            } catch (sourceError) {
                sourceMatches = [];
            }
        }

        res.json({
            answer: ziaAnswer || "Zia Agent returned an empty answer.",
            matches: sourceMatches,
            poweredBy: "Zia Agent"
        });

    } catch (error) {
        res.status(500).json({
            error: "Unable to contact Zia Agent",
            details: error.message
        });
    }
}

app.post("/zia-chat", handleZiaChat);
app.post("/zia", handleZiaChat);

app.get("/community-topic", async function (req, res) {
    try {
        await getLoggedInUser(req);

        const topicId = req.query.id;

        if (!topicId) {
            return res.status(400).json({
                error: "Community topic ID is required"
            });
        }

        const topics = await fetchHelpZohoCommunityTopics();

        const topic = topics.find(item => String(item.id) === String(topicId));

        if (!topic) {
            return res.status(404).json({
                error: "Community topic not found in latest help.zoho.com topics"
            });
        }

        res.json(topic);

    } catch (error) {
        res.status(500).json({
            error: "Please sign in to view this community topic",
            details: error.message
        });
    }
});

app.get("/test-help-community", async function (req, res) {
    try {
        const topics = await fetchHelpZohoCommunityTopics();

        res.json({
            success: true,
            count: topics.length,
            data: topics
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/zia-topic-sources", async function (req, res) {
    try {
        const question = String(req.query.question || "").trim();

        const topics = await fetchHelpZohoCommunityTopics();

        let matches = [];

        if (isSummaryQuestion(question) && isPopularQuestion(question)) {
            matches = findPopularCommunityTopics(question, topics, 10);
        } else if (isSummaryQuestion(question)) {
            matches = topics.slice(0, 10);
        } else if (question) {
            matches = selectCommunityTopics(question, topics, 10);
        } else {
            matches = topics.slice(0, 10);
        }

        if (!matches || matches.length === 0) {
            matches = topics.slice(0, 10);
        }

        res.json({
            success: true,
            question: question,
            totalFetched: topics.length,
            count: matches.length,
            topics: matches.map(topic => ({
                id: topic.id,
                title: topic.title,
                summary: topic.summary,
                type: topic.type,
                label: topic.label,
                status: topic.status,
                likeCount: topic.likeCount,
                commentCount: topic.commentCount,
                viewCount: topic.viewCount,
                createdTime: topic.createdTime,
                webUrl: topic.webUrl
            }))
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
app.get("/test-zia-agent", async function (req, res) {
    try {
        const question = String(req.query.question || "What is new in Zia AI?");

        const answer = await triggerZiaAgent(question);

        res.json({
            success: true,
            question: question,
            answer: answer
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = app;