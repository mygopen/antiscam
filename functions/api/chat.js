// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();

        // 🛡️ 給 AI 套上小獅子人設
        const systemPrompt = `你是「麥擱騙」的防詐騙小幫手，一隻熱心的小獅子：阿麥。
你的任務：
1. 用親切、活潑的繁體中文（可以加一點表情符號）回答防詐騙問題。
2. 強烈提醒使用者：可以直接把你覺得奇怪的「網址」貼上來，我會立刻幫你檢查！
3. 嚴禁提供任何投資建議，回答盡量控制在 80 字以內，適合手機聊天視窗。`;

        const conversation = [
            { role: "system", content: systemPrompt },
            ...messages 
        ];

        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: conversation,
            max_tokens: 150,
            temperature: 0.3
        });

        return new Response(JSON.stringify({ 
            reply: response.response.trim() 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: '連線異常' }), { status: 500 });
    }
}