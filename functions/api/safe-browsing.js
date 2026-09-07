import { publicUrl, readBoundedText } from '../lib/public-fetch.js';

const reply = data => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });

export async function onRequest({ request, env }) {
  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!publicUrl(targetUrl)) return Response.json({ status: 'invalid', isUnsafe: null }, { status: 400 });
  if (!env.GOOGLE_SAFE_BROWSING_API_KEY) return reply({ status: 'disabled', isUnsafe: null });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${env.GOOGLE_SAFE_BROWSING_API_KEY}`, {
      method: 'POST', signal: controller.signal, redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'mygopen-antiscam', clientVersion: '1.1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: [{ url: targetUrl }]
        }
      })
    });
    if (!response.ok) return reply({ status: 'unavailable', isUnsafe: null });
    const data = JSON.parse(await readBoundedText(response, 65536));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error ||
        (data.matches !== undefined && !Array.isArray(data.matches))) throw new Error('invalid_response');
    const matched = !!data.matches?.length;
    return reply({ status: matched ? 'matched' : 'clear', isUnsafe: matched,
      threatType: matched ? data.matches[0].threatType || 'UNKNOWN' : null,
      checkedAt: new Date().toISOString() });
  } catch {
    return reply({ status: controller.signal.aborted ? 'timeout' : 'unavailable', isUnsafe: null });
  } finally { clearTimeout(timer); }
}
