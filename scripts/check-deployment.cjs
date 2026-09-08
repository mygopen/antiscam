const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

async function checkDeployment(baseUrl, fetcher = fetch) {
    const base = new URL(baseUrl);
    const read = async (url, mime) => {
        const response = await fetcher(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
        assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
        assert.match(response.headers.get('content-type') || '', mime, `${url}: unexpected content type`);
        const body = await response.text();
        assert.ok(body.trim(), `${url}: empty response`);
        return body;
    };
    const html = await read(base, /^text\/html\b/i);
    const { document } = parseHTML(html);
    assert.ok(document.querySelector('#root'), 'Missing application root');
    const scripts = [...document.querySelectorAll('script[src^="/assets/"]')];
    const styles = [...document.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]')];
    assert.equal(scripts.length, 7, 'Missing application scripts');
    assert.ok(styles.length > 0, 'Missing application styles');
    const assets = [...scripts, ...styles];
    for (const element of assets) {
        const src = element.getAttribute('src');
        const asset = src || element.getAttribute('href');
        assert.match(asset, /^\/assets\/[a-z-]+\.[a-f0-9]{12}\.(js|css)$/, `Unbuilt asset: ${asset}`);
        const body = await read(new URL(asset, base), src ? /^(?:application|text)\/(?:javascript|ecmascript)\b/i : /^text\/css\b/i);
        assert.doesNotMatch(body, /^\s*(?:<!doctype|<html)/i, `${asset}: HTML returned as an asset`);
        if (src) new vm.Script(body, { filename: asset });
    }
    return { url: base.href, assetsChecked: assets.length };
}

module.exports = { checkDeployment };
if (require.main === module) {
    checkDeployment(process.argv[2] || 'https://check.mygopen.com/')
        .then(result => console.log(JSON.stringify(result)))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
