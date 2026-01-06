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

// Helper: 取得 TLD 對應的 WHOIS Server
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

// [Regex 增強] 支援斜線、點號、中文日期
function parseDateFromText(text) {
    const regexes = [
        // 標準格式 YYYY-MM-DD
        // [修正] 新增 "Registration Time" (針對 .cn) 與 "Creation Time"
        /(?:Creation Date|Registration Date|Registration Time|Creation Time|Created on|Registered on|Record created on|Domain Name Commencement Date):?\s*(\d{4}-\d{2}-\d{2})/i,
        // 支援斜線 YYYY/MM/DD (常見於亞洲網域)
        /(?:Creation Date|Registration Date|Registration Time|Created on|Registered on|Record created on):?\s*(\d{4})\/(\d{2})\/(\d{2})/i,
        // 支援點號 YYYY.MM.DD
        /(?:Creation Date|Registration Date|Created on|Registered on):?\s*(\d{4})\.(\d{2})\.(\d{2})/i,
        // 中文格式
        /(?:注册日期|申请日期|登録年月日):?\s*(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/
    ];

    for (const regex of regexes) {
        const match = text.match(regex);
        if (match) {
            // 如果抓到的是拆開的年月日 (group 2,3,4)，組合成 YYYY-MM-DD
            if (match.length >= 4) {
                return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
            }
            return match[1];
        }
    }
    return null;
}

// TCP Socket WHOIS
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
            if (responseText.length > 5000 || readCount++ > 50) break; 
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
    } catch (e) { return null; }
}

// Proxy Helper
async function fetchViaProxy(targetUrl) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    try {
        const res = await fetch(proxyUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        return res;
    } catch (e) { return null; }
}

// [方案六] 針對 .tw 的官方網頁爬蟲
async function fetchTwnicWeb(domain) {
    // TWNIC 官方查詢介面
    const targetUrl = `https://www.twnic.tw/whois_n.cgi?query=${domain}`;
    const res = await fetchViaProxy(targetUrl);
    
    if (res && res.ok) {
        const html = await res.text();
        // TWNIC 網頁通常顯示 "Record created on yyyy-mm-dd"
        const date = parseDateFromText(html);
        if (date) {
            return {
                events: [{ eventAction: "registration", eventDate: date }],
                entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "TWNIC Web"]]] }],
                source: "twnic-web"
            };
        }
    }
    return null;
}

// [方案五] 爬取 who.is (通用備援)
async function fetchWhoIsWeb(domain) {
    const targetUrl = `https://who.is/whois/${domain}`;
    const res = await fetchViaProxy(targetUrl);
    
    if (res && res.ok) {
        const html = await res.text();
        // who.is 結構通常是 class="queryResponseBody" 或直接在 pre tag 裡
        const date = parseDateFromText(html);
        if (date) {
            return {
                events: [{ eventAction: "registration", eventDate: date }],
                entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Who.is Web"]]] }],
                source: "whois-web"
            };
        }
    }
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
      targetUrl = ianaServer ? `${ianaServer.endsWith('/') ? ianaServer : ianaServer + '/'}domain/${rootDomain}` : `https://rdap.org/domain/${rootDomain}`;
  }

  try {
    // 策略 A: 直連官方 RDAP
    let response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });

    // 如果直連失敗 (403/404/500)，進入多重備援流程
    if (!response.ok) {
       
       // 策略 B: 透過 CORS Proxy 訪問 RDAP (針對 .cn, .online)
       const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
       try {
           const proxyRes = await fetch(proxyUrl);
           if (proxyRes.ok) {
               const data = await proxyRes.json();
               if (data.events || data.entities) return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" }});
           }
       } catch(e) {}

       // 策略 C: TCP Socket 直連 Port 43 (底層協議)
       const socketData = await fetchWhoisSocket(rootDomain, tld);
       if (socketData) {
           return new Response(JSON.stringify(socketData), { headers: { "Content-Type": "application/json" }});
       }

       // 策略 D: 針對 .tw 的特殊網頁爬蟲 (方案六)
       if (tld === 'tw') {
           const twnicData = await fetchTwnicWeb(rootDomain);
           if (twnicData) {
               return new Response(JSON.stringify(twnicData), { headers: { "Content-Type": "application/json" }});
           }
       }

       // 策略 E: 通用網頁爬蟲 who.is (方案五)
       const whoisWebData = await fetchWhoIsWeb(rootDomain);
       if (whoisWebData) {
           return new Response(JSON.stringify(whoisWebData), { headers: { "Content-Type": "application/json" }});
       }

       return new Response(JSON.stringify({ error: "Domain not found", status: response.status }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server Error", details: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}