const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../functions/lib/public-fetch.js');
const dns = url => String(url).startsWith('https://cloudflare-dns.com/dns-query?');
const publicDns = () => Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
async function mockFetch(mock, work) {
    const original = global.fetch;
    global.fetch = mock;
    try { await work(); } finally { global.fetch = original; }
}

test('block private, encoded, credentialed and non-HTTP targets before fetching', async () => {
    const { publicUrl } = await load();
    for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1',
        'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://169.254.169.254/', 'http://localhost.',
        'http://foo.internal', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com:8080']) {
        assert.equal(publicUrl(url), null, url);
    }
    assert.ok(publicUrl('https://www.cht.com.tw/'));
});

test('validate redirect targets and reject private DNS answers', async () => {
    const { fetchPublicResource } = await load();
    let targetCalls = 0;
    await mockFetch(async url => {
        if (dns(url)) return publicDns();
        targetCalls++;
        return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
    }, async () => assert.rejects(fetchPublicResource('https://example.com'), /blocked_target/));
    assert.equal(targetCalls, 1);
    await mockFetch(async url => {
        assert.ok(dns(url));
        return Response.json({ Status: 0, Answer: [{ type: 1, data: '10.1.1.1' }] });
    }, async () => assert.rejects(fetchPublicResource('https://example.com'), /blocked_private_target/));
});

test('bounded reads stop chunked large responses and redirect loops', async () => {
    const { fetchPublicResource } = await load();
    await mockFetch(async url => dns(url) ? publicDns() : new Response('x'.repeat(100)),
        async () => assert.rejects(fetchPublicResource('https://example.com', { maxBytes: 10 }), /body_too_large/));
    await mockFetch(async url => dns(url) ? publicDns() : new Response(null, { status: 302, headers: { location: '/' } }),
        async () => assert.rejects(fetchPublicResource('https://example.com'), /redirect_loop/));
});

test('fixed DNS/API endpoints reject redirects without unsupported Workers redirect mode', async () => {
    const { fetchPublicResource } = await load();
    await mockFetch(async (url, init) => {
        assert.equal(init.redirect, 'manual');
        return new Response(null, { status: 302, headers: { location: 'https://unexpected.example' } });
    }, async () => assert.rejects(fetchPublicResource('https://example.com'), /dns_unavailable/));
    const { onRequest } = await import('../functions/api/safe-browsing.js');
    await mockFetch(async (url, init) => {
        assert.equal(init.redirect, 'manual');
        return new Response(null, { status: 302, headers: { location: 'https://unexpected.example' } });
    }, async () => {
        const result = await onRequest({ request: new Request('https://scanner.test/api?url=https://example.com'), env: { GOOGLE_SAFE_BROWSING_API_KEY: 'test' } });
        assert.equal((await result.json()).status, 'unavailable');
    });
});

test('security headers on HTTP error pages remain unavailable', async () => {
    const { onRequest } = await import('../functions/api/security-headers.js');
    for (const status of [403, 404, 429, 500, 520]) await mockFetch(async url => dns(url) ? publicDns() : new Response('error', { status }), async () => {
        const data = await (await onRequest({ request: new Request('https://scanner.test/api?url=https://example.com') })).json();
        assert.equal(data.status, 'unavailable');
        assert.equal(data.missingAll, false);
    });
});

test('Safe Browsing distinguishes disabled, errors, clear and matched', async () => {
    const { onRequest } = await import('../functions/api/safe-browsing.js');
    const request = new Request('https://scanner.test/api?url=https://example.com');
    assert.equal((await (await onRequest({ request, env: {} })).json()).status, 'disabled');
    for (const [body, code, expected] of [[{}, 200, 'clear'], [{ matches: [{ threatType: 'MALWARE' }] }, 200, 'matched'],
        [{ error: 'quota' }, 429, 'unavailable'], [{ error: 'bad key' }, 200, 'unavailable'], [[], 200, 'unavailable']]) {
        await mockFetch(async () => Response.json(body, { status: code }), async () => {
            const data = await (await onRequest({ request, env: { GOOGLE_SAFE_BROWSING_API_KEY: 'test' } })).json();
            assert.equal(data.status, expected);
            assert.equal(data.isUnsafe, expected === 'clear' ? false : expected === 'matched' ? true : null);
        });
    }
});
