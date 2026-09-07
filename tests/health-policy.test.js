const test = require('node:test');
const assert = require('node:assert/strict');
const { finalize, presentation } = require('../scan-policy.js');
const base = () => ({ riskScore: 0, isWhitelisted: true, isTrustedAllowlist: true,
    details: { siteStatus: { status: 'ok' } }, checks: { googleSafeBrowsing: { status: 'safe' } } });

test('unresolved trusted shortener never becomes safe in any report', () => {
    const scan = { ...base(), unresolvedShortener: true };
    assert.equal(finalize(scan).assessment, 'unknown');
    assert.match(presentation(scan).label, /尚未確認/);
    assert.match(presentation(scan).title, /無法確認安全/);
});

for (const key of ['googleSafeBrowsing', 'officialAlerts', 'cofactsReports', 'userAgentCloaking', 'redirect']) {
    test(`trusted domain cannot override strong ${key} evidence`, () => {
        const scan = base();
        scan.checks[key] = { status: 'danger' };
        scan.unresolvedShortener = true;
        assert.equal(finalize(scan).assessment, 'high');
        assert.equal(scan.isTrustedAllowlist, false);
        assert.ok(scan.riskScore >= 90);
    });
}

for (const flag of ['confirmedScamDomain', 'manualHighRiskDomain', 'sensitiveExternalForm']) {
    test(`reviewed/sensitive threat ${flag} overrides trust`, () => {
        const scan = { ...base(), riskFlags: { [flag]: true } };
        assert.equal(finalize(scan).assessment, 'high');
    });
}

test('missing content or security source is unknown, not safe or automatically high', () => {
    for (const status of ['unknown', 'blocked', 'error', 'blank', 'unresolved-shortener']) {
        const scan = base(); scan.details.siteStatus.status = status;
        assert.equal(finalize(scan).assessment, 'unknown');
    }
    const scan = base(); scan.checks.googleSafeBrowsing.status = 'unknown';
    assert.equal(finalize(scan).assessment, 'unknown');
    assert.equal(finalize(base()).assessment, 'low');
});
