import { publicUrl, fetchPublicResource } from '../lib/public-fetch.js';

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
    if (!publicUrl(url.href)) return null;
    return url.toString();
  } catch (err) {
    return null;
  }
}

async function fetchHeaders(targetUrl, method) {
  return await fetchPublicResource(targetUrl, {
    method,
    maxBytes: 65536,
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
    let result = await fetchHeaders(targetUrl, 'HEAD');
    let res = result.response;
    if (!res.ok || res.status === 405 || res.status === 403) {
      result = await fetchHeaders(targetUrl, 'GET');
      res = result.response;
    }

    if (!res.ok) return jsonResponse({ status: 'unavailable', httpStatus: res.status, missingAll: false, missing: [], reason: 'http_error' });

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
      finalUrl: result.url,
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
