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

        // 將對話紀錄轉成純文字，讓 Google Gemma 3 能夠理解上下文
        const chatHistory = messages.map(m => `${m.role === 'user' ? '使用者' : '阿麥'}：${m.content}`).join('\n');
        const fullPrompt = `${systemPrompt}\n\n【對話紀錄】\n${chatHistory}\n\n請以「阿麥」的身份給出簡短回覆：`;

        if (!env.GEMINI_API_KEY) {
            throw new Error("找不到 GEMINI_API_KEY！");
        }

        // 👇 改用 Google API 呼叫 Gemma 3 4B，完全不扣 Cloudflare 的點數！
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: { maxOutputTokens: 80, temperature: 0.6 }
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`Google API 失敗: ${data.error?.message || res.statusText}`);
        }

        const data = await res.json();
        let reply = data.candidates[0].content.parts[0].text.trim();
        
        // 移除 AI 可能自己加上的「阿麥：」前綴
        reply = reply.replace(/^阿麥：/, '').trim();

        return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Chat API 錯誤:", err.message);
        return new Response(JSON.stringify({ error: '連線異常', details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
