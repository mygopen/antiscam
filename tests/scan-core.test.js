const assert = require('node:assert/strict');
const test = require('node:test');
const { fixtureCore, createCore, policy, riskConfig } = require('./helpers/production-core.cjs');
test('long readable domain is not extreme gibberish even without trusted mapping', async () => {
    const config = { ...riskConfig, trustedTaiwanServiceDomains: riskConfig.trustedTaiwanServiceDomains.filter(domain => domain !== 'hsinchucitygoods.com') };
    const { core } = fixtureCore({ config });
    const result = core.enforceFinalRiskConsistency(await core.runRiskScanSafely('hsinchucitygoods.com', 'https://hsinchucitygoods.com/'));
    assert.equal(result.checks.entropy.status, 'safe');
    assert.equal(result.summaryReasons.includes('網址含高隨機亂碼特徵'), false);
    const random = await core.runRiskScanSafely('x7q9z2v8k4j6p3r5.com', 'https://x7q9z2v8k4j6p3r5.com/');
    assert.equal(random.checks.entropy.status, 'danger');
});
async function scan(options = {}, target = 'https://www.cht.com.tw/') {
    const { core } = fixtureCore(options);
    return core.enforceFinalRiskConsistency(await core.runRiskScanSafely(new URL(target).hostname, target, ['cht.com.tw']));
}
test('production flow: trusted official site with completed checks is low risk', async () => {
    assert.equal((await scan()).assessment, 'low');
});
test('Taipei civic activity trust is boundary-safe and is not government verification', async () => {
    const core = createCore();
    for (const host of ['taipeispeaksup.org', 'www.taipeispeaksup.org']) {
        assert.equal(core.isVerifiedSafeRootDomain(host), true);
        assert.equal(core.isOfficialTaiwanGovDomain(host), false);
        assert.equal((await scan({}, `https://${host}/`)).assessment, 'low');
    }
    for (const host of ['taipeispeaksup.org.evil.example', 'fake-taipeispeaksup.org']) {
        assert.equal(core.isVerifiedSafeRootDomain(host), false);
    }
    const url = 'https://taipeispeaksup.org/';
    for (const options of [{ unsafe: true }, { blacklist: true }, { officialAlert: true },
        { pageSignals: { voteAccountSignals: { status: 'danger', details: 'Credential collection' } } }]) {
        assert.equal((await scan(options, url)).assessment, 'high');
    }
    for (const content of ['unknown', 'blocked', 'error', 'blank']) {
        const result = await scan({ content }, url);
        assert.equal(result.assessment, 'low');
        assert.equal(result.details.siteStatus.status, content);
        assert.match(result.checks.manualContentReview.details, /不代表本次已完整取得/);
        assert.equal((await scan({ content, unsafe: true }, url)).assessment, 'high');
    }
    assert.equal((await scan({ content: 'unknown' }, 'https://unreviewed.taipeispeaksup.org/')).assessment, 'unknown');
    assert.equal((await scan({ googleStatus: 'unavailable' }, url)).assessment, 'unknown');
});
test('verified Hsinchu event domain is trusted, but lookalikes are not', async () => {
    const core = createCore();
    for (const host of ['hsinchucitygoods.com', 'www.hsinchucitygoods.com']) {
        assert.equal(core.isVerifiedSafeRootDomain(host), true);
        assert.equal((await scan({}, `https://${host}/`)).assessment, 'low');
    }
    for (const host of ['hsinchucitygoods.com.evil.example', 'fake-hsinchucitygoods.com']) {
        assert.equal(core.isVerifiedSafeRootDomain(host), false);
    }
});
test('verified event retains strong threat overrides and incomplete-check warnings', async () => {
    const url = 'https://www.hsinchucitygoods.com/';
    for (const options of [{ unsafe: true }, { blacklist: true }, { officialAlert: true },
        { pageSignals: { voteAccountSignals: { status: 'danger', details: 'Credential collection' } } }]) {
        assert.equal((await scan(options, url)).assessment, 'high');
    }
    assert.equal((await scan({ googleStatus: 'unavailable' }, url)).assessment, 'unknown');
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
