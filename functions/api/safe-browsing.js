// 檔案路徑：functions/api/safe-browsing.js

export async function onRequest(context) {
    const { request, env } = context;
    const urlParams = new URL(request.url).searchParams;
    const targetUrl = urlParams.get("url");

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });
    }

    // 🔒 記得要去 Cloudflare Pages 的環境變數中設定 GOOGLE_SAFE_BROWSING_API_KEY
    const API_KEY = env.GOOGLE_SAFE_BROWSING_API_KEY;
    if (!API_KEY) {
        // 如果沒設定 Key，預設回傳安全，避免卡死前端流程
        return new Response(JSON.stringify({ isUnsafe: false, message: "API Key not configured" }));
    }

    const apiUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${API_KEY}`;

    // 依照 Google 官方文件要求的 Payload 格式
    const payload = {
        client: {
            clientId: "mygopen-antiscam",
            clientVersion: "1.0.0"
        },
        threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [
                { url: targetUrl }
            ]
        }
    };

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        // 如果 Google 回傳的 matches 陣列有東西，就代表是危險網址！
        const isUnsafe = data.matches && data.matches.length > 0;
        const threatDetails = isUnsafe ? data.matches[0].threatType : null;

        return new Response(JSON.stringify({
            isUnsafe: isUnsafe,
            threatType: threatDetails
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ isUnsafe: false, error: err.message }), { status: 500 });
    }
}
