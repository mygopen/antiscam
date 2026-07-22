import {
  getAnalyticsIdentifierType,
  normalizeAnalyticsIdentifier
} from './analytics-identifiers.js';
import { manualAnalyticsClusterSignals } from './manual-analytics-cluster-signals.js';
import {
  analyticsClusterSyncMetadata,
  syncedAnalyticsClusterSignals
} from './synced-analytics-cluster-signals.js';

function normalizeHostname(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  }
}

function dedupeEvidenceSources(sources = []) {
  const seen = new Set();
  return sources.filter(source => {
    const key = `${source?.name || ''}|${source?.url || ''}`;
    if (!source?.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeAnalyticsCluster({ identifiers = [], domain = '', records } = {}) {
  const currentDomain = normalizeHostname(domain);
  const allRecords = Array.isArray(records) ? records : [
    ...manualAnalyticsClusterSignals,
    ...syncedAnalyticsClusterSignals
  ];
  const normalizedIdentifiers = [...new Set(identifiers
    .map(item => normalizeAnalyticsIdentifier(typeof item === 'string' ? item : item?.id))
    .filter(Boolean))].slice(0, 20);

  const items = normalizedIdentifiers.map(id => {
    const typeInfo = getAnalyticsIdentifierType(id);
    const matchingRecords = allRecords.filter(record => normalizeAnalyticsIdentifier(record?.identifier) === id);
    const highRiskDomains = [...new Set(matchingRecords
      .flatMap(record => Array.isArray(record.highRiskDomains) ? record.highRiskDomains : [])
      .map(normalizeHostname)
      .filter(relatedDomain => relatedDomain && relatedDomain !== currentDomain))];
    const evidenceSources = dedupeEvidenceSources(matchingRecords.flatMap(record => record.evidenceSources || []));

    return {
      id,
      type: typeInfo?.type || 'unknown',
      typeLabel: typeInfo?.label || '未知分析識別碼',
      knownHighRiskCount: highRiskDomains.length,
      highRiskDomains,
      evidenceSources
    };
  });

  const relatedDomains = [...new Set(items.flatMap(item => item.highRiskDomains))];
  const matchedItems = items.filter(item => item.knownHighRiskCount > 0);
  const evidenceSources = dedupeEvidenceSources(matchedItems.flatMap(item => item.evidenceSources));
  const knownHighRiskCount = relatedDomains.length;
  const detectedCount = items.length;

  return {
    checked: true,
    matched: knownHighRiskCount > 0,
    status: knownHighRiskCount > 0 ? 'warning' : (detectedCount > 0 ? 'info' : 'safe'),
    detectedCount,
    matchedIdentifierCount: matchedItems.length,
    knownHighRiskCount,
    relatedDomains,
    items,
    evidenceSources,
    details: knownHighRiskCount > 0
      ? `擷取到 ${detectedCount} 個分析識別碼，其中 ${matchedItems.length} 個與 ${knownHighRiskCount} 個已知高風險網域共享。此項僅為站群關聯線索，不能單獨證明網站為詐騙。`
      : (detectedCount > 0
        ? `擷取到 ${detectedCount} 個分析識別碼，目前未在已知高風險站群索引中發現關聯。`
        : '未從可讀取的網頁原始碼擷取到支援的分析識別碼。')
  };
}

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const domain = requestUrl.searchParams.get('domain') || '';
  const identifiers = requestUrl.searchParams.getAll('id');
  const summary = summarizeAnalyticsCluster({ identifiers, domain });

  return new Response(JSON.stringify({
    ...summary,
    sync: analyticsClusterSyncMetadata
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
