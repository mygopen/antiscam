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

function makeJackFetcher() {
  return async (input) => {
    const url = String(input);
    if (url.includes('t187ap03_L') || url.includes('t187ap03_P') || url.includes('mopsfin_t187ap03_O') || url.includes('mopsfin_t187ap03_R')) {
      return jsonResponse([]);
    }
    if (url.includes('426D5542') && url.includes('85422023')) {
      return jsonResponse([{
        President_No: '85422023',
        Business_Name: '杰克行李箱維修工作室',
        Business_Current_Status_Desc: '核准設立',
        Business_Address: '新竹市北區金雅里金農路100號1樓',
        Business_Setup_Approve_Date: '1090528',
        Business_Organization_Type_Desc: '獨資',
        Agency_Desc: '新竹市政府'
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
  const { compareWebsiteDomain, getRegistrableDomain } = await endpointModulePromise;
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
  assert.equal(compareWebsiteDomain('ioppk.eu.cc', 'https://eukka.eu.cc/').matched, false);
  assert.equal(getRegistrableDomain('ioppk.eu.cc'), 'ioppk.eu.cc');
  assert.equal(compareWebsiteDomain('hs.kcg.gov.tw', 'http://www.vac.gov.tw/~shinhu/www/weclome.html').matched, false);
  assert.equal(compareWebsiteDomain('dept.kcg.gov.tw', 'https://www.kcg.gov.tw/').matched, true);
  assert.equal(compareWebsiteDomain('portal.ntu.edu.tw', 'https://www.nthu.edu.tw/').matched, false);
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

test('trusted company domain mappings show small business registration data without page tax IDs', async () => {
  const { verifyCompanyWebsite, getTrustedCompanyDomainMapping } = await endpointModulePromise;

  const mapping = getTrustedCompanyDomainMapping('www.jack-hsinchu.com');
  assert.equal(mapping.taxIds[0], '85422023');
  assert.equal(mapping.names[0], '杰克行李箱維修工作室');
  assert.equal(getTrustedCompanyDomainMapping('fake-jack-hsinchu.com'), null);
  assert.equal(getTrustedCompanyDomainMapping('jack-hsinchu.com.evil.shop'), null);

  const result = await verifyCompanyWebsite({
    domain: 'www.jack-hsinchu.com',
    fetcher: makeJackFetcher()
  });

  assert.equal(result.status, 'verified-domain');
  assert.equal(result.verified, true);
  assert.equal(result.domainMatched, true);
  assert.equal(result.registrationMatched, true);
  assert.equal(result.nameMatched, true);
  assert.equal(result.trustedDomainMappingMatched, true);
  assert.equal(result.companies[0].taxId, '85422023');
  assert.equal(result.companies[0].name, '杰克行李箱維修工作室');
  assert.equal(result.companies[0].status, '核准設立');
  assert.equal(result.companies[0].address, '新竹市北區金雅里金農路100號1樓');
  assert.equal(result.companies[0].organizationType, '獨資');
  assert.equal(result.companies[0].domainMatchType, 'trusted-company-domain-mapping');
  assert.equal(result.companies[0].trustedDomainMapped, true);
  assert.match(result.disclosure, /可信網域對應統編/);
  assert.ok(result.evidence.some(item => item.type === 'trusted-company-domain-mapping' && item.directDomainMatch));
  assert.ok(result.evidence.some(item => item.type === 'business-registration' && !item.directDomainMatch));
  assert.equal(result.evidence.some(item => item.type === 'market-disclosure'), false);
  assert.equal(result.evidence.every(item => item.source && item.sourceUrl), true);
});

test("trusted company domain mapping verifies What'Sub against Equal2 registration data", async () => {
  const { verifyCompanyWebsite, getTrustedCompanyDomainMapping } = await endpointModulePromise;
  const fetcher = async (input) => {
    const url = String(input);
    if (url.includes('t187ap03_L') || url.includes('t187ap03_P') || url.includes('mopsfin_t187ap03_O') || url.includes('mopsfin_t187ap03_R')) {
      return jsonResponse([]);
    }
    if (url.includes('5F64D864') && url.includes('90888561')) {
      return jsonResponse([{
        Business_Accounting_NO: '90888561',
        Company_Status_Desc: '核准設立',
        Company_Name: '等於貳有限公司',
        Capital_Stock_Amount: 1000000,
        Responsible_Name: '潘令傑',
        Company_Location: '臺北市士林區大南路347號3樓',
        Register_Organization_Desc: '臺北市政府',
        Company_Setup_Date: '1100324'
      }]);
    }
    return jsonResponse([]);
  };

  const mapping = getTrustedCompanyDomainMapping('whatsub.equal2.app');
  assert.equal(mapping.taxIds[0], '90888561');
  assert.equal(mapping.names[0], '等於貳有限公司');
  assert.equal(getTrustedCompanyDomainMapping('whatsub.equal2.app.evil.shop'), null);
  assert.equal(getTrustedCompanyDomainMapping('fake-equal2.app'), null);

  const result = await verifyCompanyWebsite({
    domain: 'whatsub.equal2.app',
    fetcher
  });

  assert.equal(result.status, 'verified-domain');
  assert.equal(result.verified, true);
  assert.equal(result.domainMatched, true);
  assert.equal(result.registrationMatched, true);
  assert.equal(result.nameMatched, true);
  assert.equal(result.trustedDomainMappingMatched, true);
  assert.equal(result.companies[0].taxId, '90888561');
  assert.equal(result.companies[0].name, '等於貳有限公司');
  assert.equal(result.companies[0].status, '核准設立');
  assert.equal(result.companies[0].domainMatchType, 'trusted-company-domain-mapping');
  assert.match(result.disclosure, /可信網域對應統編/);
  assert.ok(result.evidence.some(item => item.type === 'trusted-company-domain-mapping' && item.directDomainMatch));
  assert.ok(result.evidence.some(item => item.type === 'business-registration' && !item.directDomainMatch));
});

test('government second-level domains do not cross-match unrelated public company disclosures', async () => {
  const { verifyCompanyWebsite } = await endpointModulePromise;
  const fetcher = async (input) => {
    const url = String(input);
    if (url.includes('t187ap03_P')) {
      return jsonResponse([{
        '公司代號': '8379',
        '公司名稱': '欣湖天然氣股份有限公司',
        '公司簡稱': '欣湖天然氣',
        '營利事業統一編號': '04779353',
        '住址': '臺北市內湖區新湖二路180號5樓',
        '總機電話': '(02)2791-1345',
        '電子郵件信箱': 'example@example.test',
        '網址': 'http://www.vac.gov.tw/~shinhu/www/weclome.html'
      }]);
    }
    return jsonResponse([]);
  };
  const result = await verifyCompanyWebsite({
    domain: 'hs.kcg.gov.tw',
    fetcher
  });

  assert.equal(result.status, 'not-found');
  assert.equal(result.verified, false);
  assert.equal(result.domainMatched, false);
  assert.equal(result.companies.length, 0);
  assert.match(result.disclosure, /未取得可將公司與此網域直接連結/);
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
  assert.match(source, /isOfficialTaiwanGovDomain\(domain\)/);
  assert.match(source, /政府機關網域不適用公司網址公開資料驗證/);
  assert.match(source, /官網資料相符/);
  assert.match(source, /統一編號/);
  assert.match(source, /驗證來源/);
  assert.doesNotMatch(source, /addTrustSignal\(hasRegisteredBusinessIdentity/);
});
