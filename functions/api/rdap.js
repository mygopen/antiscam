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

function parseDateFromText(text) {
    const regexes = [
        /(?:Creation Date|Registration Date|Registration Time|Creation Time|Created on|Registered on|Record created on|Domain Name Commencement Date):?\s*(\d{4}-\d{2}-\d{2})/i,
        /(?:Creation Date|Registration Date|Registration Time|Created on|Registered on|Record created on):?\s*(\d{4})\/(\d{2})\/(\d{2})/i,
        /(?:Creation Date|Registration Date|Created on|Registered on):?\s*(\d{4})\.(\d{2})\.(\d{2})/i,
        /(?:注册日期|申请日期|登録年月日):?\s*(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/
    ];

    for (const regex of regexes) {
        const match = text.match(regex);
        if (match) {
            if (match.length >= 4) {
                return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
            }
            return match[1];
        }
    }
    return null;
}

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

async function fetchViaProxy(targetUrl) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    try {
        const res = await fetch(proxyUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        return res;
    } catch (e) { return null; }
}

async function fetchTwnicWeb(domain) {
    const targetUrl = `https://www.twnic.tw/whois_n.cgi?query=${domain}`;
    const res = await fetchViaProxy(targetUrl);
    if (res && res.ok) {
        const html = await res.text();
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

async function fetchWhoIsWeb(domain) {
    const targetUrl = `https://who.is/whois/${domain}`;
    const res = await fetchViaProxy(targetUrl);
    if (res && res.ok) {
        const html = await res.text();
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

// --- 新增：憑證透明度查詢 (Certificate Transparency) ---
// 查詢 crt.sh 獲取該網域最新的憑證簽發時間
async function fetchCertTransparency(domain) {
    // 查詢 crt.sh 的 JSON API
    const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "MyGoPen-AntiScam-Bot/1.0" }
        });
        
        if (!res.ok) return null;
        
        const text = await res.text();
        // crt.sh 有時會回傳不標準的 JSON 或空值，需 try-catch
        let data;
        try {
            data = JSON.parse(text);
        } catch(e) { return null; }

        if (!Array.isArray(data) || data.length === 0) return { found: false };

        // 找到最新的 entry_timestamp (通常是簽發時間)
        // 排序：最新的在最前
        data.sort((a, b) => new Date(b.entry_timestamp) - new Date(a.entry_timestamp));
        
        const latest = data[0];
        return {
            found: true,
            latestDate: latest.entry_timestamp, // ISO string usually
            issuer: latest.issuer_name,
            subject: latest.common_name
        };

    } catch(e) {
        return null;
    }
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
  const urlObj = new URL(request.url);
  let domain = urlObj.searchParams.get("domain");
  const type = urlObj.searchParams.get("type"); // 支援 ?type=cert

  if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400 });

  domain = domain.toLowerCase();
  if (domain.startsWith("www.")) domain = domain.slice(4);

  // --- 特殊模式：查詢 SSL 憑證 ---
  if (type === 'cert') {
      const certData = await fetchCertTransparency(domain);
      if (certData) {
          return new Response(JSON.stringify(certData), { headers: { "Content-Type": "application/json" }});
      } else {
          return new Response(JSON.stringify({ found: false, msg: "No Data or Error" }), { headers: { "Content-Type": "application/json" }});
      }
  }

  // --- 標準模式：查詢 RDAP/WHOIS ---
  const rootDomain = getRegisteredDomain(domain);
  const tld = rootDomain.split('.').pop();

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
    let response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
    });

    if (!response.ok) {
       const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
       try {
           const proxyRes = await fetch(proxyUrl);
           if (proxyRes.ok) {
               const data = await proxyRes.json();
               if (data.events || data.entities) return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" }});
           }
       } catch(e) {}

       const socketData = await fetchWhoisSocket(rootDomain, tld);
       if (socketData) {
           return new Response(JSON.stringify(socketData), { headers: { "Content-Type": "application/json" }});
       }

       if (tld === 'tw') {
           const twnicData = await fetchTwnicWeb(rootDomain);
           if (twnicData) {
               return new Response(JSON.stringify(twnicData), { headers: { "Content-Type": "application/json" }});
           }
       }

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
