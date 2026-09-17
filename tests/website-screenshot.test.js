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

const fetcForm = '遠通電收\n車號查詢\n請輸入欲查詢的車號\n車主身分證或統一編號\n查詢';
test('FETC identity mismatch with plate and identity fields is high risk without any password', () => {
    const r = W.assess(rows(fetcForm), address('unrelated.example'), { now });
    assert.equal(r.risk, 'high');
    assert.equal(r.brand, '遠通電收');
    assert.equal(r.credentials, true);
    assert.match(W.report(r), /https:\/\/www.fetc.net.tw\//);
    assert.doesNotMatch(W.report(r), /財政部|寄件線索/);
    assert.equal(W.assess(rows(fetcForm.replace('遠通電收', '申辦eTag銀行自動儲值')), address('unrelated.example'), { now }).risk, 'high');
});
test('FETC official services and related domains are not impersonation proof or blanket safe', () => {
    for (const host of [...W.fetc.hosts, ...W.fetc.relatedHosts, 'other.fetc.net.tw', 'new.utaggo.com.tw']) {
        const r = W.assess(rows(fetcForm), address(host), { now });
        assert.equal(r.risk, 'unknown');
        assert.equal(r.officialMatched, W.fetc.hosts.includes(host));
    }
    for (const host of ['www.fetc.net.tw.evil.example', 'notfetc.net.tw', 'utaggo.com.tw.evil.example']) {
        assert.equal(W.assess(rows(fetcForm), address(host), { now }).risk, 'high');
    }
});
test('FETC screenshot rule requires all evidence and fresh mapping', () => {
    for (const text of ['遠通電收\n車號查詢', '車號查詢\n身分證', '遠通電收', '防詐宣導\n' + fetcForm]) {
        assert.notEqual(W.assess(rows(text), address('unrelated.example'), { now })?.risk, 'high');
    }
    assert.equal(W.assess(rows(fetcForm), [], { now }).risk, 'unknown');
    assert.equal(W.assess(rows(fetcForm), address('unrelated.example'), { now: Date.parse('2028-01-01') }).risk, 'unknown');
    assert.equal(W.assess(rows(fetcForm).map(r => ({ ...r, confidence: 50 })), address('unrelated.example'), { now }).risk, 'unknown');
});
test('toolbar @ glyphs cannot trigger mail correction, real labelled senders can', () => {
    const bbox = { x0: 10, x1: 900, y0: 2200, y1: 2300 };
    assert.equal(W.mailRetryAllowed({ text: '@ @', bbox }, 2400), false);
    assert.equal(W.mailRetryAllowed({ text: 'x@foo.com', bbox }, 2400), false);
    assert.equal(W.mailRetryAllowed({ text: '寄件者: x@foo.com', bbox }, 2400), true);
    assert.equal(W.mailRetryAllowed({ text: 'x @ foo.com', bbox: { ...bbox, y0: 500, y1: 600 } }, 2400), true);
});
test('fallback searches bounded top and bottom bands without an initial OCR URL', () => {
    const regions = W.fallbackRegions(1125, 2436);
    assert.equal(regions.length, 2);
    assert.ok(regions[0].y1 < 2436 * 0.22);
    assert.ok(regions[1].y0 > 2436 * 0.82);
    for (const [w, h] of [[0, 0], [100, 200], [2000, 1000], [NaN, 1000]]) assert.deepEqual(W.fallbackRegions(w, h), []);
});
