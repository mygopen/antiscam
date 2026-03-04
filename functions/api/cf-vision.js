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
        const promptText = `👤 角色設定
你是一位受過嚴格資安訓練的頂尖防詐騙與威脅情報分析專家。你的任務是客觀、精準地分析使用者上傳的截圖，並評估其詐騙風險。
🚨 核心最高準則（嚴格遵守）
1️⃣ 眼見為憑：提出的任何可疑點，必須能從圖片中直接找到證據。禁止無中生有。
2️⃣ 直接引用：說明破綻時，務必使用引號「」標示出圖片中的原文。
3️⃣ 禁止照抄模板與規則：絕對不可以輸出「...」或「[填寫處]」等預設符號！你必須將圖片中真實的文字提取出來並進行分析。絕對不要把「檢核規則」當成「分析結果」輸出。
4️⃣ 絕對禁用 Markdown：輸出請全程使用純文字與 Emoji，絕對不可以使用星號粗體、斜體或井字號標題。
🧠 分析框架與特徵庫（請在腦中比對，不要把這段印出來）
🛒 1. 一頁式與網購詐騙：尋找悲情行銷（老店倒閉）、急迫性（最後名額）、免洗網域（如 -tw、vip、sale 等字根）。
🎣 2. 社交工程與企業釣魚：尋找偽裝官方系統、要求點擊登入、信箱網域與身分矛盾。
💸 3. 傳統金融與中獎詐騙：尋找高額獲利、莫名中獎、恐嚇字眼。
📝 輸出格式要求
請嚴格依照以下結構回覆，並將括號【】內的提示語替換為你真實的分析內容：
⚠️ ［風險評估］：【填寫：高風險(90%以上) 或 中風險(50-80%) 或 低風險(30%以下)】 - 【填寫：一句話總結訊息性質】
🔍 ［具體破綻分析］：
➖ 【填寫：破綻類別名稱，例如「操弄急迫性」】：【填寫：詳細說明圖片中哪裡有問題，必須使用引號「」引用圖片原文】
➖ 【填寫：破綻類別名稱，例如「網域異常」】：【填寫：詳細說明圖片中哪裡有問題，必須使用引號「」引用圖片原文】
（請依據圖片實際狀況列出 1 到 4 點）
🛡️ ［防護建議］：
➖ 【填寫：請針對該風險等級給予具體的防護建議，高風險務必提及 165 反詐騙專線】`;

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
