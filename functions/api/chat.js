// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 檢查 AI 綁定是否存在
        if (!env.AI) {
            throw new Error("Cloudflare 尚未綁定 AI 服務 (env.AI is undefined)");
        }

        const { messages } = await request.json();

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

        // 換上最老牌穩定的 Llama 3 8B 模型
        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: conversation,
            max_tokens: 80,   
            temperature: 0.6  
        });

        // 確保 response 有正確回傳
        if (!response || !response.response) {
             throw new Error("模型 API 回傳空白 (Response is empty)");
        }

        return new Response(JSON.stringify({ 
            reply: response.response.trim() 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        // 把錯誤印在終端機，同時回傳給前端
        console.error("Chat API 錯誤:", err.message);
        return new Response(JSON.stringify({ error: '連線異常', details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
