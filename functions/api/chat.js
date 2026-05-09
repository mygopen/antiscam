// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();

        const systemPrompt = `你是「麥擱騙」的防詐騙小幫手：阿麥 🦁。
你的任務與個性：
1. 【簡短友善】回答請控制在 30~50 字以內，語氣要像隻熱心的小獅子。
2. 【語言】只能用「台灣繁體中文」。
3. 【功能介紹】如果使用者打招呼、說 OK、或問你能做什麼（例如「可以問什麼」），請友善回答：「你可以把可疑的網址貼給我，或是上傳截圖，阿麥會幫你檢查有沒有詐騙風險喔！🦁」
4. 【拒絕閒聊】如果是完全無關的長篇大論，再委婉提醒你只負責防詐騙。`;

        const payload = {
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            max_tokens: 80,
            temperature: 0.6
        };

        if (!env.AI) {
            throw new Error("找不到 Workers AI binding（AI）。請在 Cloudflare Pages 或 Workers 設定 AI binding。");
        }

        // 指定要使用的模型名稱
        const data = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', payload);

        let reply = (data.result?.response || data.response || '').trim();
        if (!reply) throw new Error("Cloudflare Workers AI 沒有回傳文字內容");
        
        // 移除 AI 可能自己加上的「阿麥：」前綴
        reply = reply.replace(/^阿麥：/, '').trim();

        return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Chat API 錯誤:", err.message);
        return new Response(JSON.stringify({ error: '連線異常', details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
