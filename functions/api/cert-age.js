function normalizeHostname(input) {
  return String(input || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
}

function getRegisteredDomain(hostname) {
  const parts = normalizeHostname(hostname).split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');

  const secondLevelTLDs = [
    'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw',
    'co.uk', 'org.uk', 'gov.uk',
    'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
    'com.hk', 'org.hk',
    'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn'
  ];

  const lastTwo = parts.slice(-2).join('.');
  return secondLevelTLDs.includes(lastTwo) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

function parseCertRows(rows) {
  if (!Array.isArray(rows)) return { notBefore: null, source: null };

  const toDate = (value) => {
    if (!value) return null;
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const certs = rows
    .map(row => {
      const notBefore = toDate(row.not_before || row.notBefore || row.cert?.not_before || row.tbs_certificate?.validity?.not_before);
      const notAfter = toDate(row.not_after || row.notAfter || row.cert?.not_after || row.tbs_certificate?.validity?.not_after);
      const dnsNames = row.dns_names || row.altNames || (row.name_value ? String(row.name_value).split(/\s+/) : []);
      return {
        notBefore,
        notAfter,
        issuerName: row.issuer_name || row.issuerName || row.issuer?.name || row.issuerSubject || row.cert?.issuer?.name || null,
        commonName: row.common_name || row.commonName || row.commonNames?.[0] || row.cert?.subject?.common_name || null,
        dnsNames: Array.isArray(dnsNames) ? dnsNames.filter(Boolean).slice(0, 8) : []
      };
    })
    .filter(cert => cert.notBefore)
    .sort((a, b) => b.notBefore.getTime() - a.notBefore.getTime());

  const latest = certs[0];

  return {
    notBefore: latest ? latest.notBefore.toISOString() : null,
    notAfter: latest?.notAfter ? latest.notAfter.toISOString() : null,
    issuerName: latest?.issuerName || null,
    commonName: latest?.commonName || null,
    dnsNames: latest?.dnsNames || [],
    source: null
  };
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=21600',
      ...(init.headers || {})
    }
  });
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 antiscam-cert-age-check' }
    });
    if (!res.ok) throw new Error(`${url} status ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return JSON.parse(`[${trimmed.replace(/\n(?=\{)/g, ',')}]`);
  }
}

async function fetchCrtSh(domain, rootDomain) {
  const queries = [
    domain,
    rootDomain,
    `%.${rootDomain}`
  ].filter((item, index, list) => item && list.indexOf(item) === index);

  const errors = [];
  for (const query of queries) {
    try {
      const text = await fetchText(`https://crt.sh/?q=${encodeURIComponent(query)}&output=json`);
      const parsed = parseCertRows(parseJsonText(text));
      if (parsed.notBefore) return { ...parsed, source: 'crt.sh', query };
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { notBefore: null, source: 'crt.sh', error: errors.join('; ') };
}

async function fetchCertSpotter(rootDomain) {
  try {
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(rootDomain)}&include_subdomains=true&expand=dns_names`;
    const text = await fetchText(url);
    const parsed = parseCertRows(parseJsonText(text));
    return parsed.notBefore ? { ...parsed, source: 'certspotter' } : { notBefore: null, source: 'certspotter' };
  } catch (err) {
    return { notBefore: null, source: 'certspotter', error: err.message };
  }
}

async function fetchSslLabs(domain) {
  try {
    const url = `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(domain)}&publish=off&startNew=off&fromCache=on&all=done`;
    const text = await fetchText(url);
    const data = parseJsonText(text);
    const rows = (data.endpoints || [])
      .map(endpoint => endpoint.details?.cert || endpoint.cert)
      .filter(Boolean)
      .map(cert => ({
        notBefore: cert.notBefore,
        notAfter: cert.notAfter,
        issuerSubject: cert.issuerSubject,
        commonNames: cert.commonNames,
        altNames: cert.altNames
      }));
    const parsed = parseCertRows(rows);
    return parsed.notBefore ? { ...parsed, source: 'ssllabs-cache' } : { notBefore: null, source: 'ssllabs-cache' };
  } catch (err) {
    return { notBefore: null, source: 'ssllabs-cache', error: err.message };
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const domain = normalizeHostname(url.searchParams.get('domain'));
  if (!domain) {
    return jsonResponse({ error: 'Missing domain' }, { status: 400 });
  }

  const rootDomain = getRegisteredDomain(domain);
  const errors = [];

  const crtResult = await fetchCrtSh(domain, rootDomain);
  if (crtResult.notBefore) {
    return jsonResponse({ domain, rootDomain, ...crtResult });
  }
  if (crtResult.error) errors.push(crtResult.error);

  const certSpotterResult = await fetchCertSpotter(rootDomain);
  if (certSpotterResult.notBefore) {
    return jsonResponse({ domain, rootDomain, ...certSpotterResult });
  }
  if (certSpotterResult.error) errors.push(certSpotterResult.error);

  const sslLabsResult = await fetchSslLabs(domain);
  if (sslLabsResult.notBefore) {
    return jsonResponse({ domain, rootDomain, ...sslLabsResult });
  }
  if (sslLabsResult.error) errors.push(sslLabsResult.error);

  return jsonResponse({
    domain,
    rootDomain,
    notBefore: null,
    source: 'ct-fallbacks',
    error: errors.join('; ') || 'No certificate transparency records found'
  });
}
