const GCIS_COMPANY_ENDPOINT = 'https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6';
const GCIS_BUSINESS_ENDPOINT = 'https://data.gcis.nat.gov.tw/od/data/api/426D5542-5F05-43EB-83F9-F1300F14E1F1';

const MARKET_SOURCES = [
  { id: 'twse-listed', name: '公開資訊觀測站（上市公司）', market: '上市', url: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L', sourceUrl: 'https://mops.twse.com.tw/mops/#/web/t05st03' },
  { id: 'twse-public', name: '公開資訊觀測站（公開發行公司）', market: '公開發行', url: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_P', sourceUrl: 'https://mops.twse.com.tw/mops/#/web/t05st03' },
  { id: 'tpex-otc', name: '櫃買中心（上櫃公司）', market: '上櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', sourceUrl: 'https://www.tpex.org.tw/' },
  { id: 'tpex-emerging', name: '櫃買中心（興櫃公司）', market: '興櫃', url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R', sourceUrl: 'https://www.tpex.org.tw/' }
];

const SECOND_LEVEL_SUFFIXES = new Set([
  'com.tw', 'org.tw', 'net.tw', 'idv.tw', 'game.tw', 'ebiz.tw', 'club.tw',
  'co.uk', 'org.uk', 'gov.uk', 'co.jp', 'ne.jp', 'or.jp', 'com.hk', 'com.cn', 'net.cn', 'org.cn',
  'com.au', 'net.au', 'org.au', 'co.nz', 'com.sg', 'com.my', 'co.kr', 'com.vn',
  'co.in', 'com.br', 'com.mx', 'com.ph', 'com.tr', 'com.ar', 'co.za'
]);

const SHARED_HOSTING_ROOTS = new Set([
  'kbro.com.tw', 'wixsite.com', 'weebly.com', 'wordpress.com', 'blogspot.com',
  'shoplineapp.com', 'shopify.com', 'pages.dev', 'netlify.app', 'github.io'
]);

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeHostname(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
    return new URL(withScheme).hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch (error) {
    return '';
  }
}

export function getRegistrableDomain(value) {
  const hostname = normalizeHostname(value);
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join('.');
  return parts.slice(SECOND_LEVEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

export function compareWebsiteDomain(scannedDomain, registeredWebsite) {
  const scannedHost = normalizeHostname(scannedDomain);
  const registeredHost = normalizeHostname(registeredWebsite);
  if (!scannedHost || !registeredHost) return { matched: false, matchType: 'none' };
  if (scannedHost === registeredHost) return { matched: true, matchType: 'exact-host' };
  const scannedRoot = getRegistrableDomain(scannedHost);
  const registeredRoot = getRegistrableDomain(registeredHost);
  if (scannedRoot && scannedRoot === registeredRoot && !SHARED_HOSTING_ROOTS.has(scannedRoot)) {
    return { matched: true, matchType: 'same-registrable-domain' };
  }
  return { matched: false, matchType: 'none' };
}

export function isValidTaiwanTaxId(value) {
  const taxId = String(value || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(taxId)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const sum = taxId.split('').reduce((total, digit, index) => {
    const product = Number(digit) * weights[index];
    return total + Math.floor(product / 10) + (product % 10);
  }, 0);
  return sum % 10 === 0 || (taxId[6] === '7' && (sum + 1) % 10 === 0);
}

function normalizeCompanyName(value) {
  return cleanText(value).toLowerCase().replace(/[台臺]/g, '臺').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function companyNamesMatch(first, second) {
  const a = normalizeCompanyName(first);
  const b = normalizeCompanyName(second);
  return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))));
}

function formatRocDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 7) return cleanText(value) || null;
  return String(Number(digits.slice(0, 3)) + 1911) + '-' + digits.slice(3, 5) + '-' + digits.slice(5, 7);
}

function normalizeMarketRecord(record, source) {
  const isTpex = source.id.startsWith('tpex-');
  return {
    taxId: cleanText(isTpex ? record['UnifiedBusinessNo.'] : record['營利事業統一編號']),
    name: cleanText(isTpex ? record.CompanyName : record['公司名稱']),
    shortName: cleanText(isTpex ? record.CompanyAbbreviation : record['公司簡稱']),
    address: cleanText(isTpex ? record.Address : record['住址']),
    phone: cleanText(isTpex ? record.Telephone : record['總機電話']),
    email: cleanText(isTpex ? record.EmailAddress : record['電子郵件信箱']),
    website: cleanText(isTpex ? record.WebAddress : record['網址']),
    stockCode: cleanText(isTpex ? record.SecuritiesCompanyCode : record['公司代號']),
    market: source.market,
    source: source.name,
    sourceUrl: source.sourceUrl,
    sourceId: source.id
  };
}

function normalizeRegistrationRecord(companyRecord, businessRecord) {
  if (companyRecord) {
    return {
      taxId: cleanText(companyRecord.Business_Accounting_NO),
      name: cleanText(companyRecord.Company_Name),
      status: cleanText(companyRecord.Company_Status_Desc),
      address: cleanText(companyRecord.Company_Location),
      responsibleName: cleanText(companyRecord.Responsible_Name),
      capital: Number(companyRecord.Capital_Stock_Amount) || null,
      setupDate: formatRocDate(companyRecord.Company_Setup_Date),
      lastChangeDate: formatRocDate(companyRecord.Change_Of_Approval_Data),
      organizationType: '公司',
      registrationAuthority: cleanText(companyRecord.Register_Organization_Desc)
    };
  }
  if (businessRecord) {
    return {
      taxId: cleanText(businessRecord.President_No),
      name: cleanText(businessRecord.Business_Name),
      status: cleanText(businessRecord.Business_Current_Status_Desc),
      address: cleanText(businessRecord.Business_Address),
      responsibleName: null,
      capital: null,
      setupDate: formatRocDate(businessRecord.Business_Setup_Approve_Date),
      lastChangeDate: null,
      organizationType: cleanText(businessRecord.Business_Organization_Type_Desc) || '商業',
      registrationAuthority: cleanText(businessRecord.Agency_Desc)
    };
  }
  return null;
}

function makeGcisUrl(endpoint, field, taxId) {
  const url = new URL(endpoint);
  url.searchParams.set('$format', 'json');
  url.searchParams.set('$filter', field + ' eq ' + taxId);
  return url.toString();
}

async function fetchJson(url, fetcher) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyGoPen-AntiScam-CompanyVerifier/1.0' },
      cf: { cacheEverything: true, cacheTtl: 86400 },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('upstream_' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('invalid_upstream_payload');
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchRegistration(taxId, fetcher) {
  const results = await Promise.allSettled([
    fetchJson(makeGcisUrl(GCIS_COMPANY_ENDPOINT, 'Business_Accounting_NO', taxId), fetcher),
    fetchJson(makeGcisUrl(GCIS_BUSINESS_ENDPOINT, 'President_No', taxId), fetcher)
  ]);
  const companyRecord = results[0].status === 'fulfilled' ? results[0].value[0] : null;
  const businessRecord = results[1].status === 'fulfilled' ? results[1].value[0] : null;
  return normalizeRegistrationRecord(companyRecord, businessRecord);
}

function buildFindBizUrl(taxId) {
  return 'https://findbiz.nat.gov.tw/fts/query/QueryBar/queryInit.do?queryString=' + encodeURIComponent(taxId);
}

export async function verifyCompanyWebsite({ domain, taxIds = [], names = [], fetcher = fetch }) {
  const scannedDomain = normalizeHostname(domain);
  if (!scannedDomain || !scannedDomain.includes('.')) {
    return { checked: false, status: 'invalid', verified: false, domainMatched: false, registrationMatched: false, companies: [], evidence: [] };
  }

  const validTaxIds = [...new Set(taxIds.map(value => String(value || '').replace(/\D/g, '')).filter(isValidTaiwanTaxId))].slice(0, 3);
  const claimedNames = [...new Set(names.map(cleanText).filter(Boolean))].slice(0, 4);
  const marketResults = await Promise.allSettled(MARKET_SOURCES.map(async source => {
    const records = await fetchJson(source.url, fetcher);
    return records.map(record => normalizeMarketRecord(record, source));
  }));
  const marketRecords = marketResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const marketUnavailable = marketResults.every(result => result.status === 'rejected');
  const marketMatches = marketRecords
    .map(record => ({ ...record, domainComparison: compareWebsiteDomain(scannedDomain, record.website) }))
    .filter(record => record.domainComparison.matched)
    .sort((a, b) => Number(b.domainComparison.matchType === 'exact-host') - Number(a.domainComparison.matchType === 'exact-host'));

  const marketTaxIds = marketMatches.map(record => record.taxId).filter(isValidTaiwanTaxId);
  const registrationTaxIds = [...new Set([...validTaxIds, ...marketTaxIds])].slice(0, 4);
  const registrationResults = await Promise.allSettled(registrationTaxIds.map(taxId => fetchRegistration(taxId, fetcher)));
  const registrations = registrationResults.map(result => result.status === 'fulfilled' ? result.value : null).filter(Boolean);
  const companiesByTaxId = new Map();

  for (const registration of registrations) {
    companiesByTaxId.set(registration.taxId, {
      ...registration,
      website: null,
      stockCode: null,
      market: null,
      nameMatched: claimedNames.some(name => companyNamesMatch(name, registration.name)),
      domainMatched: false,
      domainMatchType: 'none'
    });
  }
  for (const market of marketMatches) {
    const key = market.taxId || market.sourceId + ':' + market.stockCode;
    const existing = companiesByTaxId.get(market.taxId) || {
      taxId: market.taxId,
      name: market.name,
      status: '已於證券市場資料申報',
      address: market.address,
      responsibleName: null,
      capital: null,
      setupDate: null,
      lastChangeDate: null,
      organizationType: '公司',
      registrationAuthority: null,
      nameMatched: claimedNames.some(name => companyNamesMatch(name, market.name))
    };
    companiesByTaxId.set(key, {
      ...existing,
      website: market.website,
      phone: market.phone,
      email: market.email,
      stockCode: market.stockCode,
      market: market.market,
      disclosureSource: market.source,
      disclosureSourceUrl: market.sourceUrl,
      domainMatched: true,
      domainMatchType: market.domainComparison.matchType
    });
  }

  const companies = [...companiesByTaxId.values()].sort((a, b) => Number(b.domainMatched) - Number(a.domainMatched));
  const domainMatched = companies.some(company => company.domainMatched);
  const registrationMatched = companies.some(company => validTaxIds.includes(company.taxId));
  const nameMatched = companies.some(company => company.nameMatched);
  const matchedCompanies = companies.filter(company => company.domainMatched);
  const activeRegistration = matchedCompanies.length > 0 && matchedCompanies.every(company =>
    !company.status || company.status === '核准設立' || company.status === '已於證券市場資料申報'
  );
  const verified = domainMatched && activeRegistration;
  const evidence = [];

  for (const company of companies.slice(0, 4)) {
    if (registrationTaxIds.includes(company.taxId) && company.registrationAuthority) {
      evidence.push({
        type: 'business-registration',
        source: '經濟部商工登記公示資料',
        sourceUrl: buildFindBizUrl(company.taxId),
        directDomainMatch: false,
        matchedFields: ['統一編號', '公司/商業名稱', '登記狀態']
      });
    }
    if (company.domainMatched) {
      evidence.push({
        type: 'market-disclosure',
        source: company.disclosureSource,
        sourceUrl: company.disclosureSourceUrl,
        directDomainMatch: true,
        matchType: company.domainMatchType,
        registeredWebsite: company.website,
        matchedFields: ['公司網址', '統一編號', '公司名稱']
      });
    }
  }

  const confidenceScore = Math.min(40, (verified ? 30 : (domainMatched ? 15 : 0)) + (registrationMatched ? 10 : 0) + (verified && nameMatched ? 5 : 0));
  const allUnavailable = marketUnavailable && (registrationResults.length === 0 || registrationResults.every(result => result.status === 'rejected'));
  const status = verified ? 'verified-domain' : (domainMatched ? 'inactive-domain-record' : (registrationMatched ? 'registered-business' : (allUnavailable ? 'unavailable' : 'not-found')));
  return {
    checked: true,
    status,
    verified,
    domainMatched,
    registrationMatched,
    nameMatched,
    activeRegistration,
    confidenceScore,
    scannedDomain,
    companies,
    evidence,
    checkedAt: new Date().toISOString(),
    disclosure: verified
      ? '公開發行市場資料中申報的公司網址與本網域相符。'
      : (domainMatched
        ? '公開市場資料中的公司網址與本網域相符，但目前登記狀態並非核准設立，應進一步複核。'
        : (registrationMatched
        ? '網站揭露的統編可對應合法登記主體，但公開資料尚未直接證明該主體持有此網域。'
        : '未取得可將公司與此網域直接連結的公開資料。')),
    sourcesChecked: MARKET_SOURCES.filter((source, index) => marketResults[index].status === 'fulfilled').map(source => source.name)
  };
}

function jsonResponse(payload, status = 200, cacheSeconds = 0) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cacheSeconds > 0) headers['Cache-Control'] = 'public, max-age=' + cacheSeconds;
  return new Response(JSON.stringify(payload), { status, headers });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const url = new URL(context.request.url);
  const domain = url.searchParams.get('domain') || '';
  const taxIds = (url.searchParams.get('taxIds') || '').split(',').filter(Boolean);
  const names = (url.searchParams.get('names') || '').split('|').map(value => value.slice(0, 80)).filter(Boolean);
  if (!normalizeHostname(domain).includes('.')) {
    return jsonResponse({ checked: false, status: 'invalid', error: 'invalid_domain' }, 400);
  }

  const cache = globalThis.caches?.default || null;
  const normalizedCacheUrl = new URL(context.request.url);
  normalizedCacheUrl.search = '';
  normalizedCacheUrl.searchParams.set('domain', normalizeHostname(domain));
  if (taxIds.length) normalizedCacheUrl.searchParams.set('taxIds', [...new Set(taxIds)].sort().join(','));
  if (names.length) normalizedCacheUrl.searchParams.set('names', [...new Set(names)].sort().join('|'));
  const cacheKey = cache ? new Request(normalizedCacheUrl.toString(), { method: 'GET' }) : null;
  const cached = cacheKey ? await cache.match(cacheKey).catch(() => null) : null;
  if (cached) return cached;

  try {
    const result = await verifyCompanyWebsite({ domain, taxIds, names });
    const response = jsonResponse(result, 200, result.status === 'unavailable' ? 600 : 21600);
    if (cache && cacheKey && response.ok && typeof context.waitUntil === 'function') {
      context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
    }
    return response;
  } catch (error) {
    return jsonResponse({
      checked: false,
      status: 'unavailable',
      verified: false,
      domainMatched: false,
      registrationMatched: false,
      companies: [],
      evidence: [],
      disclosure: '公開資料服務暫時無法連線，本項不納入風險計分。'
    }, 200, 300);
  }
}
