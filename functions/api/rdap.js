// Helper: 自動提取主網域 (處理 .com vs .com.tw 的差異)
function getRegisteredDomain(hostname) {
  const parts = hostname.split('.');
  
  // 如果只有兩段或更少，直接回傳 (例如 google.com, localhost)
  if (parts.length <= 2) return hostname;

  // 定義常見的雙層後綴 (依需求可擴充)
  // 遇到這些結尾時，我們要抓最後 3 段 (例如 yahoo.com.tw)
  // 否則預設抓最後 2 段 (例如 antiscam.showcha.com -> showcha.com)
  const secondLevelTLDs = [
    "com.tw", "org.tw", "gov.tw", "edu.tw", "net.tw", 
    "co.uk", "org.uk", "gov.uk", 
    "co.jp", "ne.jp", "ac.jp", "go.jp",
    "com.hk", "org.hk",
    "com.cn", "org.cn", "gov.cn"
  ];

  // 取得最後兩段組合起來檢查 (例如檢查 "com.tw")
  const lastTwo = parts.slice(-2).join('.');

  if (secondLevelTLDs.includes(lastTwo)) {
    // 如果是 .com.tw 這種，保留最後 3 段
    return parts.slice(-3).join('.');
  } else {
    // 一般情況 (.com, .xyz, .net)，保留最後 2 段
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

  // 1. 轉小寫
  domain = domain.toLowerCase();

  // 2. 智慧提取主網域 (徹底解決 www, antiscam, shop 等各種子網域問題)
  const rootDomain = getRegisteredDomain(domain);

  // 指向 RDAP 引導服務
  const targetUrl = `https://rdap.org/domain/${rootDomain}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AntiScam-Tool/2.0"
      }
    });

    if (!response.ok) {
       return new Response(JSON.stringify({ 
         error: "Domain not found in RDAP", 
         checkedDomain: rootDomain,
         originalInput: domain 
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