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

        // 👇 強化提示詞：加入強制檢查網址列與超連結警告的指令
        const promptText = `請分析圖片有無詐騙風險。嚴禁任何英文、思考過程或前言。
【特別指令】：
1. 務必優先檢查圖片最上方的「瀏覽器網址列」或文字中的網址。若發現網址是拼湊字詞、異常後綴(如.site, .vip)或假冒知名品牌，請直接在「分析」中點出。
2. 詐騙集團常使用假連結，請在「建議」中提醒民眾留意隱藏的超連結。

請用台灣繁體中文，根據圖片內容直接回答，並將括號替換為你的判斷結果，只輸出以下4行：
👀 畫面：這應該是【填寫圖片來源，例如：購物網頁、通訊聊天對話、手機簡訊等】的截圖喔！
⚠️ 風險：判斷為【高、中 或 低】風險。
🔍 分析：【一句話指出圖片最可疑的地方（若有假網址請務必寫出）】
🛡️ 建議：【一句話給予防護建議，並提醒留意假網址或隱藏的超連結】`;

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
                    // 稍微放寬 token 限制，讓它有足夠空間把網址和警告寫完整
                    generationConfig: { maxOutputTokens: 180, temperature: 0.2 }
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

        try {
            const rawReport = await callGoogleGemmaAPI('gemma-3-4b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err4b) {
            console.log("⚠️ Gemma 3 4B 失敗，切換至 12B 備援...", err4b.message);
            
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
