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

// 👇 提示詞優化：明確要求 AI 檢查「寄件者 Email 信箱」
        const promptText = `請分析圖片有無詐騙風險。嚴禁任何英文、思考過程或前言。
【特別指令】：
1. 務必優先檢查圖片最上方的「瀏覽器網址列」、「文字中的網址」或「寄件者的 Email 信箱」。若發現網址/信箱是拼湊字詞、異常後綴(如.site, .vip)或明顯與官方名稱不符(如假冒台電但信箱是亂碼)，請強制判定為「高」風險。
2. 盡可能將圖片中看到的「網址」或「寄件者信箱」精準擷取出來，若無請填寫「無」。

請用台灣繁體中文，根據圖片內容直接回答，並將括號替換為你的判斷結果，只輸出以下4行：
⚠️ 風險：判斷為【高、中 或 低】風險。
🔍 分析：【一段話指出這可能是什麼畫面，上面是否有網址，以及圖片可疑之處，例如：這看起來像一個網頁，畫面中有網址，但內容涉及金錢或帳戶。】
🔗 網址：【擷取到的網址或信箱，例如：myship-711.twox.site 或 scam@gmail.com，若無請填「無」】
🛡️ 建議：【一句話給予防護建議】`;

        if (!env.GEMINI_API_KEY) {
            throw new Error("Cloudflare 環境變數中沒有找到 GEMINI_API_KEY！");
        }

        const callGoogleGemmaAPI = async (modelName) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType: mimeType, data: base64String } }
                        ]
                    }],
                    // 4 行字，放寬 tokens 到 150
                    generationConfig: { maxOutputTokens: 150, temperature: 0.2 }
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

        // 👇 攔截器更新：移除 view 擷取，直接回傳 4 行
        const extractCleanReport = (rawText) => {
            const riskMatch = rawText.match(/⚠️.*?(?=\n|$)/);
            const analysisMatch = rawText.match(/🔍.*?(?=\n|$)/);
            const urlMatch = rawText.match(/🔗.*?(?=\n|$)/);
            const adviceMatch = rawText.match(/🛡️.*?(?=\n|$)/);

            const risk = riskMatch ? riskMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "⚠️ 風險：待確認";
            const analysis = analysisMatch ? analysisMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "🔍 分析：細節待查證";
            const urlExtract = urlMatch ? urlMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "🔗 網址：無";
            const advice = adviceMatch ? adviceMatch[0].replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim() : "🛡️ 建議：請仔細查證，勿點擊可疑連結";

            return `${risk}\n${analysis}\n${urlExtract}\n${advice}`;
        };

let cleanReport = '';

        try {
            const rawReport = await callGoogleGemmaAPI('gemma-3-4b-it');
            cleanReport = extractCleanReport(rawReport);
            
        } catch (err4b) {
            console.log("⚠️ Gemma 3 4B 失敗，切換至 12B 備援...", err4b.message);
            try {
                const rawReport = await callGoogleGemmaAPI('gemma-3-12b-it');
                cleanReport = extractCleanReport(rawReport);
            } catch (err12b) {
                throw new Error(`雙引擎無法服務。\n主將: ${err4b.message}\n備援: ${err12b.message}`);
            }
        }

        // =========================================================
        // 🌟 混合式分析核心移入後端：系統絕對權威查核
        // =========================================================
        const urlMatch = cleanReport.match(/🔗 網址：(.*?)(?=\n|$)/);
        let extractedUrl = urlMatch ? urlMatch[1].trim() : "";

       if (extractedUrl && !extractedUrl.includes("無") && !extractedUrl.includes("None")) {
            try {
                let isEmail = false; // 👈 標記這是不是一個 Email

                // 1. 處理多網址情況：只取第一個
                let firstTarget = extractedUrl.split(/[、, \t]+/)[0].trim();
                // 2. 處理 Email 情況：如果字串包含 @，只取 @ 後面的網域
                if (firstTarget.includes('@')) {
                    firstTarget = firstTarget.split('@').pop().trim();
                    isEmail = true; // 確認為 Email
                }

                let urlToParse = /^https?:\/\//i.test(firstTarget) ? firstTarget : 'https://' + firstTarget;
                const urlObj = new URL(urlToParse);
                const parsedHostname = urlObj.hostname.toLowerCase();
                
                // 抓取當前網站的 Origin (例如 https://mygopen.com)，以便在後端呼叫自己的 API
                const origin = new URL(request.url).origin;

                // 平行呼叫後端自家的 API 進行鐵腕查核
                const [wlRes, blRes, brandRes, dnsRes] = await Promise.allSettled([
                    fetch(new URL('/whitelist.json', origin)).then(r => r.json()),
                    fetch(new URL(`/api/check-blacklist?domain=${encodeURIComponent(parsedHostname)}`, origin)).then(r => r.json()),
                    fetch(new URL(`/api/check-fake-brand?url=${encodeURIComponent(urlObj.href)}`, origin)).then(r => r.json()),
                    fetch(`https://dns.google/resolve?name=${parsedHostname}&type=A`).then(r => r.json())
                ]);

                const whitelist = (wlRes.status === 'fulfilled' && wlRes.value.domains) ? wlRes.value.domains : [];
                const isBlacklisted = (blRes.status === 'fulfilled' && blRes.value.isBlacklisted) ? true : false;
                const brandData = (brandRes.status === 'fulfilled') ? brandRes.value : null;
                const isInvalid = (dnsRes.status === 'fulfilled' && dnsRes.value.Status === 3) ? true : false;

                // 判斷是否為官方白名單網域
                let isSafeWhitelisted = whitelist.some(w => {
                    const lowerW = w.toLowerCase();
                    return parsedHostname === lowerW || parsedHostname.endsWith('.' + lowerW);
                });

                // 👇 系統漏洞修補 1：免費信箱防護
                // 如果 AI 抓到的是 Email，且網域是 Gmail、Yahoo 等免費信箱，絕對不能當作「官方白名單」來洗白！
                if (isEmail && isSafeWhitelisted) {
                    const freeEmailProviders = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.tw', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'mail.com', 'msn.com', 'hinet.net'];
                    if (freeEmailProviders.some(p => parsedHostname === p || parsedHostname.endsWith('.' + p))) {
                        isSafeWhitelisted = false; // 撤銷免死金牌
                    }
                }

                if (isSafeWhitelisted) {
                    // ✅ 後端權威洗白
                    cleanReport = cleanReport.replace(/⚠️.*/, '⚠️ 風險：低風險 (官方白名單網域)');
                    cleanReport = cleanReport.replace(/(🔍.*)/, `$1\n✅ 系統驗證：資料庫確認此為官方網址，請安心使用。`);
                } else {
                    const highRiskSuffixes = ['.shop', '.xyz', '.top', '.club', '.live', '.fun', '.store', '.asia', '.digital', '.click', '.site', '.cloud', '.sbs', '.icu', '.cyou', '.chat', '.cn', '.gal'];
                    const isSuspiciousSuffix = highRiskSuffixes.some(s => parsedHostname.endsWith(s));
                    const isApkUrl = urlObj.href.toLowerCase().includes('.apk');

                    let systemRiskLevel = null;
                    let dbWarning = "";

                    if (isSuspiciousSuffix) {
                        systemRiskLevel = "高風險";
                        dbWarning = "🚨 系統警告：此網址使用高風險異常後綴，極高機率為詐騙！";
                    } else if (isApkUrl) {
                        systemRiskLevel = "高風險";
                        dbWarning = "🚨 系統警告：此網站誘導下載不明 APK 檔案，極可能是夾帶木馬的惡意軟體！";
                    } else if (isBlacklisted) {
                        systemRiskLevel = "高風險";
                        dbWarning = "🚨 系統警告：此網址已列入 165 詐騙黑名單！";
                    } else if (brandData && (brandData.isGenericScam || brandData.isFakeBrand)) {
                        systemRiskLevel = "高風險";
                        dbWarning = `🚨 系統警告：資料庫確認此為假冒網站 (${brandData.detectedBrand || '高風險特徵'})！`;
                    } else if (isInvalid) {
                        systemRiskLevel = "高風險";
                        dbWarning = "🚨 系統警告：此網址目前已失效或被封鎖，這是詐騙免洗網站的常見特徵！";
                    } 
                    // 👇 系統漏洞修補 2：語氣矛盾校正防線
                    // 如果 AI 內文已經判斷出異常，系統予以尊重，直接升級為高風險！
                    else if (/(異常|可疑|偽造|不符|冒用|假冒|拼湊|釣魚|詐騙)/.test(cleanReport)) {
                        systemRiskLevel = "高風險";
                        dbWarning = "🚨 系統警告：AI 判定此畫面具有明顯的釣魚與冒用特徵！";
                    }

                    // 💥 後端權威竄改：強制改寫 AI 報告
                    if (systemRiskLevel === "高風險") {
                        cleanReport = cleanReport.replace(/⚠️.*/, `⚠️ 風險：${systemRiskLevel}`);
                        if (!cleanReport.includes('系統警告')) {
                            cleanReport = cleanReport.replace(/(🔍.*)/, `$1\n${dbWarning}`);
                        }
                    }
                }
           } catch(e) {
                console.log("後端網址比對解析失敗", e);
                // 防呆：如果網址亂碼導致當機，退回簡單的字串比對
                const suspiciousKeywords = ['.top', '.xyz', '.site', '.vip', '.shop', '.apk'];
                if (suspiciousKeywords.some(kw => extractedUrl.toLowerCase().includes(kw))) {
                    cleanReport = cleanReport.replace(/⚠️.*/, '⚠️ 風險：高風險');
                }
            }
        }

        // =========================================================
        // 👇 終極清理：撕掉 AI 腦補的便條紙，確保畫面與複製結果絕對乾淨
        // =========================================================
        // 把文字切成一行一行，如果那一行是用 🔍 開頭的，就把它丟掉，剩下的重新組合起來！
        cleanReport = cleanReport.split('\n').filter(line => !line.trim().startsWith('🔍')).join('\n');

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
