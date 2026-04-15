// 檔案路徑：functions/api/report.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { url, riskScore, aiAnalysis } = body;

        if (!url) {
            return new Response(JSON.stringify({ error: "Missing URL parameter" }), { status: 400 });
        }

        // 依據 PDF 文件提供的 API Token (未來建議可移至 Cloudflare 環境變數)
        const NETSAFER_TOKEN = env.NETSAFER_API_TOKEN || "0b755ce0b5f70a4eadc60cd74720a0bdecffc6e3";

        // 依照 PDF API 文件組裝 Payload
        const payload = {
            feature_string: url,
            content: `麥擱騙系統偵測高風險(${riskScore}分)\n${aiAnalysis || ''}`.substring(0, 490),
            type: "OTHER",          // 預設為其他類型
            platform: "web",        // 平台為 web
            charge_type: "42",      // 依據文件範例 web 對應 42
            note: "使用者透過麥擱騙防詐系統自主通報",
            data: {
                web_42_note: "從網站自動通報"
            }
        };

        const response = await fetch('https://netsafer.tw/api/external/v2', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${NETSAFER_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 依照文件，成功會回傳 201
        if (response.status === 201 || data.success) {
            return new Response(JSON.stringify({ success: true, message: data.message || "舉報已接收" }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({ success: false, error: data }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
