// Helper: 自動提取主網域 (處理 .com.tw, .cn, .uk 等不同層級)
function getRegisteredDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const secondLevelTLDs = [
    "com.tw", "org.tw", "gov.tw", "edu.tw", "net.tw", 
    "co.uk", "org.uk", "gov.uk", 
    "co.jp", "ne.jp", "ac.jp", "go.jp",
    "com.hk", "org.hk",
    "com.cn", "org.cn", "gov.cn", "net.cn", "ac.cn"
  ];

  const lastTwo = parts.slice(-2).join('.');
  if (secondLevelTLDs.includes(lastTwo)) {
    return parts.slice(-3).join('.');
  } else {
    return parts.slice(-2).join('.');
  }
}

// [新增] Helper: 從第三方網站 (Whois365) 撈取並解析 HTML
async function fetchThirdPartyWhois(domain) {
  // 這裡以 whois365.com 為例，也可以替換成 who.is 或其他網站
  // 注意：第三方網站可能會改版或阻擋自動化請求，需定期維護
  const targetUrl = `https://www.whois365.com/tw/domain/${domain}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.whois365.com/" // 加上 Referer 增加成功率
      }
    });

    if (!response.ok) return null;

    const html = await response.text();

    // 定義要解析的欄位 (Regex)
    // 針對 whois365 的 HTML 結構進行匹配 (範例結構，需視實際狀況調整)
    // 常見關鍵字: "Creation Date", "Registration Date", "Registrar"
    
    // 1. 嘗試提取日期 (支援多種格式)
    // 尋找像是 "Creation Date: 2023-01-01" 或 "Registration Date: ..."
    const dateRegex = /(?:Creation Date|Registration Date|Created on|Registered on)[\s\S]*?(\d{4}-\d{2}-\d{2})/i;
    const dateMatch = html.match(dateRegex);
    
    // 2. 嘗試提取註冊商
    // 尋找像是 "Registrar: GoDaddy.com, LLC"
    const registrarRegex = /(?:Registrar:|Sponsoring Registrar:)[\s\S]*?(?:>|&nbsp;|\t| )([a-zA-Z0-9\.\,\ \(\)]+?)(?:<|\n|\r)/i;
    const registrarMatch = html.match(registrarRegex);

    // 建構回傳物件，模擬 RDAP 的 events 結構以便前端相容
    if (dateMatch) {
        return {
            events: [
                {
                    eventAction: "registration",
                    eventDate: dateMatch[1] // 格式: YYYY-MM-DD
                }
            ],
            entities: registrarMatch ? [
                {
                    roles: ["registrar"],
                    vcardArray: [
                        "vcard",
                        [
                            ["version", {}, "text", "4.0"],
                            ["fn", {}, "text", registrarMatch[1].trim()]
                        ]
                    ]
                }
            ] : []
        };
    }
    return null;

  } catch (e) {
    // console.log("Third party fetch failed:", e);
    return null;
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  let domain = url.searchParams.get("domain");

  if (!domain) {
    return new Response(JSON.stringify({ error: "Missing domain" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  domain = domain.toLowerCase();
  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }

  const rootDomain = getRegisteredDomain(domain);
  const tld = rootDomain.split('.').pop();

  // 定義 RDAP 伺服器
  const DIRECT_RDAP_SERVERS = {
    "cn": "https://rdap.cnnic.cn/domain/",
    "tw": "https://rdap.twnic.tw/rdap/domain/",
    "jp": "https://rdap.jprs.jp/rdap/domain/",
    "sg": "https://rdap.sgnic.sg/rdap/domain/"
  };

  let targetUrl;
  let headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rdap+json, application/json, text/javascript, */*; q=0.01"
  };

  if (tld === 'cn') {
      targetUrl = `${DIRECT_RDAP_SERVERS['cn']}${rootDomain}`;
      // CNNIC 偽裝 headers
      headers = {
          ...headers,
          "Referer": "https://whois.cnnic.cn/",
          "Origin": "https://whois.cnnic.cn",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          // ... 其他偽裝 header ...
      };
  } else if (DIRECT_RDAP_SERVERS[tld]) {
      targetUrl = `${DIRECT_RDAP_SERVERS[tld]}${rootDomain}`;
  } else {
      targetUrl = `https://rdap.org/domain/${rootDomain}`;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: headers,
      method: "GET"
    });

    // --- 關鍵修改區段 ---
    if (!response.ok) {
       // 如果是 .cn 且遇到 403 Forbidden (CNNIC 擋掉請求)
       if (tld === 'cn' && response.status === 403) {
           
           // [新增] 策略 1: 嘗試使用第三方網站 (Whois365) 作為跳板
           const thirdPartyData = await fetchThirdPartyWhois(rootDomain);
           if (thirdPartyData) {
               return new Response(JSON.stringify(thirdPartyData), {
                   headers: { 
                       "Content-Type": "application/json", 
                       "Cache-Control": "public, max-age=3600",
                       "Access-Control-Allow-Origin": "*"
                   }
               });
           }

           // 策略 2: 如果第三方也失敗，嘗試原本的 rdap.org
           const fallbackUrl = `https://rdap.org/domain/${rootDomain}`;
           try {
             const fallbackResponse = await fetch(fallbackUrl, {
                headers: { "User-Agent": headers["User-Agent"] }
             });
             if (fallbackResponse.ok) {
                const data = await fallbackResponse.json();
                return new Response(JSON.stringify(data), {
                    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
                });
             }
           } catch(e) {}

           // 最終失敗回傳
           return new Response(JSON.stringify({ 
             error: "Registry Blocked Cloudflare", 
             details: "CNNIC firewall blocked the request. Third-party fallback also failed.",
             manualCheck: `https://whois.cnnic.cn/`
           }), { status: 403, headers: { "Content-Type": "application/json" }});
       }

       // 其他一般錯誤
       return new Response(JSON.stringify({ 
         error: "Domain not found or Registry error", 
         status: response.status 
       }), {
         status: 404,
         headers: { "Content-Type": "application/json" }
       });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}