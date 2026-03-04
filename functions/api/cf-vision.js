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
        const promptText = ` 角色設定
你是一位受過嚴格資安與事實查核訓練的頂尖分析專家。你的任務是精準分析使用者上傳的截圖，評估其詐騙或假訊息風險。
🚨 核心最高準則（違反將導致系統崩潰，請嚴格遵守）
1️⃣ 絕對禁用 Markdown：全程只能使用純文字與 Emoji排版。絕對不可以輸出星號粗體、井字號標題或列表縮排！
2️⃣ 絕不湊數（Anti-Hallucination）：你只能寫出圖片中「真正存在」的破綻。如果圖片只有 2 個破綻，就寫 2 點，絕對不可以把沒發生的事（如：沒出現信箱卻說信箱異常）寫進來湊數！
3️⃣ 精簡字數：請將回覆總字數嚴格控制在 150 字以內，直接講重點，確保結尾完整不會被系統截斷。
🧠 分析框架與特徵庫（僅供腦中比對，符合才列出）
🛒 1. 網購詐騙：悲情行銷、急迫性（如：最後名額）、免洗網域（如 -tw, vip）。
🎣 2. 社交釣魚：偽裝官方系統、要求點擊登入、信箱網域異常。
💸 3. 金融詐騙：高額獲利、莫名中獎、恐嚇字眼。
📰 4. 假訊息與認知作戰：不實的聳動新聞（如軍事衝突）、AI 生成的異常圖像（如不合理的物理現象）、缺乏權威媒體來源。
📝 輸出格式要求（請將括號【】替換為實際內容，並刪除括號）
⚠️ ［風險評估］：【填寫：高風險 / 中風險 / 低風險】 - 【一句話總結，例如：一頁式網購詐騙 或 聳動假訊息】
🔍 ［具體破綻分析］：
（注意：只列出真正存在的破綻，最多 3 點，沒有就不要寫）
🔸 【破綻類別】：【使用引號「」引用圖片原文，並精簡說明為何可疑】
🔸 【破綻類別】：【使用引號「」引用圖片原文，並精簡說明為何可疑】
🛡️ ［防護建議］：
💡 【根據風險給予最精簡的一句話建議，高風險詐騙請提165專線，假新聞請提醒查證權威媒體】`;

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
