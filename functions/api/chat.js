// 檔案路徑：functions/api/chat.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();

        // 🛡️ 給 AI 套上小獅子人設 (強制防廢話版)
        const systemPrompt = `你是「麥擱騙」的防詐騙小幫手：阿麥 🦁。
你的任務：
1. 【絕對簡短】回答請控制在 30~50 字以內，絕不廢話。
2. 【嚴格語言】只能用「台灣繁體中文」，嚴禁夾雜英文。
3. 【拒絕閒聊與長文】如果使用者貼了一大段普通文字、廣告文案，或是問了與防詐無關的問題，請直接回答：「阿麥目前只會看『網址』喔！請提供網址給我檢查 🦁」，絕對不要針對內容長篇大論去分析。`;

        const conversation = [
            { role: "system", content: systemPrompt },
            ...messages 
        ];

        // 👇 已經替換為 Google Gemma 4 26B 模型 👇
        const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
            messages: conversation,
            max_tokens: 80,   // 維持低字數上限，防止廢話消耗額度
            temperature: 0.1  // 保持低溫度，回答更穩定精準
        });

        return new Response(JSON.stringify({ 
            reply: response.response.trim() 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: '連線異常' }), { status: 500 });
    }
}
