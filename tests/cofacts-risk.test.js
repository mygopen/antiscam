const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const syncModulePromise = import(pathToFileURL(path.join(repoRoot, 'scripts/sync-cofacts-risk-signals.mjs')).href);
const endpointModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/check-cofacts.js')).href);

function makeArticle(overrides = {}) {
    return {
        id: 'article-1',
        text: '請查核 https://example-scam.test/order?id=1&utm_source=line',
        status: 'NORMAL',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
        replyCount: 0,
        replyRequestCount: 1,
        articleReplies: [],
        ...overrides
    };
}

function makeReply({ type = 'RUMOR', text = '這是假消息', positive = 0, negative = 0 } = {}) {
    return {
        replyId: `reply-${type}-${positive}-${negative}-${text}`,
        replyType: type,
        status: 'NORMAL',
        positiveFeedbackCount: positive,
        negativeFeedbackCount: negative,
        reply: {
            id: 'reply',
            type,
            text,
            reference: 'https://example.org/source',
            status: 'NORMAL'
        }
    };
}

test('單一 Cofacts 回報沒有查核回應時只給低度風險訊號', async () => {
    const { classifyCofactsArticle } = await syncModulePromise;
    const result = classifyCofactsArticle(makeArticle(), '2026-07-17T00:00:00.000Z');

    assert.equal(result.level, 'reported');
    assert.equal(result.riskScore, 15);
    assert.equal(result.strongRisk, false);
    assert.equal(result.replyRequestCount, 1);
});

test('多人要求查核但尚無結論時最高維持中低度提醒', async () => {
    const { classifyCofactsArticle } = await syncModulePromise;
    const result = classifyCofactsArticle(makeArticle({ replyRequestCount: 4 }), '2026-07-17T00:00:00.000Z');

    assert.equal(result.level, 'multiple-reports');
    assert.equal(result.riskScore, 25);
    assert.equal(result.strongRisk, false);
});

test('一般 RUMOR 回應不直接等同詐騙', async () => {
    const { classifyCofactsArticle } = await syncModulePromise;
    const result = classifyCofactsArticle(makeArticle({
        replyCount: 1,
        articleReplies: [makeReply({ text: '內容中的日期與統計數字不正確' })]
    }), '2026-07-17T00:00:00.000Z');

    assert.equal(result.level, 'rumor');
    assert.equal(result.riskScore, 40);
    assert.equal(result.scamSpecificReplyCount, 0);
    assert.equal(result.strongRisk, false);
});

test('明確詐騙查核且獲社群支持才成為強風險訊號', async () => {
    const { classifyCofactsArticle } = await syncModulePromise;
    const result = classifyCofactsArticle(makeArticle({
        replyCount: 1,
        articleReplies: [makeReply({ text: '這是一頁式購物詐騙網站，請勿付款', positive: 3, negative: 0 })]
    }), '2026-07-17T00:00:00.000Z');

    assert.equal(result.level, 'supported-scam');
    assert.equal(result.riskScore, 65);
    assert.equal(result.strongRisk, true);
});

test('RUMOR 與 NOT_RUMOR 並存時改列歧異，不自動升高風險', async () => {
    const { classifyCofactsArticle } = await syncModulePromise;
    const result = classifyCofactsArticle(makeArticle({
        replyCount: 2,
        articleReplies: [
            makeReply({ type: 'RUMOR', text: '這是詐騙網站', positive: 5 }),
            makeReply({ type: 'NOT_RUMOR', text: '這是合法商家官方網站', positive: 2 })
        ]
    }), '2026-07-17T00:00:00.000Z');

    assert.equal(result.level, 'conflicting');
    assert.equal(result.riskScore, 10);
    assert.equal(result.strongRisk, false);
});

test('共用架站平台與短網址只比對完整網址，不封鎖整個根網域', async () => {
    const { articleToRiskSignals } = await syncModulePromise;
    const [record] = articleToRiskSignals(makeArticle({
        text: '請查核 https://fake-shop.weebly.com/order?id=1'
    }), '2026-07-17T00:00:00.000Z');

    assert.equal(record.rootDomain, 'weebly.com');
    assert.equal(record.matchScope, 'url');
});

test('每週重新核對時會移除已刪除或已封鎖的追蹤案件', async () => {
    const { articleToRiskSignals, mergeCofactsRiskSignals } = await syncModulePromise;
    const checkedAt = '2026-07-17T00:00:00.000Z';
    const [existingRecord] = articleToRiskSignals(makeArticle(), checkedAt);
    const merged = mergeCofactsRiskSignals(
        [existingRecord],
        [],
        '2026-07-24T00:00:00.000Z',
        ['article-1']
    );

    assert.deepEqual(merged, []);
});

test('Cofacts 網址比對會忽略廣告追蹤參數但保留訂單識別參數', async () => {
    const { normalizeCofactsUrl } = await endpointModulePromise;
    const first = normalizeCofactsUrl('http://jsizg.com/index.php?m=Order&id=mxwsh01&tpl=detail&ldtag_cl=old&lt_r=203');
    const second = normalizeCofactsUrl('https://www.jsizg.com/index.php?tpl=detail&id=mxwsh01&m=Order&utm_source=line');

    assert.equal(first, second);
    assert.match(first, /id=mxwsh01/);
    assert.doesNotMatch(first, /ldtag|utm_/);
});

test('人工 Cofacts 案例可比對原網域與子網域，但不誤中惡意後綴', async () => {
    const { findCofactsMatches, summarizeCofactsMatches } = await endpointModulePromise;
    const now = Date.parse('2026-07-17T00:00:00.000Z');
    const exactMatches = findCofactsMatches({
        domain: 'www.jsizg.com',
        targetUrl: 'https://www.jsizg.com/index.php?tpl=detail&id=mxwsh01&m=Order&utm_source=line',
        now
    });
    const subdomainMatches = findCofactsMatches({ domain: 'shop.jsizg.com', targetUrl: 'https://shop.jsizg.com/', now });
    const suffixMatches = findCofactsMatches({ domain: 'jsizg.com.safe.example', targetUrl: 'https://jsizg.com.safe.example/', now });
    const summary = summarizeCofactsMatches(exactMatches);

    assert.equal(exactMatches.length, 1);
    assert.equal(exactMatches[0].matchType, 'url');
    assert.equal(subdomainMatches.length, 1);
    assert.equal(suffixMatches.length, 0);
    assert.equal(summary.riskScore, 15);
    assert.equal(summary.strongRisk, false);
});

test('Cofacts API 回應包含原始案件、授權及顯名資訊', async () => {
    const { onRequest } = await endpointModulePromise;
    const response = await onRequest({
        request: new Request('https://example.com/api/check-cofacts?domain=jsizg.com&url=https%3A%2F%2Fjsizg.com%2F')
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.matched, true);
    assert.equal(payload.riskScore, 15);
    assert.equal(payload.matches[0].articleUrl, 'https://cofacts.tw/article/1j8omfqn1ewsm');
    assert.equal(payload.attribution.license, 'CC BY-SA 4.0');
    assert.match(payload.attribution.text, /Cofacts 真的假的/);
});
