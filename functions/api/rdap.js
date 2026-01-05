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

// [新增] IANA RDAP 資料快取 (避免每次 Request 都重新抓取 IANA JSON)
let ianaCache = {
  data: null,
  timestamp: 0
};

// [新增] Helper: 從 IANA 取得權威 RDAP 伺服器
async function fetchIanaRdapServer(tld) {
  const CACHE_TTL = 3600 * 1000; // 快取 1 小時
  const now = Date.now();

  // 如果沒有快取或快取過期，重新抓取
  if (!ianaCache.data || (now - ianaCache.timestamp > CACHE_TTL)) {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json");
      if (res.ok) {
        ianaCache.data = await res.json();
        ianaCache.timestamp = now;
      }
    } catch (e) {
      // console.error("Failed to fetch IANA data", e);
      // 失敗時若有舊資料則繼續使用，否則回傳 null
      if (!ianaCache.data) return null;
    }
  }

  // 從 services 陣列中尋找對應的 TLD
  // IANA 結構: services: [ [ ["com", "net"], ["https://rdap.verisign.com/..."] ], ... ]
  const services = ianaCache.data.services || [];
  for (const [tlds, urls] of services) {
    if (tlds.includes(tld)) {
      return urls[0]; // 回傳第一個可用的權威伺服器 URL
    }
  }
  return null;
}

// Helper: 從第三方網站 (Whois365) 撈取並解析 HTML
async function fetchThirdPartyWhois(domain) {
  const targetUrl = `https://www.whois365.com/tw/domain/${domain}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.whois365.com/"
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    
    // 1. 嘗試提取日期
    const dateRegex = /(?:Creation Date|Registration Date|Created on|Registered on)[\s\S]*?(\d{4}-\d{2}-\d{2})/i;
    const dateMatch = html.match(dateRegex);
    
    // 2. 嘗試提取註冊商
    const registrarRegex = /(?:Registrar:|Sponsoring Registrar:)[\s\S]*?(?:>|&nbsp;|\t| )([a-zA-Z0-9\.\,\ \(\)]+?)(?:<|\n|\r)/i;
    const registrarMatch = html.match(registrarRegex);

    if (dateMatch) {
        return {
            events: [
                {
                    eventAction: "registration",
                    eventDate: dateMatch[1]
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

  // 定義 RDAP 伺服器 (您原本的手動清單，保留做為快速通道或特殊處理)
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

  // --- 決定查詢網址 ---
  if (tld === 'cn') {
      // .cn 特殊處理 (保留原本的 Anti-blocking 邏輯)
      targetUrl = `${DIRECT_RDAP_SERVERS['cn']}${rootDomain}`;
      headers = {
          ...headers,
          "Referer": "https://whois.cnnic.cn/",
          "Origin": "https://whois.cnnic.cn",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      };
  } else if (DIRECT_RDAP_SERVERS[tld]) {
      // 命中手動清單
      targetUrl = `${DIRECT_RDAP_SERVERS[tld]}${rootDomain}`;
  } else {
      // [新增] 嘗試從 IANA 獲取權威伺服器
      const ianaServer = await fetchIanaRdapServer(tld);
      
      if (ianaServer) {
          // IANA 回傳的 URL 通常結尾有 slash (e.g., https://rdap.verisign.com/com/v1/)
          // 需串接 domain/{rootDomain}
          // 為了安全起見，處理一下 slash 避免雙重斜線
          const baseUrl = ianaServer.endsWith('/') ? ianaServer : ianaServer + '/';
          targetUrl = `${baseUrl}domain/${rootDomain}`;
      } else {
          // 最終保底：使用 rdap.org
          targetUrl = `https://rdap.org/domain/${rootDomain}`;
      }
  }

  try {
    const response = await fetch(targetUrl, {
      headers: headers,
      method: "GET"
    });

    // --- 錯誤處理與重試邏輯 ---
    if (!response.ok) {
       
       // [方案二：Proxy 優先策略] 
       // 當官方伺服器回傳錯誤 (403/404/500) 時，先嘗試透過 Proxy 訪問 rdap.org
       // 這可以繞過 Cloudflare IP 被 .online 等註冊局封鎖的問題
       const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://rdap.org/domain/${rootDomain}`)}`;
       
       try {
           const proxyRes = await fetch(proxyUrl, {
               headers: { "User-Agent": "Mozilla/5.0 (Compatible; AntiScamBot/1.0)" }
           });
           
           if (proxyRes.ok) {
               const data = await proxyRes.json();
               // 簡單檢查回應是否包含 RDAP 特徵欄位，避免 Proxy 回傳錯誤頁面 HTML
               if (data.events || data.handle || data.entities) {
                   return new Response(JSON.stringify(data), {
                       headers: { 
                           "Content-Type": "application/json",
                           "Cache-Control": "public, max-age=3600",
                           "Access-Control-Allow-Origin": "*"
                       }
                   });
               }
           }
       } catch(e) {
           // Proxy 失敗，靜默處理，繼續執行下方的 Whois365 備援
           // console.log("Proxy fallback failed", e);
       }

       // [備援策略：爬蟲] 若 Proxy 也失敗，嘗試爬取 Whois365 HTML
       // 只要狀態碼為 403 (Forbidden), 404 (Not Found), 500 (Server Error)
       if (response.status === 403 || response.status === 404 || response.status === 500) {
           
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

           // 針對 .cn 的特殊二次備援 (若上方 Proxy 沒過，這裡再試一次直連 rdap.org)
           if (tld === 'cn') {
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
           }

           // 若都失敗，回傳錯誤
           if (tld === 'cn' && response.status === 403) {
               return new Response(JSON.stringify({ 
                 error: "Registry Blocked Cloudflare", 
                 details: "CNNIC firewall blocked the request. Third-party fallback also failed.",
                 manualCheck: `https://whois.cnnic.cn/`
               }), { status: 403, headers: { "Content-Type": "application/json" }});
           }
       }

       // 如果是使用 IANA 網址失敗 (例如 404 或 500)，且上面 Whois365 也沒抓到
       if (!targetUrl.includes("rdap.org")) {
           try {
               const fallbackUrl = `https://rdap.org/domain/${rootDomain}`;
               const fallbackRes = await fetch(fallbackUrl, { headers });
               if (fallbackRes.ok) {
                   const data = await fallbackRes.json();
                   return new Response(JSON.stringify(data), {
                       headers: { 
                           "Content-Type": "application/json",
                           "Cache-Control": "public, max-age=3600",
                           "Access-Control-Allow-Origin": "*"
                       }
                   });
               }
           } catch(e) {}
       }

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