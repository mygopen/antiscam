import { connect } from 'cloudflare:sockets';

// Helper: 自動提取主網域
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

// Helper: 取得 TLD 對應的 WHOIS Server (用於 TCP Socket)
function getWhoisServer(tld) {
    const servers = {
        "online": "whois.nic.online",
        "xyz": "whois.nic.xyz",
        "site": "whois.nic.site",
        "cn": "whois.cnnic.cn",
        "tw": "whois.twnic.net",
        "com": "whois.verisign-grs.com",
        "net": "whois.verisign-grs.com",
        "org": "whois.publicinterestregistry.org",
        "shop": "whois.nic.shop",
        "club": "whois.nic.club",
        "vip": "whois.nic.vip",
        "top": "whois.nic.top"
    };
    return servers[tld] || `whois.nic.${tld}`; 
}

// [方案四] 增強版 Regex：支援中文與 Time 關鍵字
function parseDateFromText(text) {
    // 支援格式:
    // Creation Date: 2023-01-01
    // Registration Time: 2023-01-01 12:00:00 (.cn 常見)
    // 注册日期: 2023年01月01日 (.cn 中文常見)
    // Domain Name Commencement Date: ...
    const regexes = [
        /(?:Creation Date|Registration Date|Created on|Registered on|Domain Name Commencement Date):?\s*(\d{4}-\d{2}-\d{2})/i,
        /(?:Registration Time|Creation Time):?\s*(\d{4}-\d{2}-\d{2})/i,
        /(?:注册日期|申请日期):?\s*(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/ // 針對中文格式
    ];

    for (const regex of regexes) {
        const match = text.match(regex);
        if (match) {
            if (match.length >= 4) {
                // 處理中文年月日拆分的情況
                return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
            }
            return match[1];
        }
    }
    return null;
}

// [保留] TCP Socket WHOIS 查詢
async function fetchWhoisSocket(domain, tld) {
    const server = getWhoisServer(tld);
    try {
        const socket = connect({ hostname: server, port: 43 });
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        await writer.write(encoder.encode(domain + "\r\n"));

        let responseText = "";
        let readCount = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            responseText += decoder.decode(value, { stream: true });
            
            readCount++;
            if (responseText.length > 5000 || readCount > 50) break; 
        }
        
        const date = parseDateFromText(responseText);
        if (date) {
            return {
                events: [{ eventAction: "registration", eventDate: date }],
                entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "TCP/Whois Lookup"]]] }],
                source: "tcp-socket"
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

// [方案三] 使用 corsproxy.io 進行 RDAP 請求 (繞過 IP 封鎖)
async function fetchRdapViaProxy(targetUrl) {
    // 使用 corsproxy.io 作為跳板，它比 allorigins 更不容易被 .cn/.online 封鎖
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    try {
        const res = await fetch(proxyUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            return data;
        }
    } catch (e) {}
    return null;
}

// IANA Cache
let ianaCache = { data: null, timestamp: 0 };

async function fetchIanaRdapServer(tld) {
  const CACHE_TTL = 3600 * 1000; 
  const now = Date.now();

  if (!ianaCache.data || (now - ianaCache.timestamp > CACHE_TTL)) {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json");
      if (res.ok) {
        ianaCache.data = await res.json();
        ianaCache.timestamp = now;
      }
    } catch (e) {}
  }

  const services = ianaCache.data?.services || [];
  for (const [tlds, urls] of services) {
    if (tlds.includes(tld)) return urls[0]; 
  }
  return null;
}

// Helper: 第三方 HTML 爬蟲 (最後手段)
async function fetchThirdPartyWhois(domain) {
  const targetUrl = `https://corsproxy.io/?${encodeURIComponent(`https://www.whois365.com/tw/domain/${domain}`)}`;
  try {
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const date = parseDateFromText(html);
    
    // 嘗試提取註冊商
    const registrarRegex = /(?:Registrar:|Sponsoring Registrar:)[\s\S]*?(?:>|&nbsp;|\t| )([a-zA-Z0-9\.\,\ \(\)]+?)(?:<|\n|\r)/i;
    const registrarMatch = html.match(registrarRegex);

    if (date) {
        return {
            events: [{ eventAction: "registration", eventDate: date }],
            entities: registrarMatch ? [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", registrarMatch[1].trim()]]] }] : []
        };
    }
    return null;
  } catch (e) { return null; }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  let domain = url.searchParams.get("domain");

  if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400 });

  domain = domain.toLowerCase();
  if (domain.startsWith("www.")) domain = domain.slice(4);

  const rootDomain = getRegisteredDomain(domain);
  const tld = rootDomain.split('.').pop();

  // 1. 決定目標 RDAP URL
  let targetUrl;
  const DIRECT_RDAP_SERVERS = {
    "cn": "https://rdap.cnnic.cn/domain/",
    "tw": "https://rdap.twnic.tw/rdap/domain/",
    "jp": "https://rdap.jprs.jp/rdap/domain/",
    "sg": "https://rdap.sgnic.sg/rdap/domain/"
  };

  if (DIRECT_RDAP_SERVERS[tld]) {
      targetUrl = `${DIRECT_RDAP_SERVERS[tld]}${rootDomain}`;
  } else {
      const ianaServer = await fetchIanaRdapServer(tld);
      if (ianaServer) {
          const baseUrl = ianaServer.endsWith('/') ? ianaServer : ianaServer + '/';
          targetUrl = `${baseUrl}domain/${rootDomain}`;
      } else {
          targetUrl = `https://rdap.org/domain/${rootDomain}`;
      }
  }

  // 2. 開始嘗試獲取資料 (多重策略)
  try {
    // 策略 A: 直連官方 RDAP (對 .tw, .com 有效，對 .cn, .online 通常失敗)
    let response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });

    // 如果直連失敗 (403/404/500)，進入備援流程
    if (!response.ok) {
       
       // 策略 B: 透過 CORS Proxy 訪問 RDAP (針對 .cn, .online 的特效藥)
       // 這能繞過 Cloudflare IP 被註冊局封鎖的問題
       let data = await fetchRdapViaProxy(targetUrl);
       
       // 如果 Proxy 失敗，針對 .cn 嘗試另一個 endpoint
       if (!data && tld === 'cn') {
           data = await fetchRdapViaProxy(`https://rdap.org/domain/${rootDomain}`);
       }

       if (data && (data.events || data.entities)) {
           return new Response(JSON.stringify(data), {
               headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
           });
       }

       // 策略 C: TCP Socket 直連 Port 43 (底層協議)
       // 如果 HTTP 協議全滅，嘗試 TCP
       const socketData = await fetchWhoisSocket(rootDomain, tld);
       if (socketData) {
           return new Response(JSON.stringify(socketData), {
               headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
           });
       }

       // 策略 D: 爬取第三方 Whois 頁面 (最後手段)
       const thirdPartyData = await fetchThirdPartyWhois(rootDomain);
       if (thirdPartyData) {
           return new Response(JSON.stringify(thirdPartyData), {
               headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
           });
       }

       // 全數失敗
       return new Response(JSON.stringify({ 
         error: "Domain not found or Registry error", 
         status: response.status 
       }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // 直連成功
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}