export function publicUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        (url.port && !['80', '443'].includes(url.port)) || host.includes(':') ||
        !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|test|invalid)$/.test(host) ||
        host.endsWith('.home.arpa')) return null;
    if (/^[\d.]+$/.test(host) && !publicIpv4(host)) return null;
    return url;
  } catch { return null; }
}

function publicIpv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b, c] = parts.map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

function publicAddress(address) {
  if (!address.includes(':')) return publicIpv4(address);
  // Fail closed for mapped, transition, local and special-purpose IPv6 ranges.
  return /^[23][0-9a-f]{3}:/i.test(address) && !/^2002:/i.test(address) &&
    !/^2001:(?:0{1,4}|0*2|0*10|0*20|db8):/i.test(address);
}

export async function readBoundedText(response, maxBytes = 1000000) {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw new Error('body_too_large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('body_too_large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function verifyDns(host, signal) {
  if (/^[\d.]+$/.test(host)) return;
  let found = false;
  for (const type of ['A', 'AAAA']) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' }, redirect: 'error', signal
    });
    if (!response.ok) throw new Error('dns_unavailable');
    const data = JSON.parse(await readBoundedText(response, 65536));
    if (data.Status !== 0) throw new Error('dns_unavailable');
    for (const record of data.Answer || []) {
      if (record.type !== 1 && record.type !== 28) continue;
      if (!publicAddress(String(record.data))) throw new Error('blocked_private_target');
      found = true;
    }
  }
  if (!found) throw new Error('dns_unavailable');
}

export async function fetchPublicResource(value, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, Math.min(options.timeoutMs || 7000, 10000));
  const seen = new Set();
  let current = String(value);
  try {
    for (let hop = 0; hop <= (options.maxRedirects ?? 5); hop++) {
      const url = publicUrl(current);
      if (!url) throw new Error('blocked_target');
      if (seen.has(url.href)) throw new Error('redirect_loop');
      seen.add(url.href);
      await verifyDns(url.hostname, controller.signal);
      const response = await fetch(url.href, {
        method: options.method || 'GET', headers: options.headers,
        redirect: 'manual', signal: controller.signal
      });
      if (response.status >= 300 && response.status < 400 && options.followRedirects !== false) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('missing_location');
        current = new URL(location, url).href;
        continue;
      }
      const text = options.method === 'HEAD' || (response.status >= 300 && response.status < 400)
        ? '' : await readBoundedText(response, options.maxBytes || 1000000);
      if (!text) await response.body?.cancel().catch(() => {});
      return { response, text, url: url.href };
    }
    throw new Error('redirect_limit');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
