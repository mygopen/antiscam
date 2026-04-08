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

        // 👇 重點 1：提示詞給予明確模板，並嚴禁「Input:」等前言
        const promptText = `判斷圖片有無詐騙風險。嚴禁英文、思考過程與「Input:」前言。
直接以繁體中文輸出以下3行：
⚠️ 風險：[高/中/低]
🔍 分析：[1句話說明可疑處]
🛡️ 建議：[1句話防護建議]`;

        if (!env.GEMINI_API_KEY) {
            throw new Error("Cloudflare 環境變數中沒有找到 GEMINI_API_KEY！");
        }

        const callGoogleGemmaAPI = async (modelName) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType: mimeType, data: base64String } }
                        ]
                    }],
                    // 給予 120 Tokens 確保它有空間印出這 3 行
                    generationConfig: { maxOutputTokens: 120, temperature: 0.1 }
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const errorMsg = data.error ? data.error.message : res.statusText;
                throw new Error(`${modelName} API 失敗 (${res.status}): ${errorMsg}`);
            }

            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        };

        // 👇 重點 2：金鐘罩攔截器 (Regex)
        // 就算 AI 不聽話寫了英文，我們只精準「抽出」帶有這三個符號的句子！
        const extractCleanReport = (rawText) => {
            const riskMatch = rawText.match(/⚠️.*?(?=\n|$)/);
            const analysisMatch = rawText.match(/🔍.*?(?=\n|$)/);
            const adviceMatch = rawText.match(/🛡️.*?(?=\n|$)/);

            const risk = riskMatch ? riskMatch[0].trim() : "⚠️ 風險：待確認";
            const analysis = analysisMatch ? analysisMatch[0].trim() : "🔍 分析：細節待查證";
            const advice = adviceMatch ? adviceMatch[0].trim() : "🛡️ 建議：請勿隨意點擊連結或提供個資";

            return `${risk}\n${analysis}\n${advice}`;
        };

        let cleanReport = '';

        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗，切換至 31B...", err26b.message);
            
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                cleanReport = extractCleanReport(rawReport);
                
            } catch (err31b) {
                throw new Error(`雙引擎無法服務。\n26B: ${err26b.message}\n31B: ${err31b.message}`);
            }
        }

        return new Response(JSON.stringify({ report: cleanReport }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'AI 圖片分析失敗', details: err.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
