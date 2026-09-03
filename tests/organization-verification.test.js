const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const endpointModulePromise = import(pathToFileURL(path.join(repoRoot, 'functions/api/organization-verification.js')).href);

test('verifies TWNIC as a foundation only with independent registration and domain evidence', async () => {
  const { getTrustedLegalEntityDomainMapping, verifyLegalEntityWebsite } = await endpointModulePromise;
  const mapping = getTrustedLegalEntityDomainMapping('www.twnic.tw');
  assert.equal(mapping.entityType, 'foundation');
  assert.equal(mapping.taxIds[0], '17597502');
  assert.equal(getTrustedLegalEntityDomainMapping('twnic.tw.evil.example'), null);
  assert.equal(getTrustedLegalEntityDomainMapping('fake-twnic.tw'), null);

  const result = verifyLegalEntityWebsite({ domain: 'www.twnic.tw' });
  assert.equal(result.status, 'verified-domain');
  assert.equal(result.verified, true);
  assert.equal(result.domainMatched, true);
  assert.equal(result.registrationMatched, true);
  assert.equal(result.nameMatched, true);
  assert.equal(result.activeRegistration, true);
  assert.equal(result.entities[0].entityType, 'foundation');
  assert.equal(result.entities[0].organizationType, '財團法人');
  assert.equal(result.entities[0].name, '財團法人台灣網路資訊中心');
  assert.equal(result.entities[0].taxId, '17597502');
  assert.equal(result.entities[0].registrationCourt, '臺灣臺北地方法院');
  assert.equal(result.entities[0].registrationNumber, '2298');
  assert.equal(result.evidence.filter(item => item.independentRegistration).length, 2);
  assert.ok(result.evidence.some(item => item.type === 'domain-registration' && item.directDomainMatch));
  assert.ok(result.evidence.some(item => item.type === 'official-site' && !item.independentRegistration));
  assert.match(result.disclosure, /強威脅證據仍可翻轉為高風險/);
});

test('unmapped domains do not receive a legal entity result from a similar name', async () => {
  const { verifyLegalEntityWebsite } = await endpointModulePromise;
  assert.equal(verifyLegalEntityWebsite({ domain: 'taiwan-network-information-center.example' }), null);
});

test('organization verifier preserves the existing company verification flow', async () => {
  const { verifyOrganizationWebsite } = await endpointModulePromise;
  const fetcher = async input => {
    const url = String(input);
    if (url.includes('t187ap03_L')) {
      return new Response(JSON.stringify([{
        '公司代號': '1101',
        '公司名稱': '臺灣水泥股份有限公司',
        '營利事業統一編號': '11913502',
        '網址': 'https://www.tccgroupholdings.com/tw/'
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('5F64D864') && url.includes('11913502')) {
      return new Response(JSON.stringify([{
        Business_Accounting_NO: '11913502',
        Company_Status_Desc: '核准設立',
        Company_Name: '臺灣水泥股份有限公司',
        Register_Organization_Desc: '商業發展署'
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await verifyOrganizationWebsite({
    domain: 'tccgroupholdings.com',
    taxIds: ['11913502'],
    names: ['臺灣水泥股份有限公司'],
    fetcher
  });
  assert.equal(result.verified, true);
  assert.equal(result.entityType, 'company-or-business');
  assert.equal(result.entities[0].entityType, 'company');
});
