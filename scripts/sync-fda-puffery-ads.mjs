#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FDA_BASE_URL = 'https://www.fda.gov.tw';
const FDA_NEWS_LIST_URL = `${FDA_BASE_URL}/TC/news.aspx?cid=5085`;
const DEFAULT_OUTPUT_PATH = 'functions/api/synced-fda-ad-alerts.js';
const USER_AGENT = 'Mozilla/5.0 (compatible; AntiScamFdaIndexer/1.0; +https://github.com/)';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const DOMAIN_SUFFIXES_WITH_SECOND_LEVEL = new Set([
    'com.tw',
    'net.tw',
    'org.tw',
    'edu.tw',
    'gov.tw',
    'idv.tw'
]);
const IGNORED_ROOT_DOMAINS = new Set([
    'fda.gov.tw',
    'mohw.gov.tw',
    'gov.tw',
    'facebook.com',
    'line.me',
    'naver.jp',
    'twitter.com',
    'w3.org'
]);

export function decodeHtml(value = '') {
    return String(value)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function stripTags(value = '') {
    return decodeHtml(String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeDate(value = '') {
    const match = String(value).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return '';
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function toAbsoluteUrl(value) {
    try {
        return new URL(decodeHtml(value), FDA_NEWS_LIST_URL).href;
    } catch {
        return '';
    }
}

function normalizeHostname(value = '') {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
        return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
    } catch {
        return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
}

export function toRootDomain(hostname) {
    const host = normalizeHostname(hostname);
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');
    return DOMAIN_SUFFIXES_WITH_SECOND_LEVEL.has(lastTwo) ? lastThree : lastTwo;
}

function isIgnoredDomain(hostname) {
    const root = toRootDomain(hostname);
    return IGNORED_ROOT_DOMAINS.has(root) || root.endsWith('.gov.tw');
}

export function extractUrlsFromText(text = '') {
    const matches = String(text).match(/https?:\/\/[^\s"'<>「」『』（）()，。；;、]+/gi) || [];
    return [...new Set(matches
        .map(url => decodeHtml(url).replace(/[.,，。;；:：!?！？]+$/g, ''))
        .filter(url => {
            const hostname = normalizeHostname(url);
            return hostname && !isIgnoredDomain(hostname);
        }))];
}

export function parseFdaNewsRows(html = '') {
    const rows = [];
    const rowRegex = /<tr><td[^>]*>\s*(\d+)\s*<\/td><td[^>]*>([\s\S]*?)<\/td><td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const [, index, titleCell, date] = match;
        const linkMatch = titleCell.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;

        const [, href, titleAttribute, linkHtml] = linkMatch;
        const title = stripTags(linkHtml) || decodeHtml(titleAttribute).trim();
        const sourceUrl = toAbsoluteUrl(href);
        if (!title || !sourceUrl) continue;

        rows.push({
            index: Number(index),
            title,
            publishedDate: date,
            sourceUrl,
            recordId: new URL(sourceUrl).searchParams.get('id') || ''
        });
    }

    return rows;
}

export function parseFdaPmdsDetail(html = '') {
    const fields = {};
    const fieldRegex = /<tr><td[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/gi;
    let match;

    while ((match = fieldRegex.exec(html)) !== null) {
        const key = stripTags(match[1]);
        const value = stripTags(match[2]);
        if (key) fields[key] = value;
    }

    const title = stripTags((html.match(/<span class=["']fdtitle["']>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const dateLine = stripTags((html.match(/<span class=["']orangeText["']>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const unit = stripTags((html.match(/<span class=["']whiteText["']>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/^發布單位：/, '');

    return {
        title,
        publishedDate: normalizeDate((dateLine.match(/發布日期：\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || ''),
        maintainedDate: normalizeDate((dateLine.match(/維護日期：\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || ''),
        issuingUnit: unit,
        fields
    };
}

function productNameFromTitle(title = '') {
    const match = String(title).match(/產品：(.+)$/);
    return match ? match[1].trim() : String(title).trim();
}

export function toFdaOfficialAlertRecords(rows, detailsByUrl = new Map()) {
    const alerts = [];

    for (const row of rows) {
        const detail = detailsByUrl.get(row.sourceUrl) || { fields: {} };
        const fields = detail.fields || {};
        const candidateUrlText = [
            fields['涉嫌違規網址'],
            row.title,
            detail.title
        ].filter(Boolean).join(' ');
        const urls = extractUrlsFromText(candidateUrlText);
        const rootDomains = [...new Set(urls
            .map(url => toRootDomain(normalizeHostname(url)))
            .filter(Boolean))]
            .sort();

        if (rootDomains.length === 0) continue;

        const productName = fields['產品名稱'] || productNameFromTitle(row.title);
        const violationType = fields['涉嫌違規態樣'] || '涉嫌違規食藥廣告';
        const warning = fields['建議消費者'] || '上述廣告涉嫌違規，提醒消費者勿信勿購買。';

        alerts.push({
            source: '衛生福利部食品藥物管理署',
            category: '涉嫌違規廣告產品',
            title: detail.title || row.title,
            productName,
            productCategory: fields['產品類別'] || null,
            siteName: fields['網站名稱'] || null,
            rootDomain: rootDomains[0],
            rootDomains,
            urls,
            publishedDate: detail.publishedDate || row.publishedDate,
            monitoredDate: normalizeDate(fields['監控日期'] || ''),
            issuingUnit: detail.issuingUnit || fields['刊登單位'] || null,
            violationType,
            warning,
            claimSummary: fields['涉嫌違規宣稱詞句'] || '',
            sourceUrl: row.sourceUrl,
            syncedFrom: 'fda-puffery-ads',
            recordId: row.recordId
        });
    }

    return mergeAlertRecords(alerts);
}

export function mergeAlertRecords(records) {
    const byKey = new Map();
    for (const record of records) {
        const key = [
            record.sourceUrl,
            (record.rootDomains || [record.rootDomain]).join(','),
            (record.urls || []).join(',')
        ].join('|');
        if (!byKey.has(key)) byKey.set(key, record);
    }
    return [...byKey.values()].sort((a, b) => {
        const dateCompare = String(b.publishedDate || '').localeCompare(String(a.publishedDate || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.sourceUrl || '').localeCompare(String(b.sourceUrl || ''));
    });
}

function parseArgs(argv) {
    const options = {
        maxPages: Number(process.env.FDA_AD_SYNC_MAX_PAGES || 20),
        output: process.env.FDA_AD_SYNC_OUTPUT || DEFAULT_OUTPUT_PATH,
        dryRun: false,
        forceWriteEmpty: false,
        fixtures: null
    };

    for (const arg of argv) {
        if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--force-write-empty') options.forceWriteEmpty = true;
        else if (arg.startsWith('--max-pages=')) options.maxPages = Number(arg.split('=')[1]);
        else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
        else if (arg.startsWith('--fixtures=')) options.fixtures = arg.slice('--fixtures='.length);
    }

    options.maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0 ? Math.floor(options.maxPages) : 1;
    return options;
}

async function fetchWithRetry(url, options = {}) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.5',
                    ...options.headers
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            return response;
        } catch (error) {
            lastError = error;
            if (attempt === MAX_RETRIES) break;
            await new Promise(resolveDelay => setTimeout(resolveDelay, 800 * (attempt + 1)));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError;
}

async function fetchText(url) {
    const response = await fetchWithRetry(url);
    return response.text();
}

async function loadFixtureData(fixturesPath) {
    const raw = JSON.parse(readFileSync(resolve(fixturesPath), 'utf8'));
    return {
        listPages: raw.listPages || [],
        detailsByUrl: new Map(Object.entries(raw.detailsByUrl || {}))
    };
}

async function fetchRowsAndDetails(options) {
    if (options.fixtures) {
        const fixtures = await loadFixtureData(options.fixtures);
        const rows = fixtures.listPages.flatMap(parseFdaNewsRows);
        const detailsByUrl = new Map();
        for (const row of rows) {
            const html = fixtures.detailsByUrl.get(row.sourceUrl);
            if (html) detailsByUrl.set(row.sourceUrl, parseFdaPmdsDetail(html));
        }
        return { rows, detailsByUrl };
    }

    const rows = [];
    const detailsByUrl = new Map();

    for (let page = 1; page <= options.maxPages; page++) {
        const pageUrl = page === 1 ? FDA_NEWS_LIST_URL : `${FDA_NEWS_LIST_URL}&pn=${page}`;
        const pageHtml = await fetchText(pageUrl);
        const pageRows = parseFdaNewsRows(pageHtml);
        console.log(`Fetched FDA puffery ad page ${page}: ${pageRows.length} rows`);
        rows.push(...pageRows);
        if (pageRows.length === 0) break;
    }

    for (const row of rows) {
        try {
            const detailHtml = await fetchText(row.sourceUrl);
            detailsByUrl.set(row.sourceUrl, parseFdaPmdsDetail(detailHtml));
        } catch (error) {
            console.warn(`Skipped FDA detail page: ${row.sourceUrl} (${error.message})`);
        }
    }

    return { rows, detailsByUrl };
}

function renderGeneratedModule(records, metadata) {
    return `// Generated by scripts/sync-fda-puffery-ads.mjs. Manual curated records live in
// functions/api/manual-official-alerts.js.
export const fdaAdSyncMetadata = ${JSON.stringify(metadata, null, 4)};

export const syncedFdaAdAlerts = ${JSON.stringify(records, null, 4)};
`;
}

async function sync(options) {
    const { rows, detailsByUrl } = await fetchRowsAndDetails(options);
    const records = toFdaOfficialAlertRecords(rows, detailsByUrl);
    const metadata = {
        schemaVersion: 1,
        source: '衛生福利部食品藥物管理署',
        sourceUrl: FDA_NEWS_LIST_URL,
        generatedAt: new Date().toISOString(),
        maxPages: options.maxPages,
        recordsFetched: rows.length,
        detailsFetched: detailsByUrl.size,
        recordsWithDomains: records.length
    };

    console.log(`FDA ad rows fetched: ${rows.length}`);
    console.log(`FDA detail pages parsed: ${detailsByUrl.size}`);
    console.log(`FDA records with extracted domains: ${records.length}`);

    if (records.length === 0 && !options.forceWriteEmpty) {
        console.log('No domain-indexable FDA ad records were produced; leaving existing generated file unchanged.');
        return { records, metadata, wrote: false };
    }

    if (!options.dryRun) {
        const outputPath = resolve(options.output);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, renderGeneratedModule(records, metadata));
        console.log(`Wrote ${records.length} records to ${outputPath}`);
    }

    return { records, metadata, wrote: !options.dryRun };
}

const isCli = existsSync(process.argv[1] || '') && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    sync(parseArgs(process.argv.slice(2))).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
