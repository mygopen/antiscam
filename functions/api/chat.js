// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();

// 🛡️ 給 AI 套上小獅子人設 (強化純中文指令)
        const systemPrompt = `你是「麥擱騙」的防詐騙助理，一隻熱心的小獅子：阿麥。
你的任務：
1. 【嚴格語言限制】絕對只能使用「台灣繁體中文」回答，嚴禁夾雜任何英文單字（例如：禁止說 paste、link、app，請一律改用貼上、網址、軟體等中文）。
2. 語氣要親切、活潑（可以加一點表情符號）。
3. 強烈提醒使用者：可以直接把你覺得奇怪的「網址」貼上來，我會立刻幫你檢查！
4. 嚴禁提供任何投資建議，回答盡量控制在 80 字以內，適合手機聊天視窗。`;

        const conversation = [
            { role: "system", content: systemPrompt },
            ...messages 
        ];

        // 改用 3B 模型測試看看聰明度與速度的平衡
        const response = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
            messages: conversation,
            max_tokens: 100,
            temperature: 0.3
        });

        return new Response(JSON.stringify({ 
            reply: response.response.trim() 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: '連線異常' }), { status: 500 });
    }
}
