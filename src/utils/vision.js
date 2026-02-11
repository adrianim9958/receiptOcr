const IS_DEV =
    (typeof process !== "undefined" &&
        process.env &&
        process.env.NODE_ENV === "development") ||
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV);

async function callVisionAnnotateDirect(base64Content) {
    const key = import.meta.env.VITE_GCV_API_KEY;
    if (!key) throw new Error("VITE_GCV_API_KEY가 없습니다. (.env 확인)");

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;

    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: [
                {
                    image: { content: base64Content },
                    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                },
            ],
        }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "Vision API 오류");
    return data;
}

async function callVisionAnnotateNetlify(base64Content) {
    const r = await fetch("/.netlify/functions/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Content }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "Netlify Function 오류");
    return data;
}

export async function callVisionAnnotate(base64Content) {
    return IS_DEV ? callVisionAnnotateDirect(base64Content) : callVisionAnnotateNetlify(base64Content);
}
