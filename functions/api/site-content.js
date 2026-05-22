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

async function fetchWithBrowserHeaders(targetUrl, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"'
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
      source: 'direct-browser-ua'
    };
  } catch (err) {
    return {
      ok: false,
      status: { http_code: 0, url: targetUrl },
      contents: '',
      reason: err.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      source: 'direct-browser-ua'
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

  const result = await fetchWithBrowserHeaders(target.href);
  return jsonResponse(result);
}
