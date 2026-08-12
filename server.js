const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT =
    Number(process.env.PORT) || 3000;


/*
 * ==========================================
 * MIDDLEWARE
 * ==========================================
 */

app.use(
    express.json({
        limit: "10kb"
    })
);

app.use(
    express.static(
        path.join(__dirname)
    )
);


/*
 * ==========================================
 * TELEGRAM CONFIGURATION
 * ==========================================
 */

function loadConfig() {

    let botToken =
        process.env.BOT_TOKEN || "";

    let chatId =
        process.env.CHAT_ID || "";


    /*
     * Local fallback only.
     */

    const configPath =
        path.join(
            __dirname,
            "config.txt"
        );


    if (
        (!botToken || !chatId) &&
        fs.existsSync(configPath)
    ) {

        const contents =
            fs.readFileSync(
                configPath,
                "utf8"
            );


        for (
            const line of
            contents.split(/\r?\n/)
        ) {

            const value =
                line.trim();


            if (
                !value ||
                value.startsWith("#")
            ) {
                continue;
            }


            const separator =
                value.indexOf("=");


            if (separator === -1) {
                continue;
            }


            const key =
                value
                    .slice(0, separator)
                    .trim();


            const setting =
                value
                    .slice(separator + 1)
                    .trim();


            if (
                key === "BOT_TOKEN" &&
                !botToken
            ) {
                botToken = setting;
            }


            if (
                key === "CHAT_ID" &&
                !chatId
            ) {
                chatId = setting;
            }
        }
    }


    return {
        botToken,
        chatId
    };
}


/*
 * ==========================================
 * HEALTH CHECK
 * ==========================================
 */

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({
            status: "ok",
            service: "visitor-alert",
            timestamp:
                new Date().toISOString()
        });

    }
);


/*
 * ==========================================
 * CLIENT KEY
 * ==========================================
 */

function getClientKey(req) {

    /*
     * Cloudflare's connecting IP is preferred.
     */

    const cloudflareIP =
        req.headers[
            "cf-connecting-ip"
        ];


    if (cloudflareIP) {
        return String(
            cloudflareIP
        ).trim();
    }


    /*
     * Reverse proxy fallback.
     */

    const forwarded =
        req.headers[
            "x-forwarded-for"
        ];


    if (forwarded) {

        return String(forwarded)
            .split(",")[0]
            .trim();
    }


    return (
        req.socket.remoteAddress || ""
    ).trim();
}


/*
 * ==========================================
 * ALERT RATE LIMIT
 * ==========================================
 *
 * One alert per client every 10 minutes.
 *
 * This Map is suitable for a single
 * container instance.
 *
 * For multiple Coolify replicas,
 * use Redis instead.
 */

const alertCooldown =
    new Map();

const ALERT_COOLDOWN =
    10 * 60 * 1000;


function shouldSendAlert(clientKey) {

    const now =
        Date.now();


    const previous =
        alertCooldown.get(
            clientKey
        );


    if (
        previous &&
        now - previous <
            ALERT_COOLDOWN
    ) {

        return false;
    }


    alertCooldown.set(
        clientKey,
        now
    );


    return true;
}


/*
 * Periodically remove old entries
 * from memory.
 */

setInterval(() => {

    const now =
        Date.now();


    for (
        const [
            key,
            timestamp
        ]
        of alertCooldown
    ) {

        if (
            now - timestamp >
            ALERT_COOLDOWN
        ) {

            alertCooldown.delete(key);
        }
    }

}, ALERT_COOLDOWN);


/*
 * ==========================================
 * REGION LOOKUP
 * ==========================================
 */

async function lookupRegion(ip) {

    if (!ip) {

        return {
            city: "Unknown",
            region: "Unknown",
            country: "Unknown"
        };
    }


    const cleanIP =
        ip.replace(
            /^::ffff:/,
            ""
        );


    /*
     * Local development.
     */

    if (
        cleanIP === "127.0.0.1" ||
        cleanIP === "::1" ||
        cleanIP.startsWith("10.") ||
        cleanIP.startsWith("192.168.") ||
        cleanIP.startsWith("172.16.")
    ) {

        return {
            city: "Local",
            region: "Local",
            country: "Local"
        };
    }


    try {

        const response =
            await fetch(
                `https://ipwho.is/${encodeURIComponent(cleanIP)}`
            );


        if (!response.ok) {
            throw new Error(
                "Region lookup failed"
            );
        }


        const data =
            await response.json();


        if (!data.success) {
            throw new Error(
                "Region lookup unsuccessful"
            );
        }


        return {

            city:
                data.city || "Unknown",

            region:
                data.region || "Unknown",

            country:
                data.country || "Unknown"
        };


    } catch (error) {

        console.error(
            "Region lookup error:",
            error.message
        );


        return {
            city: "Unknown",
            region: "Unknown",
            country: "Unknown"
        };
    }
}


/*
 * ==========================================
 * BROWSER DETECTION
 * ==========================================
 */

function detectBrowser(userAgent) {

    if (/Edg\//i.test(userAgent)) {
        return "Microsoft Edge";
    }

    if (/OPR\//i.test(userAgent)) {
        return "Opera";
    }

    if (/Firefox\//i.test(userAgent)) {
        return "Firefox";
    }

    if (/Chrome\//i.test(userAgent)) {
        return "Chrome";
    }

    if (
        /Safari\//i.test(userAgent)
    ) {
        return "Safari";
    }

    return "Unknown";
}


/*
 * ==========================================
 * OS DETECTION
 * ==========================================
 */

function detectOS(userAgent) {

    if (/Windows NT/i.test(userAgent)) {
        return "Windows";
    }

    if (/Android/i.test(userAgent)) {
        return "Android";
    }

    if (
        /iPhone|iPad|iPod/i.test(userAgent)
    ) {
        return "iOS";
    }

    if (/webOS/i.test(userAgent)) {
        return "webOS";
    }

    if (/Mac OS X/i.test(userAgent)) {
        return "macOS";
    }

    if (/Linux/i.test(userAgent)) {
        return "Linux";
    }

    return "Unknown";
}


/*
 * ==========================================
 * TELEGRAM
 * ==========================================
 */

async function sendTelegramMessage(
    message
) {

    const {
        botToken,
        chatId
    } = loadConfig();


    if (
        !botToken ||
        !chatId
    ) {

        throw new Error(
            "Telegram configuration missing"
        );
    }


    const telegramURL =
        `https://api.telegram.org/bot${botToken}/sendMessage`;


    const response =
        await fetch(
            telegramURL,
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    chat_id: chatId,
                    text: message
                })

            }
        );


    if (!response.ok) {

        throw new Error(
            "Telegram request failed"
        );
    }
}


/*
 * ==========================================
 * VISITOR ALERT ENDPOINT
 * ==========================================
 */

app.post(
    "/visitor-alert",
    async (req, res) => {

        try {

            const {
                deviceType,
                userAgent,
                language,
                screenWidth,
                screenHeight,
                timezone
            } = req.body || {};


            const clientKey =
                getClientKey(req);


            /*
             * Don't notify repeatedly.
             */

            if (
                !shouldSendAlert(
                    clientKey
                )
            ) {

                return res.status(200).json({
                    success: true,
                    notified: false
                });
            }


            const safeUserAgent =
                typeof userAgent === "string"
                    ? userAgent.slice(0, 1000)
                    : "";


            const safeDevice =
                typeof deviceType === "string"
                    ? deviceType.slice(0, 50)
                    : "Unknown";


            const safeLanguage =
                typeof language === "string"
                    ? language.slice(0, 50)
                    : "Unknown";


            const safeTimezone =
                typeof timezone === "string"
                    ? timezone.slice(0, 100)
                    : "Unknown";


            const region =
                await lookupRegion(
                    clientKey
                );


            const browser =
                detectBrowser(
                    safeUserAgent
                );


            const os =
                detectOS(
                    safeUserAgent
                );


            const message = [

                "New Visitor",
                "",

                `Device: ${safeDevice}`,

                `OS: ${os}`,

                `Browser: ${browser}`,

                `Region: ${region.city}, ${region.region}, ${region.country}`,

                `Language: ${safeLanguage}`,

                `Screen: ${
                    Number(screenWidth) || 0
                }x${
                    Number(screenHeight) || 0
                }`,

                `Timezone: ${safeTimezone}`,

                `Time: ${
                    new Date().toISOString()
                }`

            ].join("\n");


            await sendTelegramMessage(
                message
            );


            return res.status(200).json({
                success: true,
                notified: true
            });


        } catch (error) {

            console.error(
                "Visitor alert error:",
                error.message
            );


            /*
             * Don't expose internal
             * server information.
             */

            return res.status(200).json({
                success: false
            });
        }
    }
);


/*
 * ==========================================
 * SERVER
 * ==========================================
 */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server listening on port ${PORT}`
        );

    }
);
