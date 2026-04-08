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

        // 👇 極度修剪的 Prompt：拿掉所有會引發 AI 思考的複雜情境，只留最簡單直接的填空要求
        const promptText = `請以「台灣繁體中文」簡單回答這張圖有無詐騙風險。嚴禁英文、嚴禁解釋。

請只輸出以下 3 行，絕不囉唆：
⚠️ 風險：【高/中/低】 - 【極短總結】
🔍 疑慮：【一句話指出可疑處，無則寫待查】
🛡️ 建議：【一句話給建議】`;

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
                    // 👇 長度放寬到 150 避免斷頭，溫度維持 0.1 保持穩定
                    generationConfig: { maxOutputTokens: 150, temperature: 0.1 }
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

        let cleanReport = '';

        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            // 清除可能殘留的奇怪標籤或 Markdown
            cleanReport = rawReport.replace(/[*#_`~]/g, '').replace(/Input:[\s\S]*Final Output:/gi, '').trim();
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗或塞車，切換至 31B 備援...", err26b.message);
            
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                cleanReport = rawReport.replace(/[*#_`~]/g, '').replace(/Input:[\s\S]*Final Output:/gi, '').trim();
                
            } catch (err31b) {
                throw new Error(`雙引擎皆無法服務。\n26B 錯誤: ${err26b.message}\n31B 錯誤: ${err31b.message}`);
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
