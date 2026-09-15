const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Search = require('../article-search.js');
const EmailRisk = require('../email-risk.js');
const { compileMethods, safeMethodUrl } = require('../scripts/lib/fraud-method-catalog.cjs');
const data = require('../data/fraud-method-reviews.json');
const now = Date.parse('2026-09-15');
const rows = text => text.split('\n').map(text => ({ text, confidence: 95 }));
const search = (text, options = {}) => Search.searchMethods(rows(text), { now, ...options });
const cases = [
    ['165-phishing', '財政部退稅，請點擊以下連結輸入信用卡'],
    ['165-fake-buyer', '賣場無法收款，請操作網銀進行認證'],
    ['165-job-account', '家庭代工職缺，請寄送金融卡'],
    ['165-investment-fees', '投資平台無法出金，請先繳納稅金'],
    ['165-fake-authority', '檢察官通知，偵查不公開，請交付存款']
];

for (const [id, text] of cases) test(`reviewed method: ${id}`, () => {
    const input = rows(text);
    const before = structuredClone(input);
    const riskBefore = EmailRisk.assess(input);
    const result = Search.searchMethods(input, { now });
    assert.equal(result[0]?.id, id);
    assert.equal(result[0].source, '165');
    assert.ok(result[0].reasons.length >= 2);
    assert.ok(result[0].advice);
    assert.equal(result[0].risk, undefined);
    assert.equal(result[0].publishedAt, undefined, 'do not invent publication date');
    assert.deepEqual(input, before);
    assert.deepEqual(EmailRisk.assess(input), riskBefore, 'recommendations never modify risk');
});

for (const text of [
    'LINE 退款 實名認證',
    '家庭代工請提供薪資入帳帳號',
    '賣家認證請自行開啟官方App',
    '國稅局退稅請登入官方網站查詢',
    '投資出金手續費依原契約扣除',
    '法院通知開庭，請準時到場',
    '家庭代工請勿寄送金融卡',
    '家庭代工不需要寄送金融卡',
    '家庭代工不會以任何形式要求您寄送金融卡',
    '賣場無法收款，不要操作網銀',
    '投資無法出金，不需先繳納稅金',
    '檢察官提醒偵查不公開，但不會要求交付存款',
    '財政部退稅請點擊以下連結，不要輸入信用卡',
    '財政部退稅請勿點擊以下連結輸入信用卡',
    'https://evil.example/家庭代工/寄送金融卡',
    'job@家庭代工.example 寄送金融卡'
]) test(`weak, normal or negated text abstains: ${text}`, () => {
    assert.deepEqual(search(text), []);
});

test('educational examples can provide neutral references, never a risk verdict', () => {
    const text = '防詐宣導：以下是詐騙範例。家庭代工要求寄送金融卡';
    assert.equal(search(text)[0].id, '165-job-account');
    assert.equal(search(text)[0].risk, undefined);
    assert.notEqual(EmailRisk.assess(rows(text)).risk, 'high');
});

test('OCR spacing/wrapping works without assembling across low-confidence gaps', () => {
    assert.equal(search('家 庭 代 工\n請 寄 送 金\n融 卡')[0]?.id, '165-job-account');
    const input = rows('家庭代工\n請寄送金\nmissing\n融卡');
    input[2].confidence = 0;
    assert.deepEqual(Search.searchMethods(input, { now }), []);
    assert.deepEqual(Search.searchMethods([{ text: '家庭代工', confidence: 95 }, { text: '不明', confidence: 10 },
        { text: '請寄送金融卡', confidence: 95 }], { now }), []);
    assert.deepEqual(Search.searchMethods(rows(cases[0][1]).map(row => ({ ...row, confidence: 79 })), { now }), []);
    assert.deepEqual(search('家庭代工\n' + '其他訊息\n'.repeat(10) + '寄送金融卡'), []);
    assert.deepEqual(Search.searchMethods(null, { now }), []);
});

test('repetition and risk-rule bonuses cannot inflate 165 ranking', () => {
    const text = cases[1][1];
    assert.equal(search(text)[0].score, search(text.repeat(3))[0].score);
    assert.deepEqual(search(text), search(text, { ruleIds: ['anything'] }));
    const all = search(cases.map(c => c[1]).join('。'));
    assert.equal(all.length, 2);
    assert.equal(new Set(all.map(m => m.url)).size, all.length);
});

test('source-specific allowlists do not trust lookalikes or arbitrary URLs', () => {
    for (const u of ['https://165dashboard.tw.evil.test/fraud-method/123', 'http://165dashboard.tw/fraud-method/123',
        'https://165dashboard.tw/fraud-method/123?q=x', 'https://name@165dashboard.tw/fraud-method/123',
        'https://165dashboard.tw/other/123', 'javascript:alert(1)']) {
        assert.equal(safeMethodUrl(u), false);
        assert.equal(Search.safeMethodUrl(u), false);
        assert.deepEqual(search(cases[0][1], { catalog: [{ ...Search.methods[0], url: u }] }), []);
    }
    assert.equal(Search.safeUrl(Search.methods[0].url), false);
    assert.equal(Search.safeMethodUrl(Search.articles[0].url), false);
    assert.equal(Search.safeUrl('https://www.mygopen.com/2026/09/Job-posting.html'), true);
});

test('expired, future and withdrawn method records are not recommended', () => {
    for (const override of [{ reviewedAt: '2024-01-01' }, { reviewedAt: '2027-01-01' }, { status: 'withdrawn' }]) {
        assert.deepEqual(search(cases[0][1], { catalog: [{ ...Search.methods[0], ...override }] }), []);
    }
});

test('build validates curated metadata and exposes no reviewer or unreviewed entries', () => {
    assert.equal(compileMethods(data).length, 5);
    assert.ok(compileMethods(data).every(m => !('reviewer' in m)));
    const make = () => structuredClone(data);
    for (const mutate of [
        d => { d.methods[0].url = 'https://evil.test/'; },
        d => { d.methods[0].required = ['pretext', 'pretext']; },
        d => { d.methods[0].groups[0].terms = ['a']; },
        d => { d.methods[0].groups[0].weight = Infinity; },
        d => { d.methods[0].reviewedAt = '2026-02-31'; },
        d => { d.methods[0].status = 'pending'; },
        d => { d.methods.push(d.methods[0]); }
    ]) { const d = make(); mutate(d); assert.throws(() => compileMethods(d), /invalid_method/); }
    const withdrawn = make(); withdrawn.methods[0].status = 'withdrawn';
    assert.equal(compileMethods(withdrawn).length, 4);
});

test('browser missing-method catalog abstains without network access', () => {
    const context = vm.createContext({ URL, fetch() { assert.fail('no network'); } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../article-search.js'), 'utf8'), context);
    assert.equal(context.ArticleSearch.searchMethods(rows(cases[0][1]), { now }).length, 0);
});
