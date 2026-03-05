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
        
        // 將圖片轉換為 Base64 格式 (Cloudflare Workers AI 多模態新版 API 要求)
        // 使用迴圈處理避免大檔案造成 Call Stack Exceeded
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binary);
        const mimeType = imageFile.type || 'image/jpeg';
        // 組裝成 Data URI 格式
        const imageUri = `data:${mimeType};base64,${base64String}`;

        // 優化版 Prompt：捨棄多餘的特徵庫與角色扮演，直接下達強硬指令以節省輸入神經元
        const promptText = `請立刻分析這張圖片的詐騙或假訊息風險。禁止寒暄、禁用 Markdown (不可用星號粗體)。字數須在 150 字內，沒有破綻就不要湊數。
        
請嚴格依下列格式輸出：
⚠️ 風險評估：【高/中/低風險】 - 【一句話總結】
🔍 破綻分析：(最多2點，若無破綻請寫「無明顯破綻」)
1. 【類別】：「【引用圖中文字】」【說明可疑處】
🛡️ 防護建議：【一句話防護建議】`;

        // 註：若此模型後續回報 404 或報錯，請改回官方穩定的: '@cf/meta/llama-3.2-11b-vision-instruct'
        const model = '@cf/meta/llama-4-scout-17b-16e-instruct';

        let response;
        try {
            response = await env.AI.run(model, {
                // 使用 OpenAI 相容的 content 陣列格式，把圖文綁在一起發送
                messages: [
                    { 
                        role: "user", 
                        content: [
                            { type: "text", text: promptText },
                            { type: "image_url", image_url: { url: imageUri } }
                        ] 
                    }
                ],
                // 大幅縮減輸出長度，防止模型亂聊浪費神經元計費
                max_tokens: 250,
                // 加上 temperature 讓輸出更固定，減少神經網路過度發散的計算
                temperature: 0.2
            });
        } catch (aiError) {
            // 自動同意條款的防呆機制
            if (aiError.message && aiError.message.includes('agree')) {
                await env.AI.run(model, { prompt: 'agree' }); 
                // 同意後，再送出一次圖文請求 (此處也一併套用優化的限制)
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

        // 【雙重保險：程式碼後處理】
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
