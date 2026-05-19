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
        /(?:Creation Date|Created Date|Registration Date|Registration Time|Creation Time|Created on|Registered on|Record created on|Domain Name Commencement Date):?\s*(\d{4}-\d{2}-\d{2})/i,
        // 支援斜線 YYYY/MM/DD (常見於亞洲網域)
        /(?:Creation Date|Created Date|Registration Date|Registration Time|Created on|Registered on|Record created on):?\s*(\d{4})\/(\d{2})\/(\d{2})/i,
        // 支援點號 YYYY.MM.DD
        /(?:Creation Date|Created Date|Registration Date|Created on|Registered on):?\s*(\d{4})\.(\d{2})\.(\d{2})/i,
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

function parseExpirationDateFromText(text) {
    const regexes = [
        /(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|Expires On|Paid-till|Renewal Date):?\s*(\d{4}-\d{2}-\d{2})/i,
        /(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|Expires On|Paid-till|Renewal Date):?\s*(\d{4})\/(\d{2})\/(\d{2})/i,
        /(?:Registry Expiry Date|Registrar Registration Expiration Date|Expiration Date|Expiry Date|Expires On|Paid-till|Renewal Date):?\s*(\d{4})\.(\d{2})\.(\d{2})/i,
        /(?:到期日|到期日期|有效期限|有效期至|过期时间|到期时间):?\s*(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})/
    ];

    for (const regex of regexes) {
        const match = String(text || '').match(regex);
        if (match) {
            if (match.length >= 4) {
                return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
            }
            return match[1];
        }
    }
    return null;
}

function cleanRegistrarName(value) {
    const cleaned = String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned || /^not disclosed$/i.test(cleaned) || /^redacted/i.test(cleaned)) return null;
    return cleaned;
}

function parseRegistrarFromText(text) {
    const regexes = [
        /(?:Registrar|Sponsoring Registrar|Registrar Name|Registration Service Provider|Authorized Agency|Record maintained by):?\s*([^\r\n<]+)/i,
        /(?:註冊商|注册商|受理註冊機構|受理注册机构|申請人之受理註冊機構):?\s*([^\r\n<]+)/i
    ];

    for (const regex of regexes) {
        const match = String(text || '').match(regex);
        const registrar = cleanRegistrarName(match?.[1]);
        if (registrar) return registrar;
    }

    return null;
}

function parseRegistrantFromText(text) {
    const source = String(text || '');
    const nameRegexes = [
        /(?:Registrant Name|Domain Holder|Holder|Registrant):?\s*([^\r\n<]+)/i,
        /(?:申請人|註冊人|注册人|網域名稱持有人|网域名称持有人):?\s*([^\r\n<]+)/i
    ];
    const orgRegexes = [
        /(?:Registrant Organization|Registrant Org|Organization|Registrant Company):?\s*([^\r\n<]+)/i,
        /(?:申請人組織|註冊人組織|注册人组织|組織名稱|组织名称):?\s*([^\r\n<]+)/i
    ];

    let registrantName = null;
    let registrantOrganization = null;
    for (const regex of nameRegexes) {
        const value = cleanRegistrarName(source.match(regex)?.[1]);
        if (value) {
            registrantName = value;
            break;
        }
    }
    for (const regex of orgRegexes) {
        const value = cleanRegistrarName(source.match(regex)?.[1]);
        if (value) {
            registrantOrganization = value;
            break;
        }
    }
    return { registrantName, registrantOrganization };
}

function getVcardName(entity) {
    if (!entity?.vcardArray || !Array.isArray(entity.vcardArray) || entity.vcardArray.length < 2) return null;
    const fnEntry = entity.vcardArray[1]?.find(item => item[0] === 'fn');
    return cleanRegistrarName(fnEntry?.[3]);
}

function getRegistrarName(data) {
    if (!data || typeof data !== 'object') return null;

    const directRegistrar =
        data.registrarName ||
        data.registrar ||
        data.sponsoringRegistrar ||
        data.sponsor ||
        data.registrationServiceProvider;
    const cleanedDirect = cleanRegistrarName(directRegistrar);
    if (cleanedDirect) return cleanedDirect;

    const entities = Array.isArray(data.entities) ? data.entities : [];
    const preferred = entities.find(entity =>
        Array.isArray(entity.roles) &&
        entity.roles.some(role => /registrar|sponsor|reseller/i.test(role))
    );
    const preferredName = getVcardName(preferred) || cleanRegistrarName(preferred?.name || preferred?.handle);
    if (preferredName) return preferredName;

    for (const entity of entities) {
        const name = getVcardName(entity) || cleanRegistrarName(entity?.name || entity?.handle);
        if (name) return name;
    }

    return null;
}

function getRegistrantInfo(data) {
    if (!data || typeof data !== 'object') return { registrantName: null, registrantOrganization: null };

    let registrantName =
        cleanRegistrarName(data.registrantName || data.registrant || data.domainHolder || data.holder);
    let registrantOrganization =
        cleanRegistrarName(data.registrantOrganization || data.registrantOrg || data.organization);

    const entities = Array.isArray(data.entities) ? data.entities : [];
    const registrantEntity = entities.find(entity =>
        Array.isArray(entity.roles) &&
        entity.roles.some(role => /registrant|holder|owner/i.test(role))
    );
    if (registrantEntity) {
        registrantName = registrantName || getVcardName(registrantEntity) || cleanRegistrarName(registrantEntity?.name || registrantEntity?.handle);
        if (registrantEntity?.vcardArray && Array.isArray(registrantEntity.vcardArray) && registrantEntity.vcardArray.length > 1) {
            const orgEntry = registrantEntity.vcardArray[1]?.find(item => item[0] === 'org');
            registrantOrganization = registrantOrganization || cleanRegistrarName(orgEntry?.[3]);
        }
    }

    return { registrantName, registrantOrganization };
}

function getRegistrationDate(data) {
    if (!data || typeof data !== 'object') return null;

    const directDate =
        data.registrationDate ||
        data.createdDate ||
        data.creationDate ||
        data.created ||
        data.registered;
    if (directDate) return directDate;

    const events = Array.isArray(data.events) ? data.events : [];
    const regEvent = events.find(e => /registration|created|creation/i.test(e.eventAction || ''));
    if (regEvent?.eventDate) return regEvent.eventDate;

    return null;
}

function getExpirationDate(data) {
    if (!data || typeof data !== 'object') return null;

    const directDate =
        data.expirationDate ||
        data.expiryDate ||
        data.expires ||
        data.registryExpiryDate ||
        data.paidTill ||
        data.renewalDate;
    if (directDate) return directDate;

    const events = Array.isArray(data.events) ? data.events : [];
    const expirationEvent = events.find(e => /expiration|expiry|expires|renewal/i.test(e.eventAction || ''));
    if (expirationEvent?.eventDate) return expirationEvent.eventDate;

    return null;
}

function withRegistrarName(data, registrarName) {
    if (!registrarName) return data;
    const output = data && typeof data === 'object' ? { ...data } : {};
    output.registrarName = output.registrarName || registrarName;
    const entities = Array.isArray(output.entities) ? [...output.entities] : [];
    if (!entities.some(entity => Array.isArray(entity.roles) && entity.roles.includes('registrar'))) {
        entities.unshift({ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", registrarName]]] });
    }
    output.entities = entities;
    return output;
}

function withRegistrantInfo(data, info = {}) {
    const registrantName = cleanRegistrarName(info.registrantName);
    const registrantOrganization = cleanRegistrarName(info.registrantOrganization);
    if (!registrantName && !registrantOrganization) return data;
    const output = data && typeof data === 'object' ? { ...data } : {};
    if (registrantName && !output.registrantName) output.registrantName = registrantName;
    if (registrantOrganization && !output.registrantOrganization) output.registrantOrganization = registrantOrganization;
    return output;
}

function mergeDomainData(primary, fallback) {
    let output = primary && typeof primary === 'object' ? { ...primary } : {};
    const fallbackDate = getRegistrationDate(fallback);
    if (fallbackDate && !getRegistrationDate(output)) {
        output = withRegistrationEvent(output, fallbackDate, fallback?.source || 'fallback');
    }
    const fallbackExpirationDate = getExpirationDate(fallback);
    if (fallbackExpirationDate && !getExpirationDate(output)) {
        output = withExpirationEvent(output, fallbackExpirationDate, fallback?.source || 'fallback');
    }
    const fallbackRegistrar = getRegistrarName(fallback);
    if (fallbackRegistrar && !getRegistrarName(output)) {
        output = withRegistrarName(output, fallbackRegistrar);
    }
    const fallbackRegistrant = getRegistrantInfo(fallback);
    const currentRegistrant = getRegistrantInfo(output);
    if ((fallbackRegistrant.registrantName || fallbackRegistrant.registrantOrganization) &&
        (!currentRegistrant.registrantName && !currentRegistrant.registrantOrganization)) {
        output = withRegistrantInfo(output, fallbackRegistrant);
    }
    if (!output.source && fallback?.source) output.source = fallback.source;
    return output;
}

function hasRegistrationDate(data) {
    return !!getRegistrationDate(data);
}

function withRegistrationEvent(data, date, source) {
    const output = data && typeof data === 'object' ? { ...data } : {};
    const events = Array.isArray(output.events) ? [...output.events] : [];
    if (!events.some(event => /registration|created|creation/i.test(event.eventAction || '') && event.eventDate)) {
        events.unshift({ eventAction: 'registration', eventDate: date });
    }
    output.events = events;
    output.source = output.source || source;
    return output;
}

function withExpirationEvent(data, date, source) {
    const output = data && typeof data === 'object' ? { ...data } : {};
    const events = Array.isArray(output.events) ? [...output.events] : [];
    if (!events.some(event => /expiration|expiry|expires|renewal/i.test(event.eventAction || '') && event.eventDate)) {
        events.push({ eventAction: 'expiration', eventDate: date });
    }
    output.events = events;
    output.expirationDate = output.expirationDate || date;
    output.source = output.source || source;
    return output;
}

function jsonResponse(data, init = {}) {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init.headers || {})
        }
    });
}

async function fetchFallbackRegistrationData(rootDomain, tld) {
    const socketData = await fetchWhoisSocket(rootDomain, tld);
    if (socketData && hasRegistrationDate(socketData)) return socketData;

    if (tld === 'tw') {
        const twnicData = await fetchTwnicWeb(rootDomain);
        if (twnicData && hasRegistrationDate(twnicData)) return twnicData;
    }

    const whoisWebData = await fetchWhoIsWeb(rootDomain);
    if (whoisWebData && hasRegistrationDate(whoisWebData)) return whoisWebData;

    return null;
}

async function fetchFallbackRegistrarData(rootDomain, tld) {
    const socketData = await fetchWhoisSocket(rootDomain, tld);
    if (socketData && getRegistrarName(socketData)) return socketData;

    if (tld === 'tw') {
        const twnicData = await fetchTwnicWeb(rootDomain);
        if (twnicData && getRegistrarName(twnicData)) return twnicData;
    }

    const whoisWebData = await fetchWhoIsWeb(rootDomain);
    if (whoisWebData && getRegistrarName(whoisWebData)) return whoisWebData;

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
        const expirationDate = parseExpirationDateFromText(responseText);
        const registrarName = parseRegistrarFromText(responseText);
        const registrantInfo = parseRegistrantFromText(responseText);
        if (date || expirationDate || registrarName || registrantInfo.registrantName || registrantInfo.registrantOrganization) {
            let output = { events: [], source: "tcp-socket" };
            if (date) output = withRegistrationEvent(output, date, "tcp-socket");
            if (expirationDate) output = withExpirationEvent(output, expirationDate, "tcp-socket");
            output = withRegistrarName(output, registrarName);
            return withRegistrantInfo(output, registrantInfo);
        }
        return null;
    } catch (e) { return null; }
}

// Proxy Helper
async function fetchViaProxy(targetUrl) {
    try {
        const directRes = await fetch(targetUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        if (directRes.ok) return directRes;
    } catch (e) { }

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
        const expirationDate = parseExpirationDateFromText(html);
        const registrarName = parseRegistrarFromText(html);
        const registrantInfo = parseRegistrantFromText(html);
        if (date || expirationDate || registrarName || registrantInfo.registrantName || registrantInfo.registrantOrganization) {
            let output = { events: [], source: "twnic-web" };
            if (date) output = withRegistrationEvent(output, date, "twnic-web");
            if (expirationDate) output = withExpirationEvent(output, expirationDate, "twnic-web");
            output = withRegistrarName(output, registrarName);
            return withRegistrantInfo(output, registrantInfo);
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
        const expirationDate = parseExpirationDateFromText(html);
        const registrarName = parseRegistrarFromText(html);
        const registrantInfo = parseRegistrantFromText(html);
        if (date || expirationDate || registrarName || registrantInfo.registrantName || registrantInfo.registrantOrganization) {
            let output = { events: [], source: "whois-web" };
            if (date) output = withRegistrationEvent(output, date, "whois-web");
            if (expirationDate) output = withExpirationEvent(output, expirationDate, "whois-web");
            output = withRegistrarName(output, registrarName);
            return withRegistrantInfo(output, registrantInfo);
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

  if (!domain) return jsonResponse({ error: "Missing domain" }, { status: 400 });

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
               if (hasRegistrationDate(data) && getRegistrarName(data)) return jsonResponse(data);
		           }
	       } catch(e) {}

	       const fallbackData = await fetchFallbackRegistrationData(rootDomain, tld);
	       if (fallbackData) return jsonResponse(fallbackData);

	       return jsonResponse({ error: "Domain not found", status: response.status }, { status: 404 });
	    }

	    const data = await response.json();
	    const directDate = getRegistrationDate(data);
	    if (directDate) {
	      let output = withRegistrationEvent(data, directDate, "rdap");
	      const directExpirationDate = getExpirationDate(output);
	      if (!directExpirationDate) {
	        const fallbackData = await fetchFallbackRegistrationData(rootDomain, tld);
	        if (fallbackData) output = mergeDomainData(output, fallbackData);
	      }
	      if (!getRegistrarName(output)) {
	        const registrarFallback = await fetchFallbackRegistrarData(rootDomain, tld);
	        const registrarName = getRegistrarName(registrarFallback);
	        if (registrarName) output = withRegistrarName(output, registrarName);
	      }
	      return jsonResponse(output);
	    }

	    const fallbackData = await fetchFallbackRegistrationData(rootDomain, tld);
	    if (fallbackData) {
	      return jsonResponse(mergeDomainData(data, fallbackData));
	    }

	    return jsonResponse(data);

	  } catch (err) {
	    return jsonResponse({ error: "Server Error", details: err.message }, { status: 500 });
	  }
}
