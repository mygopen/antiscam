const assert = require('node:assert/strict');
const test = require('node:test');
const createD1 = require('./helpers/ai-d1.cjs');
const load = () => import('../functions/lib/ai-budget.js');

test('all AI calls require one shared free-plan gate; explicit new flag overrides legacy', async () => {
    const { runBudgetedAi } = await load();
    const { freeAiConfirmed } = await import('../functions/lib/ai-policy.js');
    for (const AI_FREE_ONLY_CONFIRMED of [undefined, null, false, true, 'false', '']) {
        const env = { AI_FREE_ONLY_CONFIRMED, AI_BUDGET: { prepare() { assert.fail(); } } };
        for (const model of ['chat', 'vision', 'brand']) {
            assert.equal((await runBudgetedAi(env, { provider: 'cloudflare', model, reserve: 650,
                run() { assert.fail(); } })).reason, 'free_plan_unconfirmed');
        }
    }
    assert.equal(freeAiConfirmed({ CHAT_AI_FREE_ONLY_CONFIRMED: 'true' }), true);
    assert.equal(freeAiConfirmed({ CHAT_AI_FREE_ONLY_CONFIRMED: 'true', AI_FREE_ONLY_CONFIRMED: 'false' }), false);
    assert.equal(freeAiConfirmed({ AI_FREE_ONLY_CONFIRMED: 'true' }), true);
});

test('diagnostic read failure never retries a denied model call', async () => {
    const { runBudgetedAi } = await load();
    let reads = 0;
    const result = await runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: {
        prepare() { return { bind() { return this; }, async first() { if (++reads === 1) return null; throw new Error('offline'); } }; }
    } }, { provider: 'cloudflare', model: 'vision', reserve: 650, run() { assert.fail(); } });
    assert.equal(result.reason, 'budget_unavailable');
    assert.equal(reads, 2);
});

test('missing or broken budget storage fails closed without a model call', async () => {
    const { runBudgetedAi } = await load();
    for (const env of [{}, { AI_BUDGET: { prepare() { throw new Error('offline'); } } }]) {
        const result = await runBudgetedAi({ ...env, AI_FREE_ONLY_CONFIRMED: 'true' }, { provider: 'cloudflare', reserve: 650, model: 'vision', run() { assert.fail(); } });
        assert.equal(result.reason, 'budget_unavailable');
    }
});

test('vision and chat atomically share the same daily ceiling', async () => {
    const { runBudgetedAi } = await load();
    const db = createD1();
    const env = { AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, AI_DAILY_NEURONS: '1000' };
    const invoke = (model, reserve) => runBudgetedAi(env, { provider: 'cloudflare', model, reserve, run: async () => ({ response: 'ok' }) });
    assert.equal((await invoke('vision', 650)).ok, true);
    assert.equal((await invoke('chat', 400)).reason, 'daily_budget_exhausted');
    assert.equal(db.sqlite.prepare('SELECT SUM(reserved) AS n FROM ai_requests').get().n, 650);
    db.sqlite.close();
});

test('parallel requests cannot overbook the two concurrent leases', async () => {
    const { runBudgetedAi } = await load();
    const db = createD1();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const pending = Array.from({ length: 5 }, () => runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db }, {
        provider: 'cloudflare', model: 'vision', reserve: 650, run: () => gate
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_requests').get().n, 2);
    release({ response: 'ok' });
    const results = await Promise.all(pending);
    assert.equal(results.filter(r => r.ok).length, 2);
    assert.equal(results.filter(r => r.reason === 'busy').length, 3);
    db.sqlite.close();
});

test('quota errors trip the circuit and preserve reservations without retry', async () => {
    const { runBudgetedAi } = await load();
    const db = createD1();
    let calls = 0;
    const options = { provider: 'cloudflare', model: 'vision', reserve: 650, run() { calls++; throw Object.assign(new Error('quota'), { status: 429 }); } };
    assert.equal((await runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db }, options)).reason, 'quota');
    assert.equal((await runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db }, options)).reason, 'quota');
    assert.equal(calls, 1);
    assert.equal(db.sqlite.prepare('SELECT reserved FROM ai_requests').get().reserved, 650);
    db.sqlite.close();
});

test('timeouts keep a lease and do not log input content', async () => {
    const { runBudgetedAi } = await load();
    const db = createD1();
    const result = await runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db }, {
        provider: 'cloudflare', model: 'vision', reserve: 650, timeoutMs: 5, run: () => new Promise(() => {})
    });
    assert.equal(result.reason, 'timeout');
    const row = db.sqlite.prepare('SELECT * FROM ai_requests').get();
    assert.ok(row.lease_until > Date.now());
    assert.equal(row.status, 'timeout');
    assert.deepEqual(Object.keys(row), ['id', 'provider', 'model', 'day', 'started_at', 'lease_until', 'reserved', 'status', 'latency_ms', 'input_tokens', 'output_tokens', 'result_status', 'risk_level']);
    db.sqlite.close();
});

test('non-Cloudflare providers remain disabled even with legacy Gemini settings', async () => {
    const { runBudgetedAi } = await load();
    const db = createD1();
    const options = { provider: 'gemini', model: 'gemini-2.5-flash', reserve: 1, run: async () => ({}) };
    const env = { AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, GEMINI_FREE_TIER_CONFIRMED: 'true' };
    assert.equal((await runBudgetedAi(env, options)).reason, 'invalid_budget');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM ai_requests').get().n, 0);
    db.sqlite.close();
});

test('invalid settings disable AI and daily rollover uses provider time zones', async () => {
    const { runBudgetedAi, quotaDay } = await load();
    assert.equal(quotaDay('cloudflare', Date.parse('2026-09-05T00:30:00Z')), '2026-09-05');
    assert.equal(quotaDay('gemini', Date.parse('2026-09-05T00:30:00Z')), '2026-09-04');
    assert.equal(quotaDay('gemini', Date.parse('2026-01-05T07:30:00Z')), '2026-01-04');
    const db = createD1();
    const result = await runBudgetedAi({ AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, AI_DAILY_NEURONS: 'oops' }, {
        provider: 'cloudflare', model: 'vision', reserve: 650, run() { assert.fail(); }
    });
    assert.equal(result.ok, false);
    db.sqlite.close();
});
