const test = require('node:test');
const assert = require('node:assert/strict');
const EmailRisk = require('../email-risk.js');
const RuntimeSearch = require('../article-search.js');
// Retrieval fixtures remain testable when changed live sources are withheld.
const fixtureCatalog = require('../data/mygopen-reviews.json').articles;
const Search = { ...RuntimeSearch, articles: fixtureCatalog,
    search: (rows, options) => RuntimeSearch.search(rows, { catalog: fixtureCatalog, ...options }) };
const now = Date.parse('2026-09-15');
const rows = text => text.split('\n').map(text => ({ text, confidence: 95 }));
const example = '接下來有工作需要與你協調處理，請先建立一個 LINE 群組，並將邀請 QR Code 傳送至此 Email。先不要邀請其他人員加入，待我進群後，再安排相關工作事項，謝謝。';
const search = (text, options = {}) => Search.search(rows(text), { now, ...options });

test('work group screenshot matches evidence rule and canonical article without claiming sender authentication', () => {
    const assessment = EmailRisk.assess(rows(example));
    assert.equal(assessment.risk, 'high');
    assert.equal(assessment.ruleId, 'message-work-group-qr-v1');
    assert.equal(assessment.authentication, 'not_available_from_screenshot');
    assert.match(assessment.analysis, /不代表已發生匯款/);
    assert.match(assessment.advice, /原本掌握的電話/);
    const articles = search(example, { ruleIds: assessment.ruleMatches.map(rule => rule.id) });
    assert.equal(articles.length, 1);
    assert.equal(articles[0].url, 'https://www.mygopen.com/2025/12/email-qrcode.html');
    assert.equal(articles[0].matchType, 'rule');
});

test('real OCR-style Chinese spacing and trailing newlines retain group evidence', () => {
    const input = [
        '接 下 來 有 工作 需要 與 你 協調 處 理 , 請 先 建立\n',
        '一 個 LINE 群 組 , 並 將 邀請 QRCode 傳送 至\n',
        '此 Email。 先 不 要 邀請 其 他 人 員 加 入 , 待 我\n',
        '進 群 後 , 再 安排 相 關 工作 事項 , 謝 謝 。\n'
    ].map(text => ({ text, confidence: 93 }));
    assert.equal(EmailRisk.assess(input).risk, 'high');
    assert.equal(Search.search(input, { now })[0]?.id, 'work-group-qr');
});

for (const text of [
    '公司工作安排\n請先建立一個LINE群組\n請將邀請QR Code寄回此信箱\n先不要邀請其他人加入',
    '工作安排，麻煩創建一個Line群聊，請把二維碼轉寄到此郵箱，暫時不要邀請其他同事加入。',
    '工作安排，請先建立一個 LINE\n群組，並將邀請 QR\nCode 傳送至此 Email。先不要邀請其他人加入。'
]) test(`wrapped or variant group instructions: ${text.slice(0, 15)}`, () => {
    assert.equal(EmailRisk.assess(rows(text)).risk, 'high');
    assert.equal(search(text)[0]?.id, 'work-group-qr');
});

for (const text of [
    '公司工作安排，請建立LINE群組，邀請全部同事加入。',
    '請掃描 QR Code 點餐',
    '公司工作安排，請建立LINE群組，請勿將QR Code回傳到此Email，先不要邀請其他人加入。',
    '防詐宣導\n' + example,
    '詐騙範例：' + example
]) test(`benign or quoted group text is not high risk: ${text.slice(0, 15)}`, () => {
    assert.notEqual(EmailRisk.assess(rows(text)).risk, 'high');
});

test('incomplete or low-confidence screenshots abstain; article retrieval does not change risk', () => {
    const incomplete = '工作安排，請先建立LINE群組，請將QR Code回傳至此Email。';
    const assessment = EmailRisk.assess(rows(incomplete));
    assert.equal(assessment.risk, 'unknown');
    assert.equal(search(incomplete)[0].id, 'work-group-qr');
    assert.equal(assessment.risk, 'unknown');
    const low = rows(example).map(row => ({ ...row, confidence: 40 }));
    assert.equal(EmailRisk.assess(low).risk, 'unknown');
    assert.deepEqual(Search.search(low, { now }), []);
    assert.deepEqual(search('LINE QR Code'), []);
    assert.deepEqual(search('主管'), []);
    assert.deepEqual(search('不相干的旅遊照片'), []);
});

test('Chinese phrase ranking supports reviewed topics and never returns arbitrary OCR links', () => {
    for (const [text, id] of [
        ['財政部綜合所得稅溢繳退稅，最終通知，確認帳戶資料', 'tax-email'],
        ['賣貨便實名認證，請先匯款認證金', 'myship-verification'],
        ['親戚家小孩繪畫比賽，輸入LINE簡訊驗證碼', 'vote-account'],
        ['臺電電費溢收，點選連結退款', 'taipower-refund']
    ]) assert.equal(search(text)[0]?.id, id);
    assert.deepEqual(search('https://evil.example/財政部/退稅/最終通知'), []);
});

test('early artwork vote requests recommend the reviewed article without inventing login evidence', () => {
    // Synthetic OCR wrapping, including an unreadable preview and a split word.
    const input = rows('麻煩你了\n一天可以投票，請支持\n謝謝\n確定是這個作\n品\npreview\nart\nimage\n創意繪畫比賽');
    for (const i of [5, 6, 7]) input[i].confidence = 25;
    const result = RuntimeSearch.search(input, { now });
    assert.equal(result[0]?.url, 'https://www.mygopen.com/2026/08/vote-scam.html');
    assert.deepEqual(result[0].reasons, ['投票邀請', '作品或繪畫比賽', '請託幫忙']);
    assert.equal(EmailRisk.assess(input).risk, 'unknown');
});

test('early vote recommendation requires all three nearby readable concepts', () => {
    for (const text of ['投票', '創意繪畫比賽', '麻煩你幫我投票', '投票支持作品', '麻煩你看看我的作品']) {
        assert.ok(!search(text).some(a => a.id === 'vote-account'));
    }
    const input = rows('麻煩你投票\nunreadable\n作品');
    input[1].confidence = 20;
    assert.ok(!Search.search(input, { now }).some(a => a.id === 'vote-account'));
    assert.ok(!search('麻煩你投票\n' + '其他內容\n'.repeat(8) + '作品').some(a => a.id === 'vote-account'));
    assert.ok(!Search.search(rows('麻煩你投票支持作品').map(r => ({ ...r, confidence: 79 })), { now }).length);
});

test('normal contest requests can receive related reading but never become high risk from retrieval', () => {
    const input = rows('學校公開繪畫比賽，麻煩你幫作品投票。無需登入或提供驗證碼。');
    const before = EmailRisk.assess(input);
    assert.ok(Search.search(input, { now }).some(a => a.id === 'vote-account'));
    assert.notEqual(before.risk, 'high');
    assert.deepEqual(EmailRisk.assess(input), before);
});

test('early vote alternatives retain source review and publication gates', () => {
    const article = Search.articles.find(a => a.id === 'vote-account');
    for (const override of [{ status: 'withdrawn' }, { reviewedAt: '2024-01-01' }, { publishedAt: '2027-01-01' }]) {
        assert.deepEqual(search('麻煩你投票支持作品', { catalog: [{ ...article, ...override }] }), []);
    }
});

test('repetition cannot raise concept scores and old/unreviewed/foreign URLs are excluded', () => {
    assert.equal(search(example)[0].score, search(example.repeat(2))[0].score);
    const article = Search.articles[0];
    for (const override of [{ status: 'pending' }, { status: 'withdrawn' }, { reviewedAt: '2024-01-01' },
        { reviewedAt: '2027-01-01' }, { url: 'https://www.mygopen.com.evil.example/2025/12/email-qrcode.html' },
        { url: 'javascript:alert(1)' }]) {
        assert.deepEqual(search(example, { catalog: [{ ...article, ...override }] }), []);
    }
    const multiple = Array.from({ length: 6 }, (_, i) => ({ ...article, id: 'copy' + i,
        url: `https://www.mygopen.com/2025/12/article-${i}.html` }));
    assert.equal(search(example, { catalog: multiple }).length, 3);
    assert.equal(search(example, { catalog: [article, article] }).length, 1);
});

test('no phrase is reconstructed across an unreadable OCR line or distant blocks', () => {
    const input = rows('工作安排 LINE\nmissing\n群組 QRCode');
    input[1].confidence = 0;
    assert.deepEqual(Search.search(input, { now }), []);
    assert.deepEqual(search('財政部\n' + '其他內容\n'.repeat(10) + '退稅 最終通知'), []);
});

test('reviewed catalog has unique IDs, dates, safe URLs and required concepts', () => {
    assert.equal(new Set(Search.articles.map(a => a.id)).size, Search.articles.length);
    for (const article of Search.articles) {
        assert.ok(Search.safeUrl(article.url));
        assert.ok(Number.isFinite(Date.parse(article.publishedAt)));
        assert.ok(article.required.length >= 2);
        assert.ok(article.required.every(id => article.groups.some(group => group.id === id)));
    }
});
