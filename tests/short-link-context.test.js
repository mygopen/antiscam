const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser } = require('linkedom');
const { fixtureCore, createCore, policy } = require('./helpers/production-core.cjs');

for (const path of ['/c310jT', '/c310jt', '/other']) {
    test(`MyPPT short code scope: ${path}`, async () => {
        const { core } = fixtureCore();
        const result = await core.runRiskScanSafely('myppt.cc', `https://myppt.cc${path}`, []);
        assert.equal(result.unresolvedShortener, true);
        assert.match(result.shortLinkNotice, /詐騙集團可能濫用/);
        assert.equal(result.assessment, path === '/c310jT' ? 'high' : 'unknown');
        assert.equal(Boolean(result.reportedShortLink), path === '/c310jT');
        if (result.reportedShortLink) assert.match(result.checks.reportedShortLink.details, /尚未獨立查證/);
    });
}
test('reported short code persists when destination changes; provider trust cannot erase report', async () => {
    const { core } = fixtureCore({ trace: { resolvedDestination: true, redirectCount: 1, finalUrl: 'https://www.cht.com.tw/', chain: [] } });
    const result = await core.runRiskScanSafely('myppt.cc', 'https://myppt.cc/c310jT?utm_source=line', []);
    assert.equal(result.primaryDomain, 'cht.com.tw');
    assert.equal(result.assessment, 'high');
    assert.equal(result.isTrustedAllowlist, false);
});
test('other MyPPT link resolves and uses destination scoring without provider-wide blocking', async () => {
    const { core } = fixtureCore({ trace: { resolvedDestination: true, redirectCount: 1, finalUrl: 'https://www.cht.com.tw/', chain: [] } });
    const result = await core.runRiskScanSafely('myppt.cc', 'https://myppt.cc/legitimate', []);
    assert.equal(result.assessment, 'low');
    assert.equal(result.reportedShortLink, undefined);
    assert.match(result.shortLinkNotice, /本身不等於詐騙/);
});
function analyze(html, url = 'https://competition.example/') {
    return policy.analyzeVotePage(new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html'), url);
}
test('vote and direct LINE credential form on unrelated host is strong evidence', () => {
    const result = analyze('<h1>繪畫比賽投票</h1><form>LINE 登入<input type="password"></form>');
    assert.equal(result.status, 'danger');
    const core = createCore();
    const scan = core.enforceFinalRiskConsistency({ riskScore: 0, isTrustedAllowlist: true, checks: {}, details: { siteStatus: { status: 'ok', pageSignals: { voteAccountSignals: result } } } });
    assert.equal(scan.assessment, 'high');
    assert.equal(scan.isTrustedAllowlist, false);
});
test('legitimate voting, hosted picture and LINE OAuth are not automatically high risk', () => {
    assert.equal(analyze('<h1>繪畫比賽</h1><button>投票</button>').status, 'none');
    assert.equal(analyze('<img alt="旅遊照片">').status, 'none');
    assert.equal(analyze('<h1>繪畫比賽</h1><a href="https://access.line.me/oauth2/authorize">LINE 登入</a>').status, 'warning');
    assert.equal(analyze('<h1>投票</h1><form>LINE<input type="password"></form>', 'https://access.line.me/oauth2/authorize').status, 'none');
    assert.notEqual(analyze('<h1>投票</h1><form>會員登入<input type="password"></form><footer>LINE 客服</footer>').status, 'danger');
});
