const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = () => import('../functions/api/cf-vision.js');
const valid = (overrides = {}) => JSON.stringify({ risk: 'high', readable: true, confidence: 0.95,
    analysis: '要求提供驗證碼。', advice: '請勿提供驗證碼。', urls: [], primaryUrl: '', signals: ['otp_request'], ...overrides });
test('image API is closed for every method before reading uploads, env or calling any provider', async (t) => {
    const { onRequest } = await load();
    t.mock.method(globalThis, 'fetch', () => { assert.fail('no cloud request'); });
    for (const method of ['GET', 'POST', 'PUT', 'OPTIONS']) {
        const response = await onRequest({
            request: { method, formData() { assert.fail('must not read image'); }, json() { assert.fail('must not read body'); } },
            env: new Proxy({}, { get() { assert.fail('must not read any AI binding or secret'); } })
        });
        assert.equal(response.status, 410);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const data = await response.json();
        assert.equal(data.status, 'image_ai_disabled');
        assert.equal(data.risk, 'unknown');
        assert.equal(data.provider, null);
        assert.deepEqual(data.attempts, []);
        assert.deepEqual(data.urls, []);
    }
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

test('chat retains the free-only budget gate and rejects injected system roles', async () => {
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
    vm.runInNewContext(`${source}\nthis.helpers = { serializeTextChatMessages, screenshotReferencesText, createScreenshotPreview, getScreenshotUrls, dedupeOcrTargets, extractOcrTargets, screenshotRiskStyle, findLocalScreenshotTargets, analyzeLocalScreenshot, recognizeLocalImage, assessCorrectedScreenshotText, cropScreenshot, localScreenshotReport, preserveLocalScreenshotReport };`, context);
    return context.helpers;
}

test('preview verifies decoded dimensions and retains local data without object URLs', async () => {
    const data = 'data:image/png;base64,local';
    const helpers = browserHelpers({
        FileReader: class { readAsDataURL() { this.result = data; this.onload(); } },
        Image: class { set src(value) { assert.equal(value, data); this.naturalWidth = 200; this.naturalHeight = 100; this.onload(); } },
        URL: { createObjectURL() { assert.fail('no temporary preview URL'); } }
    });
    assert.equal(await helpers.createScreenshotPreview({ size: 100, type: 'image/png' }), data);
    await assert.rejects(helpers.createScreenshotPreview({ size: 100, type: 'image/svg+xml' }), /不支援/);
    await assert.rejects(helpers.createScreenshotPreview({ size: 0, type: 'image/png' }), /3MB/);
});

test('later text chat never transmits screenshots or their local reports', () => {
    const helpers = browserHelpers();
    const messages = [
        { role: 'user', content: '先前一般問題' },
        { role: 'user', content: 'image', imageUrl: 'data:image/png;base64,private' },
        { role: 'assistant', content: 'private OCR report', localOnly: true, methods: [{ title: 'private matched method', reasons: ['private OCR feature'] }] },
        { role: 'assistant', content: 'private extracted URL report', localOnly: true },
        { role: 'user', content: '如何預防詐騙', debug: 'excluded' }
    ];
    assert.deepEqual(JSON.parse(JSON.stringify(helpers.serializeTextChatMessages(messages))), [
        { role: 'user', content: '先前一般問題' }, { role: 'user', content: '如何預防詐騙' }
    ]);
});

test('unreadable, unsupported and oversized previews show errors instead of broken thumbnails', async () => {
    const reader = class { readAsDataURL() { this.result = 'data:image/heic;base64,test'; this.onload(); } };
    const broken = browserHelpers({ FileReader: reader, Image: class { set src(value) { this.onerror(); } } });
    await assert.rejects(broken.createScreenshotPreview({ size: 100, type: 'image/heic' }), /圖片無法顯示/);
    const oversized = browserHelpers({ FileReader: reader, Image: class { set src(value) { this.naturalWidth = 5000; this.naturalHeight = 5000; this.onload(); } } });
    await assert.rejects(oversized.createScreenshotPreview({ size: 100, type: 'image/png' }), /尺寸過大/);
    const unreadable = browserHelpers({ FileReader: class { readAsDataURL() { this.onerror(); } } });
    await assert.rejects(unreadable.createScreenshotPreview({ size: 100, type: 'image/png' }), /讀取失敗/);
});

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

test('website region retries, report and targets stay local even when overall OCR is poor', async () => {
    const WebsiteScreenshot = require('../website-screenshot.js');
    const address = { text: 'invoice-fake.example', confidence: 55, bbox: { x0: 20, y0: 100, x1: 350, y1: 130 } };
    const initial = { confidence: 50, lines: [address, ...['手機號碼', '驗證碼（密碼）', '手機條碼'].map(text => ({ text, confidence: 95 }))] };
    const recognized = { confidence: 96, words: [{ text: 'invoice-fake.example', confidence: 96 }] };
    // Header is triggered by the initial platform hint, but only the reliable retry establishes the identity.
    initial.lines.push({ text: 'E-Invoice Platform', confidence: 50 });
    const results = [initial, recognized, recognized, { lines: [{ text: '電子發票整合服務平台', confidence: 95 }] }];
    const calls = [];
    const helpers = browserHelpers({
        window: { WebsiteScreenshot, EmailRisk: require('../email-risk.js'), BarcodeDetector: class { async detect() { return []; } },
            Tesseract: { recognize: async (input, language) => { calls.push(language); return { data: results.shift() }; } } },
        createImageBitmap: async () => ({ width: 500, height: 2000, close() {} }),
        document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} }) }) }
    });
    const result = await helpers.analyzeLocalScreenshot({});
    assert.equal(result.mail.risk, 'high');
    assert.equal(result.mail.kind, 'website');
    assert.deepEqual(Array.from(result.targets), ['https://invoice-fake.example/']);
    assert.deepEqual(calls, ['eng+chi_tra', 'eng', 'eng', 'chi_tra+eng']);
    assert.doesNotMatch(helpers.localScreenshotReport(result.mail), /寄件線索/);
    const prior = helpers.localScreenshotReport(result.mail);
    const corrected = helpers.localScreenshotReport(helpers.assessCorrectedScreenshotText('電子發票整合服務平台\nhttps://www.einvoice.nat.gov.tw/').mail);
    assert.match(helpers.preserveLocalScreenshotReport(prior, corrected, 'corrected'), /風險：無法判定/);
    assert.match(helpers.preserveLocalScreenshotReport(prior, corrected, 'cancelled'), /風險：高風險/);
});

test('per-line URL quality preserves readable URLs without borrowing confidence across gaps', async () => {
    const helpers = browserHelpers({ window: { BarcodeDetector: class { async detect() { return []; } },
        Tesseract: { recognize: async () => ({ data: { confidence: 40, lines: [
            { text: 'https://clear.example/path', confidence: 95 },
            { text: 'https://unclear.example', confidence: 40 }
        ] } }) } }, createImageBitmap: async () => ({ width: 100, height: 100, close() {} }) });
    assert.deepEqual(Array.from((await helpers.analyzeLocalScreenshot({})).targets), ['https://clear.example/path']);
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

test('local reanalysis cannot erase high or unresolved original evidence', () => {
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

test('actual main upload uses local OCR and forwards only URLs into a non-AI image scan', async () => {
    const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
    const start = app.indexOf('const handleImageUpload =');
    const source = app.slice(start, app.indexOf('\n            const [url,', start));
    const helpers = browserHelpers({ window: { EmailRisk: require('../email-risk.js') } });
    let report;
    const scans = [];
    const context = {
        ...helpers,
        AbortController, imageJobRef: { current: null }, screenshotEvidenceRef: { current: null },
        createScreenshotPreview: async () => 'data:image/png;base64,test',
        setResult() {}, setAiReport(value) { report = value; }, setScreenshotUrls() {},
        setError() {}, setScreenshotSource() {}, setScreenshotFile() {}, setScreenshotText() {}, setScreenshotArticles() {}, setScreenshotMethods() {}, setScreenshotEditor() {},
        setIsImageAnalyzing() {}, setLoadingMessage() {}, setUploadedImageUrl() {}, setUrl() {},
        analyzeLocalScreenshot: async () => ({ mail: null, text: '', targets: ['https://example.com/Original'] }),
        pickPrimaryOcrTarget: values => values[0],
        handleScan: async (...args) => scans.push(args)
    };
    vm.runInNewContext(source + '\nthis.upload = handleImageUpload;', context);
    await context.upload({ target: { files: [{ size: 100 }], value: '' } });
    assert.match(report, /不能判定為安全/);
    assert.equal(scans.length, 1);
    assert.equal(scans[0][1], 'https://example.com/Original');
    assert.equal(scans[0][2].source, 'ocr');
    assert.equal(scans[0][2].contentReport, report);
    assert.doesNotMatch(app, /requestScreenshotAnalysis|fetch\(['"]\/api\/cf-vision|AI 圖片複核/);
    assert.match(app, /allowCloudAi: !\(sourceContext/);
});

test('OCR worker is reused and cancellation releases the queue even when recognize never settles', async () => {
    let created = 0, terminated = 0, languages = [];
    const helpers = browserHelpers({ window: { Tesseract: {
        async createWorker(language) {
            created++; languages.push(language);
            return {
                reinitialize: async lang => languages.push(lang),
                recognize: async input => input === 'hang' ? new Promise(() => {}) : { data: { text: input } },
                terminate: async () => { terminated++; }
            };
        }
    } } });
    await helpers.recognizeLocalImage('first', 'eng+chi_tra');
    await helpers.recognizeLocalImage('second', 'eng+chi_tra');
    assert.equal(created, 1);
    await helpers.recognizeLocalImage('crop', 'eng');
    assert.deepEqual(languages, ['eng+chi_tra', 'eng']);
    const controller = new AbortController();
    const pending = helpers.recognizeLocalImage('hang', 'eng', null, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    const next = await helpers.recognizeLocalImage('next', 'eng');
    assert.equal(next.data.text, 'next');
    assert.equal(created, 2);
    assert.ok(terminated >= 1);
});

test('corrected text is analyzed locally, bounded, and cannot clear previous high-risk evidence', () => {
    const helpers = browserHelpers({ window: { EmailRisk: require('../email-risk.js') } });
    const result = helpers.assessCorrectedScreenshotText('eTag 帳戶代扣失敗\n寄件者: 遠通<sender@upcmail.nl>\n請登入服務平台\nhttps://example.com/Visible');
    assert.equal(result.mail.risk, 'high');
    assert.deepEqual(Array.from(result.targets), ['https://example.com/Visible']);
    const high = helpers.localScreenshotReport(result.mail);
    const empty = helpers.assessCorrectedScreenshotText('');
    assert.equal(helpers.preserveLocalScreenshotReport(high, helpers.localScreenshotReport(empty.mail)), high);
    assert.equal(helpers.assessCorrectedScreenshotText('x'.repeat(22000)).text.length, 20000);
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
            createScreenshotPreview: async () => 'data:image/png;base64,test',
            setMessages: update => { messages = update(messages); }, setIsTyping() {},
            analyzeLocalScreenshot: async () => ({ mail, targets: ['https://example.com/Visible'], methods: [{ id: 'local-method' }] }),
            localScreenshotReport: helpers.localScreenshotReport, getScreenshotUrls: helpers.getScreenshotUrls,
            scanUrlForBot: async (target, context, allowCloudAi) => { assert.equal(allowCloudAi, false); scans.push(target); },
            requestScreenshotAnalysis() { assert.fail('chat must not automatically call vision AI'); }
        };
        vm.runInNewContext(source + '\nthis.upload = handleBotImageUpload;', context);
        await context.upload({ target: { files: [{ size: 100 }], value: '' } });
        assert.ok(messages.some(message => message.content === emailRisk.report(mail)));
        assert.ok(messages.every(message => message.localOnly === true));
        assert.ok(messages.some(message => message.methods?.[0]?.id === 'local-method'));
        assert.deepEqual(scans, ['https://example.com/Visible']);
    }
});

test('local OCR, corrected text and copied references include reviewed methods but keep risk independent', async () => {
    const search = require('../article-search.js');
    const helpers = browserHelpers({ window: { EmailRisk: require('../email-risk.js'),
        ArticleSearch: { ...search, searchMethods: lines => search.searchMethods(lines, { now: Date.parse('2026-09-15') }) },
        BarcodeDetector: class { async detect() { return []; } }, jsQR: () => null,
        Tesseract: { recognize: async () => ({ data: { confidence: 95, text: '家庭代工請寄送金融卡' } }) } },
        createImageBitmap: async () => ({ width: 100, height: 100, close() {} }) });
    const result = await helpers.analyzeLocalScreenshot({});
    assert.equal(result.methods[0]?.id, '165-job-account');
    const copy = helpers.screenshotReferencesText([], result.methods);
    assert.match(copy, /不代表 165 已查證/);
    assert.match(copy, /165dashboard.tw\/fraud-method\/325471681525059584/);
    assert.match(copy, /索引核對日期/);
    assert.equal(helpers.assessCorrectedScreenshotText('無關內容').methods.length, 0);
});
