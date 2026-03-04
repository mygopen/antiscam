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
        const promptText = `你是一位台灣的專業防詐騙專家。請仔細觀察這張圖片，判斷它是否含有真實的詐騙特徵（如：釣魚信件、要求輸入信用卡號、假冒官方、不合理的高報酬投資、要求匯款等）。
如果圖片只是單純的「新聞畫面截圖」、「影片分享」、「一般文章」、「個人觀點」或「日常聊天」，且沒有要求提供個資或金錢，請務必歸類為「不是詐騙」。

請務必「嚴格」選擇以下【情況一】或【情況二】的其中一種格式進行回覆。
【極度重要排版規定】：
1. 絕對不要使用任何 Markdown 語法（例如絕對不要在句子前後加上 ** 符號）。
2. 說明原因與建議時，請「直接說明內容」，絕對不要在開頭加上 (Email)、(簡訊)、(網頁) 等情境標籤！
3. 請直接使用下方我提供的 Emoji 進行排版，不要加入任何額外的寒暄。

【情況一：如果判斷為「是詐騙」或「有極高風險」】
請輸出以下格式：
🚨 要當心有詐騙風險，務必多方查證！

🔍 原因如下：
1️⃣ (直接點出可疑處，例如寄件者信箱異常、要求輸入個資等。再次提醒：不要加 (Email) 或任何前綴)
2️⃣ (直接指出冒用官方機構、不合理通知、或語氣製造急迫感等風險)
3️⃣ (直接補充其他可疑點，例如不明連結等)

⚠️ 防詐建議：
💡 (直接給出具體建議，例如檢查來源是否與官方一致，避免點選可疑連結或提供個人資料，確保安全。不要加 (Email) 等前綴)
📞 若有疑慮，可直接聯絡官方客服確認，或撥打 165 反詐騙專線尋求協助。

【情況二：如果判斷為「不是詐騙」（例如：一般新聞畫面、影片分享、個人觀點、日常聊天等，且沒有要求匯款或點擊可疑連結）】
請輸出以下格式：
✅ 目前未發現明顯風險

💡 請注意檢查資訊來源的可靠性，並確保內容的真實性，避免因誤解而影響判斷。`;

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
