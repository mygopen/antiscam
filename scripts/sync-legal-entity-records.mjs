#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { trustedLegalEntityDomainMappings } from '../functions/api/trusted-legal-entity-domain-mappings.js';

const TAX_REGISTRATION_URL = 'https://eip.fia.gov.tw/data/BGMOPEN1.csv';
const JUDICIAL_QUERY_URL = 'https://aomp109.judicial.gov.tw/judbp/whd6k/WHD6K01.htm';
const JUDICIAL_CSV_URL = courtCode => `https://aomp109.judicial.gov.tw/judbp/whd6k/WHD6K01/PUB_DATA/${courtCode}_RA.csv`;
const DEFAULT_OUTPUT_PATH = 'functions/api/synced-legal-entity-records.js';
const REQUEST_TIMEOUT_MS = 120000;

const COURT_NAMES = {
  TPD: '臺灣臺北地方法院', PCD: '臺灣新北地方法院', SLD: '臺灣士林地方法院',
  TYD: '臺灣桃園地方法院', SCD: '臺灣新竹地方法院', MLD: '臺灣苗栗地方法院',
  TCD: '臺灣臺中地方法院', NTD: '臺灣南投地方法院', CHD: '臺灣彰化地方法院',
  ULD: '臺灣雲林地方法院', CYD: '臺灣嘉義地方法院', TND: '臺灣臺南地方法院',
  CTD: '臺灣橋頭地方法院', KSD: '臺灣高雄地方法院', PTD: '臺灣屏東地方法院',
  TTD: '臺灣臺東地方法院', HLD: '臺灣花蓮地方法院', ILD: '臺灣宜蘭地方法院',
  KLD: '臺灣基隆地方法院', PHD: '臺灣澎湖地方法院', LCD: '福建連江地方法院',
  KMD: '福建金門地方法院'
};

function cleanText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/[\u0000-\u001f\u007f\u3000]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return cleanText(value).toLowerCase().replace(/[台臺]/g, '臺').replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

function normalizeRocDate(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 7) return '';
  return `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
}

export function createCsvRowParser(onRow) {
  let row = [];
  let field = '';
  let state = 'plain';

  const finishField = () => {
    row.push(field);
    field = '';
  };
  const finishRow = () => {
    finishField();
    if (row.some(value => value !== '')) onRow(row);
    row = [];
  };

  return {
    push(chunk) {
      const input = String(chunk || '');
      for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (state === 'quoted') {
          if (char === '"') state = 'after-quote';
          else field += char;
          continue;
        }
        if (state === 'after-quote') {
          if (char === '"') {
            field += '"';
            state = 'quoted';
          } else if (char === ',') {
            finishField();
            state = 'plain';
          } else if (char === '\n') {
            finishRow();
            state = 'plain';
          } else if (char !== '\r') {
            field += char;
            state = 'plain';
          }
          continue;
        }
        if (char === '"' && field === '') state = 'quoted';
        else if (char === ',') finishField();
        else if (char === '\n') finishRow();
        else if (char !== '\r') field += char;
      }
    },
    finish() {
      if (state === 'quoted') throw new Error('CSV ended inside a quoted field');
      if (field !== '' || row.length > 0) finishRow();
    }
  };
}

export function parseCsvText(text) {
  const rows = [];
  const parser = createCsvRowParser(row => rows.push(row));
  parser.push(text);
  parser.finish();
  return rows;
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [cleanText(header), cleanText(row[index])]));
}

async function fetchCsv(url, onRecord) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/csv,*/*', 'User-Agent': 'MyGoPen-AntiScam-LegalEntitySync/1.0' },
      signal: controller.signal
    });
    if (!response.ok || !response.body) throw new Error(`Unable to download ${url}: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let headers = null;
    const parser = createCsvRowParser(row => {
      if (!headers) headers = row.map(cleanText);
      else onRecord(rowToObject(headers, row));
    });
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.finish();
  } finally {
    clearTimeout(timeout);
  }
}

function latestByRegistrationDate(records) {
  return [...records].sort((a, b) => String(b.registrationDate || '').localeCompare(String(a.registrationDate || '')))[0] || null;
}

export function buildLegalEntityRecords(mappings, taxRecords, judicialRecordsByCourt) {
  return mappings.map(mapping => {
    const taxId = String(mapping.taxIds?.[0] || '').replace(/\D/g, '');
    const expectedNames = (mapping.names || []).map(normalizeName);
    const tax = taxRecords.find(record => record.taxId === taxId && expectedNames.includes(normalizeName(record.name)));
    const judicialRows = (judicialRecordsByCourt.get(mapping.courtCode) || []).filter(record =>
      expectedNames.includes(normalizeName(record.name))
    );
    const judicial = latestByRegistrationDate(judicialRows);
    if (!tax) throw new Error(`Missing tax registration match for ${taxId}`);
    if (!judicial) throw new Error(`Missing judicial registration match for ${mapping.names?.[0] || taxId}`);

    const canceledAt = judicialRows.map(record => record.canceledAt).filter(Boolean).sort().at(-1) || '';
    const revokedAt = judicialRows.map(record => record.revokedAt).filter(Boolean).sort().at(-1) || '';
    const activeRegistration = !canceledAt && !revokedAt;
    const setupDate = judicialRows.map(record => record.setupDate).filter(Boolean).sort()[0] || tax.setupDate || '';

    return {
      taxId,
      name: judicial.name || tax.name,
      entityType: mapping.entityType || 'legal-entity',
      organizationType: mapping.organizationType || '法人',
      status: activeRegistration ? '登記資料相符' : '登記已撤銷或註銷',
      activeRegistration,
      capital: tax.capital || null,
      setupDate: setupDate || null,
      registrationCourt: COURT_NAMES[mapping.courtCode] || mapping.courtCode,
      registrationNumber: judicial.registrationNumber || null,
      registrationAuthority: mapping.registrationAuthority || null,
      taxRegistration: {
        taxId,
        name: tax.name,
        setupDate: tax.setupDate || null,
        organizationType: tax.organizationType || null,
        capital: tax.capital || null,
        source: '財政部全國營業（稅籍）登記資料集',
        sourceUrl: TAX_REGISTRATION_URL
      },
      judicialRegistration: {
        name: judicial.name,
        courtCode: mapping.courtCode,
        registrationCourt: COURT_NAMES[mapping.courtCode] || mapping.courtCode,
        registrationNumber: judicial.registrationNumber || null,
        setupDate: setupDate || null,
        latestRegistrationDate: judicial.registrationDate || null,
        canceledAt: canceledAt || null,
        revokedAt: revokedAt || null,
        status: activeRegistration ? '登記資料相符' : '登記已撤銷或註銷',
        source: '司法院法人登記資料',
        sourceUrl: JUDICIAL_QUERY_URL
      }
    };
  }).sort((a, b) => a.taxId.localeCompare(b.taxId));
}

function renderModule(records) {
  const serialized = JSON.stringify(records, null, 2);
  const version = createHash('sha256').update(serialized).digest('hex').slice(0, 12);
  return `// Generated by scripts/sync-legal-entity-records.mjs. Keep this file deterministic.\nexport const syncedLegalEntityRecordsVersion = '${version}';\n\nexport const syncedLegalEntityRecords = ${serialized};\n`;
}

export async function syncLegalEntityRecords({ output = DEFAULT_OUTPUT_PATH } = {}) {
  const targetTaxIds = new Set(trustedLegalEntityDomainMappings.flatMap(mapping => mapping.taxIds || []).map(String));
  const targetNames = new Set(trustedLegalEntityDomainMappings.flatMap(mapping => mapping.names || []).map(normalizeName));
  const taxRecords = [];
  await fetchCsv(TAX_REGISTRATION_URL, row => {
    const taxId = String(row['統一編號'] || '').replace(/\D/g, '');
    if (!targetTaxIds.has(taxId)) return;
    taxRecords.push({
      taxId,
      name: row['營業人名稱'],
      capital: Number(String(row['資本額'] || '').replace(/[^\d]/g, '')) || null,
      setupDate: normalizeRocDate(row['設立日期']),
      organizationType: row['組織別名稱']
    });
  });

  const judicialRecordsByCourt = new Map();
  const courtCodes = [...new Set(trustedLegalEntityDomainMappings.map(mapping => mapping.courtCode).filter(Boolean))].sort();
  for (const courtCode of courtCodes) {
    const records = [];
    await fetchCsv(JUDICIAL_CSV_URL(courtCode), row => {
      if (!targetNames.has(normalizeName(row['法人名稱']))) return;
      records.push({
        name: row['法人名稱'],
        registrationNumber: row['登記號數'],
        registrationDate: normalizeRocDate(row['登記日期']),
        setupDate: normalizeRocDate(row['設立登記日期']),
        canceledAt: normalizeRocDate(row['註銷日期']),
        revokedAt: normalizeRocDate(row['撤銷日期'])
      });
    });
    judicialRecordsByCourt.set(courtCode, records);
  }

  const records = buildLegalEntityRecords(trustedLegalEntityDomainMappings, taxRecords, judicialRecordsByCourt);
  const outputPath = resolve(output);
  writeFileSync(outputPath, renderModule(records), 'utf8');
  return { outputPath, count: records.length };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  syncLegalEntityRecords({
    output: process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length) || DEFAULT_OUTPUT_PATH
  }).then(result => {
    process.stdout.write(`Synced ${result.count} legal entity record(s) to ${result.outputPath}\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
