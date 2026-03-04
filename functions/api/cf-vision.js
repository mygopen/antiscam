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
        const imageArray = Array.from(new Uint8Array(arrayBuffer));

        // 【優化版提示詞】使用範例引導，強制純文字輸出
        const promptText = `你是一位資安分析專家。請精準分析圖片中的詐騙風險：
1. 僅限純文字與 Emoji，嚴禁使用任何星號(*)、井字號(#)或 Markdown 格式。
2. 若無明顯破綻，請回覆「未發現明顯特徵」。
3. 總字數嚴格控制在 150 字內，結尾需完整。

【輸出範例】
⚠️ ［風險評估］：高風險 - 一頁式網購詐騙
🔍 ［具體破綻分析］：
🔸 網域異常：使用「-tw.vip」等非官方網域。
🔸 誘導手法：出現「限時倒數」與「悲情行銷」字眼。
🛡️ ［防護建議］：這是典型詐騙，請勿輸入信用卡資訊，疑問請撥 165。

【待分析截圖內容】
（請根據圖片內容，套用上方格式直接輸出結果）`;

        // 建議暫時維持使用 llama-3.2-11b-vision-instruct，因為它確定支援 image 參數
        const model = '@cf/meta/llama-3.2-11b-vision-instruct';

        let response;
        try {
            response = await env.AI.run(model, {
                prompt: promptText,
                image: imageArray,
                max_tokens: 1024 // 關鍵：解決截斷問題
            });
        } catch (aiError) {
            // 自動同意條款邏輯
            if (aiError.message && aiError.message.includes('agree')) {
                await env.AI.run(model, { prompt: 'agree' });
                response = await env.AI.run(model, {
                    prompt: promptText,
                    image: imageArray,
                    max_tokens: 1024
                });
            } else {
                throw aiError;
            }
        }

        return new Response(JSON.stringify({ report: response.response }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'AI 圖片分析失敗', details: err.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
