// Run after compiling app.js with esbuild; this executes the production scoring flow.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = process.argv[2];
if (!file) throw new Error('Pass the compiled app.js path');
const source = fs.readFileSync(file, 'utf8');

async function run({ unsafe = false, unresolved = false, blacklist = false, content = 'ok', disabled = false }) {
    const sandbox = {
        console, URL, URLSearchParams, Response, Request, TextEncoder, TextDecoder, setTimeout, clearTimeout,
        React: { createElement() {} }, ReactDOM: { createRoot() { return { render() {} }; } },
        document: { getElementById() {} }, window: {},
        fetch: async input => {
            const url = String(input);
            if (url.includes('dns.google')) return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
            if (url.includes('/safe-browsing')) return Response.json({ status: disabled ? 'disabled' : unsafe ? 'matched' : 'clear', isUnsafe: disabled ? null : unsafe });
            if (url.includes('/check-blacklist')) return Response.json({ listed: blacklist, isBlacklisted: blacklist });
            return Response.json({ status: 'unavailable', entities: [], matches: [], dns: { mx: {} } });
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'risk-config.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, 'scan-policy.js'), 'utf8'), sandbox);
    // Replace only external IO boundaries, not the production scoring function.
    const instrumented = source
        .replace(/const checkSiteAvailability = async \(fullUrl, options = \{\}\) => \{/, `const checkSiteAvailability = async (fullUrl, options = {}) => { return { status: ${JSON.stringify(content)}, pageSignals: createEmptyPageSignals(), linkStats: { total: 10, internal: 10, external: 0 } };`)
        .replace(/const checkCommunityBlocklists = async \(domain\) => \{/, `const checkCommunityBlocklists = async (domain) => { return ${blacklist};`);
    assert.notEqual(instrumented, source);
    vm.runInContext(instrumented + '\nwindow.testScan = simulateScan; window.finish = enforceFinalRiskConsistency;', sandbox);
    const scan = await sandbox.window.testScan(unresolved ? 'cht.tw' : 'www.cht.com.tw', unresolved ? 'https://cht.tw/x/b0rts' : 'https://www.cht.com.tw/', ['cht.com.tw'], {
        inputDomain: unresolved ? 'cht.tw' : 'www.cht.com.tw', unresolvedShortener: unresolved,
        tracePreflightCompleted: true, preResolvedTrace: { isHighRisk: false, resolvedDestination: false, chain: [], uaComparisonComplete: false }
    });
    return sandbox.window.finish(scan);
}

(async () => {
    assert.equal((await run({})).assessment, 'low');
    for (const options of [{ unsafe: true }, { blacklist: true }]) {
        const result = await run(options);
        assert.equal(result.assessment, 'high');
        assert.equal(result.isTrustedAllowlist, false);
    }
    for (const options of [{ unresolved: true }, { content: 'blocked' }, { disabled: true }]) {
        assert.equal((await run(options)).assessment, 'unknown');
    }
    console.log('PASS production scoring: trusted baseline, blacklist/Google threat precedence, unresolved shortener, blocked content, disabled source.');
})().catch(error => { console.error(error); process.exitCode = 1; });
