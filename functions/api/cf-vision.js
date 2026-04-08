// 檔案路徑：functions/api/cf-vision.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        
        if (!imageFile) {
            return new Response(JSON.stringify({ error: '未找到上傳的圖片' }), { status: 400 });
        }

        const arrayBuffer = await imageFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binary);
        const mimeType = imageFile.type || 'image/jpeg';

        const promptText = `請立刻分析這張圖片的詐騙或風險。禁止寒暄、禁用 Markdown (不可用星號粗體)。字數控制在 180 字內。
        
🚨【最高優先指令 1】：請務必仔細掃描圖片頂部是否有「瀏覽器網址列」。若有出現網址，請優先判斷該網域是否可疑（例如：拼字錯誤的假冒品牌、亂碼、異常後綴如 .top/.xyz/.vip，或直接使用 IP），並將「可疑網址」列為第一點疑慮！
🚨【最高優先指令 2】：若圖片看起來像是「電子郵件 (Email)」、「簡訊」或「LINE 對話」，請務必在防護建議中強制加入這句警告：「請注意！詐騙常將惡意網址隱藏在正常的文字底層（超連結偽裝），請長按複製真實網址後來此文字框進行檢測，勿直接點擊！」

請嚴格依下列格式輸出：
⚠️ 風險評估：【高/中/低風險】 - 【一句話總結】
🔍 疑慮分析：(最多2點，若無疑慮請寫「細節尚待查證」)
1. 【網址異常/風險類別】：「【引用圖中網址或文字】」【說明可疑處】
🛡️ 防護建議：【一句話防護建議】`;

        // ====================================================================
        // 🌟 抓漏模式：強制只使用 Google Gemini，並捕捉真實錯誤
        // ====================================================================
        if (!env.GEMINI_API_KEY) {
            throw new Error("Cloudflare 環境變數中沒有找到 GEMINI_API_KEY，請確認是否設定正確！");
        }

        // 使用最穩定的官方模型名稱
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
        
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: mimeType, data: base64String } }
                    ]
                }],
                generationConfig: { maxOutputTokens: 250, temperature: 0.2 }
            })
        });

        const geminiData = await geminiRes.json();

        // 🚨 抓漏核心：如果 Google 拒絕連線，直接把 Google 的錯誤訊息丟到畫面上
        if (!geminiRes.ok) {
            const errorMsg = geminiData.error ? geminiData.error.message : '未知錯誤';
            throw new Error(`Google Gemini 拒絕處理 (${geminiRes.status})：${errorMsg}`);
        }

        let cleanReport = geminiData.candidates[0].content.parts[0].text;
        cleanReport = cleanReport.replace(/[*#_`~]/g, '').trim();
        
        return new Response(JSON.stringify({ report: cleanReport }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        // 將具體的錯誤訊息回傳給前端 UI 顯示
        return new Response(JSON.stringify({ error: 'AI 圖片分析失敗', details: err.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
