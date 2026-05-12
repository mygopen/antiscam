const SECOND_LEVEL_TLDS = [
  'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw',
  'co.uk', 'org.uk', 'gov.uk',
  'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.hk', 'org.hk',
  'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn'
];

function normalizeHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '');
}

function getRegistrableDomain(hostname) {
  const parts = normalizeHostname(hostname).split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');

  const lastTwo = parts.slice(-2).join('.');
  const registeredSize = SECOND_LEVEL_TLDS.includes(lastTwo) ? 3 : 2;
  return parts.slice(-registeredSize).join('.');
}

async function fetchTrancoDomain(domain) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`, {
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      return { status: 'unavailable', rank: null, reason: `tranco_http_${res.status}` };
    }
    if (!res.ok) return { status: 'unavailable', rank: null, reason: `http_${res.status}` };

    const data = await res.json();
    const ranks = Array.isArray(data?.ranks) ? data.ranks : [];
    const latestRank = ranks
      .filter(item => Number.isFinite(Number(item.rank)))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];

    if (!latestRank) return { status: 'unranked', rank: null, reason: 'not_in_recent_tranco_lists' };
    return {
      status: 'ranked',
      rank: Number(latestRank.rank),
      date: latestRank.date || null,
      reason: null
    };
  } catch (e) {
    return { status: 'unavailable', rank: null, reason: e.name === 'AbortError' ? 'timeout' : 'fetch_failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function jsonResponse(payload, cacheSeconds, status = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (cacheSeconds > 0) headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  return new Response(JSON.stringify(payload), { status, headers });
}

function maybeStoreCache(context, cache, cacheKey, response) {
  if (!cache || !cacheKey || !response.ok) return;
  const putPromise = cache.put(cacheKey, response.clone()).catch(() => {});
  if (typeof context.waitUntil === 'function') context.waitUntil(putPromise);
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const inputDomain = normalizeHostname(url.searchParams.get('domain'));

  if (!inputDomain || !inputDomain.includes('.')) {
    return jsonResponse({ status: 'unavailable', rank: null, reason: 'invalid_domain' }, 0, 400);
  }

  const registrableDomain = getRegistrableDomain(inputDomain);
  const cache = request.method === 'GET' ? globalThis.caches?.default : null;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.search = `?domain=${encodeURIComponent(registrableDomain)}`;
  const cacheKey = cache ? new Request(cacheKeyUrl.toString(), { method: 'GET' }) : null;
  const cachedResponse = cache && cacheKey ? await cache.match(cacheKey).catch(() => null) : null;
  if (cachedResponse) return cachedResponse;

  // Tranco API is rate-limited to 1 query/second. Query the registrable domain once
  // instead of probing subdomains and immediately falling back to the root domain.
  const candidates = [registrableDomain];
  const attempts = [];

  for (const domain of candidates) {
    const result = await fetchTrancoDomain(domain);
    attempts.push({ domain, status: result.status, rank: result.rank, reason: result.reason || null });
    if (result.status === 'ranked') {
      const response = jsonResponse({
        status: 'ranked',
        rank: result.rank,
        date: result.date || null,
        queriedDomain: domain,
        source: 'tranco-api',
        attempts
      }, 86400);
      maybeStoreCache(context, cache, cacheKey, response);
      return response;
    }
  }

  const hasUnavailable = attempts.some(item => item.status === 'unavailable');
  const response = jsonResponse({
    status: hasUnavailable ? 'unavailable' : 'unranked',
    rank: null,
    queriedDomain: registrableDomain,
    source: 'tranco-api',
    attempts
  }, hasUnavailable ? 900 : 21600);
  maybeStoreCache(context, cache, cacheKey, response);
  return response;
}
