const DGPA_ORG_LIST_CSV_URL = 'https://www.dgpa.gov.tw/open/code/orglist.csv';
const DGPA_ORG_LIST_DATASET_URL = 'https://data.gov.tw/dataset/7307';

const SECOND_LEVEL_SUFFIXES = new Set([
  'com.tw', 'org.tw', 'net.tw', 'gov.tw', 'edu.tw', 'mil.tw', 'idv.tw', 'game.tw', 'ebiz.tw', 'club.tw',
  'co.uk', 'org.uk', 'gov.uk', 'co.jp', 'ne.jp', 'or.jp', 'com.hk', 'com.cn', 'net.cn', 'org.cn',
  'com.au', 'net.au', 'org.au', 'co.nz', 'com.sg', 'com.my', 'co.kr', 'com.vn', 'eu.cc'
]);

const TAIWAN_GOV_ROOT_AGENCY_NAMES = {
  'gov.tw': '中華民國政府',
  'kcg.gov.tw': '高雄市政府',
  'ntpc.gov.tw': '新北市政府',
  'taipei.gov.tw': '臺北市政府',
  'tycg.gov.tw': '桃園市政府',
  'taichung.gov.tw': '臺中市政府',
  'tainan.gov.tw': '臺南市政府',
  'klcg.gov.tw': '基隆市政府',
  'hccg.gov.tw': '新竹市政府',
  'hchg.gov.tw': '新竹縣政府',
  'miaoli.gov.tw': '苗栗縣政府',
  'changhua.gov.tw': '彰化縣政府',
  'nantou.gov.tw': '南投縣政府',
  'yunlin.gov.tw': '雲林縣政府',
  'cyhg.gov.tw': '嘉義縣政府',
  'chiayi.gov.tw': '嘉義市政府',
  'pthg.gov.tw': '屏東縣政府',
  'taitung.gov.tw': '臺東縣政府',
  'hl.gov.tw': '花蓮縣政府',
  'penghu.gov.tw': '澎湖縣政府',
  'kinmen.gov.tw': '金門縣政府',
  'matsu.gov.tw': '連江縣政府'
};

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

export function isOfficialTaiwanGovDomain(value) {
  const hostname = normalizeHostname(value);
  return hostname === 'gov.tw' || hostname.endsWith('.gov.tw');
}

export function getRegistrableDomain(value) {
  const hostname = normalizeHostname(value);
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join('.');
  return parts.slice(SECOND_LEVEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

function normalizeAgencyName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[台臺]/g, '臺')
    .replace(/^(主管機關|主辦單位|協辦單位|承辦單位|公告單位|申請單位|服務機關|發布單位|聯絡單位|承辦機關|機關名稱|單位)[:：\s　]*/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function agencyNamesMatch(candidate, officialName) {
  const candidateName = normalizeAgencyName(candidate);
  const official = normalizeAgencyName(officialName);
  if (!candidateName || !official) return false;
  if (candidateName === official) return true;
  return Math.min(candidateName.length, official.length) >= 6 &&
    (candidateName.includes(official) || official.includes(candidateName));
}

export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(item => item.some(value => cleanText(value)));
}

function decodeCsvBuffer(buffer, contentType = '') {
  const preferred = /big5|ms950|950/i.test(contentType) ? ['big5', 'utf-8'] : ['utf-8', 'big5'];
  const decoded = preferred.map(encoding => {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      const replacementCount = (text.match(/\uFFFD/g) || []).length;
      const headerScore = /機關代碼|機關名稱/.test(text) ? 100 : 0;
      return { encoding, text, score: headerScore - replacementCount };
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
  decoded.sort((a, b) => b.score - a.score);
  return decoded[0]?.text || '';
}

export function parseDgpaOrgCsv(text) {
  const rows = parseCsvRows(text);
  const headers = rows[0]?.map(cleanText) || [];
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cleanText(values[index]);
    });
    return {
      code: record['機關代碼'] || '',
      name: record['機關名稱'] || '',
      englishName: record['機關英文名稱'] || '',
      postalCode: record['郵遞區號'] || '',
      address: record['機關地址'] || '',
      phone: record['機關電話'] || '',
      parentCode: record['主管機關代碼'] || '',
      parentName: record['主管機關名稱'] || '',
      fax: record['傳真'] || '',
      effectiveDate: record['機關生效日期'] || '',
      abolishedDate: record['機關裁撤日期'] || '',
      level: record['機關層級'] || '',
      abolishedFlag: record['裁撤註記'] || '',
      newCode: record['新機關代碼'] || '',
      newName: record['新機關名稱'] || ''
    };
  }).filter(record => record.code && record.name);
}

function isActiveAgency(record) {
  return !record.abolishedDate && !/^(是|y|yes|true|1)$/i.test(record.abolishedFlag || '');
}

async function fetchDgpaOrgRecords(fetcher) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetcher(DGPA_ORG_LIST_CSV_URL, {
      headers: { Accept: 'text/csv,*/*', 'User-Agent': 'MyGoPen-AntiScam-GovAgencyVerifier/1.0' },
      cf: { cacheEverything: true, cacheTtl: 86400 },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('upstream_' + response.status);
    const buffer = await response.arrayBuffer();
    const text = decodeCsvBuffer(buffer, response.headers.get('Content-Type') || '');
    return parseDgpaOrgCsv(text).filter(isActiveAgency);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildCandidateNames({ domain, siteName = '', agencyName = '', rootAgency = '' }) {
  const rootDomain = getRegistrableDomain(domain);
  const rootAgencyHint = TAIWAN_GOV_ROOT_AGENCY_NAMES[rootDomain] || '';
  const candidates = [
    { value: agencyName, source: 'page-agency' },
    { value: rootAgency, source: 'page-root-agency' },
    { value: rootAgencyHint, source: 'domain-root-agency' },
    { value: siteName, source: 'page-title' }
  ].filter(item => cleanText(item.value));
  const seen = new Set();
  return candidates.filter(item => {
    const normalized = normalizeAgencyName(item.value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function findAgencyMatches(records, candidates) {
  const matches = [];
  for (const candidate of candidates) {
    for (const record of records) {
      if (!agencyNamesMatch(candidate.value, record.name)) continue;
      const exact = normalizeAgencyName(candidate.value) === normalizeAgencyName(record.name);
      matches.push({
        ...record,
        matchedCandidate: cleanText(candidate.value),
        matchedCandidateSource: candidate.source,
        matchType: exact ? 'exact-name' : 'contains-name',
        directAgencyMatch: candidate.source === 'page-agency'
      });
    }
  }
  const byCode = new Map();
  for (const match of matches) {
    const existing = byCode.get(match.code);
    if (!existing || Number(match.matchType === 'exact-name') > Number(existing.matchType === 'exact-name') ||
      (match.directAgencyMatch && !existing.directAgencyMatch)) {
      byCode.set(match.code, match);
    }
  }
  return [...byCode.values()].sort((a, b) =>
    Number(b.directAgencyMatch) - Number(a.directAgencyMatch) ||
    Number(b.matchType === 'exact-name') - Number(a.matchType === 'exact-name') ||
    Number(a.level || 99) - Number(b.level || 99)
  ).slice(0, 5);
}

function buildEvidence(matches) {
  return matches.map(match => ({
    type: 'dgpa-org-code',
    source: '行政院所屬中央及地方機關代碼',
    sourceUrl: DGPA_ORG_LIST_DATASET_URL,
    directAgencyMatch: match.directAgencyMatch,
    matchType: match.matchType,
    matchedFields: ['機關名稱', '機關代碼', '主管機關名稱'],
    matchedCandidate: match.matchedCandidate
  }));
}

export async function verifyGovernmentAgency({ domain, siteName = '', agencyName = '', rootAgency = '', fetcher = fetch }) {
  const scannedDomain = normalizeHostname(domain);
  if (!scannedDomain || !scannedDomain.includes('.')) {
    return { checked: false, status: 'invalid', officialDomain: false, verified: false, agencies: [], evidence: [] };
  }
  if (!isOfficialTaiwanGovDomain(scannedDomain)) {
    return { checked: true, status: 'not-applicable', officialDomain: false, verified: false, scannedDomain, agencies: [], evidence: [] };
  }

  const rootDomain = getRegistrableDomain(scannedDomain);
  const domainRootAgency = TAIWAN_GOV_ROOT_AGENCY_NAMES[rootDomain] || '';
  const candidates = buildCandidateNames({ domain: scannedDomain, siteName, agencyName, rootAgency });
  let records = [];
  try {
    records = await fetchDgpaOrgRecords(fetcher);
  } catch (error) {
    return {
      checked: false,
      status: 'unavailable',
      officialDomain: true,
      verified: false,
      scannedDomain,
      rootDomain,
      siteName: cleanText(siteName),
      agencyName: cleanText(agencyName),
      rootAgency: cleanText(rootAgency) || domainRootAgency,
      agencies: [],
      evidence: [],
      disclosure: '政府機關公開資料暫時無法查詢，本項先不顯示；.gov.tw 官方網域仍會保留安全判定。'
    };
  }

  const matches = findAgencyMatches(records, candidates);
  const directAgencyMatched = matches.some(match => match.directAgencyMatch);
  const verified = matches.length > 0;
  const status = directAgencyMatched ? 'verified-agency' : (verified ? 'verified-root-agency' : 'official-domain-only');
  return {
    checked: true,
    status,
    officialDomain: true,
    verified,
    directAgencyMatched,
    scannedDomain,
    rootDomain,
    siteName: cleanText(siteName),
    agencyName: cleanText(agencyName),
    rootAgency: cleanText(rootAgency) || domainRootAgency,
    domainRootAgency,
    agencies: matches,
    evidence: buildEvidence(matches),
    checkedAt: new Date().toISOString(),
    disclosure: directAgencyMatched
      ? '頁面擷取的機關/單位名稱可對應行政院人事行政總處公開機關代碼資料。'
      : (verified
        ? '政府根網域可對應行政院人事行政總處公開機關代碼資料；頁面服務名稱仍需搭配內容判讀。'
        : '已確認為 .gov.tw 官方網域，但尚未在公開機關代碼資料中比對到頁面擷取的機關名稱。'),
    sourcesChecked: ['行政院所屬中央及地方機關代碼']
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
  const siteName = (url.searchParams.get('siteName') || '').slice(0, 80);
  const agencyName = (url.searchParams.get('agencyName') || '').slice(0, 80);
  const rootAgency = (url.searchParams.get('rootAgency') || '').slice(0, 80);
  if (!normalizeHostname(domain).includes('.')) {
    return jsonResponse({ checked: false, status: 'invalid', error: 'invalid_domain' }, 400);
  }

  const cache = globalThis.caches?.default || null;
  const normalizedCacheUrl = new URL(context.request.url);
  normalizedCacheUrl.search = '';
  normalizedCacheUrl.searchParams.set('domain', normalizeHostname(domain));
  if (siteName) normalizedCacheUrl.searchParams.set('siteName', cleanText(siteName));
  if (agencyName) normalizedCacheUrl.searchParams.set('agencyName', cleanText(agencyName));
  if (rootAgency) normalizedCacheUrl.searchParams.set('rootAgency', cleanText(rootAgency));
  const cacheKey = cache ? new Request(normalizedCacheUrl.toString(), { method: 'GET' }) : null;
  const cached = cacheKey ? await cache.match(cacheKey).catch(() => null) : null;
  if (cached) return cached;

  const result = await verifyGovernmentAgency({ domain, siteName, agencyName, rootAgency });
  const response = jsonResponse(result, 200, result.status === 'unavailable' ? 600 : 21600);
  if (cache && cacheKey && response.ok && typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  }
  return response;
}
