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
        "top": "whois.nic.top",
        "shop": "whois.nic.shop",
        "club": "whois.nic.club",
        "vip": "whois.nic.vip",
        "cc": "whois.nic.cc",
        "cn": "whois.cnnic.cn",
        "tw": "whois.twnic.net",
        "com": "whois.verisign-grs.com",
        "net": "whois.verisign-grs.com",
        "org": "whois.publicinterestregistry.org",
        "info": "whois.afilias.net",
        "co": "whois.nic.co"
    };
    // 如果不在列表中，嘗試通用的命名規則，或回傳 IANA
    return servers[tld] || `whois.nic.${tld}`; 
}

// [新增] TCP Socket WHOIS 查詢 (最強備援)
async function fetchWhoisSocket(domain, tld) {
    const server = getWhoisServer(tld);
    
    try {
        const socket = connect({ hostname: server, port: 43 });
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // 寫入查詢指令 (網域 + CRLF)
        await writer.write(encoder.encode(domain + "\r\n"));

        let responseText = "";
        
        // 讀取回應
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            responseText += decoder.decode(value, { stream: true });
            
            // 簡單防止過大回應
            if (responseText.length > 10000) break;
        }
        
        // 解析日期 (支援多種格式)
        // Creation Date: 2023-01-01T...
        // Domain Registration Date: ...
        const dateRegex = /(?:Creation Date|Registration Date|Created on|Registered on|Domain Name Commencement Date):?\s*(\d{4}-\d{2}-\d{2})/i;
        const match = responseText.match(dateRegex);

        if (match) {
            return {
                events: [{
                    eventAction: "registration",
                    eventDate: match[1]
                }],
                entities: [{
                    roles: ["registrar"],
                    vcardArray: ["vcard", [["fn", {}, "text", "TCP/Whois Lookup"]]]
                }],
                source: "tcp-socket" // 標記來源
            };
        }
        return null;

    } catch (e) {
        console.log(`Socket Error to ${server}:`, e);
        return null;
    }
}

// [新增] IANA RDAP 資料快取
let ianaCache = {
  data: null,
  timestamp: 0
};

// [新增] Helper: 從 IANA 取得權威 RDAP 伺服器
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
    } catch (e) {
      if (!ianaCache.data) return null;
    }
  }

  const services = ianaCache.data.services || [];
  for (const [tlds, urls] of services) {
    if (tlds.includes(tld)) {
      return urls[0]; 
    }
  }
  return null;
}

// Helper: 從第三方網站 (Whois365) 撈取並解析 HTML (最後手段)
async function fetchThirdPartyWhois(domain) {
  // 使用 corsproxy.io 可能比 allorigins 更穩定一點
  const targetUrl = `https://corsproxy.io/?${encodeURIComponent(`https://www.whois365.com/tw/domain/${domain}`)}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
      }
    });

    if (!response.ok) return null;
    const html = await response.text();
    
    const dateRegex = /(?:Creation Date|Registration Date|Created on|Registered on)[\s\S]*?(\d{4}-\d{2}-\d{2})/i;
    const dateMatch = html.match(dateRegex);
    
    const registrarRegex = /(?:Registrar:|Sponsoring Registrar:)[\s\S]*?(?:>|&nbsp;|\t| )([a-zA-Z0-9\.\,\ \(\)]+?)(?:<|\n|\r)/i;
    const registrarMatch = html.match(registrarRegex);

    if (dateMatch) {
        return {
            events: [{
                eventAction: "registration",
                eventDate: dateMatch[1]
            }],
            entities: registrarMatch ? [{
                roles: ["registrar"],
                vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", registrarMatch[1].trim()]]]
            }] : []
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

  // --- 決定查詢網址 ---
  if (tld === 'cn') {
      targetUrl = `${DIRECT_RDAP_SERVERS['cn']}${rootDomain}`;
      headers = {
          ...headers,
          "Referer": "https://whois.cnnic.cn/",
          "Origin": "https://whois.cnnic.cn",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      };
  } else if (DIRECT_RDAP_SERVERS[tld]) {
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

  try {
    const response = await fetch(targetUrl, {
      headers: headers,
      method: "GET"
    });

    // --- 錯誤處理與重試邏輯 ---
    if (!response.ok) {
       // [優先策略] 使用 TCP Socket 直連 Port 43 (最強解法)
       // 當 HTTP RDAP 失敗 (403/404/500)，直接使用 Socket 查詢
       if (response.status === 403 || response.status === 404 || response.status === 500) {
           
           // 嘗試 1: TCP Socket
           const socketData = await fetchWhoisSocket(rootDomain, tld);
           if (socketData) {
               return new Response(JSON.stringify(socketData), {
                   headers: { 
                       "Content-Type": "application/json", 
                       "Cache-Control": "public, max-age=3600",
                       "Access-Control-Allow-Origin": "*"
                   }
               });
           }

           // 嘗試 2: 爬蟲備援 (Whois365) - 如果 Socket 也失敗才用這個
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

           // 嘗試 3: RDAP Proxy (針對 .cn 的最後掙扎)
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