import { runBudgetedAi } from '../lib/ai-budget.js';
import { freeAiConfirmed } from '../lib/ai-policy.js';
import { CHAT_MODEL, CHAT_MAX_TOKENS, fixedChatReply, chatFallback, reserveChatNeurons } from '../lib/chat-policy.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { messages } = await request.json();
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12 || messages.at(-1)?.role !== 'user' || messages.some(m =>
            !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string') ||
            messages.reduce((n, m) => n + m.content.length, 0) > 6000) {
            return Response.json({ error: '對話過長，請縮短後重試。' }, { status: 400 });
        }
        const fixed = fixedChatReply(messages.at(-1).content);
        if (fixed) return Response.json({ reply: fixed, status: 'local', source: 'fixed' }, { headers: { 'Cache-Control': 'no-store' } });
        // An app-side estimate cannot prevent account-wide paid overages.
        // Enable only after verifying platform-enforced Workers Free limits.
        if (!freeAiConfirmed(env)) {
            return Response.json({ reply: chatFallback('free_plan_unconfirmed'), status: 'free_plan_unconfirmed', source: 'fixed' }, { headers: { 'Cache-Control': 'no-store' } });
        }

        const systemPrompt = `你是「麥擱騙」的防詐騙小幫手：阿麥 🦁。
你的任務與個性：
1. 【簡短友善】回答請控制在 30~50 字以內，語氣要像隻熱心的小獅子。
2. 【語言】只能用「台灣繁體中文」。
3. 【功能介紹】如果使用者打招呼、說 OK、或問你能做什麼（例如「可以問什麼」），請友善回答：「你可以把可疑的網址貼給我，或是上傳截圖，阿麥會幫你檢查有沒有詐騙風險喔！🦁」
4. 【拒絕閒聊】如果是完全無關的長篇大論，再委婉提醒你只負責防詐騙。
5. 【安全界線】不得宣稱已查詢網站、保證交易安全或要求密碼、驗證碼、完整卡號。沒有檢測證據時，請使用者貼上網址走檢測流程。`;

        const payload = {
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.slice(-3)
            ],
            max_tokens: CHAT_MAX_TOKENS,
            temperature: 0.6
        };

        if (!env.AI) {
            return Response.json({ reply: chatFallback('configuration'), status: 'configuration', source: 'fixed' }, { headers: { 'Cache-Control': 'no-store' } });
        }

        // 指定要使用的模型名稱
        const attempt = await runBudgetedAi(env, {
            provider: 'cloudflare', model: CHAT_MODEL, reserve: reserveChatNeurons(payload.messages),
            run: () => env.AI.run(CHAT_MODEL, payload)
        });
        if (!attempt.ok) return Response.json({
            reply: chatFallback(attempt.reason), status: attempt.reason, source: 'fixed'
        }, { headers: { 'Cache-Control': 'no-store' } });
        const data = attempt.data;

        let reply = (data.result?.response || data.response || '').trim();
        if (!reply) return Response.json({ reply: chatFallback('empty_response'), status: 'empty_response', source: 'fixed' }, { headers: { 'Cache-Control': 'no-store' } });
        
        // 移除 AI 可能自己加上的「阿麥：」前綴
        reply = reply.replace(/^阿麥：/, '').trim();

        return Response.json({ reply, source: 'cloudflare', model: CHAT_MODEL }, { headers: { 'Cache-Control': 'no-store' } });

    } catch (err) {
        return Response.json({ error: '連線異常，請稍後再試。' }, { status: 503 });
    }
}
