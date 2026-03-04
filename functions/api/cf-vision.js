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

        // 終極版提示詞：強化防幻覺與嚴格格式要求
        const promptText = `你是一位專業的資安分析專家，負責審查圖片中是否有詐騙特徵。
請嚴格遵守以下規則：
1. 只能輸出純文字與 Emoji，絕對不要使用任何 Markdown 標記。
2. 【極度重要】只能根據圖片中「真正存在」的文字與畫面進行分析！如果看不出明顯破綻，請直接回答「未發現明顯特徵」，絕對不可以為了湊數而憑空捏造。
3. 總字數限制在 150 字以內。

【輸出範例】（請完全模仿此格式，不要加多餘的對話）
⚠️ ［風險評估］：高風險 - 一頁式網購詐騙
🔍 ［具體破綻分析］：
🔸 網域異常：使用「-tw.vip」等非官方網域。
🔸 誘導手法：出現「限時倒數」與「悲情行銷」字眼。
🛡️ ［防護建議］：這是典型詐騙，請勿輸入信用卡資訊，疑問請撥 165。

請直接輸出分析結果：`;

// 🚀 確認使用最新的 Llama 4 多模態模型
        const model = '@cf/meta/llama-4-scout-17b-16e-instruct';

        let response;
        try {
            response = await env.AI.run(model, {
                // 修正：新版模型需改用 messages 陣列格式
                messages: [
                    { role: "user", content: promptText }
                ],
                // 修正：使用展開運算子，對 V8 引擎處理大陣列有時較友善
                image: [...new Uint8Array(arrayBuffer)], 
                max_tokens: 1024
            });
        } catch (aiError) {
            // 自動同意條款的防呆機制
            if (aiError.message && aiError.message.includes('agree')) {
                await env.AI.run(model, { prompt: 'agree' }); // 注意：同意條款可能還是只吃 prompt
                response = await env.AI.run(model, {
                    messages: [
                        { role: "user", content: promptText }
                    ],
                    image: [...new Uint8Array(arrayBuffer)],
                    max_tokens: 1024
                });
            } else {
                throw aiError;
            }
        }

        // 【雙重保險：程式碼後處理】
        // 強制用正則表達式清除 Markdown 符號，確保前端排版乾淨
        let cleanReport = response.response;
        if (cleanReport) {
            // 移除星號(*)、井字號(#)、底線(_)、反引號(`) 等常見 Markdown 標記
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
