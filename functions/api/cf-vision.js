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

        // 3. 提示詞工程 (Prompt Engineering) - 強制指定回覆格式
        const promptText = `你是一位台灣的專業防詐騙專家。請分析這張網頁或對話截圖，判斷是否為詐騙。
請務必「嚴格」依照以下格式回覆，不要加入額外的寒暄用語，並根據截圖內容具體列出 3 點原因：

要當心這可能是詐騙，務必多方查證！

原因如下：
1. 該訊息要求輸入信用卡詳細資料，包括卡號、安全碼等，這是典型的詐騙手法。 (如果圖片沒有提及信用卡，請根據圖片實際的詐騙手法改寫這一點)
2. (請根據圖片內容指出冒用官方機構、語氣急迫或是不合理的高報酬風險)
3. (請補充一個合理的詐騙可疑點，例如網址特徵或索取不必要的個資)

建議您不要輸入任何個人或金融資訊，並提高警覺。若有疑慮，可直接聯絡官方客服確認活動真偽。也可以撥打165反詐騙專線尋求協助。`;

        // 4. 呼叫 Cloudflare 的免費視覺模型
        const response = await env.AI.run(
            '@cf/meta/llama-3.2-11b-vision-instruct',
            {
                prompt: promptText,
                image: imageArray
            }
        );

        // 5. 回傳分析報告給前端
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
