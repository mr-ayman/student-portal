'use strict';

const express = require('express');
const https = require('https');
const querystring = require('querystring');

const app = express();
app.use(express.json());

app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    next();
});

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const ORG_ID = process.env.ORG_ID || "60076426050";

function request(method, hostname, path, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            path: path,
            method: method,
            headers: headers || {}
        };

        const req = https.request(options, (res) => {
            let data = "";

            res.on("data", chunk => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

async function getAccessToken() {
    const postData = querystring.stringify({
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token"
    });

    const response = await request(
        "POST",
        "accounts.zoho.in",
        "/oauth/v2/token",
        {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData)
        },
        postData
    );

    if (!response.access_token) {
        throw new Error(JSON.stringify(response));
    }

    return response.access_token;
}

app.get("/", function (req, res) {
    res.json({
        success: true,
        message: "Helpcenter Catalyst API is running"
    });
});

app.get("/articles", async function (req, res) {
    try {
        const accessToken = await getAccessToken();

        const response = await request(
            "GET",
            "desk.zoho.in",
            "/api/v1/articles",
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID
            }
        );

        res.json(response);

    } catch (error) {
        res.status(500).json({
            error: "Unable to fetch articles",
            details: error.message
        });
    }
});

app.get("/article", async function (req, res) {
    try {
        const articleId = req.query.id;

        if (!articleId) {
            return res.status(400).json({
                error: "Article ID is required"
            });
        }

        const accessToken = await getAccessToken();

        const response = await request(
            "GET",
            "desk.zoho.in",
            "/api/v1/articles/" + encodeURIComponent(articleId),
            {
                "Authorization": "Zoho-oauthtoken " + accessToken,
                "orgId": ORG_ID
            }
        );

        res.json(response);

    } catch (error) {
        res.status(500).json({
            error: "Unable to fetch article",
            details: error.message
        });
    }
});

module.exports = app;
