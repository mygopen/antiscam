import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractAnalyticsIdentifiers, normalizeAnalyticsIdentifier } from '../functions/api/analytics-identifiers.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..');
const outputPath = path.join(repoRoot, 'functions/api/synced-analytics-cluster-signals.js');
const HACKERTARGET_ENDPOINT = 'https://api.hackertarget.com/analyticslookup/';
const HACKERTARGET_SOURCE_URL = 'https://hackertarget.com/reverse-analytics-search/';

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseOptions(args = process.argv.slice(2)) {
  const findValue = name => args.find(arg => arg.startsWith(`${name}=`))?.split('=').slice(1).join('=');
  return {
    maxLookups: Math.min(45, parsePositiveInteger(findValue('--max-lookups'), 35)),
    timeoutMs: Math.min(20000, parsePositiveInteger(findValue('--timeout-ms'), 8000)),
    dryRun: args.includes('--dry-run')
  };
}

export function normalizeHostname(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  }
}

export function parseHackerTargetDomains(body = '') {
  const text = String(body || '').trim();
  if (!text || /(api count exceeded|error check your search parameter|invalid api key|no records found)/i.test(text)) return [];
  return [...new Set(text
    .split(/\r?\n/)
    .map(line => normalizeHostname(line.split(/[\s,]+/)[0]))
    .filter(domain => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)))];
}

function loadConfirmedScamDomains(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'risk-config.js' });
  return [...new Set((sandbox.window.RISK_CONFIG?.confirmedScamDomains || []).map(normalizeHostname).filter(Boolean))];
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; MyGoPen-AntiScam-Research/1.0; +https://www.mygopen.com/)'
      }
    });
    if (!response.ok) return '';
    return (await response.text()).slice(0, 1000000);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function extractIdentifiersFromKnownDomain(domain, timeoutMs) {
  const candidateUrls = [
    `https://${domain}/`,
    `https://${domain}/index.php`,
    `http://${domain}/`,
    `http://${domain}/index.php`
  ];
  for (const candidateUrl of candidateUrls) {
    const source = await fetchText(candidateUrl, timeoutMs);
    if (!source) continue;
    const identifiers = extractAnalyticsIdentifiers(source);
    if (identifiers.length > 0) return identifiers;
  }
  return [];
}

async function lookupHackerTarget(identifier, timeoutMs) {
  const body = await fetchText(`${HACKERTARGET_ENDPOINT}?q=${encodeURIComponent(identifier)}`, timeoutMs);
  return parseHackerTargetDomains(body);
}

async function loadPreviousSignals() {
  try {
    const moduleUrl = `${pathToFileURL(outputPath).href}?updated=${Date.now()}`;
    const loaded = await import(moduleUrl);
    return Array.isArray(loaded.syncedAnalyticsClusterSignals) ? loaded.syncedAnalyticsClusterSignals : [];
  } catch {
    return [];
  }
}

export function buildAnalyticsClusterSignals({ directFindings = [], reverseFindings = [], confirmedDomains = [], previousSignals = [], checkedAt } = {}) {
  const confirmedSet = new Set(confirmedDomains.map(normalizeHostname));
  const byIdentifier = new Map();
  const addDomain = (identifier, type, typeLabel, domain, evidenceKind, lastSeenAt = checkedAt) => {
    const id = normalizeAnalyticsIdentifier(identifier);
    const normalizedDomain = normalizeHostname(domain);
    if (!id || !confirmedSet.has(normalizedDomain)) return;
    if (!byIdentifier.has(id)) {
      byIdentifier.set(id, {
        schemaVersion: 1,
        identifier: id,
        type,
        typeLabel,
        highRiskDomains: new Set(),
        evidenceKinds: new Set(),
        lastSeenAt,
        checkedAt
      });
    }
    const record = byIdentifier.get(id);
    record.highRiskDomains.add(normalizedDomain);
    record.evidenceKinds.add(evidenceKind);
    if (String(lastSeenAt || '') > String(record.lastSeenAt || '')) record.lastSeenAt = lastSeenAt;
  };

  directFindings.forEach(finding => addDomain(
    finding.identifier,
    finding.type,
    finding.typeLabel,
    finding.domain,
    'source-code'
  ));
  reverseFindings.forEach(finding => (finding.domains || []).forEach(domain => addDomain(
    finding.identifier,
    finding.type,
    finding.typeLabel,
    domain,
    'hackertarget'
  )));

  // 網站關閉或暫時阻擋爬蟲時保留舊證據，避免一次同步失敗清空索引。
  const retentionCutoff = Date.parse(checkedAt) - (180 * 24 * 60 * 60 * 1000);
  previousSignals.forEach(record => {
    const lastSeenAt = record.lastSeenAt || record.checkedAt;
    const lastSeenTime = Date.parse(lastSeenAt);
    if (Number.isFinite(retentionCutoff) && Number.isFinite(lastSeenTime) && lastSeenTime < retentionCutoff) return;
    (record.highRiskDomains || []).forEach(domain => addDomain(
      record.identifier,
      record.type,
      record.typeLabel,
      domain,
      'previous-sync',
      lastSeenAt
    ));
  });

  return [...byIdentifier.values()]
    .map(record => ({
      schemaVersion: 1,
      identifier: record.identifier,
      type: record.type,
      typeLabel: record.typeLabel,
      highRiskDomains: [...record.highRiskDomains].sort(),
      evidenceSources: [
        ...(record.evidenceKinds.has('source-code') || record.evidenceKinds.has('previous-sync') ? [{
          name: '已知高風險網站原始碼擷取',
          kind: 'source-code'
        }] : []),
        ...(record.evidenceKinds.has('hackertarget') ? [{
          name: 'HackerTarget Reverse Analytics Search',
          kind: 'reverse-analytics',
          url: HACKERTARGET_SOURCE_URL
        }] : []),
        {
          name: '人工確認高風險網域清單',
          kind: 'risk-verdict'
        }
      ],
      lastSeenAt: record.lastSeenAt,
      checkedAt: record.checkedAt
    }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
}

function renderGeneratedModule(records, metadata) {
  return `// Generated by scripts/sync-analytics-cluster-signals.mjs.\n// Manual reviewed records live in manual-analytics-cluster-signals.js.\nexport const analyticsClusterSyncMetadata = ${JSON.stringify(metadata, null, 2)};\n\nexport const syncedAnalyticsClusterSignals = ${JSON.stringify(records, null, 2)};\n`;
}

export async function syncAnalyticsClusterSignals(options = parseOptions()) {
  const riskConfigSource = await fs.readFile(path.join(repoRoot, 'risk-config.js'), 'utf8');
  const confirmedDomains = loadConfirmedScamDomains(riskConfigSource);
  const previousSignals = await loadPreviousSignals();
  const findingsByDomain = await Promise.all(confirmedDomains.map(async domain => {
    const identifiers = await extractIdentifiersFromKnownDomain(domain, options.timeoutMs);
    return identifiers.map(item => ({
      domain,
      identifier: item.id,
      type: item.type,
      typeLabel: item.typeLabel
    }));
  }));
  const directFindings = findingsByDomain.flat();

  const uniqueIdentifiers = [...new Map(directFindings.map(item => [item.identifier, item])).values()];
  const reverseFindings = [];
  for (const finding of uniqueIdentifiers.slice(0, options.maxLookups)) {
    const domains = await lookupHackerTarget(finding.identifier, options.timeoutMs);
    reverseFindings.push({ ...finding, domains });
  }

  const checkedAt = new Date().toISOString();
  const records = buildAnalyticsClusterSignals({
    directFindings,
    reverseFindings,
    confirmedDomains,
    previousSignals,
    checkedAt
  });
  const metadata = {
    schemaVersion: 1,
    generatedAt: checkedAt,
    status: records.length > 0 ? 'ok' : 'no-identifiers-found',
    records: records.length,
    confirmedDomainsChecked: confirmedDomains.length,
    identifiersFound: uniqueIdentifiers.length,
    hackerTargetLookups: Math.min(uniqueIdentifiers.length, options.maxLookups),
    freeLookupProvider: 'HackerTarget Reverse Analytics Search',
    lookupLimitPerRun: options.maxLookups
  };

  if (!options.dryRun) await fs.writeFile(outputPath, renderGeneratedModule(records, metadata), 'utf8');
  return { records, metadata };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await syncAnalyticsClusterSignals();
  console.log(`Analytics cluster sync complete: ${result.metadata.records} identifiers, ${result.metadata.hackerTargetLookups} free lookups.`);
}
