const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../website-screenshot.js');
const now = Date.parse('2026-09-17');
const rows = text => text.split('\n').map(text => ({ text, confidence: 95 }));
const login = '財政部\n電子發票整合服務平台\n手機號碼\n驗證碼（密碼）\n圖形驗證碼\n手機條碼';
const address = host => [{ host, verified: true }];
const data = (host, confidence = 95) => ({ words: [{ text: host, confidence, symbols: [...host].map(text => ({ text, confidence })) }] });

test('invoice impersonation requires identity, confirmed address mismatch and credential context', () => {
    const result = W.assess(rows(login), address('invoice-fake.example'), { now });
    assert.equal(result.risk, 'high');
    assert.equal(result.kind, 'website');
    assert.match(W.report(result), /網站登入頁截圖/);
    assert.doesNotMatch(W.report(result), /寄件者|寄件線索/);
    assert.match(result.advice, /不等於簡訊 OTP/);
    for (const text of ['電子發票整合服務平台', '手機號碼\n驗證碼（密碼）\n手機條碼',
        '私人 E-Invoice Platform\n手機號碼\n驗證碼（密碼）\n手機條碼']) {
        assert.notEqual(W.assess(rows(text), address('invoice-fake.example'), { now })?.risk, 'high');
    }
});
test('official hosts match exactly and never prove screenshot safety', () => {
    for (const host of W.official.hosts) {
        const result = W.assess(rows(login), address(host), { now });
        assert.equal(result.officialMatched, true);
        assert.equal(result.risk, 'unknown');
    }
    for (const host of ['www.einvoice.nat.gov.tw.evil.example', 'fake-einvoice.nat.gov.tw', 'invoice-other.gov.tw']) {
        assert.equal(W.assess(rows(login), address(host), { now }).risk, 'high');
    }
});
test('ambiguous, missing, stale or low-confidence evidence abstains', () => {
    assert.equal(W.assess(rows('防詐宣導\n' + login), address('fake.example'), { now }).risk, 'unknown');
    for (const addresses of [[], [{ host: 'fake.example', verified: false }], [...address('fake.example'), ...address('other.example')]]) {
        assert.equal(W.assess(rows(login), addresses, { now }).risk, 'unknown');
    }
    assert.equal(W.assess(rows(login).map(r => ({ ...r, confidence: 50 })), address('fake.example'), { now }).risk, 'unknown');
    for (const date of ['2026-09-01', '2028-01-01']) {
        assert.equal(W.assess(rows(login), address('fake.example'), { now: Date.parse(date) }).risk, 'unknown');
    }
});
test('two independent address passes must agree with reliable domain characters', () => {
    assert.equal(W.consensus(data('fake.example'), data('fake.example')), 'fake.example');
    assert.equal(W.consensus(data('fake.example'), data('foke.example')), null);
    assert.equal(W.consensus(data('fake.example', 79), data('fake.example')), null);
    const weak = data('fake.example'); weak.words[0].symbols[2].confidence = 40;
    assert.equal(W.consensus(weak, data('fake.example')), null);
    assert.equal(W.consensus({ lines: [{ text: 'fake.example', confidence: 95 }] }, data('fake.example')), null);
    assert.equal(W.consensus({ words: [...data('fake.example').words, ...data('other.example').words] }, data('fake.example')), null);
});
test('address candidates require bounded top or bottom geometry and exclude email', () => {
    const line = (text, y) => ({ text, bbox: { x0: 20, x1: 400, y0: y, y1: y + 30 } });
    assert.equal(W.addressRows([line('example.com', 100)], 2000).length, 1);
    assert.equal(W.addressRows([line('example.com', 1800)], 2000).length, 1);
    for (const r of [line('example.com', 900), line('sender@example.com', 100), { text: 'example.com' }]) {
        assert.equal(W.addressRows([r], 2000).length, 0);
    }
    assert.equal(W.addressRows(Array(10).fill(line('example.com', 100)), 2000).length, 2);
});
test('telephone and captcha values are not included in structured website evidence or report', () => {
    const result = W.assess(rows(login + '\n0912345678\n45678'), address('fake.example'), { now });
    assert.doesNotMatch(JSON.stringify(result) + W.report(result), /0912345678|45678/);
});
