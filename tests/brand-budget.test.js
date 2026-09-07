const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createD1 = require('./helpers/ai-d1.cjs');

test('brand endpoint fails closed without bindings and never calls unmanaged providers', async () => {
    const { onRequest } = await import('../functions/api/check-fake-brand.js');
    const original = global.fetch;
    global.fetch = () => { assert.fail('must not fetch without budget'); };
    try {
        const response = await onRequest({ request: new Request('https://scanner.test/api?url=https://example.com'), env: {} });
        assert.equal((await response.json()).status, 'disabled');
    } finally { global.fetch = original; }
    const source = fs.readFileSync(path.join(__dirname, '../functions/api/check-fake-brand.js'), 'utf8');
    assert.doesNotMatch(source, /browser-rendering\/markdown|generativelanguage\.googleapis/);
    assert.match(source, /runBudgetedAi\(env/);
});

test('brand request admission is atomic and does not store raw IP', async () => {
    const { admitBrandRequest } = await import('../functions/lib/request-guard.js');
    const db = createD1();
    db.sqlite.exec(fs.readFileSync(path.join(__dirname, '../migrations/0002_request_limits.sql'), 'utf8'));
    const request = new Request('https://scanner.test/api', { headers: { 'CF-Connecting-IP': '203.0.113.10' } });
    try {
        const results = await Promise.all(Array.from({ length: 8 }, () => admitBrandRequest({ AI_BUDGET: db }, request)));
        assert.equal(results.filter(Boolean).length, 5);
        assert.doesNotMatch(JSON.stringify(db.sqlite.prepare('SELECT * FROM request_limits').all()), /203\.0\.113\.10/);
    } finally { db.sqlite.close(); }
});

test('brand analysis shares the chat/vision budget and preserves Generic_Scam output', async () => {
    const { onRequest } = await import('../functions/api/check-fake-brand.js');
    const db = createD1();
    db.sqlite.exec(fs.readFileSync(path.join(__dirname, '../migrations/0002_request_limits.sql'), 'utf8'));
    const original = global.fetch;
    let aiCalls = 0;
    global.fetch = async url => String(url).startsWith('https://cloudflare-dns.com/')
        ? Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] })
        : new Response('<main>Important account notice: please send your password and OTP to customer service now.</main>');
    const env = { AI_BUDGET: db, AI_DAILY_NEURONS: '400', AI: { async run() { aiCalls++; return { response: 'Generic_Scam' }; } } };
    try {
        const request = new Request('https://scanner.test/api?url=https://example.com');
        const first = await (await onRequest({ request, env })).json();
        assert.equal(first.isGenericScam, true);
        const second = await (await onRequest({ request, env })).json();
        assert.equal(second.isFakeBrand, null);
        assert.equal(aiCalls, 1);
        assert.equal(db.sqlite.prepare('SELECT SUM(reserved) AS total FROM ai_requests').get().total, 400);
    } finally { global.fetch = original; db.sqlite.close(); }
});
