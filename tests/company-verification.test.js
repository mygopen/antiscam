const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const endpointModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/company-verification.js')).href);

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function makeFetcher() {
  return async (input) => {
    const url = String(input);
    if (url.includes('t187ap03_L')) {
      return jsonResponse([{
        '公司代號': '1101',
        '公司名稱': '臺灣水泥股份有限公司',
        '公司簡稱': '台泥',
        '營利事業統一編號': '11913502',
        '住址': '臺北市中山區中山北路二段113號',
        '總機電話': '(02)2531-7099',
        '電子郵件信箱': 'finance@example.test',
        '網址': 'https://www.tccgroupholdings.com/tw/'
      }]);
    }
    if (url.includes('t187ap03_P') || url.includes('mopsfin_t187ap03_O') || url.includes('mopsfin_t187ap03_R')) {
      return jsonResponse([]);
    }
    if (url.includes('5F64D864') && url.includes('11913502')) {
      return jsonResponse([{
        Business_Accounting_NO: '11913502',
        Company_Status_Desc: '核准設立',
        Company_Name: '臺灣水泥股份有限公司',
        Capital_Stock_Amount: 100000000000,
        Responsible_Name: '張安平',
        Company_Location: '臺北市中山區中山北路二段113號',
        Register_Organization_Desc: '商業發展署',
        Company_Setup_Date: '0360823',
        Change_Of_Approval_Data: '1150610'
      }]);
    }
    return jsonResponse([]);
  };
}

test('validates Taiwan tax IDs before querying public registries', async () => {
  const { isValidTaiwanTaxId } = await endpointModulePromise;
  assert.equal(isValidTaiwanTaxId('11913502'), true);
  assert.equal(isValidTaiwanTaxId('85598514'), true);
  assert.equal(isValidTaiwanTaxId('12345678'), false);
  assert.equal(isValidTaiwanTaxId('1234'), false);
});

test('matches exact hosts and same company roots without suffix tricks', async () => {
  const { compareWebsiteDomain } = await endpointModulePromise;
  assert.deepEqual(compareWebsiteDomain('www.example.com.tw', 'https://example.com.tw/'), {
    matched: true,
    matchType: 'exact-host'
  });
  assert.deepEqual(compareWebsiteDomain('shop.example.com.tw', 'https://www.example.com.tw/'), {
    matched: true,
    matchType: 'same-registrable-domain'
  });
  assert.equal(compareWebsiteDomain('example.com.tw.evil.shop', 'https://example.com.tw/').matched, false);
  assert.equal(compareWebsiteDomain('unrelated.com.au', 'https://official.com.au/').matched, false);
  assert.equal(compareWebsiteDomain('fake.kbro.com.tw', 'https://brand.kbro.com.tw/').matched, false);
});

test('verifies a company website only when a market disclosure points to the domain', async () => {
  const { verifyCompanyWebsite } = await endpointModulePromise;
  const result = await verifyCompanyWebsite({
    domain: 'www.tccgroupholdings.com',
    taxIds: ['11913502'],
    names: ['臺灣水泥股份有限公司'],
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'verified-domain');
  assert.equal(result.verified, true);
  assert.equal(result.domainMatched, true);
  assert.equal(result.registrationMatched, true);
  assert.equal(result.companies[0].name, '臺灣水泥股份有限公司');
  assert.equal(result.companies[0].status, '核准設立');
  assert.equal(result.companies[0].website, 'https://www.tccgroupholdings.com/tw/');
  assert.ok(result.evidence.some(item => item.type === 'market-disclosure' && item.directDomainMatch));
  assert.ok(result.evidence.some(item => item.type === 'business-registration' && !item.directDomainMatch));
});

test('copied company registration data does not turn an unrelated domain into an official website', async () => {
  const { verifyCompanyWebsite } = await endpointModulePromise;
  const result = await verifyCompanyWebsite({
    domain: 'unrelated-shopping.example',
    taxIds: ['11913502'],
    names: ['臺灣水泥股份有限公司'],
    fetcher: makeFetcher()
  });

  assert.equal(result.status, 'registered-business');
  assert.equal(result.registrationMatched, true);
  assert.equal(result.domainMatched, false);
  assert.equal(result.verified, false);
  assert.match(result.disclosure, /尚未直接證明/);
});

test('an old disclosed website is not trusted when the company registration is inactive', async () => {
  const { verifyCompanyWebsite } = await endpointModulePromise;
  const baseFetcher = makeFetcher();
  const fetcher = async (input, options) => {
    const url = String(input);
    if (url.includes('5F64D864') && url.includes('11913502')) {
      return jsonResponse([{
        Business_Accounting_NO: '11913502',
        Company_Status_Desc: '解散',
        Company_Name: '臺灣水泥股份有限公司',
        Company_Location: '臺北市中山區中山北路二段113號',
        Register_Organization_Desc: '商業發展署'
      }]);
    }
    return baseFetcher(input, options);
  };
  const result = await verifyCompanyWebsite({
    domain: 'tccgroupholdings.com',
    taxIds: ['11913502'],
    fetcher
  });

  assert.equal(result.domainMatched, true);
  assert.equal(result.activeRegistration, false);
  assert.equal(result.verified, false);
  assert.equal(result.status, 'inactive-domain-record');
  assert.match(result.disclosure, /進一步複核/);
});

test('app exposes company public data and evidence in the result indicators', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
  assert.match(source, /\/api\/company-verification/);
  assert.match(source, /公司網址公開資料驗證/);
  assert.match(source, /官網資料相符/);
  assert.match(source, /統一編號/);
  assert.match(source, /驗證來源/);
  assert.doesNotMatch(source, /addTrustSignal\(hasRegisteredBusinessIdentity/);
});
