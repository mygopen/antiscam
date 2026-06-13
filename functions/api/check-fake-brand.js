// 檔案路徑：functions/api/check-fake-brand.js

function normalizeBrandToken(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function isSameRootDomain(hostname, rootDomain) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    const root = String(rootDomain || "").toLowerCase().replace(/^www\./, "");
    return !!host && !!root && (host === root || host.endsWith("." + root));
}

const TRACKING_URL_PARAM_RULES = [
    "utm_*", "fbclid", "gclid", "gbraid", "wbraid", "msclkid",
    "dclid", "yclid", "twclid", "ttclid", "li_fat_id", "mc_cid",
    "mc_eid", "igshid", "gad_source", "gclsrc", "_ga", "_gl",
    "fb_action_ids", "fb_action_types", "fb_source", "irclickid",
    "srsltid", "sc_campaign", "sc_channel", "sc_content",
    "sc_country", "sc_geo", "sc_medium", "sc_outcome",
    "sc_publisher", "sc_subchannel"
];

const VOLATILE_URL_PARAM_RULES = [
    "_eat", "eat", "_t", "_ts", "ts", "timestamp", "time",
    "expires", "expire", "valid", "nonce", "cachebust",
    "cachebuster", "cb", "rnd", "rand"
];

function isTrackingUrlParamName(name) {
    const lowerName = String(name || "").toLowerCase();
    return TRACKING_URL_PARAM_RULES.some(rule => {
        const lowerRule = String(rule || "").toLowerCase();
        if (lowerRule.endsWith("*")) return lowerName.startsWith(lowerRule.slice(0, -1));
        return lowerName === lowerRule;
    });
}

function isVolatileUrlParam(name, value = "") {
    const lowerName = String(name || "").toLowerCase();
    const rawValue = String(value || "");
    if (VOLATILE_URL_PARAM_RULES.some(rule => lowerName === String(rule || "").toLowerCase())) return true;
    if (/^(?:valid|verify|auth|session)[_-]?\d{8,14}[_-][a-f0-9]{12,}$/i.test(rawValue)) return true;
    if (/^(?:valid|expire|expires|ts|time|timestamp|nonce|rnd|rand|cb)$/i.test(lowerName) && /^[a-z0-9_-]{8,80}$/i.test(rawValue)) return true;
    if (/(?:time|timestamp|expire|expires|valid|nonce)/i.test(lowerName) && /^\d{10,14}$/.test(rawValue)) return true;
    if (lowerName.startsWith("_") && /^[a-z0-9_-]{16,120}$/i.test(rawValue) && (/\d/.test(rawValue) || /[a-f0-9]{16,}/i.test(rawValue))) return true;
    return false;
}

function sanitizeUrlForBrandAnalysis(rawUrl) {
    const parsed = new URL(rawUrl);
    const removedTrackingParams = [];
    const removedVolatileParams = [];

    [...new Set([...parsed.searchParams.keys()])].forEach(name => {
        const values = parsed.searchParams.getAll(name);
        if (values.some(value => isVolatileUrlParam(name, value))) {
            removedVolatileParams.push(name);
            parsed.searchParams.delete(name);
        } else if (isTrackingUrlParamName(name)) {
            removedTrackingParams.push(name);
            parsed.searchParams.delete(name);
        }
    });

    parsed.hash = "";
    return {
        href: parsed.href,
        rawUrl,
        removedTrackingParams: [...new Set(removedTrackingParams)],
        removedVolatileParams: [...new Set(removedVolatileParams)]
    };
}

function isMarketplaceProductBrandContext(markdownText = "", targetUrl = "") {
    const text = String(markdownText || "").toLowerCase();
    let pathname = "";
    try {
        pathname = new URL(targetUrl).pathname.toLowerCase();
    } catch (e) {}

    const hasProductPath = /\/(?:salepage|products?|goods|items?|collections?)\b/i.test(pathname) ||
        /\/salepage\/index\/\d+/i.test(pathname);
    const commerceSignals = [
        "購物車", "加入購物車", "商品分類", "商品規格", "規格",
        "售價", "特價", "nt$", "結帳", "下單", "訂單",
        "配送", "付款", "退換貨", "官方 app", "官方app"
    ].filter(keyword => text.includes(keyword.toLowerCase()));
    const managedCommerceSignals = [
        "91app", "official-static.91app", "shopline", "cyberbiz",
        "waca", "qdm", "myshopify"
    ].filter(keyword => text.includes(keyword.toLowerCase()));
    const sensitiveCollectionSignals = [
        "信用卡卡號", "card number", "cvv", "cvc", "otp", "簡訊碼",
        "金融卡", "網銀密碼", "password", "帳戶異常", "account suspended"
    ].filter(keyword => text.includes(keyword.toLowerCase()));

    return (hasProductPath || managedCommerceSignals.length > 0 || commerceSignals.length >= 4) &&
        commerceSignals.length >= 2 &&
        sensitiveCollectionSignals.length === 0;
}

function isTrustedCoBrandCampaignHost(inputDomain, detectedBrand) {
    const trustedCampaignHosts = [
        {
            domain: "mababy.com",
            allowedBrandTokens: ["nestle", "雀巢", "能恩", "nan", "nestlebaby"]
        },
        {
            domain: "uni-prosperity.com.tw",
            allowedBrandTokens: ["carrefour", "家樂福", "家福", "康達盛通", "uni-prosperity", "uniprosperity", "uniprosperitylifestyle"]
        },
        {
            domain: "uni-lions.com.tw",
            allowedBrandTokens: ["統一超商", "7-11", "711", "7eleven", "統一7eleven獅", "統一獅", "unilions", "lioncrew", "萊恩酷"]
        },
        {
            domain: "sunsetgoods.tw",
            allowedBrandTokens: ["日落小物", "sunsetgoods", "蠟筆小新", "小新", "crayonshinchan", "shinchan"]
        },
        {
            domain: "theaxiomstore.com",
            allowedBrandTokens: [
                "theaxiomstore", "axiomstore", "axiomretailpartners",
                "安德國際商貿", "安德國際", "安德家品",
                "jmgo", "堅果", "foodcycler", "廚餘大師",
                "uwant", "mova", "ilife", "designnest", "foldstand"
            ]
        },
        {
            domain: "sunpay.com.tw",
            allowedBrandTokens: [
                "sunpay", "紅陽科技", "紅陽支付", "紅陽",
                "電子發票", "電子發票整合服務", "財政部電子發票",
                "einvoice", "einv", "統一發票"
            ]
        }
    ];
    const normalizedBrand = normalizeBrandToken(detectedBrand);
    if (!normalizedBrand) return false;

    return trustedCampaignHosts.some(item => {
        if (!isSameRootDomain(inputDomain, item.domain)) return false;
        return item.allowedBrandTokens.some(token => {
            const normalizedToken = normalizeBrandToken(token);
            return normalizedToken &&
                (normalizedBrand.includes(normalizedToken) || normalizedToken.includes(normalizedBrand));
        });
    });
}

async function getOfficialDomain(brand) {
// 1. 本地白名單：改為「陣列」格式，支援一個品牌擁有多個合法網域
const localBrandMap = {
        "台灣電力公司": ["taipower.com.tw"], "台電": ["taipower.com.tw"],
        "台灣自來水公司": ["water.gov.tw"], "遠通電收": ["fetc.net.tw"],
        "中華郵政": ["post.gov.tw"], 
        "中國信託": ["ctbcbank.com"], "ctbc bank": ["ctbcbank.com"], "ctbc": ["ctbcbank.com"],
        // 👇 把重複的刪掉，只留這一行即可：
        "國泰世華": ["cathaybk.com.tw", "cathayins.tw"],
        "國泰產險": ["cathay-ins.com.tw", "cathayins.tw"],
        "玉山銀行": ["esunbank.com.tw"],
        "台新銀行": ["taishinbank.com.tw"], "富邦銀行": ["fubon.com"],
        "台北富邦銀行": ["taipeifubon.com.tw"], "財政部": ["mof.gov.tw"],
        "衛生福利部": ["mohw.gov.tw"], "台灣大哥大": ["taiwanmobile.com"],
        "中華電信": ["cht.com.tw"], "遠傳電信": ["fetnet.net"],
        "台灣積體電路製造": ["tsmc.com"],
        "家樂福": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "家福": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "家福股份有限公司": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "康達盛通": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "康達盛通生活事業股份有限公司": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "Carrefour": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "Carrefour Taiwan": ["carrefour.com.tw", "uni-prosperity.com.tw"],
        "Uni-Prosperity": ["uni-prosperity.com.tw", "carrefour.com.tw"],
        "Uni-Prosperity Lifestyle Corp.": ["uni-prosperity.com.tw", "carrefour.com.tw"],
        "統一獅": ["uni-lions.com.tw"],
        "統一 7-ELEVEN 獅": ["uni-lions.com.tw"],
        "統一7-ELEVEN獅": ["uni-lions.com.tw"],
        "統一7ELEVEN獅": ["uni-lions.com.tw"],
        "統一棒球隊": ["uni-lions.com.tw"],
        "統一棒球隊股份有限公司": ["uni-lions.com.tw"],
        "Uni-Lions": ["uni-lions.com.tw"],
        "Unilions": ["uni-lions.com.tw"],
        "LION CREW": ["uni-lions.com.tw"],
        "萊恩酷": ["uni-lions.com.tw"],
        "萊恩酷商城": ["uni-lions.com.tw"],
        "日落小物": ["sunsetgoods.tw"],
        "Sunset Goods": ["sunsetgoods.tw"],
        "sunsetgoods": ["sunsetgoods.tw"],
        "The AXIOM": ["theaxiomstore.com"],
        "The AXIOM 安德家品": ["theaxiomstore.com"],
        "安德家品": ["theaxiomstore.com"],
        "安德國際": ["theaxiomstore.com"],
        "安德國際商貿": ["theaxiomstore.com"],
        "安德國際商貿股份有限公司": ["theaxiomstore.com"],
        "AXIOM RETAIL PARTNERS": ["theaxiomstore.com"],
        "AXIOM RETAIL PARTNERS CO., LTD.": ["theaxiomstore.com"],
        "theaxiomstore": ["theaxiomstore.com"],
        "axiomstore": ["theaxiomstore.com"],
        "紅陽科技": ["sunpay.com.tw"],
        "紅陽科技股份有限公司": ["sunpay.com.tw"],
        "紅陽支付": ["sunpay.com.tw"],
        "SunPay": ["sunpay.com.tw"],
        "sunpay": ["sunpay.com.tw"],
        "Apple": ["apple.com", "icloud.com"], "APPLE": ["apple.com", "icloud.com"],
        "蘋果": ["apple.com", "icloud.com"], "Apple ID": ["apple.com", "icloud.com"],
        "iCloud": ["icloud.com", "apple.com"], "App Store": ["apple.com"],
        "zingala": ["zingala.com.tw", "zingala.cc", "zingala.com"],
        "銀角零卡": ["zingala.com.tw", "zingala.cc", "zingala.com"],
        "中租": ["chailease.com.tw", "zingala.com.tw", "zingala.cc", "zingala.com"],
        "Nestle": ["nestle.com", "nestle.com.tw", "nestlebaby.com.tw"],
        "Nestlé": ["nestle.com", "nestle.com.tw", "nestlebaby.com.tw"],
        "雀巢": ["nestle.com", "nestle.com.tw", "nestlebaby.com.tw"],
        "雀巢能恩": ["nestlebaby.com.tw"],
        "能恩": ["nestlebaby.com.tw"],
        "microsoft": ["microsoft.com", "aka.ms", "live.com", "office.com"],
        "微軟": ["microsoft.com", "aka.ms", "live.com", "office.com"],
        "7-zip": ["7-zip.org"],
        "7zip": ["7-zip.org"],
        "電子發票": ["einvoice.nat.gov.tw", "mof.gov.tw"],
        "電子發票整合服務平台": ["einvoice.nat.gov.tw", "mof.gov.tw"],
        "財政部電子發票": ["einvoice.nat.gov.tw", "mof.gov.tw"],
        // 👇 新增 7-11 賣貨便相關防護
        "統一超商": ["7-11.com.tw", "myship.7-11.com.tw"],
        "7-11": ["7-11.com.tw", "myship.7-11.com.tw"],
        "賣貨便": ["7-11.com.tw", "myship.7-11.com.tw"],
        "交貨便": ["7-11.com.tw", "myship.7-11.com.tw"],
        // 👇 新增全家便利商店與好賣+ 相關防護
        "全家": ["family.com.tw", "famiport.com.tw", "famistore.com.tw"],
        "全家便利商店": ["family.com.tw", "famiport.com.tw", "famistore.com.tw"],
        "familymart": ["family.com.tw", "famiport.com.tw", "famistore.com.tw"],
        "好賣+": ["family.com.tw", "famiport.com.tw", "famistore.com.tw"],
        "好賣": ["family.com.tw", "famiport.com.tw", "famistore.com.tw"]
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
    const rawTargetUrl = urlParams.get("url");

    if (!rawTargetUrl) return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });

    try {
        const sanitizedTarget = sanitizeUrlForBrandAnalysis(rawTargetUrl);
        const targetUrl = sanitizedTarget.href;
        const analysisMetadata = {
            analyzedUrl: targetUrl,
            rawUrl: rawTargetUrl,
            removedTrackingParams: sanitizedTarget.removedTrackingParams,
            removedVolatileParams: sanitizedTarget.removedVolatileParams
        };
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
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網站渲染超時或阻擋", ...analysisMetadata }));
        }
        
        const renderData = await renderRes.json();
        if (!renderData.success) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網頁渲染失敗", ...analysisMetadata }));
        }
        
        // 只取前 2000 個字元，節省 AI Token
        const markdownText = renderData.result.slice(0, 2000).trim();

        // 🚨 新增防呆機制：如果網頁內容太少（例如空白或被阻擋），直接跳過 AI 辨識，避免幻覺
        if (markdownText.length < 30) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "網頁內容過少，無法判斷品牌", ...analysisMetadata }));
        }

        // 2. AI Agent 1：萃取品牌名稱 (利用 Workers AI)
        // 優化提示詞：加入假網貸與高利貸的詐騙特徵防堵
        const prompt = `你是一位嚴格的資安分析師。請閱讀以下的網頁內容，進行判斷：
        1. 如果網頁「明確」冒用特定知名品牌（如：中國信託、台灣大哥大、中華郵政等），請直接輸出該「品牌名稱」。
        2. 如果這是一般的「戶外用品、服飾、生活百貨等合法電商」或「一般購物網站」，請嚴格輸出「Unknown」。絕對不可以因為有打折促銷就當作詐騙。
        2a. 如果這是媒體、活動承辦或合作夥伴網域上的品牌合作活動頁，且未要求密碼、OTP、信用卡或金融帳密，不要只因出現贊助品牌名稱就判定冒用；請輸出「Unknown」。
        3. 只有當內容包含強烈的通用詐騙特徵（如：保證獲利、高薪免經驗代工、要求加 LINE 領飆股、免聯徵快速借款、身分證小額借貸、代辦包裝信用等），才輸出「Generic_Scam」。
        4. 如果網頁在台灣情境下販售或導流購買電子煙、電子菸、煙彈、菸彈、加熱菸、RELX/悅刻等類菸品，且出現 LINE 客服、貨到付款、現貨、價格、購物車或下單資訊，請輸出「Generic_Scam」。
        請只輸出單一詞彙（品牌名稱、Generic_Scam 或 Unknown），絕對不要有任何標點符號或解釋。
        
        網頁內容：
        ${markdownText}`;

        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "未設定 API Key", ...analysisMetadata }));
        }

        // 👇 將純文字的品牌偵測，交給 Gemma 3 4B
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${env.GEMINI_API_KEY}`;
        const aiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
            })
        });

        if (!aiRes.ok) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "AI 品牌分析 API 連線失敗", ...analysisMetadata }));
        }

        const aiData = await aiRes.json();
        const detectedBrand = aiData.candidates[0].content.parts[0].text.trim().replace(/[*#_`~]/g, '');

        if (!detectedBrand || detectedBrand === "Unknown" || detectedBrand.toLowerCase().includes("unknown")) {
            return new Response(JSON.stringify({ isFakeBrand: false, message: "未偵測到明顯品牌偽裝", ...analysisMetadata }));
        }

        // 👇 如果 AI 發現是一般購物詐騙，就不會回傳 isFakeBrand: true
        if (detectedBrand === "Generic_Scam") {
            return new Response(JSON.stringify({
                detectedBrand: "Generic_Scam",
                isFakeBrand: false,
                isGenericScam: true,
                warningMessage: "嚴重警告：此網站內容包含強烈的通用型詐騙特徵！",
                ...analysisMetadata
            }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        
        // 3. AI Agent 2：取得官方網域並比對
        if (isTrustedCoBrandCampaignHost(inputDomain, detectedBrand)) {
            return new Response(JSON.stringify({
                detectedBrand: detectedBrand,
                inputDomain: inputDomain,
                isFakeBrand: false,
                coBrandCampaign: true,
                message: "可信活動/媒體網域上的品牌合作活動，不視為品牌仿冒",
                ...analysisMetadata
            }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }
        const officialDomains = await getOfficialDomain(detectedBrand);
        
        if (!officialDomains || officialDomains.length === 0) {
            return new Response(JSON.stringify({ 
                isFakeBrand: false, 
                detectedBrand: detectedBrand,
                message: "無法查證該品牌的官方網域",
                ...analysisMetadata
            }));
        }

        // 🚨 判定邏輯更新：只要輸入的網域符合陣列中的「任何一個」合法網域（或是其子網域），就是安全的！
        const isMatch = officialDomains.some(domain => inputDomain === domain || inputDomain.endsWith("." + domain));

        if (!isMatch && isMarketplaceProductBrandContext(markdownText, targetUrl)) {
            return new Response(JSON.stringify({
                detectedBrand: detectedBrand,
                officialDomain: officialDomains[0],
                inputDomain: inputDomain,
                isFakeBrand: false,
                productBrandContext: true,
                message: "一般電商商品頁出現商品品牌，不視為品牌仿冒",
                ...analysisMetadata
            }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        return new Response(JSON.stringify({
            detectedBrand: detectedBrand,
            officialDomain: officialDomains[0], // 畫面上顯示主要的第一個網域即可
            inputDomain: inputDomain,
            isFakeBrand: !isMatch,
            warningMessage: !isMatch ? `嚴重警告：此網站企圖偽裝成「${detectedBrand}」，但其真實網域並非官方網站（如 ${officialDomains[0]}）！` : "品牌與網域相符。",
            ...analysisMetadata
        }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
