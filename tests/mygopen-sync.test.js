const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { BLOG_ID, safeUrl, parseEntry, classify, compileCatalog, validReview } = require('../scripts/lib/mygopen-catalog.cjs');
const { synchronize, fetchFeed, LIMITS, reviewReport } = require('../scripts/sync-mygopen-articles.cjs');
const { approveArticle } = require('../scripts/review-mygopen-article.cjs');
const entry = (id = 1, title = '【詐騙】假主管通知') => ({
    id: { $t: `tag:blogger.com,1999:blog-${BLOG_ID}.post-${id}` },
    title: { $t: title }, published: { $t: '2026-09-01T00:00:00Z' }, updated: { $t: '2026-09-02T00:00:00Z' },
    link: [{ rel: 'alternate', type: 'text/html', href: `https://www.mygopen.com/2026/09/Case-${id}.html` }],
    content: { $t: '<p>假冒主管建立 LINE 群組，索取 QR Code。</p>' }, category: [{ term: '詐騙' }]
});
const response = (entries = [entry()], next = false) => new Response(JSON.stringify({ feed: {
    id: { $t: `tag:blogger.com,1999:blog-${BLOG_ID}` }, entry: entries, link: next ? [{ rel: 'next' }] : []
} }), { headers: { 'content-type': 'application/json' } });
const empty = () => ({ schemaVersion: 1, sync: { cursor: 1, verifyCursor: 0 }, posts: [] });
const reviews = () => ({ schemaVersion: 1, articles: [] });
const source = () => ({ ...parseEntry(entry()), missingCount: 0 });
const review = () => ({
    id: 'sample', title: '假主管通知', url: source().url, kind: 'scam', status: 'reviewed',
    reviewer: 'test', reviewedAt: '2026-09-15', sourceHash: source().hash, rules: ['existing-rule'],
    required: ['group', 'qr'], groups: [
        { id: 'group', label: '群組', terms: ['LINE群組'], weight: 3 },
        { id: 'qr', label: '邀請碼', terms: ['QRCode'], weight: 3 }
    ]
});

test('feed identity and canonical URLs are restricted to public MyGoPen posts', () => {
    assert.ok(safeUrl(source().url));
    for (const url of ['https://www.mygopen.com.evil.test/2026/09/a.html', 'http://www.mygopen.com/2026/09/a.html',
        'https://user@www.mygopen.com/2026/09/a.html', 'https://www.mygopen.com/2026/09/a.html?q=x']) assert.equal(safeUrl(url), false);
    const bad = entry(); bad.id.$t = 'tag:blogger.com,1999:blog-1.post-1';
    assert.throws(() => parseEntry(bad), /identity/);
    assert.throws(() => parseEntry({ ...entry(), content: { $t: '' } }), /empty_article/);
});

test('candidate metadata omits raw body and fingerprints link-only changes', () => {
    const a = entry(); a.content.$t += '<a href="https://example.org/a">來源</a>';
    const b = structuredClone(a); b.content.$t = b.content.$t.replace('/a"', '/b"');
    assert.notEqual(parseEntry(a).hash, parseEntry(b).hash);
    assert.equal(parseEntry(a).body, undefined);
    assert.equal(parseEntry(a).content, undefined);
    assert.equal(classify('【錯誤】這是真的通知'), 'clarification');
    assert.equal(classify('【詐騙】冒用'), 'scam');
    assert.equal(classify('防詐宣導'), 'reference');
});

test('bounded sync refreshes latest page and resumes historical cursor', async () => {
    const previous = empty(); previous.sync.cursor = 201;
    const starts = [];
    const result = await synchronize(previous, reviews(), async (url, options) => {
        assert.equal(url.origin, 'https://www.mygopen.com');
        assert.equal(options.redirect, 'error');
        const start = Number(url.searchParams.get('start-index')); starts.push(start);
        return response(Array.from({ length: 50 }, (_, i) => entry(start + i)), true);
    });
    assert.deepEqual(starts, [1, 201, 251, 301]);
    assert.equal(result.sync.cursor, 351);
    assert.equal(result.posts.length, 200);
    assert.ok(result.posts.every(p => p.reviewState === 'pending'));
    assert.deepEqual(compileCatalog(reviews(), result), []);
    assert.equal(previous.posts.length, 0);
});

test('failed or repeated feeds leave the previous snapshot unchanged', async () => {
    const previous = empty(); previous.posts = [source()]; const before = structuredClone(previous);
    let calls = 0;
    await assert.rejects(synchronize(previous, reviews(), async () => {
        if (++calls === 2) throw Error('network_offline');
        return response(Array.from({ length: 50 }, (_, i) => entry(i + 1)), true);
    }), /network_offline/);
    assert.deepEqual(previous, before);
    await assert.rejects(synchronize(previous, reviews(), async () => response([])), /empty_or_invalid/);
    await assert.rejects(synchronize(previous, reviews(), async () => response(Array.from({ length: 50 }, (_, i) => entry(i + 1)), true)), /repeated_feed/);
});

test('HTTP failures, wrong blog and oversized responses fail without retrying', async () => {
    let calls = 0;
    await assert.rejects(fetchFeed({}, async () => { calls++; return new Response('', { status: 429 }); }), /http_429/);
    assert.equal(calls, 1);
    await assert.rejects(fetchFeed({}, async () => new Response('{"feed":{"id":{"$t":"wrong"}}}')), /wrong_feed/);
    await assert.rejects(fetchFeed({}, async () => new Response('not-json')), SyntaxError);
    await assert.rejects(fetchFeed({}, async () => new Response('x', { headers: { 'content-length': String(LIMITS.bytes + 1) } })), /too_large/);
    await assert.rejects(fetchFeed({}, async () => new Response('x'.repeat(LIMITS.bytes + 1))), /too_large/);
    assert.equal(await fetchFeed({ path: '/2026/09/missing.html' }, async () => new Response('', { status: 404 })), null);
});

test('two independent path misses withhold approved articles even if listing is stale', async () => {
    const r = { schemaVersion: 1, articles: [review()] };
    let previous = { ...empty(), posts: [source()] };
    const fetcher = async url => url.searchParams.has('path') ? new Response('', { status: 404 }) : response();
    previous = await synchronize(previous, r, fetcher);
    assert.equal(previous.posts[0].missingCount, 1);
    previous = await synchronize(previous, r, fetcher);
    assert.equal(previous.posts[0].missingCount, 2);
    assert.deepEqual(compileCatalog(r, previous), []);
    await assert.rejects(synchronize(previous, r, async url => response([entry(url.searchParams.has('path') ? 2 : 1)])), /path_lookup_mismatch/);
});

test('changed, withdrawn and mismatched-kind articles are not compiled', () => {
    const r = { schemaVersion: 1, articles: [review()] }, c = { ...empty(), posts: [source()] };
    assert.equal(compileCatalog(r, c).length, 1);
    assert.equal(compileCatalog(r, c)[0].sourceHash, undefined);
    c.posts[0].hash = 'a'.repeat(64); assert.deepEqual(compileCatalog(r, c), []);
    c.posts = [source()]; c.posts[0].kind = 'clarification'; assert.deepEqual(compileCatalog(r, c), []);
    c.posts = [source()]; r.articles[0].status = 'withdrawn'; assert.deepEqual(compileCatalog(r, c), []);
});

test('catalog validation rejects duplicate or malformed sources and weak concept gates', () => {
    const c = { ...empty(), posts: [source(), source()] };
    assert.throws(() => compileCatalog(reviews(), c), /invalid_candidate/);
    assert.equal(validReview({ ...review(), required: ['group', 'group'] }), false);
    assert.equal(validReview({ ...review(), groups: [null] }), false);
    assert.throws(() => compileCatalog({ schemaVersion: 1, articles: [review(), review()] }, { ...empty(), posts: [source()] }), /invalid_review/);
});

test('alternative concept gates require bounded distinct reviewed groups', () => {
    assert.ok(validReview({ ...review(), alternativeRequired: [['group', 'qr']] }));
    for (const alternativeRequired of [null, {}, [[]], [['group']], [['group', 'group']], [['group', 'missing']],
        Array(5).fill(['group', 'qr'])]) {
        const item = { ...review(), alternativeRequired };
        assert.equal(validReview(item), false);
        assert.throws(() => compileCatalog({ schemaVersion: 1, articles: [item] }, { ...empty(), posts: [source()] }), /invalid_review/);
    }
    const item = { ...review(), alternativeRequired: [['group', 'qr']], sourceHash: 'b'.repeat(64) };
    assert.deepEqual(compileCatalog({ schemaVersion: 1, articles: [item] }, { ...empty(), posts: [source()] }), []);
});

test('approval requires explicit review and does not copy risk-rule IDs to new topics', () => {
    const r = { schemaVersion: 1, articles: [review()] }, c = { ...empty(), posts: [{ ...parseEntry(entry(2)), missingCount: 0 }] };
    const options = { url: c.posts[0].url, profile: 'sample', kind: 'scam', reviewer: 'editor', confirm: true };
    assert.throws(() => approveArticle(r, c, { ...options, confirm: false }), /confirmation/);
    assert.throws(() => approveArticle(r, c, { ...options, kind: 'clarification' }), /mismatch/);
    const approved = approveArticle(r, c, options);
    assert.equal(approved.articles[1].sourceHash, c.posts[0].hash);
    assert.deepEqual(approved.articles[1].rules, []);
    assert.equal(r.articles.length, 1);
});

test('review queue escapes article titles and labels corrections without risk rules', () => {
    const s = source(); s.title = '<img> [injection](x) | text'; s.kind = 'clarification';
    const report = reviewReport({ ...empty(), posts: [s] }, reviews());
    assert.match(report, /clarification/);
    assert.match(report, /待審核/);
    assert.doesNotMatch(report, /<img>|\[injection\]/);
});

test('browser remains usable with an empty or changed-source catalog and never loads candidates', () => {
    const code = fs.readFileSync(path.join(__dirname, '../article-search.js'), 'utf8');
    for (const catalog of [undefined, []]) {
        const context = vm.createContext({ MyGoPenCatalog: catalog });
        vm.runInContext(code, context);
        assert.equal(context.ArticleSearch.articles.length, 0);
        assert.equal(context.ArticleSearch.search([{ text: 'LINE群組 QRCode', confidence: 95 }]).length, 0);
    }
});
