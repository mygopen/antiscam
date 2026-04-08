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
                    // 稍微放寬 Tokens，讓它有空間把腦內的碎碎念跑完，才不會切斷最終答案
                    generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
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

        // 👇 🌟 終極殺手鐧：物理攔截器 🌟 👇
        const extractCleanReport = (rawText) => {
            // 將所有文字按換行切開
            const lines = rawText.split('\n').map(line => line.trim());
            // 只保留開頭是這三個表情符號的句子
            const validLines = lines.filter(line => 
                line.startsWith('⚠️') || line.startsWith('🔍') || line.startsWith('🛡️')
            );
            
            // 由於 AI 可能會在草稿中重複寫出這些格式，我們只取「最後出現的 3 行」（通常是最完美的定稿）
            if (validLines.length >= 3) {
                return validLines.slice(-3).join('\n');
            }
            
            // 萬一它真的沒照格式，就退回基本的去除特殊符號
            return rawText.replace(/[*#_`~]/g, '').trim();
        };

        let cleanReport = '';

        // ====================================================================
        // 🌟 引擎一：Google Gemma 4 26B (主將)
        // ====================================================================
        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            // 將原始的長篇大論丟給攔截器處理
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗或塞車，切換至 31B 備援...", err26b.message);
            
            // ====================================================================
            // 🌟 引擎二：Google Gemma 4 31B (副將)
            // ====================================================================
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                // 同樣使用攔截器處理
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
