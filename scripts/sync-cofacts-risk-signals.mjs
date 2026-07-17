#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COFACTS_GRAPHQL_URL = 'https://api.cofacts.tw/graphql';
const DEFAULT_OUTPUT_PATH = 'functions/api/synced-cofacts-risk-signals.js';
const REQUEST_TIMEOUT_MS = 25000;
const MAX_RETRIES = 2;
const PAGE_SIZE = 100;
const ATTRIBUTION = '本編輯資料取自「Cofacts 真的假的」訊息回報機器人與查證協作社群，採 CC BY-SA 4.0 授權提供。';
const SECOND_LEVEL_SUFFIXES = new Set(['com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw', 'idv.tw']);
const SHARED_OR_REDIRECT_ROOTS = new Set([
    'bit.ly', 'cutt.ly', 'goo.gl', 'is.gd', 'lihi.cc', 'reurl.cc', 'shorturl.at', 'tinyurl.com',
    'blogspot.com', 'canva.site', 'firebaseapp.com', 'github.io', 'netlify.app', 'notion.site',
    'pages.dev', 'web.app', 'weebly.com', 'wixsite.com', 'wordpress.com',
    'facebook.com', 'instagram.com', 'line.me', 'threads.net', 'tiktok.com', 'x.com', 'youtube.com'
]);
const IGNORED_ROOTS = new Set(['cofacts.tw']);
const SCAM_KEYWORDS = [
    '詐騙', '騙局', '釣魚', '假網站', '假冒網站', '一頁式詐騙', '購物詐騙', '投資詐騙',
    '求職詐騙', '不出貨', '盜刷', '騙取個資', '惡意連結', '假客服', '假投資'
];

const LIST_ARTICLES_QUERY = `
query SyncCofactsArticles($first: Int!, $after: String, $filter: ListArticleFilter) {
  ListArticles(first: $first, after: $after, filter: $filter, orderBy: [{ createdAt: ASC }]) {
    totalCount
    edges {
      cursor
      node {
        ... on Article {
          id
          text
          status
          createdAt
          updatedAt
          replyCount
          replyRequestCount
          lastRequestedAt
          articleReplies {
            replyId
            replyType
            status
            createdAt
            positiveFeedbackCount
            negativeFeedbackCount
            reply {
              id
              type
              text
              reference
              status
            }
          }
        }
      }
    }
  }
}`;

function decodeHtml(value = '') {
    return String(value)
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

export function normalizeHostname(value = '') {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
        return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
    } catch {
        return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
}

export function toRootDomain(value = '') {
    const hostname = normalizeHostname(value);
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length <= 2) return hostname;
    const lastTwo = parts.slice(-2).join('.');
    return SECOND_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export function normalizeReportedUrl(value = '') {
    try {
        const parsed = new URL(decodeHtml(value).trim());
        parsed.hash = '';
        parsed.hostname = normalizeHostname(parsed.hostname);
        return parsed.href;
    } catch {
        return '';
    }
}

export function extractReportedUrls(text = '') {
    const matches = decodeHtml(text).match(/https?:\/\/[^\s"'<>「」『』（）()，。；;、]+/gi) || [];
    return [...new Set(matches
        .map(value => normalizeReportedUrl(value.replace(/[.,，。;；:：!?！？]+$/g, '')))
        .filter(value => {
            if (!value) return false;
            const root = toRootDomain(value);
            return root && !IGNORED_ROOTS.has(root);
        }))];
}

function getActiveArticleReplies(article = {}) {
    return (article.articleReplies || []).filter(articleReply => {
        const status = articleReply.status || 'NORMAL';
        const replyStatus = articleReply.reply?.status || 'NORMAL';
        return status === 'NORMAL' && replyStatus === 'NORMAL';
    });
}

function addDays(isoDate, days) {
    const value = new Date(isoDate);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString();
}

export function classifyCofactsArticle(article = {}, checkedAt = new Date().toISOString()) {
    const replies = getActiveArticleReplies(article);
    const rumorReplies = replies.filter(item => (item.replyType || item.reply?.type) === 'RUMOR');
    const notRumorReplies = replies.filter(item => (item.replyType || item.reply?.type) === 'NOT_RUMOR');
    const scamSpecificReplies = rumorReplies.filter(item => {
        const haystack = `${item.reply?.text || ''} ${item.reply?.reference || ''}`;
        return SCAM_KEYWORDS.some(keyword => haystack.includes(keyword));
    });
    const positiveFeedbackCount = replies.reduce((sum, item) => sum + Number(item.positiveFeedbackCount || 0), 0);
    const negativeFeedbackCount = replies.reduce((sum, item) => sum + Number(item.negativeFeedbackCount || 0), 0);
    const replyRequestCount = Number(article.replyRequestCount || 0);

    let level = 'reported';
    let riskScore = 15;
    let strongRisk = false;
    let label = '曾有民眾回報，尚未查核';
    let ttlDays = 90;

    if (rumorReplies.length > 0 && notRumorReplies.length > 0) {
        level = 'conflicting';
        riskScore = 10;
        label = 'Cofacts 查核回應有歧異，需人工確認';
        ttlDays = 30;
    } else if (scamSpecificReplies.length >= 2) {
        level = 'corroborated-scam';
        riskScore = 70;
        strongRisk = true;
        label = '多筆 Cofacts 查核回應明確指出詐騙';
        ttlDays = 365;
    } else if (scamSpecificReplies.length === 1 && positiveFeedbackCount > negativeFeedbackCount) {
        level = 'supported-scam';
        riskScore = 65;
        strongRisk = true;
        label = 'Cofacts 查核回應指出詐騙，且獲社群支持';
        ttlDays = 365;
    } else if (scamSpecificReplies.length === 1) {
        level = 'scam-reply';
        riskScore = 50;
        label = 'Cofacts 查核回應明確提及詐騙，仍需搭配其他證據';
        ttlDays = 270;
    } else if (rumorReplies.length > 0) {
        level = 'rumor';
        riskScore = 40;
        label = 'Cofacts 查核者認為訊息含錯誤資訊，不等同已確認詐騙';
        ttlDays = 270;
    } else if (notRumorReplies.length > 0) {
        level = 'not-rumor';
        riskScore = 0;
        label = 'Cofacts 查核者認為訊息並非謠言';
        ttlDays = 90;
    } else if (replyRequestCount >= 3) {
        level = 'multiple-reports';
        riskScore = 25;
        label = '已有多位民眾要求 Cofacts 查核，尚無結論';
        ttlDays = 120;
    }

    return {
        replyRequestCount,
        replyCount: Number(article.replyCount || replies.length),
        rumorReplyCount: rumorReplies.length,
        notRumorReplyCount: notRumorReplies.length,
        scamSpecificReplyCount: scamSpecificReplies.length,
        positiveFeedbackCount,
        negativeFeedbackCount,
        level,
        riskScore,
        strongRisk,
        label,
        expiresAt: addDays(checkedAt, ttlDays)
    };
}

export function articleToRiskSignals(article = {}, checkedAt = new Date().toISOString()) {
    if (!article.id || article.status === 'DELETED' || article.status === 'BLOCKED') return [];
    const classification = classifyCofactsArticle(article, checkedAt);

    return extractReportedUrls(article.text).map(reportedUrl => {
        const hostname = normalizeHostname(reportedUrl);
        const rootDomain = toRootDomain(hostname);
        const matchScope = SHARED_OR_REDIRECT_ROOTS.has(rootDomain) ? 'url' : 'domain';
        return {
            schemaVersion: 1,
            source: 'Cofacts 真的假的',
            articleId: article.id,
            articleUrl: `https://cofacts.tw/article/${encodeURIComponent(article.id)}`,
            reportedUrl,
            hostname,
            rootDomain,
            matchScope,
            articleCreatedAt: article.createdAt || null,
            articleUpdatedAt: article.updatedAt || null,
            lastRequestedAt: article.lastRequestedAt || null,
            checkedAt,
            ...classification,
            attribution: ATTRIBUTION
        };
    });
}

export function mergeCofactsRiskSignals(existing = [], refreshedArticles = [], checkedAt = new Date().toISOString(), refreshedArticleIds = []) {
    const refreshedIds = new Set([
        ...refreshedArticleIds,
        ...refreshedArticles.map(article => article.id).filter(Boolean)
    ]);
    const retained = existing.filter(record => {
        if (refreshedIds.has(record.articleId)) return false;
        if (!record.expiresAt) return true;
        const expiresAt = Date.parse(record.expiresAt);
        return !Number.isFinite(expiresAt) || expiresAt > Date.parse(checkedAt);
    });
    const fresh = refreshedArticles.flatMap(article => articleToRiskSignals(article, checkedAt));
    const byKey = new Map();
    for (const record of [...retained, ...fresh]) {
        const key = `${record.articleId}|${normalizeReportedUrl(record.reportedUrl)}`;
        const previous = byKey.get(key);
        if (!previous || String(record.checkedAt || '') >= String(previous.checkedAt || '')) byKey.set(key, record);
    }
    return [...byKey.values()].sort((a, b) => {
        const scoreDifference = Number(b.riskScore || 0) - Number(a.riskScore || 0);
        return scoreDifference || String(b.checkedAt || '').localeCompare(String(a.checkedAt || ''));
    });
}

function parseExportedJson(source, exportName, fallback) {
    const pattern = new RegExp(`export const ${exportName} = ([\\s\\S]*?);(?:\\n|$)`);
    const match = String(source || '').match(pattern);
    if (!match) return fallback;
    try {
        return JSON.parse(match[1]);
    } catch {
        return fallback;
    }
}

export function renderGeneratedModule(records, metadata) {
    return `// Generated by scripts/sync-cofacts-risk-signals.mjs. Manual reviewed records live in
// functions/api/manual-cofacts-risk-signals.js.
export const cofactsSyncMetadata = ${JSON.stringify(metadata, null, 4)};

export const syncedCofactsRiskSignals = ${JSON.stringify(records, null, 4)};
`;
}

function loadExistingOutput(outputPath) {
    if (!existsSync(outputPath)) return { records: [], metadata: {} };
    const source = readFileSync(outputPath, 'utf8');
    return {
        records: parseExportedJson(source, 'syncedCofactsRiskSignals', []),
        metadata: parseExportedJson(source, 'cofactsSyncMetadata', {})
    };
}

function parseArgs(argv) {
    const options = {
        output: process.env.COFACTS_SYNC_OUTPUT || DEFAULT_OUTPUT_PATH,
        lookbackDays: Number(process.env.COFACTS_SYNC_LOOKBACK_DAYS || 30),
        maxPages: Number(process.env.COFACTS_SYNC_MAX_PAGES || 50),
        recheckExisting: false,
        dryRun: false
    };
    for (const arg of argv) {
        if (arg === '--recheck-existing') options.recheckExisting = true;
        else if (arg === '--dry-run') options.dryRun = true;
        else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
        else if (arg.startsWith('--lookback-days=')) options.lookbackDays = Number(arg.split('=')[1]);
        else if (arg.startsWith('--max-pages=')) options.maxPages = Number(arg.split('=')[1]);
    }
    options.lookbackDays = Number.isFinite(options.lookbackDays) && options.lookbackDays > 0 ? Math.floor(options.lookbackDays) : 30;
    options.maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0 ? Math.floor(options.maxPages) : 50;
    return options;
}

function getAuthHeaders() {
    const appSecret = String(process.env.COFACTS_APP_SECRET || '').trim();
    const appId = String(process.env.COFACTS_APP_ID || '').trim();
    if (!appSecret && !appId) {
        throw new Error('Missing authorized Cofacts credentials. Set COFACTS_APP_SECRET or COFACTS_APP_ID after applying with Cofacts WG.');
    }
    return appSecret ? { 'x-app-secret': appSecret } : { 'x-app-id': appId };
}

async function delay(milliseconds) {
    await new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

async function requestGraphql(variables) {
    const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
    };
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(COFACTS_GRAPHQL_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query: LIST_ARTICLES_QUERY, variables }),
                signal: controller.signal
            });
            const payload = await response.json();
            if (!response.ok || payload.errors?.length) {
                throw new Error(payload.errors?.map(error => error.message).join('; ') || `Cofacts API HTTP ${response.status}`);
            }
            return payload.data.ListArticles;
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) await delay(500 * (attempt + 1));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError;
}

async function fetchArticles(filter, maxPages) {
    const articles = [];
    let after = null;
    for (let page = 0; page < maxPages; page++) {
        const result = await requestGraphql({ first: PAGE_SIZE, after, filter });
        const edges = result.edges || [];
        articles.push(...edges.map(edge => edge.node).filter(Boolean));
        if (edges.length < PAGE_SIZE) break;
        after = edges[edges.length - 1]?.cursor || null;
        if (!after) break;
    }
    return articles;
}

function uniqueArticles(articles) {
    const byId = new Map();
    for (const article of articles) {
        if (article?.id) byId.set(article.id, article);
    }
    return [...byId.values()];
}

async function sync(options) {
    const outputPath = resolve(options.output);
    const existing = loadExistingOutput(outputPath);
    const checkedAt = new Date().toISOString();
    const previousGeneratedAt = Date.parse(existing.metadata.generatedAt || '');
    const fallbackSince = Date.now() - options.lookbackDays * 86400000;
    const sinceTimestamp = Number.isFinite(previousGeneratedAt)
        ? Math.min(Date.now(), previousGeneratedAt - 12 * 3600000)
        : fallbackSince;
    const since = new Date(sinceTimestamp).toISOString();

    const incrementalArticles = await fetchArticles({ createdAt: { GTE: since } }, options.maxPages);
    const repliedArticles = await fetchArticles({
        articleReply: { createdAt: { GTE: since }, statuses: ['NORMAL'] }
    }, options.maxPages);
    const refreshedArticleIds = new Set();
    let refreshedArticles = uniqueArticles([...incrementalArticles, ...repliedArticles]);
    refreshedArticles.forEach(article => refreshedArticleIds.add(article.id));

    if (options.recheckExisting) {
        const existingIds = [...new Set(existing.records.map(record => record.articleId).filter(Boolean))];
        for (let index = 0; index < existingIds.length; index += 100) {
            const ids = existingIds.slice(index, index + 100);
            ids.forEach(id => refreshedArticleIds.add(id));
            const articles = await fetchArticles({ ids }, 2);
            refreshedArticles = uniqueArticles([...refreshedArticles, ...articles]);
        }
    }

    const records = mergeCofactsRiskSignals(
        existing.records,
        refreshedArticles,
        checkedAt,
        [...refreshedArticleIds]
    );
    const metadata = {
        schemaVersion: 1,
        source: 'Cofacts 真的假的',
        sourceUrl: 'https://cofacts.tw/',
        license: 'CC BY-SA 4.0',
        attribution: ATTRIBUTION,
        generatedAt: checkedAt,
        queriedSince: since,
        recheckedExisting: options.recheckExisting,
        articlesFetched: refreshedArticles.length,
        records: records.length,
        status: 'ok'
    };

    const recordsChanged = JSON.stringify(records) !== JSON.stringify(existing.records);
    const needsInitialAuthorizedMetadata = existing.metadata.status !== 'ok';
    const shouldWrite = recordsChanged || needsInitialAuthorizedMetadata || !existsSync(outputPath);

    if (!options.dryRun && shouldWrite) {
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, renderGeneratedModule(records, metadata));
    }
    console.log(`Cofacts sync: ${refreshedArticles.length} articles, ${records.length} URL risk records${options.dryRun ? ' (dry run)' : (shouldWrite ? '' : ' (no index changes)')}.`);
    return { records, metadata, wrote: !options.dryRun && shouldWrite };
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isCli) {
    sync(parseArgs(process.argv.slice(2))).catch(error => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}
