const assert = require('node:assert/strict');
const test = require('node:test');
const { fixtureCore, createCore, policy } = require('./helpers/production-core.cjs');
async function scan(options = {}, target = 'https://www.cht.com.tw/') {
    const { core } = fixtureCore(options);
    return core.enforceFinalRiskConsistency(await core.runRiskScanSafely(new URL(target).hostname, target, ['cht.com.tw']));
}
test('production flow: trusted official site with completed checks is low risk', async () => {
    assert.equal((await scan()).assessment, 'low');
});
for (const [name, options] of Object.entries({ Google: { unsafe: true }, blacklist: { blacklist: true }, official: { officialAlert: true }, cofacts: { cofacts: { status: 'ok', matched: true, strongRisk: true, riskScore: 65, label: 'Supported scam', matches: [] } } })) {
    test(`production flow: ${name} strong threat overrides trusted domain`, async () => {
        const result = await scan(options);
        assert.equal(result.assessment, 'high');
        assert.equal(result.isTrustedAllowlist, false);
        assert.equal(result.riskScore >= 90, true);
    });
}
for (const status of ['disabled', 'unavailable', 'timeout']) {
    test(`production flow: Google ${status} cannot become safe`, async () => {
        const result = await scan({ googleStatus: status });
        assert.equal(result.assessment, 'unknown');
        assert.equal(result.checks.googleSafeBrowsing.status, 'unknown');
    });
}
test('production flow: blocked content is unknown, not low risk', async () => {
    assert.equal((await scan({ content: 'blocked' })).assessment, 'unknown');
});
test('production flow: unresolved official shortener stays unknown across report presentation', async () => {
    const result = await scan({}, 'https://cht.tw/x/b0rts');
    assert.equal(result.unresolvedShortener, true);
    assert.equal(result.assessment, 'unknown');
    assert.equal(policy.presentation(result).label, '資料不足／尚未確認');
});
test('production flow: resolved shortener scores the destination, not the trusted entry point', async () => {
    const destination = 'https://ioppk.eu.cc/vote';
    const result = await scan({ trace: { resolvedDestination: true, redirectCount: 1, finalUrl: destination, isHighRisk: false, chain: [{ url: 'https://cht.tw/x/demo', status: 302 }, { url: destination, status: 200 }], uaComparisonComplete: true } }, 'https://cht.tw/x/demo');
    assert.equal(result.primaryDomain, 'ioppk.eu.cc');
    assert.equal(result.assessment, 'high');
});
test('production flow: disabled Cofacts sync is disclosed, never presented as a clean full search', async () => {
    const result = await scan({ cofacts: { status: 'ok', matched: false, sources: { manual: { records: 1 }, synced: { state: 'disabled', records: 0 } } } });
    assert.equal(result.checks.cofactsReports.status, 'unknown');
    assert.match(result.checks.cofactsReports.details, /未啟用／等待授權/);
});
test('production finalizer preserves strong threats in conditional company results', () => {
    const core = createCore();
    const result = core.enforceFinalRiskConsistency({ riskScore: 20, isConditionalCompanyTrust: true, conditionalCompanyTrustApplied: true, checks: { googleSafeBrowsing: { status: 'danger' } } });
    assert.equal(result.assessment, 'high');
    assert.equal(result.conditionalCompanyTrustApplied, false);
});
