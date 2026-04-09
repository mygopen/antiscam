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

        // 👇 提示詞：要回完整的 4 行，並且用引導的方式讓它自然填空
        const promptText = `請分析圖片有無詐騙風險。嚴禁任何英文、思考過程或前言。
請用台灣繁體中文，根據圖片內容直接回答，並將括號替換為你的判斷結果，只輸出以下4行：
👀 畫面：這應該是【填寫圖片來源，例如：購物網頁、LINE對話、手機簡訊等】的截圖喔！
⚠️ 風險：判斷為【高、中 或 低】風險。
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
                    // 給予 150 Tokens 的空間印出這 4 行，溫度 0.2 保持微幅彈性
                    generationConfig: { maxOutputTokens: 150, temperature: 0.2 }
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

        // 👇 攔截器：動態抓取 4 行，並強制移除死板的 【 】 中括號
        const extractCleanReport = (rawText) => {
            const viewMatch = rawText.match(/👀.*?(?=\n|$)/);
            const riskMatch = rawText.match(/⚠️.*?(?=\n|$)/);
            const analysisMatch = rawText.match(/🔍.*?(?=\n|$)/);
            const adviceMatch = rawText.match(/🛡️.*?(?=\n|$)/);

            const view = viewMatch ? viewMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "👀 畫面：這看起來像是一張截圖";
            const risk = riskMatch ? riskMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "⚠️ 風險：待確認";
            const analysis = analysisMatch ? analysisMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "🔍 分析：細節待查證";
            const advice = adviceMatch ? adviceMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "🛡️ 建議：請仔細查證，勿點擊可疑連結";

            return `${view}\n${risk}\n${analysis}\n${advice}`;
        };

        let cleanReport = '';

        // ====================================================================
        // 🌟 引擎一：Google Gemma 3 4B (主將 - 極限速度)
        // ====================================================================
        try {
            const rawReport = await callGoogleGemmaAPI('gemma-3-4b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err4b) {
            console.log("⚠️ Gemma 3 4B 失敗，切換至 12B 備援...", err4b.message);
            
            // ====================================================================
            // 🌟 引擎二：Google Gemma 3 12B (副將)
            // ====================================================================
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-3-12b-it');
                cleanReport = extractCleanReport(rawReport);
                
            } catch (err12b) {
                throw new Error(`雙引擎無法服務。\n主將: ${err4b.message}\n備援: ${err12b.message}`);
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
