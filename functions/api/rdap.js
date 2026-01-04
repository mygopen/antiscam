// Helper: 自動提取主網域 (處理 .com.tw, .cn, .uk 等不同層級)
function getRegisteredDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  // 定義常見的雙層後綴
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

  // 1. 格式標準化
  domain = domain.toLowerCase();
  
  // 移除 www.
  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }

  // 2. 智慧提取主網域
  const rootDomain = getRegisteredDomain(domain);

  // 3. 取得頂級域名後綴 (TLD)
  const tld = rootDomain.split('.').pop();

  // 4. 定義特定 TLD 的直連伺服器
  // 針對 .cn 嘗試偽裝成從 CNNIC 官網發出的請求
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

  // 針對不同 TLD 進行客製化 Header 偽裝
  if (tld === 'cn') {
      targetUrl = `${DIRECT_RDAP_SERVERS['cn']}${rootDomain}`;
      // CNNIC 防火牆較嚴格，加入 Referer 和語系設定
      headers = {
          ...headers,
          "Referer": "https://whois.cnnic.cn/",
          "Origin": "https://whois.cnnic.cn",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-site"
      };
  } else if (DIRECT_RDAP_SERVERS[tld]) {
      targetUrl = `${DIRECT_RDAP_SERVERS[tld]}${rootDomain}`;
  } else {
      // 其他網域使用 rdap.org 導引
      targetUrl = `https://rdap.org/domain/${rootDomain}`;
  }

  try {
    // 5. 發送請求
    const response = await fetch(targetUrl, {
      headers: headers,
      method: "GET"
    });

    if (!response.ok) {
       // 如果直連失敗 (特別是 .cn 403)，嘗試 fallback 到 rdap.org (雖然可能也被擋，但值得一試)
       if (tld === 'cn' && response.status === 403) {
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
           } catch(e) {
             // Fallback failed, continue to error response
           }

           return new Response(JSON.stringify({ 
             error: "Registry Blocked Cloudflare", 
             details: "CNNIC firewall blocked the request. Please use manual check.",
             manualCheck: `https://whois.cnnic.cn/`
           }), { status: 403, headers: { "Content-Type": "application/json" }});
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