const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDeployment } = require('../scripts/check-deployment.cjs');
const names = ['react', 'react-dom', 'risk-config', 'scan-policy', 'scan-core', 'email-risk', 'app'];
const html = `<div id="root"></div>${names.map(name => `<script src="/assets/${name}.0123456789ab.js"></script>`).join('')}<link rel="stylesheet" href="/assets/styles.0123456789ab.css">`;
const response = (body, type) => new Response(body, { headers: { 'content-type': type } });
const fixture = assetResponse => async url => new URL(url).pathname === '/'
    ? response(html, 'text/html')
    : assetResponse(url);

test('deployment check validates every frontend asset including JavaScript syntax', async () => {
    const result = await checkDeployment('https://example.com/', fixture(url => String(url).endsWith('.css')
        ? response('body{color:black}', 'text/css') : response('const ready = true;', 'application/javascript')));
    assert.equal(result.assetsChecked, 8);
});

test('deployment check rejects the HTTP 200 HTML fallback that caused the blank page', async () => {
    await assert.rejects(checkDeployment('https://example.com/', fixture(() => response(html, 'text/html'))), /unexpected content type/);
});

test('deployment check rejects source HTML without a production build', async () => {
    await assert.rejects(checkDeployment('https://example.com/', async () => response(html.replaceAll('.0123456789ab', ''), 'text/html')), /Unbuilt asset/);
});

test('deployment check rejects JavaScript parse errors', async () => {
    await assert.rejects(checkDeployment('https://example.com/', fixture(() => response('const broken = ;', 'application/javascript'))), SyntaxError);
});
