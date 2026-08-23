const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const siteContentModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/site-content.js')).href);

test('一般 Cloudflare Insights 統計腳本不會被誤認為 WAF 封鎖頁', async () => {
  const { looksCrawlerBlocked } = await siteContentModulePromise;
  const html = `
    <!doctype html>
    <title>Joyful Living</title>
    <main><button>Add to Cart</button></main>
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>
  `;

  assert.equal(looksCrawlerBlocked(html, 200), false);
  assert.equal(looksCrawlerBlocked('<p>Cloudflare provides website infrastructure.</p>', 200), false);
});

test('Cloudflare challenge 與明確封鎖回應仍會被辨識', async () => {
  const { looksCrawlerBlocked } = await siteContentModulePromise;

  assert.equal(looksCrawlerBlocked('<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>', 200), true);
  assert.equal(looksCrawlerBlocked('<div class="cf-chl-widget">Verify you are human</div>', 200), true);
  assert.equal(looksCrawlerBlocked('<h1>Ordinary page</h1>', 403), true);
});

test('前端備援封鎖偵測不得再以 cloudflare 單字直接判定', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
  const block = source.match(/const detectCrawlerBlock = \(text, httpCode = 0\) => \{[\s\S]+?\n\s*\};\n\s*const getCrawlerCandidates/)?.[0] || '';

  assert.match(block, /challenge-platform/);
  assert.match(block, /hasWafVendor && hasChallengeContext/);
  assert.doesNotMatch(block, /cf-chl\|cloudflare\|akamai/);
});
