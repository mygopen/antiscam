// 檔案路徑：functions/api/check-fake-brand.js

async function getOfficialDomain(brand) {
    // 1. 本地白名單：改為「陣列」格式，支援一個品牌擁有多個合法網域
    const localBrandMap = {
        "台灣電力公司": ["taipower.com.tw"], "台電": ["taipower.com.tw"],
        "台灣自來水公司": ["water.gov.tw"], "遠通電收": ["fetc.net.tw"],
        "中華郵政": ["post.gov.tw"], "中國信託": ["ctbcbank.com"],
        "國泰世華": ["cathaybk.com.tw"], "玉山銀行": ["esunbank.com.tw"],
        "台新銀行": ["taishinbank.com.tw"], "富邦銀行": ["fubon.com"],
        "台北富邦銀行": ["taipeifubon.com.tw"], "財政部": ["mof.gov.tw"],
        "衛生福利部": ["mohw.gov.tw"], "台灣大哥大": ["taiwanmobile.com"],
        "中華電信": ["cht.com.tw"], "遠傳電信": ["fetnet.net"],
        "台灣積體電路製造": ["tsmc.com"],
        "zingala": ["zingala.com.tw", "zingala.cc"],
        "銀角零卡": ["zingala.com.tw", "zingala.cc"],
        "中租": ["chailease.com.tw", "zingala.com.tw", "zingala.cc"]
    };

    // 將品牌名稱轉換為小寫來比對，增加容錯率
    const normalizedBrand = brand.toLowerCase();
    const mappedDomains = Object.keys(localBrandMap).find(key => key.toLowerCase() === normalizedBrand);
    if (mappedDomains) return localBrandMap[mappedDomains];

    // 2. 查無資料則去 Wikidata (維基數據) 查詢
    try {
        const wikiRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&sites=zhwiki&titles=${encodeURIComponent(brand)}&props=claims&format=json`);
        const wikiData = await wikiRes.json();
        const entityId = Object.keys(wikiData.entities)[0];
        if (entityId !== "-1" && wikiData.entities[entityId].claims && wikiData.entities[entityId].claims.P856) {
            const officialUrl = wikiData.entities[entityId].claims.P856[0].mainsnak.datavalue.value;
            let domain = new URL(officialUrl).hostname.toLowerCase();
            domain = domain.startsWith("www.") ? domain.slice(4) : domain;
            return [domain]; // 回傳陣列格式以統一比對邏輯
        }
    } catch (e) {}
    return null;
}

export async function onRequest(context) {
    const { request, env } = context;
    const urlParams = new URL(request.url).searchParams;
    const targetUrl = urlParams.get("url");

    if (!targetUrl) return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });

    try {
        const parsedUrl = new URL(targetUrl);
        let inputDomain = parsedUrl.hostname.toLowerCase();
        if (inputDomain.startsWith("www.")) inputDomain = inputDomain.slice(4);

        // 1. 呼叫 Cloudflare Browser Rendering API (取得純淨 Markdown)
        const renderApiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/markdown`;
        
        // 設定 6 秒的 AbortController 防止無頭瀏覽器卡死
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        let renderRes;
        try {
            renderRes = await fetch(renderApiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.CF_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ url: targetUrl }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網站渲染超時或阻擋" }));
        }
        
        const renderData = await renderRes.json();
        if (!renderData.success) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網頁渲染失敗" }));
        }
        
        // 只取前 2000 個字元，節省 AI Token
        const markdownText = renderData.result.slice(0, 2000).trim();

        // 🚨 新增防呆機制：如果網頁內容太少（例如空白或被阻擋），直接跳過 AI 辨識，避免幻覺
        if (markdownText.length < 30) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網頁內容過少，無法判斷品牌" }));
        }

        // 2. AI Agent 1：萃取品牌名稱 (利用 Workers AI)
        // 🚨 優化提示詞：移除具體品牌暗示，給予更嚴格的 Unknown 判定標準
        const prompt = `你是一位資安分析師。請閱讀以下的網頁內容，判斷這個網頁企圖代表或偽裝成哪一家知名的「台灣公司、品牌或政府機關」？
        - 如果能明確看出是特定知名品牌（如某銀行、某政府單位、某電信），請直接輸出該「品牌名稱」。
        - 如果是綜合性網站、論壇、無法辨識內容，或是你無法 100% 確定，請嚴格回答「Unknown」。
        請只輸出品牌名稱，不要任何標點符號、不要任何解釋。
        
        網頁內容：
        ${markdownText}`;

        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [{ role: "user", content: prompt }],
            max_tokens: 20,
            temperature: 0.1
        });

        const detectedBrand = aiResponse.response.trim().replace(/[*#_`~]/g, '');

        if (!detectedBrand || detectedBrand === "Unknown" || detectedBrand.toLowerCase().includes("unknown")) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "未偵測到明顯品牌偽裝" }));
        }

        // 3. AI Agent 2：取得官方網域並比對
        const officialDomains = await getOfficialDomain(detectedBrand);
        
        if (!officialDomains || officialDomains.length === 0) {
            return new Response(JSON.stringify({ 
                isFakeBrand: false, 
                detectedBrand: detectedBrand,
                message: "無法查證該品牌的官方網域" 
            }));
        }

        // 🚨 判定邏輯更新：只要輸入的網域符合陣列中的「任何一個」合法網域（或是其子網域），就是安全的！
        const isMatch = officialDomains.some(domain => inputDomain === domain || inputDomain.endsWith("." + domain));

        return new Response(JSON.stringify({
            detectedBrand: detectedBrand,
            officialDomain: officialDomains[0], // 畫面上顯示主要的第一個網域即可
            inputDomain: inputDomain,
            isFakeBrand: !isMatch,
            warningMessage: !isMatch ? `嚴重警告：此網站企圖偽裝成「${detectedBrand}」，但其真實網域並非官方網站（如 ${officialDomains[0]}）！` : "品牌與網域相符。"
        }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
