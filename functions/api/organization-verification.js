import {
  compareWebsiteDomain,
  normalizeHostname,
  verifyCompanyWebsite
} from './company-verification.js';
import { trustedCompanyDomainMappingVersion } from './trusted-company-domain-mappings.js';
import {
  trustedLegalEntityDomainMappingVersion,
  trustedLegalEntityDomainMappings
} from './trusted-legal-entity-domain-mappings.js';
import {
  syncedLegalEntityRecords,
  syncedLegalEntityRecordsVersion
} from './synced-legal-entity-records.js';

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeOrganizationName(value) {
  return cleanText(value).toLowerCase().replace(/[台臺]/g, '臺').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function organizationNamesMatch(first, second) {
  const a = normalizeOrganizationName(first);
  const b = normalizeOrganizationName(second);
  return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))));
}

export function getTrustedLegalEntityDomainMapping(domain) {
  const scannedDomain = normalizeHostname(domain);
  if (!scannedDomain) return null;
  return trustedLegalEntityDomainMappings.find(mapping =>
    (mapping.domains || []).some(mappedDomain => compareWebsiteDomain(scannedDomain, mappedDomain).matched)
  ) || null;
}

function getSyncedLegalEntityRecord(mapping) {
  const mappedTaxIds = new Set((mapping?.taxIds || []).map(value => String(value || '').replace(/\D/g, '')));
  return syncedLegalEntityRecords.find(record => mappedTaxIds.has(String(record.taxId || ''))) || null;
}

function buildLegalEntityEvidence(mapping, record) {
  const evidence = [...(mapping?.evidence || [])];
  if (record?.taxRegistration) {
    evidence.push({
      type: 'tax-registration',
      source: record.taxRegistration.source,
      sourceUrl: record.taxRegistration.sourceUrl,
      directDomainMatch: false,
      independentRegistration: true,
      matchedFields: ['統一編號', '組織名稱', '稅籍資料']
    });
  }
  if (record?.judicialRegistration) {
    evidence.push({
      type: 'judicial-registration',
      source: record.judicialRegistration.source,
      sourceUrl: record.judicialRegistration.sourceUrl,
      directDomainMatch: false,
      independentRegistration: true,
      matchedFields: ['法人名稱', '登記法院', '登記號數', '設立日期']
    });
  }
  return evidence.filter(item => item?.source && item?.sourceUrl);
}

export function verifyLegalEntityWebsite({ domain }) {
  const scannedDomain = normalizeHostname(domain);
  const mapping = getTrustedLegalEntityDomainMapping(scannedDomain);
  if (!mapping) return null;

  const record = getSyncedLegalEntityRecord(mapping);
  const evidence = buildLegalEntityEvidence(mapping, record);
  const mappedNames = mapping.names || [];
  const taxRegistrationNameMatched = !!record?.taxRegistration?.name && mappedNames.some(name =>
    organizationNamesMatch(name, record.taxRegistration.name)
  );
  const judicialRegistrationNameMatched = !!record?.judicialRegistration?.name && mappedNames.some(name =>
    organizationNamesMatch(name, record.judicialRegistration.name)
  );
  const mappedTaxIds = new Set((mapping.taxIds || []).map(value => String(value || '').replace(/\D/g, '')));
  const taxIdMatched = !!record?.taxId && mappedTaxIds.has(String(record.taxId));
  const hasTaxRegistration = evidence.some(item => item.type === 'tax-registration' && item.independentRegistration);
  const hasJudicialRegistration = evidence.some(item => item.type === 'judicial-registration' && item.independentRegistration);
  const hasDirectDomainEvidence = evidence.some(item => item.directDomainMatch && item.type === 'domain-registration');
  const registrationMatched = taxIdMatched && hasTaxRegistration && hasJudicialRegistration;
  const nameMatched = taxRegistrationNameMatched && judicialRegistrationNameMatched;
  const domainMatched = hasDirectDomainEvidence;
  const activeRegistration = !!record && record.activeRegistration !== false;
  const verified = domainMatched && registrationMatched && nameMatched && activeRegistration;
  const entity = record ? {
    ...record,
    website: mapping.officialUrl || null,
    domainMatched,
    domainMatchType: 'trusted-legal-entity-domain-mapping',
    nameMatched,
    trustedDomainMapped: true
  } : null;
  const entities = entity ? [entity] : [];

  return {
    checked: true,
    status: verified ? 'verified-domain' : (domainMatched ? 'incomplete-registration-evidence' : 'not-found'),
    verified,
    domainMatched,
    registrationMatched,
    nameMatched,
    activeRegistration,
    confidenceScore: verified ? 40 : (domainMatched ? 15 : 0),
    scannedDomain,
    trustedDomainMappingMatched: true,
    entityType: mapping.entityType || 'legal-entity',
    entities,
    companies: entities,
    evidence,
    checkedAt: new Date().toISOString(),
    disclosure: verified
      ? '財政部稅籍、司法院法人登記與網域註冊資料可交叉連結此網域與登記法人。此結果採條件式信任，強威脅證據仍可翻轉為高風險。'
      : '已有網域對應資料，但尚未同時取得兩個獨立官方登記來源與直接網域證據，因此不納入可信判定。',
    sourcesChecked: evidence.map(item => item.source)
  };
}

function normalizeCompanyResult(result) {
  const entities = (result.companies || []).map(company => ({
    ...company,
    entityType: company.organizationType === '公司' ? 'company' : 'business'
  }));
  return {
    ...result,
    entityType: 'company-or-business',
    entities,
    companies: entities
  };
}

export async function verifyOrganizationWebsite(options) {
  const legalEntityResult = verifyLegalEntityWebsite(options);
  if (legalEntityResult) return legalEntityResult;
  return normalizeCompanyResult(await verifyCompanyWebsite(options));
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
  normalizedCacheUrl.searchParams.set('organizationMapVersion', [
    trustedCompanyDomainMappingVersion,
    trustedLegalEntityDomainMappingVersion,
    syncedLegalEntityRecordsVersion
  ].join('.'));
  if (taxIds.length) normalizedCacheUrl.searchParams.set('taxIds', [...new Set(taxIds)].sort().join(','));
  if (names.length) normalizedCacheUrl.searchParams.set('names', [...new Set(names)].sort().join('|'));
  const cacheKey = cache ? new Request(normalizedCacheUrl.toString(), { method: 'GET' }) : null;
  const cached = cacheKey ? await cache.match(cacheKey).catch(() => null) : null;
  if (cached) return cached;

  try {
    const result = await verifyOrganizationWebsite({ domain, taxIds, names });
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
      entities: [],
      companies: [],
      evidence: [],
      disclosure: '組織與法人公開資料服務暫時無法連線，本項不納入風險計分。'
    }, 200, 300);
  }
}
