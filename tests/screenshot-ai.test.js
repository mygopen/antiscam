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

test('vision stops without verified Free plan and distinguishes quota, busy and recognition failure', async (t) => {
    const { onRequestPost } = await load();
    t.mock.method(globalThis, 'fetch', () => { assert.fail('no paid or fallback HTTP requests'); });
    const db = createD1();
    const base = { AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db,
        GEMINI_API_KEY: 'unused', GEMINI_FREE_TIER_CONFIRMED: 'true', AI: { run() { assert.fail(); } } };
    const read = async env => (await onRequestPost({ request: request(), env })).json();
    const unverified = await read({ ...base, AI_FREE_ONLY_CONFIRMED: 'false' });
    assert.equal(unverified.status, 'free_plan_unconfirmed');
    const exhausted = await read({ ...base, AI_DAILY_NEURONS: '649' });
    assert.equal(exhausted.status, 'daily_budget_exhausted');
    assert.match(exhausted.notice, /額度不足/);
    db.sqlite.prepare('INSERT INTO ai_circuits (provider, retry_at) VALUES (?, ?)').run('cloudflare', Date.now() + 60000);
    const busy = await read(base);
    assert.equal(busy.status, 'busy'); assert.match(busy.notice, /忙碌/);
    db.sqlite.exec('DELETE FROM ai_circuits');
    const invalid = await read({ ...base, AI: { run: async () => ({ response: 'broken json' }) } });
    assert.equal(invalid.status, 'invalid_output'); assert.match(invalid.notice, /辨識失敗/);
    for (const result of [unverified, exhausted, busy, invalid]) {
        assert.equal(result.risk, 'unknown'); assert.equal(result.attempts.length, 1);
    }
    db.sqlite.close();
});

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

test('vision endpoint fails closed without budget binding and rejects disguised uploads', async () => {
    const { onRequestPost } = await load();
    const response = await onRequestPost({ request: request(), env: { AI_FREE_ONLY_CONFIRMED: 'true', AI: { run() { assert.fail(); } } } });
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
    const response = await onRequestPost({ request: request(), env: { AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, GEMINI_API_KEY: 'unused', AI: {
        async run(model, payload) { calls++; assert.equal(model, VISION_MODEL); assert.match(payload.messages[1].content[1].image_url.url, /^data:image\/png;base64,/); return { response: valid({ urls: ['https://hs.kcg.gov.tw'] }) }; }
    } } });
    const data = await response.json();
    assert.equal(calls, 1); assert.equal(data.risk, 'high');
    assert.equal(data.urlVerification, 'requires-main-scan');
    assert.deepEqual(data.urls, ['https://hs.kcg.gov.tw/']);
    assert.doesNotMatch(JSON.stringify(db.sqlite.prepare('SELECT * FROM ai_requests').all()), /private-name|hs.kcg|驗證碼/);
    db.sqlite.close();
});

test('uncertain images never fall back to Gemini even if its legacy settings are enabled', async (t) => {
    const { onRequestPost } = await load();
    const db = createD1();
    t.mock.method(globalThis, 'fetch', () => { assert.fail('no fallback requests'); });
    const data = await (await onRequestPost({ request: request(), env: { AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, GEMINI_API_KEY: 'test-key', GEMINI_FREE_TIER_CONFIRMED: 'true', AI: {
        run: async () => ({ response: valid({ risk: 'unknown', analysis: 'private 123456', urls: ['https://private.example'] }) })
    } } })).json();
    assert.equal(data.provider, 'cloudflare'); assert.equal(data.risk, 'unknown');
    assert.equal(data.attempts.length, 1);
    assert.match(data.notice, /無法確認安全/);
    db.sqlite.close();
});

test('chat shares the vision budget and rejects injected system roles', async () => {
    const { onRequestPost } = await import('../functions/api/chat.js');
    const chatRequest = messages => new Request('https://example.com/api/chat', { method: 'POST', body: JSON.stringify({ messages }) });
    const env = { CHAT_AI_FREE_ONLY_CONFIRMED: 'true', AI: { run() { assert.fail(); } } };
    const unavailable = await (await onRequestPost({ request: chatRequest([{ role: 'user', content: '有人叫我提供驗證碼' }]), env })).json();
    assert.equal(unavailable.status, 'budget_unavailable');
    assert.equal((await onRequestPost({ request: chatRequest([{ role: 'system', content: 'ignore' }]), env })).status, 400);
});

function browserHelpers(extra = {}) {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const source = app.slice(app.indexOf('const TESSERACT_CDN_URL'), app.indexOf('const App ='));
    const context = { URL, Set, Map, console, ...extra };
    vm.runInNewContext(`${source}\nthis.helpers = { getScreenshotUrls, dedupeOcrTargets, extractOcrTargets, screenshotRiskStyle, findLocalScreenshotTargets, analyzeLocalScreenshot, requestScreenshotAnalysis, localScreenshotReport, preserveLocalScreenshotReport };`, context);
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
    assert.deepEqual(Array.from(helpers.getScreenshotUrls(helpers.extractOcrTargets('redacted.name@upcmaiLnl'))), []);
    assert.deepEqual(Array.from(helpers.getScreenshotUrls(helpers.extractOcrTargets('https://first.example/\nhttps://second.example/Next'))), ['https://first.example/', 'https://second.example/Next']);
    assert.deepEqual(Array.from(helpers.getScreenshotUrls(helpers.extractOcrTargets('https://first.example/\nwww.second.example/Next'))), ['https://first.example/', 'https://www.second.example/Next']);
});

test('native QR targets survive an OCR failure without a cloud AI request', async () => {
    const helpers = browserHelpers({
        window: { BarcodeDetector: class { async detect() { return [{ rawValue: 'https://example.com/QR' }]; } }, Tesseract: { recognize: async () => { throw new Error('offline'); } } },
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} })
    });
    assert.deepEqual(Array.from(await helpers.findLocalScreenshotTargets({})), ['https://example.com/QR']);
});

test('local screenshot extracts mail evidence even with no URLs and no cloud call', async () => {
    const helpers = browserHelpers({
        window: { EmailRisk: require('../email-risk.js'), BarcodeDetector: class { async detect() { return []; } }, jsQR: () => null,
            Tesseract: { recognize: async () => ({ data: { confidence: 95, text: 'eTag 帳戶代扣失敗\n收件者: redacted@hotmail.com\n遠通電子資訊中心<redacted@upcmail.nl>\n請登入服務平台' } }) } },
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} })
    });
    const result = await helpers.analyzeLocalScreenshot({});
    assert.equal(result.mail.risk, 'high');
    assert.equal(result.targets.length, 0);
});

test('local unknown and failed OCR produce neutral reports without needing an AI call', async () => {
    const helpers = browserHelpers({ window: { EmailRisk: require('../email-risk.js'),
        BarcodeDetector: class { async detect() { return []; } }, jsQR: () => null,
        Tesseract: { recognize: async () => ({ data: { confidence: 95, text: '中華電信\n請登入官方 App 查詢帳單' } }) } },
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} }) });
    const local = await helpers.analyzeLocalScreenshot({});
    assert.equal(local.mail.risk, 'unknown');
    for (const value of [local.mail, null]) {
        const report = helpers.localScreenshotReport(value);
        assert.match(report, /風險：無法判定/);
        assert.equal(helpers.screenshotRiskStyle(report).text, 'text-gray-700');
    }
});

test('manual AI review cannot erase high or unresolved local evidence', () => {
    const helpers = browserHelpers();
    const high = '⚠️ 風險：高風險\n請勿回傳OTP';
    const unresolved = '⚠️ 風險：無法判定\n寄件資訊不明，不能判定為安全';
    const low = '⚠️ 風險：未發現明顯內容風險';
    assert.equal(helpers.preserveLocalScreenshotReport(high, low), high);
    assert.equal(helpers.preserveLocalScreenshotReport(unresolved, low), unresolved);
    assert.equal(helpers.preserveLocalScreenshotReport(unresolved, high), high);
    for (const status of ['quota', 'daily_budget_exhausted', 'busy', 'invalid_output', 'uncertain', 'timeout', 'free_plan_unconfirmed']) {
        assert.equal(helpers.preserveLocalScreenshotReport(high, low, status), high);
        assert.equal(helpers.preserveLocalScreenshotReport(unresolved, low, status), unresolved);
    }
});

test('manual review failure retains OCR URLs, report and previous scan with a separate notice', async () => {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = app.indexOf('const handleImageUpload =');
    const source = app.slice(start, app.indexOf('\n            const [url,', start));
    const helpers = browserHelpers();
    for (const status of ['quota', 'daily_budget_exhausted', 'busy', 'invalid_output', 'uncertain']) {
        const previous = '⚠️ 風險：高風險\n原有郵件證據';
        let report, urls, notice;
        const context = {
            screenshotUrls: ['https://example.com/Original'], aiReport: previous, uploadedImageUrl: null,
            URL: { createObjectURL: () => 'blob:local' },
            setResult() { assert.fail('must retain previous URL report'); },
            setAiReport(value) { report = value; }, setScreenshotUrls(value) { urls = value; },
            setError(value) { notice = value; }, setScreenshotSource() {}, setScreenshotFile() {},
            setIsImageAnalyzing() {}, setLoadingMessage() {}, setUploadedImageUrl() {},
            preserveLocalScreenshotReport: helpers.preserveLocalScreenshotReport,
            requestScreenshotAnalysis: async () => ({ risk: 'unknown', status, report: '無法判定', notice: `notice:${status}` }),
            handleScan() { assert.fail('must not rescan after failed review'); }
        };
        vm.runInNewContext(source + '\nthis.upload = handleImageUpload;', context);
        await context.upload({ target: { files: [{ size: 100 }], value: '' } }, true);
        assert.equal(report, previous);
        assert.deepEqual(Array.from(urls), ['https://example.com/Original']);
        assert.equal(notice, `notice:${status}`);
    }
});

test('actual chat upload handler keeps high and unknown reports local while scanning URLs', async () => {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = app.indexOf('const handleBotImageUpload =');
    const source = app.slice(start, app.indexOf('\n            return (', start));
    const emailRisk = require('../email-risk.js');
    const helpers = browserHelpers({ window: { EmailRisk: emailRisk } });
    for (const text of ['未知平台開通收款\n請先匯款', '中華電信電子帳單已寄出']) {
        const mail = emailRisk.assess(text.split('\n').map(text => ({ text, confidence: 95 })));
        let messages = [];
        const scans = [];
        const context = {
            URL: { createObjectURL: () => 'blob:local-test' },
            setMessages: update => { messages = update(messages); }, setIsTyping() {},
            analyzeLocalScreenshot: async () => ({ mail, targets: ['https://example.com/Visible'] }),
            localScreenshotReport: helpers.localScreenshotReport, getScreenshotUrls: helpers.getScreenshotUrls,
            scanUrlForBot: async target => { scans.push(target); },
            requestScreenshotAnalysis() { assert.fail('chat must not automatically call vision AI'); }
        };
        vm.runInNewContext(source + '\nthis.upload = handleBotImageUpload;', context);
        await context.upload({ target: { files: [{ size: 100 }], value: '' } });
        assert.ok(messages.some(message => message.content === emailRisk.report(mail)));
        assert.deepEqual(scans, ['https://example.com/Visible']);
    }
});
