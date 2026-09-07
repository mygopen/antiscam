export async function admitBrandRequest(env, request) {
  if (!env.AI_BUDGET) return false;
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${minute}:${ip}`));
  const key = `brand:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
  try {
    const row = await env.AI_BUDGET.prepare(`INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < 5 RETURNING count`)
      .bind(key, now + 120000).first();
    await env.AI_BUDGET.prepare('DELETE FROM request_limits WHERE expires_at < ?').bind(now).run();
    return !!row;
  } catch { return false; }
}
