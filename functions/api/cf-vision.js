// 檔案路徑：functions/api/cf-vision.js

const cleanAiLine = (line) => String(line || '').replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim();

const normalizeRiskLine = (line) => {
    const cleaned = cleanAiLine(line || '');
    const riskText = cleaned.replace(/^⚠️\s*風險：?/, '').trim();

    if (/(高|high)/i.test(riskText) && !/(中|低|未發現|未偵測|無明顯|沒有明顯)/.test(riskText)) {
        return "⚠️ 風險：高風險";
    }
    if (/(中|medium)/i.test(riskText) && !/(高|低|未發現|未偵測|無明顯|沒有明顯)/.test(riskText)) {
        return "⚠️ 風險：中風險";
    }
    if (/(未發現|未偵測|無明顯|沒有明顯|低|low|none)/i.test(riskText)) {
        return "⚠️ 風險：未發現";
    }

    return "⚠️ 風險：未發現";
};

const normalizeUrlText = (text) => String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[：]/g, ':')
    .replace(/[／]/g, '/')
    .replace(/[．。]/g, '.')
    .replace(/[–—−]/g, '-')
    .replace(/https?:\s*\/\s*\//gi, match => match.toLowerCase().startsWith('https') ? 'https://' : 'http://')
    .replace(/([A-Za-z0-9])-\s*\n\s*([A-Za-z0-9])/g, '$1-$2')
    .replace(/([A-Za-z0-9./?&_=:%#-])\s*\n\s*([A-Za-z0-9])/g, '$1$2');

const stripTargetPunctuation = (value) => String(value || '')
    .trim()
    .replace(/^[<([{「『【]+/, '')
    .replace(/[>),.，。；;:」』】\]]+$/g, '');

const dedupeTargets = (items) => {
    const seen = new Set();
    return items
        .map(stripTargetPunctuation)
        .filter(Boolean)
        .filter(item => {
            const key = item.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const extractVisualTargets = (text) => {
    const normalized = normalizeUrlText(text);
    const targets = [];
    const add = (value) => {
        const cleaned = stripTargetPunctuation(value);
        if (!cleaned || cleaned.length < 4 || /^(無|none|null)$/i.test(cleaned)) return;
        if (!targets.includes(cleaned)) targets.push(cleaned);
    };

    const urlMatches = normalized.match(/https?:\/\/[^\s<>"'，。；、）)]+/gi) || [];
    urlMatches.forEach(add);

    const emailMatches = normalized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
    emailMatches.forEach(add);

    const domainPattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'，。；、）)]*)?/gi;
    for (const match of normalized.matchAll(domainPattern)) {
        const value = match[0];
        const start = match.index || 0;
        const end = start + value.length;
        if (normalized[start - 1] === '@' || normalized[end] === '@') continue;
        add(value);
    }

    return dedupeTargets(targets);
};

const parseVisionJson = (rawText) => {
    const text = String(rawText || '').trim();
    const candidates = [
        text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(),
        (text.match(/\{[\s\S]*\}/) || [])[0]
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) { }
    }

    return null;
};

const buildCleanReport = (rawText) => {
    const parsed = parseVisionJson(rawText);
    const parsedTargets = [];
    if (parsed) {
        if (Array.isArray(parsed.urls)) parsed.urls.forEach(item => parsedTargets.push(item));
        if (parsed.primaryUrl) parsedTargets.unshift(parsed.primaryUrl);
        if (parsed.senderEmail) parsedTargets.push(parsed.senderEmail);
    }

    const fallbackTargets = extractVisualTargets(rawText);
    const targets = dedupeTargets([...parsedTargets, ...fallbackTargets]);
    const primaryTarget = targets[0] || '無';

    if (parsed) {
        const risk = normalizeRiskLine(`⚠️ 風險：${parsed.risk || parsed.riskLevel || ''}`);
        const analysis = cleanAiLine(`🔍 分析：${parsed.analysis || '細節待查證'}`);
        const urlExtract = cleanAiLine(`🔗 網址：${primaryTarget}`);
        const advice = cleanAiLine(`🛡️ 建議：${parsed.advice || '請仔細查證，勿點擊可疑連結'}`);
        return { report: `${risk}\n${analysis}\n${urlExtract}\n${advice}`, targets };
    }

    const riskMatch = rawText.match(/⚠️.*?(?=\n|$)/);
    const analysisMatch = rawText.match(/🔍.*?(?=\n|$)/);
    const urlMatch = rawText.match(/🔗.*?(?=\n|$)/);
    const adviceMatch = rawText.match(/🛡️.*?(?=\n|$)/);

    const risk = riskMatch ? normalizeRiskLine(riskMatch[0]) : "⚠️ 風險：未發現";
    const analysis = analysisMatch ? cleanAiLine(analysisMatch[0]) : "🔍 分析：細節待查證";
    const urlFromLine = urlMatch ? cleanAiLine(urlMatch[0]).replace(/^🔗\s*網址：?/, '').trim() : '';
    const urlExtract = cleanAiLine(`🔗 網址：${targets[0] || urlFromLine || '無'}`);
    const advice = adviceMatch ? cleanAiLine(adviceMatch[0]) : "🛡️ 建議：請仔細查證，勿點擊可疑連結";

    return { report: `${risk}\n${analysis}\n${urlExtract}\n${advice}`, targets };
};

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

        const promptText = `請分析圖片有無詐騙風險。只輸出 JSON，不要 markdown、不要前言、不要思考過程。
最重要任務：先做 OCR，優先找出畫面中的網址、藍色連結、卡片預覽網址、瀏覽器網址列、寄件者 Email。
若網址在手機截圖中換行，請合併成完整網址，例如「https://sf-」下一行「express.example.top」要輸出為「https://sf-express.example.top」。
若同時看到多個網址，urls 請全部列出，primaryUrl 請放最可疑或最主要的那一個。
若出現物流、銀行、政府、電商、付款、預約、匯款、填寫個資等語意，但網址不是官方網域，risk 請判為 high。
若網址使用 .top, .xyz, .site, .vip, .shop, .click 等高風險後綴，risk 請判為 high。

請回傳以下 JSON 欄位：
{
  "risk": "high | medium | low | none",
  "analysis": "台灣繁體中文，一句話說明畫面與可疑點",
  "urls": ["畫面中所有網址或 Email，沒有則空陣列"],
  "primaryUrl": "最主要的網址或 Email，沒有則空字串",
  "brand": "畫面疑似冒用的品牌，沒有則空字串",
  "advice": "台灣繁體中文，一句防護建議"
}`;

        if (!env.GEMINI_API_KEY) {
            throw new Error("Cloudflare 環境變數中沒有找到 GEMINI_API_KEY！");
        }

        const callGeminiVisionAPI = async (modelName) => {
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
                    generationConfig: { maxOutputTokens: 300, temperature: 0.1 }
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
        let visualTargets = [];

        try {
            // 👇 主將：優先動用 Gemini 2.5 Flash 處理圖片
            const rawReport = await callGeminiVisionAPI('gemini-2.5-flash');
            const builtReport = buildCleanReport(rawReport);
            cleanReport = builtReport.report;
            visualTargets = builtReport.targets;
            
        } catch (errFlash) {
            console.log("⚠️ Gemini Flash 失敗，切換至 Pro 備援...", errFlash.message);
            try {
                // 👇 備援 1：切換到 Gemini 2.5 Pro 繼續嘗試
                const rawReport = await callGeminiVisionAPI('gemini-2.5-pro');
                const builtReport = buildCleanReport(rawReport);
                cleanReport = builtReport.report;
                visualTargets = builtReport.targets;
            } catch (errPro) {
                throw new Error(`今日圖片分析額度已滿，請稍後再試。`);
            }
        }

        // =========================================================
        // 🌟 混合式分析核心移入後端：系統絕對權威查核
        // =========================================================
        const urlMatch = cleanReport.match(/🔗 網址：(.*?)(?=\n|$)/);
        let extractedUrl = visualTargets[0] || (urlMatch ? urlMatch[1].trim() : "");

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

                // 👇 新增防護：台灣的政府、教育、財團法人網域需實體審核，詐騙集團無法註冊，直接視為最高信賴白名單！
                if (parsedHostname.endsWith('.gov.tw') || parsedHostname.endsWith('.edu.tw') || parsedHostname.endsWith('.org.tw') || parsedHostname.endsWith('.mil.tw')) {
                    isSafeWhitelisted = true;
                }

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
                    cleanReport = cleanReport.replace(/⚠️.*/, '⚠️ 風險：未偵測到明顯風險的網址或特徵');
                    cleanReport = cleanReport.replace(/(🔍.*)/, `$1\n✅ 系統驗證：資料庫確認此為官方網址。`);
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
        
        // 1. 軟化 AI 原生的「低風險」斬釘截鐵語氣 (無敵版：不管 AI 加上什麼廢話，只要這行有⚠️且包含「低」，全部強迫換掉！)
        cleanReport = cleanReport.replace(/⚠️.*低.*/, '⚠️ 風險：未發現');
        
        // 2. 把文字切成一行一行，如果那一行是用 🔍 開頭的，就把它丟掉，剩下的重新組合起來！
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
