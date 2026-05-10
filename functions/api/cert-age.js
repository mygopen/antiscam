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
  if (!Array.isArray(rows)) return { notBefore: null, source: 'crt.sh' };

  const timestamps = rows
    .map(row => row.not_before || row.notBefore)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return {
    notBefore: timestamps[0] ? timestamps[0].toISOString() : null,
    source: 'crt.sh'
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const domain = normalizeHostname(url.searchParams.get('domain'));
  if (!domain) {
    return new Response(JSON.stringify({ error: 'Missing domain' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const rootDomain = getRegisteredDomain(domain);
  const crtUrl = `https://crt.sh/?q=${encodeURIComponent(rootDomain)}&output=json`;

  try {
    const res = await fetch(crtUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 antiscam-cert-age-check' }
    });
    if (!res.ok) throw new Error(`crt.sh status ${res.status}`);

    const text = await res.text();
    const rows = JSON.parse(text.replace(/\n(?=\{)/g, ','));
    const parsed = parseCertRows(rows);

    return new Response(JSON.stringify({
      domain,
      rootDomain,
      ...parsed
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      domain,
      rootDomain,
      notBefore: null,
      source: 'crt.sh',
      error: err.message
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
