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

  // 4. 定義特定 TLD 的直連伺服器 (避開 rdap.org 的轉址問題)
  // 尤其是 .cn, .tw 這些有時會有防火牆或轉址延遲的註冊局
  const DIRECT_RDAP_SERVERS = {
    "cn": "https://rdap.cnnic.cn/domain/",
    "tw": "https://rdap.twnic.tw/rdap/domain/",
    "jp": "https://rdap.jprs.jp/rdap/domain/",
    "sg": "https://rdap.sgnic.sg/rdap/domain/"
  };

  // 決定最終查詢網址：如果有直連清單就用直連，否則用 rdap.org 引導
  let targetUrl;
  if (DIRECT_RDAP_SERVERS[tld]) {
    targetUrl = `${DIRECT_RDAP_SERVERS[tld]}${rootDomain}`;
  } else {
    targetUrl = `https://rdap.org/domain/${rootDomain}`;
  }

  try {
    // 5. 發送請求 (偽裝成瀏覽器)
    const response = await fetch(targetUrl, {
      headers: {
        // 使用真實瀏覽器的 User-Agent，降低被 .cn 防火牆擋下的機率
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/rdap+json, application/json"
      }
    });

    if (!response.ok) {
       // 如果直連失敗，針對 .cn 特別回傳說明，方便除錯
       if (tld === 'cn' && response.status === 403) {
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
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}