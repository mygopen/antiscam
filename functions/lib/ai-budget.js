import { freeAiConfirmed } from './ai-policy.js';

export const RESERVE_SQL = `INSERT INTO ai_requests
  (id, provider, model, day, started_at, lease_until, reserved, status)
  SELECT ?, ?, ?, ?, ?, ?, ?, 'running'
  WHERE COALESCE((SELECT SUM(reserved) FROM ai_requests WHERE provider = ? AND day = ?), 0) + ? <= ?
    AND (SELECT COUNT(*) FROM ai_requests WHERE provider = ? AND day = ?) < ?
    AND (SELECT COUNT(*) FROM ai_requests WHERE provider = ? AND lease_until > ?) < ?
    AND (SELECT COUNT(*) FROM ai_requests WHERE provider = ? AND started_at > ?) < ?
    AND NOT EXISTS (SELECT 1 FROM ai_circuits WHERE provider = ? AND retry_at > ?)
  RETURNING id`;

export function quotaDay(provider, now = Date.now()) {
  if (provider === 'gemini') return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(now));
  return new Date(now).toISOString().slice(0, 10);
}

function limit(value, fallback, maximum) {
  const n = value === undefined ? fallback : Number(value);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, maximum) : 0;
}

export function classifyAiError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (Number(error?.status) === 429 || /quota|rate.?limit|neurons|resource.exhausted|3040/i.test(String(error?.message))) return 'quota';
  if (Number(error?.status) === 401 || Number(error?.status) === 403) return 'configuration';
  return 'upstream';
}

// Reservations are atomic across isolates. Failed/timeout requests keep their budget.
export async function runBudgetedAi(env, { provider, model, reserve, run, timeoutMs = 20000 }) {
  if (provider !== 'cloudflare' || !Number.isSafeInteger(reserve) || reserve <= 0) return { ok: false, reason: 'invalid_budget' };
  if (!freeAiConfirmed(env)) return { ok: false, reason: 'free_plan_unconfirmed' };
  if (!env.AI_BUDGET) return { ok: false, reason: 'budget_unavailable' };
  const now = Date.now();
  const id = crypto.randomUUID();
  const day = quotaDay(provider, now);
  const daily = limit(env.AI_DAILY_NEURONS, 8000, 8000);
  if (!daily) return { ok: false, reason: 'configuration' };
  const rpm = 10;
  const slots = 2;
  let admitted;
  try {
    admitted = await env.AI_BUDGET.prepare(RESERVE_SQL).bind(
      id, provider, model, day, now, now + 300000, reserve,
      provider, day, reserve, daily, provider, day, 500,
      provider, now, slots, provider, now - 60000, rpm, provider, now
    ).first();
  } catch {
    return { ok: false, reason: 'budget_unavailable' };
  }
  if (!admitted) {
    // Diagnostic read only: never retry admission after the atomic denial.
    try {
      const usage = await env.AI_BUDGET.prepare(`SELECT COALESCE(SUM(reserved), 0) AS reserved,
        COUNT(*) AS requests, COALESCE(MAX(CASE WHEN status = 'quota' THEN 1 ELSE 0 END), 0) AS quota
        FROM ai_requests WHERE provider = ? AND day = ?`).bind(provider, day).first();
      if (!usage) return { ok: false, reason: 'budget_unavailable' };
      const reason = usage.quota ? 'quota' : usage.reserved + reserve > daily || usage.requests >= 500
        ? 'daily_budget_exhausted' : 'busy';
      return { ok: false, reason };
    } catch { return { ok: false, reason: 'budget_unavailable' }; }
  }

  const controller = new AbortController();
  let timer;
  let data;
  let reason = 'ok';
  try {
    data = await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort();
        reject(new DOMException('AI deadline exceeded', 'TimeoutError'));
      }, timeoutMs); })
    ]);
  } catch (error) {
    reason = classifyAiError(error);
  } finally {
    clearTimeout(timer);
  }

  const usage = data?.usage || data?.usageMetadata;
  const input = Number(usage?.prompt_tokens ?? usage?.promptTokenCount);
  const output = Number(usage?.completion_tokens ?? usage?.candidatesTokenCount);
  const tokensKnown = Number.isInteger(input) && input >= 0 && Number.isInteger(output) && output >= 0;
  // Usage is audit-only: do not refund reservations from incomplete model accounting.
  try {
    const statements = [env.AI_BUDGET.prepare(`UPDATE ai_requests SET status = ?, latency_ms = ?,
      input_tokens = ?, output_tokens = ?, lease_until = ? WHERE id = ?`).bind(
      reason, Date.now() - now, tokensKnown ? input : null, tokensKnown ? output : null,
      reason === 'timeout' ? now + 300000 : 0, id
    )];
    if (reason !== 'ok') statements.push(env.AI_BUDGET.prepare(`INSERT INTO ai_circuits (provider, retry_at)
      VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET retry_at = MAX(retry_at, excluded.retry_at)`)
      .bind(provider, reason === 'quota'
        ? Date.parse(`${day}T00:00:00Z`) + 86400000
        : Date.now() + 60000));
    statements.push(env.AI_BUDGET.prepare('DELETE FROM ai_requests WHERE started_at < ?').bind(now - 30 * 86400000));
    await env.AI_BUDGET.batch(statements);
  } catch {
    // An unfinished lease and its reservation remain conservative if logging fails.
    console.warn(JSON.stringify({ event: 'ai_audit_unavailable', requestId: id, provider }));
  }
  console.log(JSON.stringify({ event: 'ai_attempt', requestId: id, provider, model, reason, latencyMs: Date.now() - now }));
  return { ok: reason === 'ok', data, reason, requestId: id, provider, model };
}
