import { extractAnalyticsIdentifiers } from './analytics-identifiers.js';

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  });
}

function normalizeTargetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch (err) {
    return null;
  }
}

function isVolatileUrlParam(name, value = '') {
  const lowerName = String(name || '').toLowerCase();
  const rawValue = String(value || '');
  const volatileNames = new Set([
    '_eat', 'eat', '_t', '_ts', 'ts', 'timestamp', 'time',
    'expires', 'expire', 'valid', 'nonce', 'cachebust',
    'cachebuster', 'cb', 'rnd', 'rand'
  ]);
  if (volatileNames.has(lowerName)) return true;
  if (/^(?:valid|verify|auth|session)[_-]?\d{8,14}[_-][a-f0-9]{12,}$/i.test(rawValue)) return true;
  if (/^(?:valid|expire|expires|ts|time|timestamp|nonce|rnd|rand|cb)$/i.test(lowerName) && /^[a-z0-9_-]{8,80}$/i.test(rawValue)) return true;
  if (/(?:time|timestamp|expire|expires|valid|nonce)/i.test(lowerName) && /^\d{10,14}$/.test(rawValue)) return true;
  if (lowerName.startsWith('_') && /^[a-z0-9_-]{16,120}$/i.test(rawValue) && (/\d/.test(rawValue) || /[a-f0-9]{16,}/i.test(rawValue))) return true;
  return false;
}

function sanitizeUrlForCrawler(target) {
  const parsed = new URL(target.href);
  const removedVolatileParams = [];
  [...new Set([...parsed.searchParams.keys()])].forEach(name => {
    if (parsed.searchParams.getAll(name).some(value => isVolatileUrlParam(name, value))) {
      removedVolatileParams.push(name);
      parsed.searchParams.delete(name);
    }
  });
  return {
    href: parsed.href,
    removedVolatileParams: [...new Set(removedVolatileParams)]
  };
}

function toHttpFallbackUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return '';
    parsed.protocol = 'http:';
    return parsed.href;
  } catch (err) {
    return '';
  }
}

function buildCrawlerCandidateUrls(urls) {
  const candidates = [];
  const add = value => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  urls.filter(Boolean).forEach(value => {
    add(value);
    add(toHttpFallbackUrl(value));
  });

  return candidates;
}

function looksCrawlerBlocked(text, statusCode = 0) {
  const haystack = String(text || '').toLowerCase();
  if ([403, 429].includes(Number(statusCode))) return true;
  return /(access denied|request blocked|forbidden|verify you are human|checking your browser|cf-chl|cloudflare|akamai|incapsula|imperva|datadome|bot detection|anti[- ]?bot)/i.test(haystack);
}

const HEADER_PROFILES = [
  {
    name: 'desktop-chrome',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"'
    }
  },
  {
    name: 'mobile-safari',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"iOS"'
    }
  }
];

async function fetchWithBrowserHeaders(targetUrl, timeoutMs = 7000, profile = HEADER_PROFILES[0]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const origin = new URL(targetUrl).origin;
    const res = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Referer': origin + '/',
        ...profile.headers
      }
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: {
        http_code: res.status,
        url: res.url || targetUrl
      },
      contents: text.slice(0, 1000000),
      contentType: res.headers.get('content-type') || '',
      blocked: looksCrawlerBlocked(text, res.status),
      fetchUrl: targetUrl,
      source: `direct-browser-ua:${profile.name}`
    };
  } catch (err) {
    return {
      ok: false,
      status: { http_code: 0, url: targetUrl },
      contents: '',
      reason: err.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      fetchUrl: targetUrl,
      source: `direct-browser-ua:${profile.name}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = normalizeTargetUrl(url.searchParams.get('url'));
  if (!target) {
    return jsonResponse({ status: 'invalid', reason: 'invalid_url' }, { status: 400 });
  }

  const sanitized = sanitizeUrlForCrawler(target);
  const rawUrl = normalizeTargetUrl(url.searchParams.get('rawUrl'))?.href || target.href;
  const candidates = buildCrawlerCandidateUrls([sanitized.href, target.href, rawUrl]);
  const attempts = [];
  let best = null;

  for (const candidate of candidates) {
    for (const profile of HEADER_PROFILES) {
      const result = await fetchWithBrowserHeaders(candidate, 7000, profile);
      attempts.push({
        url: candidate,
        profile: profile.name,
        status: result.status?.http_code || 0,
        ok: result.ok,
        blocked: !!result.blocked,
        reason: result.reason || ''
      });
      if (result.ok && result.contents && !result.blocked) {
        return jsonResponse({
          ...result,
          analyticsIdentifiers: extractAnalyticsIdentifiers(result.contents),
          rawUrl,
          sanitizedUrl: sanitized.href,
          removedVolatileParams: sanitized.removedVolatileParams,
          fetchAttempts: attempts
        });
      }
      if (!best || (result.contents && !best.contents) || (best.blocked && !result.blocked)) best = result;
    }
  }

  return jsonResponse({
    ...(best || { ok: false, status: { http_code: 0, url: target.href }, contents: '', reason: 'fetch_failed', source: 'direct-browser-ua' }),
    analyticsIdentifiers: extractAnalyticsIdentifiers(best?.contents || ''),
    rawUrl,
    sanitizedUrl: sanitized.href,
    removedVolatileParams: sanitized.removedVolatileParams,
    fetchAttempts: attempts
  });
}
