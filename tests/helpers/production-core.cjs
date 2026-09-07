const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DOMParser } = require('linkedom');
const policy = require('../../scan-policy.js');
const { create } = require('../../scan-core.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../risk-config.js'), 'utf8'), sandbox);
const riskConfig = sandbox.window.RISK_CONFIG;
function createCore(options = {}) {
    return create({ riskConfig, policy, DOMParser, ...options });
}
function fixtureCore({ unsafe = false, blacklist = false, content = 'ok', googleStatus = 'clear', cofacts = {}, trace = null, pageSignals = null, officialAlert = false } = {}) {
    let core;
    const requests = [];
    core = createCore({
        services: {
            checkSiteAvailability: async () => ({ status: content, pageSignals: pageSignals || core.createEmptyPageSignals(), linkStats: { total: 10, internal: 10, external: 0 } }),
            checkCommunityBlocklists: async () => blacklist
        },
        fetch: async input => {
            const url = String(input);
            requests.push(url);
            if (url.includes('dns.google')) return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
            if (url.includes('/safe-browsing')) return Response.json({ status: unsafe ? 'matched' : googleStatus, isUnsafe: unsafe || (googleStatus === 'clear' ? false : null) });
            if (url.includes('/check-blacklist')) return Response.json({ listed: blacklist, isBlacklisted: blacklist });
            if (url.includes('/check-cofacts')) return Response.json(cofacts);
            if (url.includes('/check-official-alerts')) return Response.json({ matched: officialAlert, matches: officialAlert ? [{ title: 'Test alert', matchType: 'url' }] : [] });
            if (url.includes('/trace')) return Response.json(trace || { resolvedDestination: false, isHighRisk: false, chain: [], uaComparisonComplete: false });
            return Response.json({ status: 'unavailable', entities: [], matches: [], dns: { mx: {} } });
        }
    });
    return { core, requests };
}
module.exports = { createCore, fixtureCore, riskConfig, policy };
