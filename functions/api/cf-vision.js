// 檔案路徑：functions/api/cf-vision.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. 解析前端傳來的圖片
        const formData = await request.formData();
        const imageFile = formData.get('image');
        
        if (!imageFile) {
            return new Response(JSON.stringify({ error: '未找到上傳的圖片' }), { status: 400 });
        }

        // 2. 將圖片轉換成 Cloudflare AI 支援的位元組陣列
        const arrayBuffer = await imageFile.arrayBuffer();
        const imageArray = Array.from(new Uint8Array(arrayBuffer));

// 3. 【精準防誤判版】優化新聞/影片的判斷，並套用指定文案
        const promptText = `你是一位資安分析專家。請分析圖片中的詐騙風險，並嚴格遵守以下規則：
1. 輸出格式必須完全模仿下方的範例。
2. 僅限純文字與 Emoji，禁止使用任何星號(*)、井字號(#)或其他 Markdown 標記。
3. 若無發現破綻，請寫「未發現明顯特徵」。
4. 總字數嚴格控制在 150 字以內。

【輸出範例】
⚠️ ［風險評估］：高風險 - 一頁式網購詐騙
🔍 ［具體破綻分析］：
🔸 網域異常：使用「-tw.vip」等免洗網域。
🔸 悲情行銷：圖片強調「倒閉清倉」誘導下單。
🛡️ ［防護建議］：這是典型詐騙，請勿輸入個資或刷卡，有疑問請撥 165。

【待分析截圖】
（請根據圖片內容，套用上方格式直接輸出結果）`;

        let response;
        try {
            // 4. 第一次嘗試正常呼叫視覺模型
response = await env.AI.run(
    '@cf/google/gemma-3-12b-it', // 更換為 Gemma 3
    {
        prompt: promptText,
        image: imageArray,
        max_tokens: 1024 // 新增此參數，防止輸出被截斷
    }
);
        } catch (aiError) {
// 5. 攔截錯誤並自動處理
if (aiError.message && aiError.message.includes('agree')) {
    await env.AI.run('@cf/google/gemma-3-12b-it', { prompt: 'agree' });
    
    response = await env.AI.run(
        '@cf/google/gemma-3-12b-it',
        {
            prompt: promptText,
            image: imageArray,
            max_tokens: 1024
        }
    );
}
            } else {
                throw aiError;
            }
        }

        // 6. 回傳分析報告給前端
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
