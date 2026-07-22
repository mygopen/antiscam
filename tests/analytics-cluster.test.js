const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const identifiersModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/analytics-identifiers.js')).href);
const endpointModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/check-analytics-cluster.js')).href);
const syncModulePromise = import(pathToFileURL(path.join(repoRoot, 'scripts/sync-analytics-cluster-signals.mjs')).href);

test('extracts supported analytics identifiers and removes duplicates', async () => {
  const { extractAnalyticsIdentifiers } = await identifiersModulePromise;
  const html = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCD123456"></script>
    <script>gtag('config', 'G-ABCD123456');</script>
    <script>GoogleAnalyticsObject='ga'; ga('create', 'UA-12345678-2');</script>
    <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>
    <script>gtag('config', 'AW-123456789');</script>
    <script data-ad-client="ca-pub-1234567890123456"></script>
  `;
  const identifiers = extractAnalyticsIdentifiers(html);
  assert.deepEqual(identifiers.map(item => item.id), [
    'UA-12345678-2',
    'G-ABCD123456',
    'GTM-ABC1234',
    'AW-123456789',
    'pub-1234567890123456'
  ]);
});

test('does not accept a GA4-like token without analytics context', async () => {
  const { extractAnalyticsIdentifiers } = await identifiersModulePromise;
  assert.deepEqual(extractAnalyticsIdentifiers('<p>Order G-ABCD123456 has shipped.</p>'), []);
});

test('summarizes shared identifiers without turning one identifier into a danger verdict', async () => {
  const { summarizeAnalyticsCluster } = await endpointModulePromise;
  const result = summarizeAnalyticsCluster({
    domain: 'candidate.example',
    identifiers: ['GTM-ABC1234'],
    records: [{
      identifier: 'GTM-ABC1234',
      highRiskDomains: ['fraud-one.example', 'fraud-two.example'],
      evidenceSources: [
        { name: 'HackerTarget Reverse Analytics Search', url: 'https://hackertarget.com/reverse-analytics-search/' },
        { name: '人工確認高風險網域清單' }
      ]
    }]
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.matched, true);
  assert.equal(result.knownHighRiskCount, 2);
  assert.equal(result.items[0].typeLabel, 'Google Tag Manager');
  assert.match(result.details, /不能單獨證明網站為詐騙/);
  assert.equal('riskScore' in result, false);
});

test('excludes the scanned domain itself from related-domain counts', async () => {
  const { summarizeAnalyticsCluster } = await endpointModulePromise;
  const result = summarizeAnalyticsCluster({
    domain: 'www.fraud-one.example',
    identifiers: ['UA-12345678-2'],
    records: [{
      identifier: 'UA-12345678-2',
      highRiskDomains: ['fraud-one.example', 'fraud-two.example'],
      evidenceSources: [{ name: '已知高風險網站原始碼擷取' }]
    }]
  });
  assert.deepEqual(result.relatedDomains, ['fraud-two.example']);
  assert.equal(result.knownHighRiskCount, 1);
});

test('parses HackerTarget plain-text results and rejects quota/error messages', async () => {
  const { parseHackerTargetDomains } = await syncModulePromise;
  assert.deepEqual(parseHackerTargetDomains('www.one.example\ntwo.example\none.example'), ['one.example', 'two.example']);
  assert.deepEqual(parseHackerTargetDomains('API count exceeded - Increase Quota with Membership'), []);
});

test('sync builder only counts domains already present in the confirmed high-risk list', async () => {
  const { buildAnalyticsClusterSignals } = await syncModulePromise;
  const records = buildAnalyticsClusterSignals({
    checkedAt: '2026-07-21T00:00:00.000Z',
    confirmedDomains: ['fraud-one.example'],
    directFindings: [{
      domain: 'fraud-one.example',
      identifier: 'GTM-ABC1234',
      type: 'google-tag-manager',
      typeLabel: 'Google Tag Manager'
    }],
    reverseFindings: [{
      identifier: 'GTM-ABC1234',
      type: 'google-tag-manager',
      typeLabel: 'Google Tag Manager',
      domains: ['fraud-one.example', 'normal-shop.example']
    }]
  });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].highRiskDomains, ['fraud-one.example']);
  assert.equal(records[0].evidenceSources.some(source => source.kind === 'reverse-analytics'), true);
});

test('app wires the analytics cluster endpoint and renders the requested card fields', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
  assert.match(source, /\/api\/check-analytics-cluster/);
  assert.match(source, /詐騙站群關聯/);
  assert.match(source, /共享識別碼類型/);
  assert.match(source, /已知高風險關聯數/);
  assert.match(source, /證據來源/);
});
