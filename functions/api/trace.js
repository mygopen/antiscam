const MAX_REDIRECTS = 6;
const PROFILE_TIMEOUT = 9000;

const USER_AGENT_PROFILES = [
  {
    key: 'mobile',
    label: 'Mobile Safari',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  },
  {
    key: 'desktop',
    label: 'Desktop Chrome',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  }
];

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  });
}

function normalizeTargetUrl(value) {
  const raw = String(value || '').normalize('NFKC').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch (err) {
    return null;
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch (err) {
    return '';
  }
}

function getComparableRoot(hostname) {
  const secondLevelTlds = [
    'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw',
    'co.uk', 'org.uk', 'gov.uk',
    'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
    'com.hk', 'org.hk',
    'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn'
  ];
  const parts = String(hostname || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  const registeredSize = secondLevelTlds.includes(lastTwo) ? 3 : 2;
  return parts.slice(-registeredSize).join('.');
}

function isSameSiteUrl(a, b) {
  const hostA = getHostname(a);
  const hostB = getHostname(b);
  if (!hostA || !hostB) return false;
  return hostA === hostB || getComparableRoot(hostA) === getComparableRoot(hostB);
}

function resolveNextUrl(rawValue, currentUrl) {
  const raw = String(rawValue || '').replace(/&amp;/g, '&').trim();
  if (!raw) return { ok: false, reason: 'empty_redirect', raw };

  try {
    const nextUrl = new URL(raw, currentUrl);
    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      return { ok: false, reason: 'non_http_redirect', raw, href: nextUrl.href };
    }
    return { ok: true, href: nextUrl.href };
  } catch (err) {
    return { ok: false, reason: 'invalid_redirect_url', raw };
  }
}

function extractClientRedirect(html) {
  const text = String(html || '');
  const metaMatch = text.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i) ||
    text.match(/content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?[^>]+http-equiv=["']?refresh/i);
  if (metaMatch) return metaMatch[1];

  const jsAssignMatch = text.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
  if (jsAssignMatch) return jsAssignMatch[1];

  const jsCallMatch = text.match(/(?:window\.)?location\.(?:replace|assign)\(\s*["']([^"']+)["']/i);
  if (jsCallMatch) return jsCallMatch[1];

  return null;
}

async function traceWithProfile(targetUrl, profile) {
  let currentUrl = targetUrl;
  const redirectChain = [];
  let redirectCount = 0;
  let isHighRisk = false;
  let riskReason = '';
  let status = 'ok';
  const seenUrls = new Set([currentUrl]);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROFILE_TIMEOUT);

  try {
    while (redirectCount < MAX_REDIRECTS) {
      let response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: profile.headers
        });
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          status = 'timeout';
          riskReason = '檢測超時 (Timeout)，網站可能依裝置或網路環境阻擋自動掃描。';
        } else {
          status = 'unavailable';
          riskReason = `轉址追蹤連線失敗：${fetchError.message || 'unknown_error'}`;
        }
        break;
      }

      redirectChain.push({
        url: currentUrl,
        status: response.status,
        profile: profile.key
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location');
        if (!location) break;

        const resolved = resolveNextUrl(location, currentUrl);
        if (!resolved.ok) {
          status = resolved.reason;
          isHighRisk = resolved.reason === 'non_http_redirect';
          riskReason = resolved.reason === 'non_http_redirect'
            ? `偵測到非 HTTP 轉址 (${resolved.href || resolved.raw})，常見於誘導開啟 App、外部錢包或規避掃描。`
            : `偵測到無法解析的轉址目標 (${resolved.raw})`;
          redirectChain.push({
            url: resolved.href || resolved.raw || location,
            status: 'invalid-redirect',
            profile: profile.key
          });
          break;
        }

        if (seenUrls.has(resolved.href)) {
          isHighRisk = true;
          riskReason = '偵測到惡意迴圈 (Loop)，網站試圖導向重複路徑，企圖癱瘓檢測。';
          break;
        }
        seenUrls.add(resolved.href);
        currentUrl = resolved.href;
        redirectCount++;
        continue;
      }

      if (response.status === 200) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          let text = '';
          try {
            text = await response.text();
          } catch (err) {
            status = 'body_unavailable';
            riskReason = '已取得網頁回應，但無法讀取內容。';
            break;
          }

          const nextUrlStr = extractClientRedirect(text);
          if (nextUrlStr) {
            const resolved = resolveNextUrl(nextUrlStr, currentUrl);
            if (!resolved.ok) {
              status = resolved.reason;
              isHighRisk = resolved.reason === 'non_http_redirect';
              riskReason = resolved.reason === 'non_http_redirect'
                ? `偵測到前端非 HTTP 轉址 (${resolved.href || resolved.raw})，常見於誘導開啟 App 或規避掃描。`
                : `偵測到前端轉址但無法解析 (${resolved.raw})`;
              redirectChain.push({
                url: resolved.href || resolved.raw || nextUrlStr,
                status: 'invalid-client-redirect',
                profile: profile.key
              });
              break;
            }

            if (seenUrls.has(resolved.href)) {
              isHighRisk = true;
              riskReason = '偵測到前端惡意迴圈 (JS Loop)。';
              break;
            }
            seenUrls.add(resolved.href);
            currentUrl = resolved.href;
            redirectCount++;
            continue;
          }
        }
        break;
      }

      break;
    }

    if (!isHighRisk) {
      if (redirectCount >= MAX_REDIRECTS) {
        isHighRisk = true;
        riskReason = `轉址路徑過深 (超過 ${MAX_REDIRECTS} 層)，強制中止。正常網站極少轉址這麼多次。`;
      } else if (redirectCount >= 5) {
        isHighRisk = true;
        riskReason = `偵測到多重轉址 (${redirectCount} 次)，常見於詐騙連結規避掃描。`;
      } else {
        const riskyShorteners = ['i.gal', 'bit.do', 'is.gd', 'tiny.cc', 't.cn'];
        const hasRiskyShortener = redirectChain.some(hop => riskyShorteners.some(risk => String(hop.url || '').includes(risk)));
        if (hasRiskyShortener && redirectCount >= 1) {
          isHighRisk = true;
          riskReason = '使用了常被詐騙集團濫用的短網址服務。';
        }
      }
    }

    return {
      profile: profile.key,
      profileLabel: profile.label,
      finalUrl: currentUrl,
      redirectCount,
      chain: redirectChain,
      isHighRisk,
      riskReason,
      status
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function onRequest(context) {
  const { request } = context;
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = normalizeTargetUrl(urlParams.get('url'));

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing or invalid url parameter', isHighRisk: false, chain: [] }, { status: 400 });
  }

  try {
    const [mobileTrace, desktopTrace] = await Promise.all(
      USER_AGENT_PROFILES.map(profile => traceWithProfile(targetUrl, profile))
    );
    const primaryTrace = mobileTrace || desktopTrace;
    const uaDifference = !!(mobileTrace?.finalUrl && desktopTrace?.finalUrl) &&
      !isSameSiteUrl(mobileTrace.finalUrl, desktopTrace.finalUrl);
    const mobileOnlyRisk = uaDifference && !isSameSiteUrl(targetUrl, mobileTrace.finalUrl);
    const isHighRisk = !!(primaryTrace?.isHighRisk || desktopTrace?.isHighRisk || mobileOnlyRisk);
    const riskReason = primaryTrace?.riskReason ||
      desktopTrace?.riskReason ||
      (mobileOnlyRisk ? `偵測到 Mobile/Desktop 導向不同主網域：Mobile=${getHostname(mobileTrace.finalUrl)}，Desktop=${getHostname(desktopTrace.finalUrl)}` : '');

    return jsonResponse({
      finalUrl: primaryTrace?.finalUrl || targetUrl,
      redirectCount: primaryTrace?.redirectCount || 0,
      chain: primaryTrace?.chain || [],
      isHighRisk,
      riskReason,
      uaDifference,
      mobileFinalUrl: mobileTrace?.finalUrl || null,
      desktopFinalUrl: desktopTrace?.finalUrl || null,
      variants: {
        mobile: mobileTrace,
        desktop: desktopTrace
      }
    });
  } catch (err) {
    return jsonResponse({
      error: 'Trace unavailable',
      details: err.message,
      finalUrl: targetUrl,
      redirectCount: 0,
      chain: [],
      isHighRisk: false,
      riskReason: '轉址追蹤暫時無法完成，已改由其他檢測指標判斷。'
    });
  }
}
