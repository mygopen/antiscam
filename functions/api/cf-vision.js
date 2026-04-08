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
        
        // 將圖片轉換為 Base64 格式
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binary);
        const mimeType = imageFile.type || 'image/jpeg';

        // 防詐專用提示詞
        const promptText = `請立刻分析這張圖片的詐騙或價值不合理的風險。禁止寒暄、禁用 Markdown (不可用星號粗體)。字數須在 150 字內，沒有疑慮就不要湊數。
        
請嚴格依下列格式輸出：
⚠️ 風險評估：【高/中/低風險】 - 【一句話總結】
🔍 疑慮分析：(最多2點，若無疑慮請寫「細節尚待查證」)
1. 【風險類別】：「【引用圖中文字】」【說明可疑處】
🛡️ 防護建議：【一句話防護建議】`;

        // ====================================================================
        // 🌟 引擎一：Google Gemini 1.5 Flash (主將 - 每日免費 1500 次)
        // ====================================================================
        if (env.GEMINI_API_KEY) {
            try {
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

                // 如果 Gemini 額度用盡 (429) 或發生異常，強制拋出錯誤讓下方 Catch 接手
                if (!geminiRes.ok) {
                    throw new Error(`Gemini API Failed with status: ${geminiRes.status}`);
                }

                const geminiData = await geminiRes.json();
                let cleanReport = geminiData.candidates[0].content.parts[0].text;
                cleanReport = cleanReport.replace(/[*#_`~]/g, '').trim();
                
                return new Response(JSON.stringify({ report: cleanReport }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (geminiErr) {
                // Gemini 失敗，不中斷程式，繼續往下交給 Cloudflare 備援引擎
                console.log("⚠️ Gemini 處理失敗或額度耗盡，自動切換至 Cloudflare 備援引擎...");
            }
        }

        // ====================================================================
        // 🌟 引擎二：Cloudflare Workers AI (副將 - 自動備援機制)
        // ====================================================================
        const imageUri = `data:${mimeType};base64,${base64String}`;
        const model = '@cf/meta/llama-4-scout-17b-16e-instruct';

        let response;
        try {
            response = await env.AI.run(model, {
                messages: [
                    { 
                        role: "user", 
                        content: [
                            { type: "text", text: promptText },
                            { type: "image_url", image_url: { url: imageUri } }
                        ] 
                    }
                ],
                max_tokens: 250,
                temperature: 0.2
            });
        } catch (aiError) {
            // 自動同意條款的防呆機制
            if (aiError.message && aiError.message.includes('agree')) {
                await env.AI.run(model, { prompt: 'agree' }); 
                response = await env.AI.run(model, {
                    messages: [
                        { 
                            role: "user", 
                            content: [
                                { type: "text", text: promptText },
                                { type: "image_url", image_url: { url: imageUri } }
                            ] 
                        }
                    ],
                    max_tokens: 250,
                    temperature: 0.2
                });
            } else {
                throw aiError;
            }
        }

        let cleanReport = response.response;
        if (cleanReport) {
            cleanReport = cleanReport.replace(/[*#_`~]/g, '').trim();
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
