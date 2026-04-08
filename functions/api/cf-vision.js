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

        // 👇 終極極簡提示詞：不要求特殊格式、不要求表情符號，只求最口語的「兩句話」
        const promptText = `請以「台灣繁體中文」判斷圖片有無詐騙風險。嚴禁英文、嚴禁解釋。
只需要用「兩句話」回答：
第一句指出最可疑的地方（若無則說看起來正常）。
第二句給予防護建議（若為對話截圖，請提醒惡意網址常隱藏於文字底層）。`;

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
                    // 👇 因為只要求兩句話，我們把最大 Tokens 壓縮到 60，只要它講超過大概 40 個中文字就會被強制切斷！
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

        // 👇 極簡物理攔截器：直接抓前兩句話，忽略後面所有的廢話與英文
        const extractCleanReport = (rawText) => {
            // 將 AI 回傳的文字用「句號、驚嘆號、換行」等常見分隔符號切開
            const sentences = rawText.split(/[。\n！]/).map(s => s.trim()).filter(s => s.length > 0);
            
            // 如果它很囉唆，我們就只冷酷地抓前兩句話，並手動加上句號
            if (sentences.length >= 2) {
                return `${sentences[0]}。\n${sentences[1]}。`;
            }
            
            // 萬一它只講了一句話，就直接回傳
            return rawText.replace(/[*#_`~]/g, '').trim();
        };

        let cleanReport = '';

        // ====================================================================
        // 🌟 引擎一：Google Gemma 4 26B (主將)
        // ====================================================================
        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗或塞車，切換至 31B 備援...", err26b.message);
            
            // ====================================================================
            // 🌟 引擎二：Google Gemma 4 31B (副將)
            // ====================================================================
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                cleanReport = extractCleanReport(rawReport);
                
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
