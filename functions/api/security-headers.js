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
    return url.toString();
  } catch (err) {
    return null;
  }
}

async function fetchHeaders(targetUrl, method) {
  return await fetch(targetUrl, {
    method,
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 antiscam-security-headers'
    }
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = normalizeTargetUrl(url.searchParams.get('url'));
  if (!targetUrl) {
    return jsonResponse({ status: 'invalid', missingAll: false, reason: 'invalid_url' }, { status: 400 });
  }

  try {
    let res = await fetchHeaders(targetUrl, 'HEAD');
    if (!res.ok || res.status === 405 || res.status === 403) {
      res = await fetchHeaders(targetUrl, 'GET');
    }

    const headers = {
      csp: !!res.headers.get('content-security-policy'),
      xFrameOptions: !!res.headers.get('x-frame-options'),
      xContentTypeOptions: !!res.headers.get('x-content-type-options')
    };
    const missing = [];
    if (!headers.csp) missing.push('Content-Security-Policy');
    if (!headers.xFrameOptions) missing.push('X-Frame-Options');
    if (!headers.xContentTypeOptions) missing.push('X-Content-Type-Options');

    return jsonResponse({
      status: 'ok',
      url: targetUrl,
      finalUrl: res.url || targetUrl,
      httpStatus: res.status,
      headers,
      missing,
      missingAll: missing.length === 3
    });
  } catch (err) {
    return jsonResponse({
      status: 'unavailable',
      missingAll: false,
      reason: 'fetch_failed'
    });
  }
}
