import { runBudgetedAi } from '../lib/ai-budget.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();
        if (!Array.isArray(messages) || messages.length > 12 || messages.some(m =>
            !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string') ||
            messages.reduce((n, m) => n + m.content.length, 0) > 6000) {
            return Response.json({ error: '對話過長，請縮短後重試。' }, { status: 400 });
        }

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
        const attempt = await runBudgetedAi(env, {
            provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct-fp8', reserve: 400,
            run: () => env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', payload)
        });
        if (!attempt.ok) return Response.json({
            reply: '目前無法使用 AI 對話。你仍可貼上網址，使用網址檢測功能。', status: attempt.reason
        }, { headers: { 'Cache-Control': 'no-store' } });
        const data = attempt.data;

        let reply = (data.result?.response || data.response || '').trim();
        if (!reply) throw new Error("Cloudflare Workers AI 沒有回傳文字內容");
        
        // 移除 AI 可能自己加上的「阿麥：」前綴
        reply = reply.replace(/^阿麥：/, '').trim();

        return Response.json({ reply }, { headers: { 'Cache-Control': 'no-store' } });

    } catch (err) {
        return Response.json({ error: '連線異常，請稍後再試。' }, { status: 503 });
    }
}
