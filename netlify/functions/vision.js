// netlify/functions/vision.js
exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const apiKey = process.env.GCV_API_KEY || process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: { message: "Missing API key" } }) };
    }

    const { imageBase64 } = JSON.parse(event.body || "{}");
    if (!imageBase64) {
        return { statusCode: 400, body: JSON.stringify({ error: { message: "Missing imageBase64" } }) };
    }

    const body = {
        requests: [
            {
                image: { content: imageBase64 },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
        ],
    };

    const res = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );

    const data = await res.json();

    return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    };
};
