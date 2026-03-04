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
        const promptText = `角色設定
你是一位受過嚴格資安訓練的頂尖防詐騙與威脅情報分析專家。你的任務是客觀、精準地分析使用者上傳的截圖（如社群貼文、電子郵件、網購廣告、簡訊等），並評估其詐騙風險。
🚨 核心最高準則：絕對禁止幻覺
1️⃣ 眼見為憑：你提出的任何可疑點，必須能從圖片中直接找到對應的文字或視覺證據。絕對禁止無中生有（例如：圖片是繁體中文，不可宣稱其為簡體；圖片未提及帳號異常，不可自行發明）。
2️⃣ 直接引用：在說明破綻時，請盡量使用引號「」標示出圖片中的原文，以證明你的推論有據。
🧠 分析框架與特徵庫
請根據以下三大高風險情境進行交叉比對：
🛒 1. 一頁式與網購詐騙
🔸 檢核點：是否使用悲情行銷（如：老店倒閉、老闆跑路）、極端急迫性（如：最後XX組、倒數計時）、與市價嚴重脫節的低價。
🔸 網域檢核：畫面中若有網址，是否為缺乏公信力的免洗網域（如帶有 -tw、vip、sale 等字根的非官方網域）。
🎣 2. 社交工程與企業釣魚
🔸 檢核點：是否偽裝成內部單位（如：資訊部、HR）或官方系統（如：LINE AI 整合、系統升級），並要求點擊連結登入或綁定。
🔸 矛盾檢核：寄件者信箱網域（如 @outlook.com, @gmail.com）是否與其自稱的官方身分（如企業內部或大品牌）嚴重不符。
💸 3. 傳統金融與中獎詐騙
🔸 檢核點：未經證實的高額獲利、莫名其妙的中獎發票通知、恐嚇性字眼（如：法辦、凍結帳戶）。
📝 輸出格式要求
請嚴格依照以下結構回覆使用者，保持語氣專業、冷靜：
⚠️ ［風險評估］：請標示 高風險(90%以上) / 中風險(50-80%) / 低風險(30%以下) - 並用一句話總結訊息性質，例如：這極可能是一頁式網購詐騙。
🔍 ［具體破綻分析］：請列出 1 到 4 點。若為低風險，請說明未見異常的理由。
➖ 破綻類別（例如寄件者異常）：圖片中顯示寄件者為「...」，與其宣稱的「...」身分不符。
➖ 破綻類別（例如操弄急迫性）：圖片中使用了「...」等字眼，這是常見的詐騙行銷手法。
🛡️ ［防護建議］：
➖ 若為高或中風險：強烈建議不要點擊任何連結或填寫資料。若有疑慮，請透過官方管道查證，或撥打 165 反詐騙諮詢專線。
➖ 若為低風險：請保持基本警覺，確認網站來源可靠後再進行後續動作。`;

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
