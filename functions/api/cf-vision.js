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

        // 👇 採用你的極簡提示詞，解放 Gemma 的運算負擔
        const promptText = `請用2句話判斷圖片有無詐騙風險與原因，全使用繁體中文，嚴禁解釋。`;

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
                    // 只要 2 句話，Tokens 給 60 就足夠了
                    generationConfig: { maxOutputTokens: 60, temperature: 0.1 }
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

        // 👇 智慧排版攔截器：把 AI 吐出的一整段話，硬生生切成漂亮的 3 行
        const formatReport = (rawText) => {
            // 清理掉任何 AI 可能偷渡的 Markdown 符號
            let text = rawText.replace(/[*#_`~]/g, '').trim();
            
            // 判斷風險高低 (粗略的關鍵字比對)
            let riskLevel = "待確認";
            if (text.includes("高") || text.includes("詐騙") || text.includes("可疑") || text.includes("釣魚")) {
                riskLevel = "高";
            } else if (text.includes("低") || text.includes("正常") || text.includes("安全")) {
                riskLevel = "低";
            }

            // 把 AI 的回覆用標點符號切開，取前兩句當作原因
            const sentences = text.split(/[。！？\n]/).map(s => s.trim()).filter(s => s.length > 2);
            const reason = sentences.length > 0 ? sentences[0] : "細節待查證";
            const advice = sentences.length > 1 ? sentences[1] : "請勿隨意點擊連結或提供個資";

            // 由程式碼強制套上我們想要的 UI 格式
            return `⚠️ 風險：【${riskLevel}】\n🔍 分析：${reason}\n🛡️ 建議：${advice}`;
        };

        let cleanReport = '';

        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            cleanReport = formatReport(rawReport);
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗，切換至 31B...", err26b.message);
            
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                cleanReport = formatReport(rawReport);
                
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
