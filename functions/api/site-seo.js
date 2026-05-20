function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
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

async function fetchText(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 antiscam-site-seo'
      }
    });
    const text = res.ok ? await res.text() : '';
    return { ok: res.ok, status: res.status, url: res.url || url, text: text.slice(0, 600000) };
  } catch (err) {
    return { ok: false, status: 0, url, text: '', reason: 'fetch_failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function parseRobots(text) {
  const lines = String(text || '').split(/\r?\n/);
  const sitemapUrls = [];
  for (const line of lines) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match) sitemapUrls.push(match[1].trim());
  }
  return {
    hasRules: /^\s*(user-agent|allow|disallow|sitemap)\s*:/im.test(text || ''),
    sitemapUrls: [...new Set(sitemapUrls)].filter(item => /^https?:\/\//i.test(item)).slice(0, 4)
  };
}

function parseSitemap(text) {
  const source = String(text || '');
  return {
    isXmlSitemap: /<(urlset|sitemapindex)\b/i.test(source) || /<loc>\s*https?:\/\//i.test(source),
    locCount: (source.match(/<loc>/gi) || []).length
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = normalizeTargetUrl(url.searchParams.get('url'));
  if (!target) {
    return jsonResponse({ status: 'invalid', reason: 'invalid_url' }, { status: 400 });
  }

  const origin = target.origin;
  const robotsUrl = new URL('/robots.txt', origin).href;
  const robotsRes = await fetchText(robotsUrl);
  const robotsParsed = parseRobots(robotsRes.text);

  const sitemapCandidates = [
    ...robotsParsed.sitemapUrls,
    new URL('/sitemap.xml', origin).href,
    new URL('/sitemap_index.xml', origin).href
  ];
  const uniqueCandidates = [...new Set(sitemapCandidates)].slice(0, 5);

  let sitemapResult = { exists: false, url: null, locCount: 0, status: 0 };
  for (const candidate of uniqueCandidates) {
    const res = await fetchText(candidate);
    const parsed = parseSitemap(res.text);
    if (res.ok && parsed.isXmlSitemap) {
      sitemapResult = {
        exists: true,
        url: res.url || candidate,
        locCount: parsed.locCount,
        status: res.status
      };
      break;
    }
  }

  const score =
    (robotsRes.ok && robotsParsed.hasRules ? 20 : 0) +
    (sitemapResult.exists ? 30 : 0) +
    (robotsParsed.sitemapUrls.length > 0 ? 10 : 0);

  return jsonResponse({
    status: 'ok',
    url: target.href,
    origin,
    robots: {
      exists: robotsRes.ok,
      url: robotsRes.url || robotsUrl,
      status: robotsRes.status,
      hasRules: robotsParsed.hasRules,
      sitemapUrls: robotsParsed.sitemapUrls
    },
    sitemap: sitemapResult,
    score,
    matched: score >= 40
  });
}
