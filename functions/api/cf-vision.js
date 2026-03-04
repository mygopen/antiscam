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

        // 針對 Qwen2-VL 優化的提示詞：直接用明確的界線與範例約束
        const promptText = `你是一位資安專家，負責審查圖片中是否有詐騙特徵。
請嚴格遵守以下 4 條鐵律：
1. 只能輸出純文字與 Emoji，【絕對禁止】使用 Markdown 語法（包含星號、井字號、粗體）。
2. 只寫圖片中真正出現的資訊，沒有破綻就寫「未發現明顯特徵」，不准為了湊數而編造。
3. 總字數限制在 150 字以內。
4. 必須 100% 模仿下方的【輸出範例】格式。

【輸出範例】
⚠️ ［風險評估］：高風險 - 一頁式網購詐騙
🔍 ［具體破綻分析］：
🔸 網域異常：使用「-tw.vip」等非官方網域。
🔸 誘導手法：出現「限時倒數」與「悲情行銷」字眼。
🛡️ ［防護建議］：這是典型詐騙，請勿輸入信用卡資訊，疑問請撥 165。

請分析使用者上傳的圖片，並直接輸出結果：`;

        // 換成專注於視覺與 OCR 的 Qwen2-VL 模型
        const model = '@cf/qwen/qwen2-vl-7b-instruct';

        let response;
        try {
            response = await env.AI.run(model, {
                prompt: promptText,
                image: imageArray,
                max_tokens: 1024 // 保持這個參數以防止字數截斷
            });
        } catch (aiError) {
            // 自動同意條款的防呆機制
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
