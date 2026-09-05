const assert = require('node:assert/strict');
const test = require('node:test');
const EmailRisk = require('../email-risk.js');
const now = Date.parse('2026-09-05T12:00:00Z');
const lines = text => text.split('\n').map(text => ({ text, confidence: 95 }));
const sample = `eTag 帳戶代扣失敗
收件者 redacted@hotmail.com
遠通電子資訊中心<redacted@upcmail.nl>
other@hotmail.com
停車紀錄資料通知 | 請登入服務平台查詢
請確認相關帳務資訊
停車費用：新臺幣120元整`;
const assess = (text, registry = EmailRisk.brands) => EmailRisk.assess(lines(text), registry, now);

test('de-identified eTag example triggers a combination without any URL', () => {
    const result = assess(sample);
    assert.equal(result.risk, 'high');
    assert.equal(result.ruleId, 'mail-brand-unlisted-payment-login-v1');
    assert.deepEqual(result.addresses.map(a => a.role), ['recipient', 'claimed_sender', 'body']);
    assert.equal(result.senderStatus, 'not_in_verified_records');
    assert.equal(result.authentication, 'not_available_from_screenshot');
    assert.equal(result.vehiclePlate, 'not_visible_in_excerpt');
    assert.equal(result.amounts[0].value, 120);
    assert.doesNotMatch(JSON.stringify(result), /redacted@|other@/);
});

test('unlisted sender, payment failure or amount alone never establishes fraud', () => {
    for (const text of ['eTag\n寄件者: redacted@upcmail.nl', 'eTag 扣款失敗\n120元', 'eTag 請登入服務平台\n120元']) {
        assert.equal(assess(text).risk, 'unknown');
    }
});

test('OCR spacing is normalized without inventing ambiguous email characters', () => {
    const text = 'eTag 帳 戶 代 扣 失 敗\n遠 通 電 子 資 訊 中 心<redacted @ upcmail . nl>\n請 登 入 服 務 平 台';
    assert.equal(assess(text).risk, 'high');
    assert.equal(assess(text).addresses[0].domain, 'upcmail.nl');
    assert.equal(assess(text.replace('upcmail . nl', 'upcmail . n|')).risk, 'unknown');
});

test('recipient and body addresses are never used as sender mismatch evidence', () => {
    assert.equal(assess(sample.replace('遠通電子資訊中心<redacted@upcmail.nl>', '收件者 redacted@upcmail.nl')).risk, 'unknown');
    assert.equal(assess(sample.replace('遠通電子資訊中心<redacted@upcmail.nl>', 'redacted@upcmail.nl')).risk, 'unknown');
    assert.equal(assess(sample.replace('遠通電子資訊中心<redacted@upcmail.nl>', 'From: redacted@upcmail.nl To: recipient@hotmail.com')).risk, 'unknown');
});

test('listed and verified delegated domains are not authenticity guarantees', () => {
    const official = assess(sample.replace('upcmail.nl', 'fetc.net.tw'));
    assert.equal(official.risk, 'unknown');
    assert.equal(official.senderStatus, 'listed_not_authenticated');
    const registry = structuredClone(EmailRisk.brands);
    registry[0].delegatedSenderDomains.push({ domain: 'mail.example.com', includeSubdomains: false });
    assert.equal(assess(sample.replace('upcmail.nl', 'mail.example.com'), registry).risk, 'unknown');
    assert.equal(assess(sample.replace('upcmail.nl', 'fetc.net.tw.evil.com')).risk, 'high');
});

test('explicit education/quoted examples do not trigger the mail combination', () => {
    for (const prefix of ['防詐宣導', '詐騙範例', '以下為詐騙範例']) assert.equal(assess(prefix + '\n' + sample).risk, 'unknown');
    // A generic footer mentioning fraud must not silently exempt an actual email.
    assert.equal(assess(sample + '\n請小心詐騙').risk, 'high');
});

test('low-confidence sender evidence and expired reference data abstain', () => {
    const data = lines(sample);
    data[2].confidence = 70;
    assert.equal(EmailRisk.assess(data, EmailRisk.brands, now).risk, 'unknown');
    assert.equal(EmailRisk.assess(lines(sample), EmailRisk.brands, now + 367 * 86400000).senderStatus, 'stale_reference');
    const separated = lines('eTag 扣款失敗\nFrom:\nblurred\nredacted@upcmail.nl\n請登入服務平台');
    separated[2].confidence = 0;
    assert.equal(EmailRisk.assess(separated, EmailRisk.brands, now).risk, 'unknown');
});

test('vision parser applies the same rule and official URLs cannot override it', async () => {
    const { parseVisionResult, buildReport, geminiSignalPayload } = await import('../functions/api/cf-vision.js');
    const result = parseVisionResult(JSON.stringify({ risk: 'none', readable: true, confidence: 0.95,
        analysis: 'No generic threats', advice: 'Check independently', urls: ['https://www.fetc.net.tw/'], primaryUrl: '', signals: ['none'], mailLines: lines(sample) }));
    assert.equal(result.risk, 'high');
    assert.match(buildReport(result), /疑似冒用遠通/);
    assert.equal(geminiSignalPayload(result), null);
    assert.doesNotMatch(JSON.stringify(result), /redacted@|other@/);
});

test('unreadable sender plus billing/login requests needs content review rather than safe URL-only exit', async () => {
    const text = sample.replace('upcmail.nl', 'upcmaiLnl');
    assert.equal(assess(text).needsContentReview, true);
    const { parseVisionResult } = await import('../functions/api/cf-vision.js');
    const result = parseVisionResult(JSON.stringify({ risk: 'none', readable: true, confidence: 0.95,
        analysis: 'No generic threats', advice: 'Proceed', urls: [], primaryUrl: '', signals: ['none'], mailLines: lines(text) }));
    assert.equal(result.risk, 'unknown');
    assert.match(result.analysis, /寄件資訊尚未可靠確認/);
    assert.notEqual(result.advice, 'Proceed');
});

test('missing and malformed mail lines do not invent evidence', () => {
    for (const value of [undefined, {}, ['hello'], [{ text: 'eTag', confidence: '95' }]]) {
        assert.equal(EmailRisk.assess(value).risk, 'unknown');
    }
});

test('domain-only character confidence excludes the private local part, but requires every domain character', () => {
    const text = 'unreadable@upcmail.nl';
    const word = { text, confidence: 0, symbols: [...text].map((text, i) => ({ text, confidence: i < 12 ? 0 : 95 })) };
    assert.equal(EmailRisk.domainEvidence([word]).length, 0);
    word.symbols = [...text].map((text, i) => ({ text, confidence: i <= 10 ? 0 : 95 }));
    // 'unreadable' is ten characters; the domain starts at offset 11.
    assert.deepEqual(EmailRisk.domainEvidence([word]), [{ domain: 'upcmail.nl', confidence: 95 }]);
    word.symbols[15].confidence = 10;
    assert.deepEqual(EmailRisk.domainEvidence([word]), []);
});

const behaviorCases = [
    ['台電客服\n電費扣款異常\n請回傳簡訊驗證碼給客服', 'message-secret-handoff-v1'],
    ['未知銀行帳戶驗證\n請將OTP傳給客服', 'message-secret-handoff-v1'],
    ['蝦皮訂單誤設分期\n請操作ATM解除分期', 'message-atm-cancel-installment-v1'],
    ['未知平台解除重複扣款\n請登入網路銀行依指示操作', 'message-atm-cancel-installment-v1'],
    ['賣貨便賣家認證\n請先匯款新臺幣1000元', 'message-seller-advance-payment-v1'],
    ['未知平台開通收款\n需要繳交認證金', 'message-seller-advance-payment-v1'],
    ['國泰世華帳戶凍結\n請安裝AnyDesk處理', 'message-financial-remote-control-v1'],
    ['退款處理通知\n請開啟遠端控制', 'message-financial-remote-control-v1'],
];
for (const [text, ruleId] of behaviorCases) test(`local behavior: ${ruleId} / ${text.split('\n')[0]}`, () => {
    const result = assess(text);
    assert.equal(result.risk, 'high');
    assert.ok(result.ruleMatches.some(rule => rule.id === ruleId));
    assert.ok(result.ruleMatches.every(rule => rule.lines.length > 0 && rule.sources.length > 0));
    assert.equal(result.authentication, 'not_available_from_screenshot');
});

const normalCases = [
    '中華電信電子帳單\nFrom: redacted@cht.com.tw\n請登入 https://123.cht.com.tw/Bill 查詢繳費\n請勿回傳驗證碼給任何人',
    '中華電信電子帳單\n請登入 cht.tw/c/0un94 持條碼繳費',
    '國泰世華\n請在您自行開啟的官方 App 輸入驗證碼',
    '國泰世華\n您的驗證碼為 redacted，請勿告知客服',
    '未知銀行\n本公司不會要求您回傳密碼或驗證碼',
    '蝦皮退款已完成\n不要操作ATM解除分期',
    '蝦皮已取消分期\n請登入網路銀行查看交易紀錄',
    '賣貨便賣家認證\n無需先匯款',
    '賣貨便收款已入帳\n提領跨行手續費新臺幣10元',
    '技術支援\n請安裝AnyDesk協助設定印表機',
    '退款通知\n請勿安裝AnyDesk',
    '台電\n電費未繳，若已繳請忽略\n有疑問請洽客服1911',
    '中華郵政\n包裹已送達\n收件人 redacted@unknown.example',
    '中華電信帳單\n請輸入密碼開啟加密PDF帳單',
    '扣款異常\n請登入服務平台',
    '監理服務網\n您的交通罰鍰未繳\n請自行開啟官方網站查詢',
];
for (const text of normalCases) test(`normal/insufficient content abstains: ${text.split('\n')[0]} / ${text.split('\n')[1]}`, () => {
    assert.equal(assess(text).risk, 'unknown');
});

test('educational headings and negative clauses are not positive action evidence', () => {
    for (const [text] of behaviorCases) {
        assert.equal(assess('防詐宣導\n' + text).risk, 'unknown');
        assert.equal(assess('中華電信防詐提醒\n' + text).risk, 'unknown');
        assert.equal(assess(text.replace(/請|需要/g, '請勿')).risk, 'unknown');
    }
    const mixed = assess('客服帳戶驗證\n請勿分享密碼，請回傳OTP給客服');
    assert.equal(mixed.risk, 'high');
    assert.equal(assess('客服帳戶驗證\n請回傳OTP給客服\n勿提供信用卡').risk, 'high');
});

test('low confidence and far apart instructions cannot create a behavior combination', () => {
    const evidence = lines('解除分期\n請操作ATM');
    evidence[1].confidence = 79;
    assert.equal(EmailRisk.assess(evidence, EmailRisk.brands, now).risk, 'unknown');
    assert.equal(assess('解除分期\n' + '不相關說明\n'.repeat(12) + '請操作ATM').risk, 'unknown');
});

test('sourced website references are not fabricated sender authorizations', () => {
    assert.equal(EmailRisk.brands.length, 8);
    for (const brand of EmailRisk.brands) {
        assert.equal(brand.exhaustive, false);
        assert.ok(brand.sources.every(source => new URL(source).protocol === 'https:'));
        assert.ok(brand.websiteDomains.every(entry => entry.source && entry.purpose && entry.includeSubdomains === false));
    }
    for (const name of ['台電', '監理所', '國泰世華', '中華郵政', '賣貨便', '蝦皮']) {
        const result = assess(`${name}扣款失敗\n寄件者: redacted@unknown.example\n請登入服務平台`);
        assert.equal(result.senderStatus, 'no_sender_reference');
        assert.equal(result.risk, 'unknown');
    }
});

test('multiple brands are disclosed without choosing the first brand or asserting sender mismatch', () => {
    const result = assess('中華電信與國泰世華合作通知\nFrom: redacted@cht.com.tw\n扣款失敗\n請登入服務平台');
    assert.equal(result.brands.length, 2);
    assert.equal(result.brand, null);
    assert.equal(result.senderStatus, 'ambiguous_brand');
    assert.equal(result.risk, 'unknown');
    assert.equal(assess('中華電信與國泰世華合作通知\n請將OTP回傳客服').risk, 'high');
});

for (const name of ['台電', '監理服務網', '中華郵政', '蝦皮', '國泰世華', '中華電信']) {
    test(`${name}: service problem + actionable external URL + card request`, () => {
        const result = assess(`${name}退款通知\n請點擊 https://billing.example/Pay?private=secret 申請退款\n請填寫信用卡卡號`);
        assert.equal(result.risk, 'high');
        assert.equal(result.ruleId, 'message-brand-external-card-v1');
        assert.equal(result.linkDestination, 'not_verified');
        assert.equal(result.links[0].domain, 'billing.example');
        assert.deepEqual(result.ruleMatches[0].lines, [1, 2, 3]);
        assert.doesNotMatch(JSON.stringify(result), /private=|secret|\/Pay/);
    });
}

test('external link alone, footer links, recipient domains and unseen destinations cannot establish high risk', () => {
    for (const text of [
        '台電\n請點擊 https://billing.example/',
        '台電退款通知\n請填寫信用卡卡號\n參考資訊 https://billing.example/',
        '台電退款通知\n請填寫信用卡卡號\n請勿點擊 https://billing.example/',
        '台電退款通知\n請填寫信用卡卡號\n請點擊 https://www.taipower.com.tw/',
        '未知公司退款通知\n請填寫信用卡卡號\n請點擊 https://billing.example/',
        '台電退款通知\n請填寫信用卡卡號\n收件者 redacted@billing.example',
    ]) assert.equal(assess(text).risk, 'unknown');
    const spoof = assess('中華電信退款通知\n請點擊 https://123.cht.com.tw.attacker.example/\n請填寫信用卡卡號');
    assert.equal(spoof.risk, 'high');
    const short = assess('中華電信退款通知\n請點擊 https://cht.tw/c/test\n請填寫信用卡卡號');
    assert.equal(short.risk, 'unknown');
    assert.equal(short.linkDestination, 'not_verified');
    for (const [brand, host] of [['中華電信', 'member.cht.com.tw'], ['國泰世華', 'www.cathay-cube.com.tw'], ['台電', 'taipower.com.tw'], ['國泰世華', 'cathaybk.tw']]) {
        assert.equal(assess(`${brand}退款通知\n請點擊 https://${host}/\n請填寫信用卡卡號`).risk, 'unknown');
    }
});

test('unexpired data is required for branded external URL rules, but not universal behavior rules', () => {
    const future = now + 367 * 86400000;
    assert.equal(EmailRisk.assess(lines('台電退款通知\n請點擊 https://billing.example/\n請填寫信用卡卡號'), EmailRisk.brands, future).risk, 'unknown');
    assert.equal(EmailRisk.assess(lines(behaviorCases[0][0]), EmailRisk.brands, future).risk, 'high');
});

test('URL query punctuation and instruction-like path contents are not behavior evidence', () => {
    assert.equal(assess('台電退款通知\n請點擊 https://billing.example/a?notice=never\n請填寫信用卡卡號').risk, 'high');
    assert.equal(assess('https://billing.example/帳戶驗證請回傳OTP給客服').risk, 'unknown');
});

test('model-safe result cannot downgrade cross-brand behavior evidence or unresolved actions', async () => {
    const { parseVisionResult } = await import('../functions/api/cf-vision.js');
    const parse = text => parseVisionResult(JSON.stringify({ risk: 'none', readable: true, confidence: 0.95,
        analysis: 'Looks safe', advice: 'Proceed', urls: ['https://www.cathaybk.com.tw/'], primaryUrl: '', signals: ['none'], mailLines: lines(text) }));
    assert.equal(parse(behaviorCases[6][0]).risk, 'high');
    assert.equal(parse('未知品牌退款通知\n請填寫信用卡卡號\n請點擊 https://billing.example/').risk, 'unknown');
});
