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
for (const [name, options] of Object.entries({ Google: { unsafe: true }, blacklist: { blacklist: true }, official: { officialAlert: true } })) {
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
    assert.equal(policy.presentation(result).label, '資訊不足／尚未確認');
});
test('production flow: resolved shortener scores the destination, not the trusted entry point', async () => {
    const destination = 'https://ioppk.eu.cc/vote';
    const result = await scan({ trace: { resolvedDestination: true, redirectCount: 1, finalUrl: destination, isHighRisk: false, chain: [{ url: 'https://cht.tw/x/demo', status: 302 }, { url: destination, status: 200 }], uaComparisonComplete: true } }, 'https://cht.tw/x/demo');
    assert.equal(result.primaryDomain, 'ioppk.eu.cc');
    assert.equal(result.assessment, 'high');
});
test('production flow: removed community integration has no requests or indicators', async () => {
    const { core, requests } = fixtureCore();
    const result = await core.runRiskScanSafely('www.cht.com.tw', 'https://www.cht.com.tw/', ['cht.com.tw']);
    assert.equal(requests.some(url => /cofacts/i.test(url)), false);
    assert.equal(/cofacts/i.test(JSON.stringify(result)), false);
    assert.equal(core.checkCofactsRiskSignals, undefined);
});
test('production finalizer preserves strong threats in conditional company results', () => {
    const core = createCore();
    const result = core.enforceFinalRiskConsistency({ riskScore: 20, isConditionalCompanyTrust: true, conditionalCompanyTrustApplied: true, checks: { googleSafeBrowsing: { status: 'danger' } } });
    assert.equal(result.assessment, 'high');
    assert.equal(result.conditionalCompanyTrustApplied, false);
});
