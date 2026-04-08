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

        // 提示詞維持極簡，讓它知道目標即可
        const promptText = `請以「台灣繁體中文」判斷圖片有無詐騙風險。嚴禁英文與解釋。
請直接輸出以下 3 行：
⚠️ 風險：【高/中/低】 - 【極短總結】
🔍 疑慮：【一句話指出可疑處】
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
                    // 👇 極限壓縮！既然我們只取第一筆，就把最大字數鎖死在剛好夠印出這三行的長度 (約 80 Tokens)
                    // 這樣就算它想繼續碎碎念，API 也會直接把它切斷，省下大把等待時間！
                    generationConfig: { maxOutputTokens: 80, temperature: 0.1 }
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

        // 👇 🌟 極速攔截器：只取第一組符合的 3 行 🌟 👇
        const extractCleanReport = (rawText) => {
            const lines = rawText.split('\n').map(line => line.trim());
            const validLines = lines.filter(line => 
                line.startsWith('⚠️') || line.startsWith('🔍') || line.startsWith('🛡️')
            );
            
            // 👇 改變邏輯：只要抓到第一組 (前 3 行) 就直接回傳，不管它後面寫了什麼！
            if (validLines.length >= 3) {
                return validLines.slice(0, 3).join('\n');
            }
            
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
