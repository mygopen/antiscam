const test = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser } = require('linkedom');
const { createCore, fixtureCore } = require('./helpers/production-core.cjs');

const target = 'https://localcraft.design/';
const age = years => ({ registrationDate: new Date(Date.now() - years * 365 * 86400000).toISOString(), registrantOrganization: 'Example Crafts Limited' });
function signals() {
    return { ...createCore().createEmptyPageSignals(),
        businessIdentitySignals: { names: ['Example Crafts Limited'], hasTaxId: false },
        seoSignals: { score: 70, matched: true },
        ecommerceTrustSignals: { score: 60, matched: true, reasons: ['Contact and checkout'], categories: [] },
        shoppingScamSignals: { ...createCore().createEmptyPageSignals().shoppingScamSignals, matched: true, reasonCount: 4, reasons: ['Checkout', 'LINE', 'Tracking', 'Order fields'], hasMerchantInfo: true, hasCommerceOffer: true }
    };
}
async function scan(options = {}, url = target) {
    const { core } = fixtureCore(options);
    return core.enforceFinalRiskConsistency(await core.runRiskScanSafely(new URL(url).hostname, url));
}
test('brand mentions in customer logos, shipping and payment text are not identity claims', () => {
    const core = createCore();
    const analyze = body => {
        const html = `<html><head><title>Local Crafts</title></head><body>${body}</body></html>`;
        return core.analyzePageBrandSignals(new DOMParser().parseFromString(html, 'text/html'), target, html);
    };
    assert.equal(analyze('<img alt="台北富邦銀行" src="/client-logos/fubon.webp">').evidenceLevel, 'mention');
    assert.equal(analyze('<p>付款銀行：富邦銀行</p>').evidenceLevel, 'mention');
    assert.equal(analyze('<form>富邦銀行帳戶<input type="password"></form>').evidenceLevel, 'impersonation');
    assert.equal(analyze('<p>Apple 配件</p><form>富邦銀行帳戶<input type="password"></form>').evidenceLevel, 'impersonation');
});
test('five years needs verified identity and readable business evidence, not prepaid term', async () => {
    const good = await scan({ rdap: age(6), pageSignals: signals() });
    assert.equal(good.checks.domainMaturity.applied, true);
    assert.equal(good.assessment, 'low');
    for (const rdap of [age(4), {}, { registrationDate: new Date().toISOString(), expirationDate: '2040-01-01' }]) {
        assert.equal((await scan({ rdap, pageSignals: signals() })).checks.domainMaturity.applied, false);
    }
    assert.equal((await scan({ rdap: age(6) })).checks.domainMaturity.applied, false);
    assert.equal((await scan({ rdap: age(6), pageSignals: signals(), content: 'unknown' })).assessment, 'unknown');
    assert.equal((await scan({ rdap: age(6), pageSignals: signals(), googleStatus: 'unavailable' })).assessment, 'unknown');
});
test('three-year threshold excludes shared hosting and unknown ages', async () => {
    assert.equal((await scan({ rdap: age(3.1) })).checks.domainMaturity.hidden, false);
    assert.equal((await scan({ rdap: age(2.9) })).checks.domainMaturity.hidden, true);
    for (const host of ['merchant.eu.cc', 'merchant.github.io']) {
        assert.equal((await scan({ rdap: age(20), pageSignals: signals() }, `https://${host}/`)).checks.domainMaturity.hidden, true);
    }
});
test('old businesses still lose to blacklists, alerts, credentials and malicious redirects', async () => {
    for (const options of [{ unsafe: true }, { blacklist: true }, { officialAlert: true },
        { pageSignals: { ...signals(), voteAccountSignals: { status: 'danger', details: 'LINE credentials' } } },
        { pageSignals: { ...signals(), externalResources: { sensitiveFormActionCount: 1, formActionCount: 1 } } }]) {
        const result = await scan({ rdap: age(10), pageSignals: signals(), ...options });
        assert.equal(result.assessment, 'high');
        assert.equal(result.checks.domainMaturity.applied, false);
    }
});
test('ordinary shopping features alone do not trigger the shopping scam rule', async () => {
    const pageSignals = signals();
    pageSignals.ecommerceTrustSignals = { score: 0, matched: false, reasons: [] };
    const result = await scan({ pageSignals });
    assert.notEqual(result.checks.shoppingScam.status, 'danger');
});
test('old domain cannot override a malicious resolved destination', async () => {
    const url = 'https://myppt.cc/new-code';
    const destination = 'https://ioppk.eu.cc/vote';
    const result = await scan({ rdap: age(15), pageSignals: signals(), trace: {
        resolvedDestination: true, finalUrl: destination, redirectCount: 1, isHighRisk: true,
        chain: [{ url, status: 302 }, { url: destination, status: 200 }], uaComparisonComplete: true
    } }, url);
    assert.equal(result.assessment, 'high');
});
