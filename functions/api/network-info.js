function normalizeHostname(input) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900',
      ...(init.headers || {})
    }
  });
}

async function resolveDoh(domain, type, resolver) {
  const url = `${resolver}?name=${encodeURIComponent(domain)}&type=${type}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/dns-json',
      'User-Agent': 'Mozilla/5.0 antiscam-network-info'
    }
  });
  if (!res.ok) throw new Error(`${resolver} ${type} status ${res.status}`);
  return await res.json();
}

async function resolveDns(domain) {
  const resolvers = [
    { name: 'cloudflare-doh', url: 'https://cloudflare-dns.com/dns-query' },
    { name: 'google-doh', url: 'https://dns.google/resolve' }
  ];
  const errors = [];

  for (const resolver of resolvers) {
    try {
      const [aData, aaaaData] = await Promise.all([
        resolveDoh(domain, 'A', resolver.url),
        resolveDoh(domain, 'AAAA', resolver.url)
      ]);

      const answers = [...(aData.Answer || []), ...(aaaaData.Answer || [])];
      const addresses = answers
        .filter(record => record.type === 1 || record.type === 28)
        .map(record => record.data)
        .filter(Boolean);

      if (addresses.length > 0) {
        return { status: 'ok', source: resolver.name, answers, addresses: [...new Set(addresses)] };
      }

      if (aData.Status === 3 && aaaaData.Status === 3) {
        return { status: 'nxdomain', source: resolver.name, answers: [], addresses: [] };
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  return { status: 'unavailable', source: null, answers: [], addresses: [], error: errors.join('; ') };
}

async function fetchGeo(ip) {
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          country: `${data.country} (${data.country_code})`,
          asn: data.connection?.asn ? `AS${data.connection.asn}` : '',
          org: data.connection?.org || data.connection?.isp || '',
          isReal: true,
          geoSource: 'ipwho.is'
        };
      }
    }
  } catch (err) { }

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (!data.error) {
        return {
          country: `${data.country_name || 'Unknown'} (${data.country || '??'})`,
          asn: data.asn || '',
          org: data.org || '',
          isReal: true,
          geoSource: 'ipapi.co'
        };
      }
    }
  } catch (err) { }

  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const domain = normalizeHostname(url.searchParams.get('domain'));
  if (!domain) return jsonResponse({ error: 'Missing domain' }, { status: 400 });

  const dns = await resolveDns(domain);
  if (dns.status === 'nxdomain') {
    return jsonResponse({ domain, status: 'nxdomain', isReal: false, dns });
  }

  const ip = dns.addresses?.[0] || null;
  const geo = ip ? await fetchGeo(ip) : null;

  return jsonResponse({
    domain,
    status: dns.status,
    ip,
    dns,
    country: geo?.country || null,
    asn: geo?.asn || '',
    org: geo?.org || '',
    isReal: !!geo?.isReal,
    source: geo?.geoSource || dns.source || null
  });
}
