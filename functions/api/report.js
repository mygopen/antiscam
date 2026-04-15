// 檔案路徑：functions/api/report.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        const { url, riskScore, aiAnalysis } = body;

        if (!url) {
            return new Response(JSON.stringify({ error: "Missing URL parameter" }), { status: 400 });
        }

        // 依據 PDF 文件提供的 API Token
        const NETSAFER_TOKEN = env.NETSAFER_API_TOKEN || "0b755ce0b5f70a4eadc60cd74720a0bdecffc6e3";

        const payload = {
            feature_string: url,
            content: `高風險(${riskScore}分)\n${aiAnalysis || ''}`.substring(0, 490),
            type: "OTHER",
            platform: "web",
            charge_type: "42",
            note: "使用者透過麥擱騙防詐系統自主通報",
            data: {
                web_42_note: "從網站自動通報"
            }
        };

        const response = await fetch('https://netsafer.tw/api/external/v2/', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${NETSAFER_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // 💡 增強型錯誤捕捉：先讀取為純文字，避免對方回傳 HTML 錯誤頁面導致程式崩潰
        const text = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(text);
        } catch (e) {
            responseData = text; // 儲存原始字串
        }

        // 💡 特殊處理：如果 API 回傳 400 且錯誤訊息包含 feature_string，代表「此網址已被通報過」
        // 對使用者來說，這算是通報「成功」(因為網址已經在黑名單了)
        const isDuplicate = response.status === 400 && 
                            typeof responseData === 'object' && 
                            JSON.stringify(responseData).includes('feature_string');

        if (response.status === 201 || (responseData && responseData.success) || isDuplicate) {
            return new Response(JSON.stringify({ 
                success: true, 
                message: isDuplicate ? "此網址已被其他人通報過" : (responseData.message || "舉報已接收"),
                isDuplicate: isDuplicate
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            // 回傳清楚的錯誤內容給前端
            return new Response(JSON.stringify({ 
                success: false, 
                error: responseData, 
                status: response.status 
            }), {
                status: 400, // 回傳 400 讓前端 fetch 可以正常處理
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
