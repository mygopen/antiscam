const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const endpointModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/gov-agency-verification.js')).href);

const sampleDgpaCsv = [
  '機關代碼,機關名稱,機關英文名稱,郵遞區號,機關地址,機關電話,主管機關代碼,主管機關名稱,傳真,機關生效日期,機關裁撤日期,機關層級,裁撤註記,新機關代碼,新機關名稱',
  '397000000A,高雄市政府,Kaohsiung City Government,802,高雄市苓雅區四維三路2號,07-3368333,,行政院,,19791225,,2,,,',
  '397360000G,高雄市政府都市發展局,Urban Development Bureau Kaohsiung City Government,802,高雄市苓雅區四維三路2號6樓,07-3368333,397000000A,高雄市政府,,19791225,,3,,,',
  'A07000000E,財政部,Ministry of Finance,100,臺北市中正區愛國西路2號,02-23228000,,行政院,,19480101,,2,,,'
].join('\n');

function csvResponse(csv = sampleDgpaCsv) {
  return new Response(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8' }
  });
}

function makeFetcher(csv = sampleDgpaCsv) {
  return async () => csvResponse(csv);
}

test('parses quoted CSV rows and DGPA agency records', async () => {
  const { parseCsvRows, parseDgpaOrgCsv } = await endpointModulePromise;
  assert.deepEqual(parseCsvRows('"機關代碼","機關名稱"\n"001","高雄市政府,測試"'), [
    ['機關代碼', '機關名稱'],
    ['001', '高雄市政府,測試']
  ]);

  const records = parseDgpaOrgCsv(sampleDgpaCsv);
  assert.equal(records.length, 3);
  assert.equal(records[1].code, '397360000G');
  assert.equal(records[1].name, '高雄市政府都市發展局');
  assert.equal(records[1].parentName, '高雄市政府');
});

test('verifies a gov.tw page when the extracted agency name matches DGPA records', async () => {
  const { verifyGovernmentAgency } = await endpointModulePromise;
  const result = await verifyGovernmentAgency({
    domain: 'hs.kcg.gov.tw',
    siteName: '高雄住宅補貼網',
    agencyName: '高雄市政府都市發展局',
    rootAgency: '高雄市政府',
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'verified-agency');
  assert.equal(result.officialDomain, true);
  assert.equal(result.verified, true);
  assert.equal(result.directAgencyMatched, true);
  assert.equal(result.rootDomain, 'kcg.gov.tw');
  assert.equal(result.agencies[0].name, '高雄市政府都市發展局');
  assert.ok(result.evidence.some(item => item.type === 'dgpa-org-code' && item.directAgencyMatch));
  assert.match(result.disclosure, /公開機關代碼資料/);
});

test('verifies a gov.tw domain at root-agency level without showing guessed page agency', async () => {
  const { verifyGovernmentAgency } = await endpointModulePromise;
  const result = await verifyGovernmentAgency({
    domain: 'service.kcg.gov.tw',
    siteName: '高雄市便民服務平台',
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'verified-root-agency');
  assert.equal(result.officialDomain, true);
  assert.equal(result.verified, true);
  assert.equal(result.directAgencyMatched, false);
  assert.equal(result.agencies[0].name, '高雄市政府');
  assert.match(result.disclosure, /政府根網域可對應/);
});

test('keeps unmatched gov.tw domains safe but unverified for display purposes', async () => {
  const { verifyGovernmentAgency } = await endpointModulePromise;
  const result = await verifyGovernmentAgency({
    domain: 'service.unknown.gov.tw',
    siteName: '政府服務入口',
    agencyName: '不存在的單位',
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'official-domain-only');
  assert.equal(result.officialDomain, true);
  assert.equal(result.verified, false);
  assert.equal(result.agencies.length, 0);
  assert.match(result.disclosure, /尚未在公開機關代碼資料中比對到/);
});

test('ignores non-government domains', async () => {
  const { verifyGovernmentAgency } = await endpointModulePromise;
  const result = await verifyGovernmentAgency({
    domain: 'example.com.tw',
    agencyName: '高雄市政府',
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'not-applicable');
  assert.equal(result.officialDomain, false);
  assert.equal(result.verified, false);
});
