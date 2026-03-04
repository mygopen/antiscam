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

        // 3. 【純提示詞控制版】強迫使用 Emoji 並明令禁止 Markdown 星號
        const promptText = `你是一位台灣的專業防詐騙專家。請仔細觀察這張圖片，先判斷它是否含有詐騙特徵（如：釣魚信件、要求輸入信用卡號、假冒官方、不合理的高報酬投資等），還是只是一般的個人意見、偏激評論或日常對話。

請務必「嚴格」選擇以下【情況一】或【情況二】的其中一種格式進行回覆。
【極度重要排版規定】：絕對不要使用任何 Markdown 語法（例如 **粗體** 或 * 列表符號），請直接使用下方我提供的 Emoji 進行排版！不要加入任何額外的寒暄。

【情況一：如果判斷為「是詐騙」或「有極高風險」】
請輸出以下格式：
🚨 要當心這極可能是詐騙，務必多方查證！

🔍 原因如下：
1️⃣ (具體點出第一個可疑處。若是Email，請檢查寄件者信箱；若是網頁，請指出是否要求輸入敏感個資)
2️⃣ (指出冒用官方機構、不合理通知、或語氣製造急迫感等風險)
3️⃣ (補充其他可疑點，例如不明連結等)

⚠️ 防詐建議：
💡 (依據情境給出建議。Email/簡訊：「請注意檢查郵件的寄件者地址和內容是否與官方資訊一致，避免點選可疑連結或提供個人資料，保持謹慎，確保安全！」網頁填寫：「建議您絕對不要輸入任何信用卡號、安全碼等金融資訊，避免遭到盜刷。」)
📞 若有疑慮，可直接聯絡官方客服確認，或撥打 165 反詐騙專線尋求協助。

【情況二：如果判斷為「不是詐騙」（如：個人觀點、偏激評論、新聞等）】
請輸出以下格式：
✅ 目前未發現明顯的詐騙風險

💡 請注意，當收到涉及個人意見或批評的訊息時，建議保持冷靜，並以理性態度處理，避免因情緒影響判斷。`;

        let response;
        try {
            // 4. 第一次嘗試正常呼叫視覺模型
            response = await env.AI.run(
                '@cf/meta/llama-3.2-11b-vision-instruct',
                {
                    prompt: promptText,
                    image: imageArray
                }
            );
        } catch (aiError) {
            // 5. 攔截 5016 錯誤並自動同意條款
            if (aiError.message && aiError.message.includes('agree')) {
                await env.AI.run(
                    '@cf/meta/llama-3.2-11b-vision-instruct',
                    { prompt: 'agree' }
                );
                
                response = await env.AI.run(
                    '@cf/meta/llama-3.2-11b-vision-instruct',
                    {
                        prompt: promptText,
                        image: imageArray
                    }
                );
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
