#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FTC_BASE_URL = 'https://www.ftc.gov.tw';
const FTC_DECISION_LIST_URL = `${FTC_BASE_URL}/internet/main/decision/decisionlist.aspx?mid=11`;
const DEFAULT_OUTPUT_PATH = 'functions/api/synced-official-penalty-records.js';
const DEFAULT_CACHE_DIR = '.cache/ftc-decisions';
const USER_AGENT = 'Mozilla/5.0 (compatible; AntiScamFTCIndexer/1.0; +https://github.com/)';
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
    'adobe.com',
    'ftc.gov.tw',
    'gov.tw',
    'purl.org',
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
        return new URL(decodeHtml(value), FTC_BASE_URL).href;
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
        .map(url => url.replace(/[.,，。;；:：!?！？]+$/g, ''))
        .filter(url => {
            const hostname = normalizeHostname(url);
            return hostname && !isIgnoredDomain(hostname);
        }))];
}

export function extractDomainsFromText(text = '') {
    const normalized = String(text).replace(/\s+/g, ' ');
    const bareDomainMatches = normalized.match(/\b(?:[a-z0-9-]+\.)+(?:com\.tw|net\.tw|org\.tw|idv\.tw|tw|com|net|org|cc|shop|store|site|info|app)\b/gi) || [];
    const urlDomains = extractUrlsFromText(normalized).map(url => normalizeHostname(url));
    const domains = [...bareDomainMatches, ...urlDomains]
        .map(normalizeHostname)
        .filter(domain => domain && !isIgnoredDomain(domain));
    return [...new Set(domains)].sort();
}

export function parseDecisionRows(html = '') {
    const rows = [];
    const rowRegex = /<ul class="result-list">([\s\S]*?)<\/ul>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const block = match[1];
        const date = normalizeDate((block.match(/<span>\s*發文日期\s*<\/span>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
        const type = stripTags((block.match(/<span>\s*類型\s*<\/span>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
        const law = stripTags((block.match(/<span>\s*相關法條\s*<\/span>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
        const reasonBlock = (block.match(/<li class="result-reason">([\s\S]*?)<\/li>/) || [])[1] || '';
        const linkMatch = reasonBlock.match(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*title=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;

        const [, href, titleAttribute, linkHtml] = linkMatch;
        const titleFromParagraph = stripTags((linkHtml.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '');
        const title = titleFromParagraph || decodeHtml(titleAttribute).replace(/\.pdf$/i, '').trim();
        const sourceUrl = toAbsoluteUrl(href);

        if (!date || !title || !sourceUrl) continue;

        rows.push({
            date,
            type,
            law,
            title,
            sourceUrl,
            recordId: basename(new URL(sourceUrl).pathname, '.pdf')
        });
    }

    return rows;
}

export function isConsumerFacingDecision(row) {
    const haystack = `${row.law} ${row.title}`;
    return /公平交易法第21條|公平交易法第25條/.test(row.law) &&
        /廣告|虛偽不實|引人錯誤|網路|網站|商城|購物|銷售|商品|服務|一頁式|平台|蝦皮|momo|PChome|露天|LINE|臉書|Facebook|Instagram/i.test(haystack);
}

function inferCategory(row) {
    if (/第21條/.test(row.law) || /廣告|虛偽不實|引人錯誤/.test(row.title)) return '廣告不實處分';
    if (/第25條/.test(row.law)) return '交易秩序處分';
    return '公平交易法處分';
}

function inferWarning(row, rootDomains) {
    const domainText = rootDomains.length ? `，涉及網域：${rootDomains.join('、')}` : '';
    return `公平交易委員會行政決定列表記載：${row.title}${domainText}。`;
}

export function toOfficialAlertRecords(rows, pdfTextsByUrl = new Map()) {
    const alerts = [];

    for (const row of rows) {
        if (!isConsumerFacingDecision(row)) continue;

        const pdfText = pdfTextsByUrl.get(row.sourceUrl) || '';
        const urls = extractUrlsFromText(pdfText);
        const domains = extractDomainsFromText(`${row.title} ${pdfText}`);
        const rootDomains = [...new Set(domains.map(toRootDomain).filter(Boolean))]
            .filter(root => !IGNORED_ROOT_DOMAINS.has(root))
            .sort();

        if (rootDomains.length === 0) continue;

        alerts.push({
            source: '中華民國公平交易委員會',
            category: inferCategory(row),
            title: row.title,
            productName: row.title,
            rootDomain: rootDomains[0],
            rootDomains,
            urls,
            publishedDate: row.date,
            decisionType: row.type,
            violationType: row.law,
            warning: inferWarning(row, rootDomains),
            claimSummary: '此為公平交易委員會行政決定同步資料造成的消費風險訊號；建議查證交易條件、退貨與客服資訊。',
            sourceUrl: row.sourceUrl,
            syncedFrom: 'ftc-decision-list',
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
        maxPages: Number(process.env.FTC_SYNC_MAX_PAGES || 12),
        output: process.env.FTC_SYNC_OUTPUT || DEFAULT_OUTPUT_PATH,
        cacheDir: process.env.FTC_SYNC_CACHE_DIR || DEFAULT_CACHE_DIR,
        dryRun: false,
        forceWriteEmpty: false
    };

    for (const arg of argv) {
        if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--force-write-empty') options.forceWriteEmpty = true;
        else if (arg.startsWith('--max-pages=')) options.maxPages = Number(arg.split('=')[1]);
        else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
        else if (arg.startsWith('--cache-dir=')) options.cacheDir = arg.slice('--cache-dir='.length);
    }

    options.maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0 ? Math.floor(options.maxPages) : 1;
    return options;
}

function parseHiddenInputs(html) {
    const fields = {};
    const inputRegex = /<input\s+[^>]*type=["']hidden["'][^>]*>/gi;
    const nameRegex = /\sname=["']([^"']+)["']/i;
    const valueRegex = /\svalue=["']([^"']*)["']/i;
    let match;
    while ((match = inputRegex.exec(html)) !== null) {
        const tag = match[0];
        const name = (tag.match(nameRegex) || [])[1];
        if (!name) continue;
        fields[decodeHtml(name)] = decodeHtml((tag.match(valueRegex) || [])[1] || '');
    }
    return fields;
}

function updateCookieJar(cookieJar, response) {
    const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const cookie of setCookie) {
        const [pair] = cookie.split(';');
        const [name, value] = pair.split('=');
        if (name && value) cookieJar.set(name.trim(), value.trim());
    }
}

function cookieHeader(cookieJar) {
    return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function fetchWithRetry(url, options = {}, cookieJar = new Map()) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const headers = {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.5',
                ...options.headers
            };
            const cookies = cookieHeader(cookieJar);
            if (cookies) headers.Cookie = cookies;

            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal
            });
            updateCookieJar(cookieJar, response);
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

async function fetchDecisionPage(pageNumber, state, cookieJar) {
    if (pageNumber === 1) {
        const response = await fetchWithRetry(FTC_DECISION_LIST_URL, {}, cookieJar);
        const html = await response.text();
        return { html, fields: parseHiddenInputs(html) };
    }

    const form = new URLSearchParams({
        ...state.fields,
        __EVENTTARGET: 'ctl00$ContentPlaceHolder1$dl_toPage',
        __EVENTARGUMENT: '',
        'ctl00$ContentPlaceHolder1$PdfKeyWords': '',
        'ctl00$ContentPlaceHolder1$FormalDocDateStart': '',
        'ctl00$ContentPlaceHolder1$FormalDocDateEnd': '',
        'ctl00$ContentPlaceHolder1$CaseKindID': '',
        'ctl00$ContentPlaceHolder1$LawID': '',
        'ctl00$ContentPlaceHolder1$lawList': '',
        'ctl00$ContentPlaceHolder1$dl_toPage': String(pageNumber)
    });

    const response = await fetchWithRetry(FTC_DECISION_LIST_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: FTC_DECISION_LIST_URL
        },
        body: form
    }, cookieJar);
    const html = await response.text();
    return { html, fields: parseHiddenInputs(html) };
}

function hasPdftotext() {
    try {
        execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function fetchPdfText(url, cacheDir, cookieJar) {
    mkdirSync(cacheDir, { recursive: true });
    const pdfPath = resolve(cacheDir, basename(new URL(url).pathname));

    if (!existsSync(pdfPath)) {
        const response = await fetchWithRetry(url, {
            headers: {
                Accept: 'application/pdf'
            }
        }, cookieJar);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(pdfPath, buffer);
    }

    const result = spawnSync('pdftotext', ['-layout', '-nopgbrk', '-enc', 'UTF-8', pdfPath, '-'], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024
    });

    if (result.status !== 0) {
        throw new Error(result.stderr || `pdftotext failed for ${url}`);
    }

    return result.stdout;
}

function renderGeneratedModule(records, metadata) {
    return `// Generated by scripts/sync-ftc-decisions.mjs. Manual curated records live in
// functions/api/manual-official-alerts.js.
export const officialPenaltySyncMetadata = ${JSON.stringify(metadata, null, 4)};

export const syncedOfficialPenaltyRecords = ${JSON.stringify(records, null, 4)};
`;
}

async function sync(options) {
    const cookieJar = new Map();
    let state = { fields: {} };
    const rows = [];

    for (let page = 1; page <= options.maxPages; page++) {
        const pageData = await fetchDecisionPage(page, state, cookieJar);
        state = pageData;
        const pageRows = parseDecisionRows(pageData.html);
        console.log(`Fetched FTC decision page ${page}: ${pageRows.length} rows`);
        rows.push(...pageRows);
        if (pageRows.length === 0) break;
    }

    const candidateRows = rows.filter(isConsumerFacingDecision);
    const pdfExtractorAvailable = hasPdftotext();
    const pdfTextsByUrl = new Map();

    if (!pdfExtractorAvailable) {
        console.log('pdftotext is not available; parsed decision list only and skipped PDF domain extraction.');
    } else {
        for (const row of candidateRows) {
            try {
                const text = await fetchPdfText(row.sourceUrl, options.cacheDir, cookieJar);
                pdfTextsByUrl.set(row.sourceUrl, text);
            } catch (error) {
                console.warn(`Skipped PDF text extraction: ${row.sourceUrl} (${error.message})`);
            }
        }
    }

    const records = toOfficialAlertRecords(candidateRows, pdfTextsByUrl);
    const metadata = {
        schemaVersion: 1,
        source: '中華民國公平交易委員會',
        sourceUrl: FTC_DECISION_LIST_URL,
        generatedAt: new Date().toISOString(),
        maxPages: options.maxPages,
        recordsFetched: rows.length,
        consumerFacingCandidates: candidateRows.length,
        recordsWithDomains: records.length,
        pdfTextExtractor: pdfExtractorAvailable ? 'pdftotext' : null
    };

    console.log(`Consumer-facing candidates: ${candidateRows.length}`);
    console.log(`Records with extracted domains: ${records.length}`);

    if (records.length === 0 && !options.forceWriteEmpty) {
        console.log('No domain-indexable FTC records were produced; leaving existing generated file unchanged.');
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

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isCli) {
    sync(parseArgs(process.argv.slice(2))).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
