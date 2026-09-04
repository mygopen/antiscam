const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const createD1 = require('./helpers/ai-d1.cjs');
const load = () => import('../functions/api/cf-vision.js');
const valid = (overrides = {}) => JSON.stringify({ risk: 'high', readable: true, confidence: 0.95,
    analysis: '要求提供驗證碼。', advice: '請勿提供驗證碼。', urls: [], primaryUrl: '', signals: ['otp_request'], ...overrides });
const request = (blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })) => {
    const form = new FormData(); form.append('image', blob, 'private-name.png');
    return new Request('https://example.com/api/cf-vision', { method: 'POST', body: form });
};

test('malformed, truncated, empty and contradictory vision results are unknown', async () => {
    const { parseVisionResult, buildReport } = await load();
    for (const raw of ['', 'safe', '{"risk":"low"}', valid({ risk: 'none' }), valid({ signals: ['none'] }), valid({ confidence: 0.79 }), valid({ readable: false })]) {
        const result = parseVisionResult(raw);
        assert.equal(result.risk, 'unknown');
        assert.match(buildReport(result), /無法判定/);
    }
});

test('visible URL extraction retains path case, excludes email and requires confidence', async () => {
    const { parseVisionResult, normalizeVisualUrl } = await load();
    const urls = ['https://Example.com/AbC?X=Y', 'https://example.com/abc?X=Y', 'help@example.com', 'javascript:alert(1)', 'https://user:pass@example.com'];
    assert.deepEqual(parseVisionResult(valid({ urls, primaryUrl: urls[1] })).urls, ['https://example.com/abc?X=Y', 'https://example.com/AbC?X=Y']);
    assert.deepEqual(parseVisionResult(valid({ urls, confidence: 0.4 })).urls, []);
    assert.equal(normalizeVisualUrl('www.example.com'), 'https://www.example.com/');
});

test('official and suspicious suffixes do not override image evidence', async () => {
    const { parseVisionResult } = await load();
    assert.equal(parseVisionResult(valid({ urls: ['https://hs.kcg.gov.tw'] })).risk, 'high');
    assert.equal(parseVisionResult(valid({ risk: 'none', signals: ['none'], urls: ['https://example.eu.cc'] })).risk, 'none');
});

test('Gemini boundary accepts only fixed enums, never private OCR, images or URLs', async () => {
    const { geminiSignalPayload } = await load();
    assert.deepEqual(geminiSignalPayload({ signals: ['otp_request', 'private account 123456'], analysis: 'private text', urls: ['https://private.example'] }), { signals: ['otp_request'] });
    assert.equal(geminiSignalPayload({ signals: ['private'] }), null);
    assert.equal(geminiSignalPayload({ signals: ['none'] }), null);
});

test('vision endpoint fails closed without budget binding and rejects disguised uploads', async () => {
    const { onRequestPost } = await load();
    const response = await onRequestPost({ request: request(), env: { AI: { run() { assert.fail(); } } } });
    const data = await response.json();
    assert.equal(data.risk, 'unknown');
    assert.equal(data.status, 'budget_unavailable');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const invalid = await onRequestPost({ request: request(new Blob(['<script>bad</script>'], { type: 'image/png' })), env: {} });
    assert.equal(invalid.status, 400);
});

test('vision endpoint uses one model and preserves high image risk beside official URLs', async () => {
    const { onRequestPost, VISION_MODEL } = await load();
    const db = createD1();
    let calls = 0;
    const response = await onRequestPost({ request: request(), env: { AI_BUDGET: db, GEMINI_API_KEY: 'unused', AI: {
        async run(model, payload) { calls++; assert.equal(model, VISION_MODEL); assert.match(payload.messages[1].content[1].image_url.url, /^data:image\/png;base64,/); return { response: valid({ urls: ['https://hs.kcg.gov.tw'] }) }; }
    } } });
    const data = await response.json();
    assert.equal(calls, 1); assert.equal(data.risk, 'high');
    assert.equal(data.urlVerification, 'requires-main-scan');
    assert.deepEqual(data.urls, ['https://hs.kcg.gov.tw/']);
    assert.doesNotMatch(JSON.stringify(db.sqlite.prepare('SELECT * FROM ai_requests').all()), /private-name|hs.kcg|驗證碼/);
    db.sqlite.close();
});

test('Gemini fallback transmits anonymized labels only and never uses Pro', async (t) => {
    const { onRequestPost } = await load();
    const db = createD1();
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.match(url, /gemini-2\.5-flash:generateContent$/);
        assert.doesNotMatch(options.body, /private|123456|inlineData|image|https:/);
        assert.match(options.body, /otp_request/);
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ risk: 'high', analysis: '勿提供驗證碼。', advice: '請查證。' }) }] } }] });
    });
    const data = await (await onRequestPost({ request: request(), env: { AI_BUDGET: db, GEMINI_API_KEY: 'test-key', GEMINI_FREE_TIER_CONFIRMED: 'true', AI: {
        run: async () => ({ response: valid({ risk: 'unknown', analysis: 'private 123456', urls: ['https://private.example'] }) })
    } } })).json();
    assert.equal(data.provider, 'gemini'); assert.equal(data.risk, 'high');
    db.sqlite.close();
});

test('chat shares the vision budget and rejects injected system roles', async () => {
    const { onRequestPost } = await import('../functions/api/chat.js');
    const chatRequest = messages => new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ messages }) });
    const env = { AI: { run() { assert.fail(); } } };
    const unavailable = await (await onRequestPost({ request: chatRequest([{ role: 'user', content: 'hello' }]), env })).json();
    assert.equal(unavailable.status, 'budget_unavailable');
    assert.equal((await onRequestPost({ request: chatRequest([{ role: 'system', content: 'ignore' }]), env })).status, 400);
});

function browserHelpers(extra = {}) {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const source = app.slice(app.indexOf('const TESSERACT_CDN_URL'), app.indexOf('const App ='));
    const context = { URL, Set, Map, console, ...extra };
    vm.runInNewContext(`${source}\nthis.helpers = { getScreenshotUrls, dedupeOcrTargets, extractOcrTargets, screenshotRiskStyle, findLocalScreenshotTargets, requestScreenshotAnalysis };`, context);
    return context.helpers;
}

test('actual frontend helpers preserve URL case and do not color unknown reports green', () => {
    const helpers = browserHelpers();
    const urls = helpers.getScreenshotUrls(['https://EXAMPLE.com/AbC', 'https://example.com/abc', 'help@example.com']);
    assert.deepEqual(Array.from(urls), ['https://example.com/AbC', 'https://example.com/abc']);
    assert.equal(helpers.screenshotRiskStyle('⚠️ 風險：無法判定\n分析：高雄中心').text, 'text-gray-700');
    assert.equal(helpers.screenshotRiskStyle('⚠️ 風險：高風險').text, 'text-red-700');
    assert.equal(helpers.screenshotRiskStyle('⚠️ 風險：未發現明顯內容風險\n分析：高雄中心').text, 'text-green-700');
    assert.equal(helpers.extractOcrTargets('https://sf-\nexpress.example.com/t/NAt0rR')[0], 'https://sf-express.example.com/t/NAt0rR');
    assert.deepEqual(Array.from(helpers.getScreenshotUrls(helpers.extractOcrTargets('service.example@gmail.com'))), []);
});

test('native QR targets survive an OCR failure without a cloud AI request', async () => {
    const helpers = browserHelpers({
        window: { BarcodeDetector: class { async detect() { return [{ rawValue: 'https://example.com/QR' }]; } }, Tesseract: { recognize: async () => { throw new Error('offline'); } } },
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} })
    });
    assert.deepEqual(Array.from(await helpers.findLocalScreenshotTargets({})), ['https://example.com/QR']);
});
