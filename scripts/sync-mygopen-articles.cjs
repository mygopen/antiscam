const fs = require('node:fs');
const path = require('node:path');
const { BLOG_ID, parseEntry } = require('./lib/mygopen-catalog.cjs');
const ROOT = path.resolve(__dirname, '..');
const FEED = 'https://www.mygopen.com/feeds/posts/default';
const LIMITS = { pages: 4, pageSize: 50, verify: 10, bytes: 4 * 1024 * 1024, timeoutMs: 15000 };

async function fetchFeed(params, fetcher = fetch) {
    const url = new URL(FEED); url.search = new URLSearchParams({ alt: 'json', ...params });
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(LIMITS.timeoutMs) });
    if (response.status === 404 && params.path) return null;
    if (!response.ok) throw Error('feed_http_' + response.status);
    if (Number(response.headers.get('content-length')) > LIMITS.bytes) throw Error('feed_too_large');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > LIMITS.bytes) { await reader.cancel(); throw Error('feed_too_large'); } chunks.push(value);
    } } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data.feed?.id?.$t !== `tag:blogger.com,1999:blog-${BLOG_ID}`) throw Error('wrong_feed');
    return data.feed;
}
async function synchronize(previous, reviews, fetcher = fetch, now = new Date().toISOString()) {
    if (previous.schemaVersion !== 1 || !Array.isArray(previous.posts)) throw Error('invalid_previous_snapshot');
    const posts = new Map(previous.posts.map(p => [p.url, { ...p }]));
    const seenIds = new Set();
    const save = entry => {
        const value = parseEntry(entry);
        const tracked = reviews.articles.some(a => a.url === value.url);
        if (!value.relevant && !tracked && !posts.has(value.url)) return;
        const old = posts.get(value.url) || [...posts.values()].find(p => p.id === value.id);
        if (old && old.url !== value.url) posts.delete(old.url);
        posts.set(value.url, { ...value, firstSeenAt: old?.firstSeenAt || now, lastSeenAt: now, missingCount: 0,
            reviewState: !old ? 'pending' : old.hash !== value.hash ? 'changed' : old.reviewState });
    };
    let cursor = Number.isInteger(previous.sync?.cursor) && previous.sync.cursor > 0 ? previous.sync.cursor : 1;
    let requests = 0, fetched = 0;
    // Refresh the latest page on every run while the historical cursor advances.
    for (let page = 0; page < LIMITS.pages; page++) {
        const start = page === 0 ? 1 : cursor;
        const feed = await fetchFeed({ 'max-results': String(LIMITS.pageSize), 'start-index': String(start), orderby: 'updated' }, fetcher);
        requests++;
        const entries = feed.entry || [];
        if (!Array.isArray(entries) || entries.length > LIMITS.pageSize || !entries.length && page === 0) throw Error('empty_or_invalid_feed');
        if (entries.length && entries.every(e => seenIds.has(e.id?.$t))) throw Error('repeated_feed_page');
        for (const entry of entries) { save(entry); seenIds.add(entry.id.$t); }
        fetched += entries.length;
        if (page === 0 && cursor !== 1) continue;
        cursor = start + entries.length;
        if (entries.length < LIMITS.pageSize || !feed.link?.some(l => l.rel === 'next')) { cursor = 1; break; }
    }
    const active = reviews.articles.filter(a => a.status === 'reviewed');
    let verifyCursor = previous.sync?.verifyCursor || 0;
    for (let i = 0; i < Math.min(LIMITS.verify, active.length); i++) {
        const article = active[(verifyCursor + i) % active.length];
        const feed = await fetchFeed({ path: new URL(article.url).pathname, 'max-results': '1' }, fetcher);
        requests++;
        if (feed === null) {
            const old = posts.get(article.url);
            const priorMissing = previous.posts.find(p => p.url === article.url)?.missingCount || 0;
            if (old) posts.set(article.url, { ...old, missingCount: Math.min(2, priorMissing + 1), reviewState: 'missing_check' });
        } else {
            if (feed.entry?.length !== 1 || parseEntry(feed.entry[0]).url !== article.url) throw Error('path_lookup_mismatch');
            save(feed.entry[0]);
        }
    }
    verifyCursor = active.length ? (verifyCursor + LIMITS.verify) % active.length : 0;
    if (posts.size > 6000) throw Error('candidate_limit_reached');
    return { schemaVersion: 1, sync: { cursor, verifyCursor, lastSuccessAt: now, fetched, requests },
        posts: [...posts.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)) };
}
function reviewReport(snapshot, reviews) {
    const approved = new Map(reviews.articles.map(a => [a.url, a]));
    const safe = s => String(s).replace(/[\[\]<>|`\r\n]/g, ' ');
    return '# MyGoPen 文章待審核清單\n\n此清單由公開 Feed 產生，不是新風險規則。未核准文章不會出現在網站推薦。\n\n' +
        `最後成功同步：${snapshot.sync.lastSuccessAt}\n\n本次讀取 ${snapshot.sync.fetched} 篇，${snapshot.sync.requests} 次請求；歷史游標 ${snapshot.sync.cursor}。\n\n` +
        '| 類型 | 審核狀態 | 文章 |\n| --- | --- | --- |\n' + snapshot.posts.map(p => {
            const a = approved.get(p.url);
            const state = p.missingCount ? '待查是否撤除' : a?.status === 'withdrawn' ? '已停用' : a?.sourceHash === p.hash ? '已審核' : a ? '內容有更新，需複核' : '待審核';
            return `| ${p.kind} | ${state} | [${safe(p.title)}](${p.url}) |`;
        }).join('\n') + '\n';
}
async function main() {
    const file = path.join(ROOT, 'data/mygopen-candidates.json');
    const reviews = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mygopen-reviews.json')));
    const previous = JSON.parse(fs.readFileSync(file));
    const next = await synchronize(previous, reviews);
    // Publish only after every request/validation succeeds. A failure leaves the
    // previous snapshot and cursor untouched, never an empty replacement catalog.
    fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2) + '\n'); fs.renameSync(file + '.tmp', file);
    fs.writeFileSync(path.join(ROOT, 'docs/mygopen-review-queue.md'), reviewReport(next, reviews));
    console.log(JSON.stringify({ status: 'ok', ...next.sync, candidates: next.posts.length }));
}
if (require.main === module) main().catch(error => { console.error('MyGoPen sync stopped; prior snapshot preserved:', error.message); process.exitCode = 1; });
module.exports = { synchronize, fetchFeed, reviewReport, LIMITS };
