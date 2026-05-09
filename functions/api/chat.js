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

        if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
            throw new Error("找不到 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN！");
        }

        // 👇 純文字對話，交給 Cloudflare Workers AI 的免費 Llama 3.1 8B
        const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ],
                max_tokens: 80,
                temperature: 0.6
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`Google API 失敗: ${data.error?.message || res.statusText}`);
        }

        const data = await res.json();
        let reply = data.result.response.trim();
        
        // 移除 AI 可能自己加上的「阿麥：」前綴
        reply = reply.replace(/^阿麥：/, '').trim();

        return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Chat API 錯誤:", err.message);
        return new Response(JSON.stringify({ error: '連線異常', details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
