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
