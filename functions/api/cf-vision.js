// 檔案路徑：functions/api/cf-vision.js

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        
        if (!imageFile) {
            return new Response(JSON.stringify({ error: '未找到上傳的圖片' }), { status: 400 });
        }

        const arrayBuffer = await imageFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binary);
        const mimeType = imageFile.type || 'image/jpeg';

        // 👇 1. 啟用系統最高指令 (System Instruction)，從大腦底層切斷英文與思考過程
        const systemInstruction = `你是一個防詐分析 API。
絕對禁止：輸出任何思考過程、英文、或是「Input:」、「Final Output:」等標籤。
強制任務：只能直接給出最終的 3 行台灣繁體中文結果。`;

        // 👇 2. 簡化提示詞，直接給予填空格式，避免觸發複雜的解題思維
        const promptText = `請檢查圖片頂部是否有網址列。若有，優先判斷該網域是否可疑並列為疑慮。
若為通訊軟體或信件截圖，建議需加上：「注意！惡意網址常隱藏於文字底層，請長按複製真實網址檢測，勿點擊！」

直接輸出以下3行格式：
⚠️ 風險：【高/中/低】 - 【5字內總結】
🔍 疑慮：【指出網址異常或最可疑處，無則寫待查】
🛡️ 建議：【10字內防護建議 或 套用上述警告】`;

        if (!env.GEMINI_API_KEY) {
            throw new Error("Cloudflare 環境變數中沒有找到 GEMINI_API_KEY！");
        }

        const callGoogleGemmaAPI = async (modelName) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // 👇 將系統指令注入 API
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType: mimeType, data: base64String } }
                        ]
                    }],
                    // 👇 限制長度為 100，溫度 0.0 剝奪創造力
                    generationConfig: { maxOutputTokens: 100, temperature: 0.0 }
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const errorMsg = data.error ? data.error.message : res.statusText;
                throw new Error(`${modelName} API 失敗 (${res.status}): ${errorMsg}`);
            }

            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        };

        let cleanReport = '';

        // ====================================================================
        // 🌟 引擎一：Google Gemma 4 26B (主將)
        // ====================================================================
        try {
            const rawReport = await callGoogleGemmaAPI('gemma-4-26b-a4b-it');
            // 清除可能殘留的奇怪標籤或 Markdown
            cleanReport = rawReport.replace(/[*#_`~]/g, '').replace(/Input:[\s\S]*Final Output:/gi, '').trim();
            
        } catch (err26b) {
            console.log("⚠️ Gemma 4 26B 失敗或塞車，切換至 31B 備援...", err26b.message);
            
            // ====================================================================
            // 🌟 引擎二：Google Gemma 4 31B (副將)
            // ====================================================================
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-4-31b-it');
                cleanReport = rawReport.replace(/[*#_`~]/g, '').replace(/Input:[\s\S]*Final Output:/gi, '').trim();
                
            } catch (err31b) {
                throw new Error(`雙引擎皆無法服務。\n26B 錯誤: ${err26b.message}\n31B 錯誤: ${err31b.message}`);
            }
        }

        return new Response(JSON.stringify({ report: cleanReport }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: 'AI 圖片分析失敗', details: err.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
