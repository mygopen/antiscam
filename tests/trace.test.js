const test = require('node:test');
const assert = require('node:assert/strict');

const traceModulePromise = import('../functions/api/trace.js');

async function runTrace(targetUrl, fetchImpl) {
    const { onRequest } = await traceModulePromise;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;

    try {
        const request = new Request(`https://scanner.test/api/trace?url=${encodeURIComponent(targetUrl)}`);
        const response = await onRequest({ request });
        return {
            status: response.status,
            data: await response.json()
        };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

test('reurl.cc 隱藏 target 欄位會解析成最終目的地', { concurrency: false }, async () => {
    const destination = 'https://www.ntbna.gov.tw/singlehtml/activity?cntId=57f9ec1c4bd041029576a7da90121c83&from=sms';
    const fetchCalls = [];
    const result = await runTrace('https://reurl.cc/Z89q56', async input => {
        const url = String(input);
        fetchCalls.push(url);
        if (url.startsWith('https://reurl.cc/Z89q56')) {
            return new Response(`
                <!doctype html>
                <input value="${destination.replace('&', '&amp;')}" name="target" type="hidden" id="target">
            `, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        if (url === destination) {
            return new Response('<!doctype html><title>財政部北區國稅局</title>', {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' }
            });
        }
        throw new Error(`unexpected_url:${url}`);
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.finalUrl, destination);
    assert.equal(result.data.redirectCount, 1);
    assert.equal(result.data.resolvedDestination, true);
    assert.equal(result.data.uaDifference, false);
    assert.equal(result.data.isHighRisk, false);
    assert.equal(fetchCalls.filter(url => url === destination).length, 2);
    assert.ok(result.data.observedAt);
});

test('一般網站的同名 hidden target 不會被當成轉址', { concurrency: false }, async () => {
    const result = await runTrace('https://example.com/form', async () => {
        return new Response(`
            <!doctype html>
            <form><input id="target" name="target" type="hidden" value="https://attacker.example/phish"></form>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.finalUrl, 'https://example.com/form');
    assert.equal(result.data.redirectCount, 0);
    assert.equal(result.data.resolvedDestination, false);
});

test('正式內容頁事件中的 location.href 不會被誤認成自動轉址', { concurrency: false }, async () => {
    const fetchCalls = [];
    const result = await runTrace('https://content.example/article', async input => {
        const url = String(input);
        fetchCalls.push(url);
        return new Response(`
            <!doctype html>
            <main>${'政府機關正式頁面內容 '.repeat(40)}</main>
            <script>function openSearch() { location.href = 'https://www.google.com/advanced_search'; }</script>
        `, { status: 200, headers: { 'content-type': 'text/html' } });
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.finalUrl, 'https://content.example/article');
    assert.equal(result.data.redirectCount, 0);
    assert.equal(fetchCalls.some(url => url.includes('google.com')), false);
});

test('幾乎沒有可視內容的 JavaScript 轉址殼頁仍會被追蹤', { concurrency: false }, async () => {
    const destination = 'https://destination.example/landing';
    const result = await runTrace('https://redirect-shell.example/start', async input => {
        const url = String(input);
        if (url === destination) {
            return new Response('<!doctype html><main>Destination</main>', {
                status: 200,
                headers: { 'content-type': 'text/html' }
            });
        }
        return new Response(`<script>window.location.href = '${destination}';</script>`, {
            status: 200,
            headers: { 'content-type': 'text/html' }
        });
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.finalUrl, destination);
    assert.equal(result.data.redirectCount, 1);
});

test('reurl.cc 若指向私有 IP 會拒絕連線並標示高風險', { concurrency: false }, async () => {
    const result = await runTrace('https://reurl.cc/private', async input => {
        const url = String(input);
        if (!url.startsWith('https://reurl.cc/private')) {
            throw new Error(`private_target_was_fetched:${url}`);
        }
        return new Response(`
            <!doctype html>
            <input type="hidden" id="target" value="http://127.0.0.1/admin">
        `, { status: 200, headers: { 'content-type': 'text/html' } });
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.isHighRisk, true);
    assert.equal(result.data.resolvedDestination, false);
    assert.equal(result.data.variants.mobile.status, 'blocked_private_target');
    assert.match(result.data.riskReason, /私有網路/);
});

test('Mobile 與 Desktop 導向不同主網域時一律標示高風險', { concurrency: false }, async () => {
    const mobileDestination = 'https://mobile-target.example/page';
    const desktopDestination = 'https://desktop-target.example/page';
    const result = await runTrace('https://reurl.cc/cloaked', async (input, init = {}) => {
        const url = String(input);
        if (url.startsWith('https://reurl.cc/cloaked')) {
            const userAgent = String(init.headers?.['User-Agent'] || '');
            const destination = userAgent.includes('iPhone') ? mobileDestination : desktopDestination;
            return new Response(`<input type="hidden" id="target" value="${destination}">`, {
                status: 200,
                headers: { 'content-type': 'text/html' }
            });
        }
        return new Response('<!doctype html><title>Destination</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
        });
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.uaDifference, true);
    assert.equal(result.data.isHighRisk, true);
    assert.equal(result.data.mobileFinalUrl, mobileDestination);
    assert.equal(result.data.desktopFinalUrl, desktopDestination);
    assert.match(result.data.riskReason, /Mobile\/Desktop/);
});
