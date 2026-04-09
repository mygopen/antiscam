// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();

        // 🛡️ 重新調整阿麥的人設：允許友善的自我介紹，但依然拒絕長篇閒聊
        const systemPrompt = `你是「麥擱騙」的防詐騙小幫手：阿麥 🦁。
你的任務與個性：
1. 【簡短友善】回答請控制在 30~50 字以內，語氣要像隻熱心的小獅子。
2. 【語言】只能用「台灣繁體中文」。
3. 【功能介紹】如果使用者打招呼、說 OK、或問你能做什麼（例如「可以問什麼」），請友善回答：「你可以把可疑的網址貼給我，或是上傳截圖，阿麥會幫你檢查有沒有詐騙風險喔！🦁」
4. 【拒絕閒聊】如果是完全無關的長篇大論，再委婉提醒你只負責防詐騙。`;

        const conversation = [
            { role: "system", content: systemPrompt },
            ...messages 
        ];

        // 👇 換上極速文字大腦 Gemma 3 1B
        const response = await env.AI.run('@cf/google/gemma-3-1b-it', {
            messages: conversation,
            max_tokens: 80,   
            temperature: 0.6  // 稍微調高溫度，讓對話比較自然不死板
        });

        return new Response(JSON.stringify({ 
            reply: response.response.trim() 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        // 把真實的錯誤原因印出來，方便未來除錯
        return new Response(JSON.stringify({ error: '連線異常', details: err.message }), { status: 500 });
    }
}
