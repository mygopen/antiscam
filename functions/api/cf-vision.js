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

        // 👇 終極防呆提示詞：明確要求「替換括號內容」，防止 AI 照抄模板
        const promptText = `請分析圖片有無詐騙風險。嚴禁任何英文、思考過程或「Input:」前言。
請用台灣繁體中文，根據圖片內容直接回答並「替換括號中的提示」，輸出以下3行：
⚠️ 風險：【只回答 高、中 或 低】
🔍 分析：【一句話指出圖片最可疑的地方】
🛡️ 建議：【一句話給予防護建議】`;

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
                    // 👇 將溫度微調至 0.2，給它一點點思考空間，避免它因為太死板而照抄模板
                    generationConfig: { maxOutputTokens: 120, temperature: 0.2 }
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

        // 👇 金鐘罩攔截器 (Regex)：精準抽出帶有這三個符號的句子，無視廢話
        const extractCleanReport = (rawText) => {
            const riskMatch = rawText.match(/⚠️.*?(?=\n|$)/);
            const analysisMatch = rawText.match(/🔍.*?(?=\n|$)/);
            const adviceMatch = rawText.match(/🛡️.*?(?=\n|$)/);

            // 移除 AI 可能加上的 Markdown 粗體星號
            const risk = riskMatch ? riskMatch[0].replace(/[*#_`~]/g, '').trim() : "⚠️ 風險：待確認";
            const analysis = analysisMatch ? analysisMatch[0].replace(/[*#_`~]/g, '').trim() : "🔍 分析：細節待查證";
            const advice = adviceMatch ? adviceMatch[0].replace(/[*#_`~]/g, '').trim() : "🛡️ 建議：請勿隨意點擊連結或提供個資";

            return `${risk}\n${analysis}\n${advice}`;
        };

        let cleanReport = '';

        // ====================================================================
        // 🌟 引擎一：Google Gemma 3 12B (主將 - 速度與智力的完美平衡，14.4K 額度)
        // ====================================================================
        try {
            const rawReport = await callGoogleGemmaAPI('gemma-3-12b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err12b) {
            console.log("⚠️ Gemma 3 12B 失敗，切換至 4B 備援...", err12b.message);
            
            // ====================================================================
            // 🌟 引擎二：Google Gemma 3 4B (副將 - 極限速度)
            // ====================================================================
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-3-4b-it');
                cleanReport = extractCleanReport(rawReport);
                
            } catch (err4b) {
                throw new Error(`雙引擎無法服務。\n主將: ${err12b.message}\n備援: ${err4b.message}`);
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
