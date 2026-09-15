const { createHash } = require('node:crypto');
const { parseHTML } = require('linkedom');
const BLOG_ID = '4272037284105697328';
const safeUrl = value => {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'www.mygopen.com' &&
        !u.username && !u.password && !u.port && !u.search && !u.hash && /^\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.html$/.test(u.pathname); }
    catch { return false; }
};
const clean = html => {
    const { document } = parseHTML(`<html><body>${String(html || '')}</body></html>`);
    for (const e of document.querySelectorAll('script,style,iframe,form,nav,footer')) e.remove();
    return document.body.textContent.normalize('NFKC').replace(/\s+/g, ' ').trim();
};
const classify = title => /^【詐騙】/.test(title) ? 'scam' : /^【(?:錯誤|謠言|誤導|易誤解)】/.test(title) ? 'clarification' : 'reference';
function parseEntry(entry) {
    const id = entry?.id?.$t;
    const url = entry?.link?.find(l => l.rel === 'alternate' && l.type === 'text/html')?.href;
    if (typeof id !== 'string' || !new RegExp(`^tag:blogger.com,1999:blog-${BLOG_ID}\\.post-\\d+$`).test(id) || !safeUrl(url)) throw Error('invalid_article_identity');
    const title = clean(entry.title?.$t);
    const publishedAt = entry.published?.$t, updatedAt = entry.updated?.$t;
    if (!title || title.length > 500 || !Number.isFinite(Date.parse(publishedAt)) || !Number.isFinite(Date.parse(updatedAt)) || typeof entry.content?.$t !== 'string') throw Error('invalid_article_fields');
    const body = clean(entry.content.$t);
    if (!body) throw Error('empty_article_content');
    const labels = [...new Set((entry.category || []).map(c => c.term).filter(t => typeof t === 'string' && t.length <= 100))].sort();
    const hash = createHash('sha256').update(JSON.stringify({ title, content: entry.content.$t, labels, url, updatedAt })).digest('hex');
    const relevant = /詐騙|釣魚|假冒|偽冒|冒用|盜用|盜刷/.test(title + ' ' + labels.join(' ') + ' ' + body);
    const keywords = ['詐騙', '釣魚', '假冒', '盜用', 'LINE', 'QR Code', '退款', '退稅', '驗證碼', '匯款', '保證金', '信用卡', '帳戶', '主管', '群組', '投票', '賣貨便', '台電', '國稅局', '包裹', '求職']
        .filter(word => (title + body).toLowerCase().includes(word.toLowerCase()));
    return { id, url, title, publishedAt, updatedAt, labels, kind: classify(title), hash, relevant, keywords };
}
function validReview(a) {
    return a && typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 100 && safeUrl(a.url) && typeof a.title === 'string' && a.title.length > 0 && a.title.length <= 500 &&
        ['scam', 'clarification', 'reference'].includes(a.kind) && ['reviewed', 'withdrawn'].includes(a.status) &&
        typeof a.reviewer === 'string' && a.reviewer.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.reviewedAt) && Number.isFinite(Date.parse(a.reviewedAt)) &&
        /^[a-f0-9]{64}$/.test(a.sourceHash || '') && Array.isArray(a.required) && new Set(a.required).size >= 2 &&
        Array.isArray(a.rules) && a.rules.every(id => typeof id === 'string') && Array.isArray(a.groups) && a.groups.length <= 20 &&
        a.groups.every(g => g && typeof g === 'object') && new Set(a.groups.map(g => g.id)).size === a.groups.length && a.required.every(id => a.groups.some(g => g.id === id)) &&
        (a.alternativeRequired === undefined || (Array.isArray(a.alternativeRequired) && a.alternativeRequired.length <= 4 &&
            a.alternativeRequired.every(ids => Array.isArray(ids) && ids.length >= 2 && ids.length <= 20 && new Set(ids).size === ids.length &&
                ids.every(id => a.groups.some(g => g.id === id))))) &&
        a.groups.every(g => typeof g.id === 'string' && g.id.length > 0 && typeof g.label === 'string' && g.label.length > 0 && g.label.length <= 80 && Number.isFinite(g.weight) && g.weight > 0 && g.weight <= 10 &&
            Array.isArray(g.terms) && g.terms.length > 0 && g.terms.length <= 40 && g.terms.every(t => typeof t === 'string' && t.length >= 2 && t.length <= 80));
}
function compileCatalog(reviews, candidates) {
    if (reviews.schemaVersion !== 1 || candidates.schemaVersion !== 1 || !Array.isArray(reviews.articles) || !Array.isArray(candidates.posts)) throw Error('invalid_catalog');
    const sources = new Map();
    for (const p of candidates.posts) {
        if (!p || !safeUrl(p.url) || sources.has(p.url) || !/^[a-f0-9]{64}$/.test(p.hash || '') ||
            !Number.isFinite(Date.parse(p.publishedAt)) || !['scam', 'clarification', 'reference'].includes(p.kind) ||
            !Number.isInteger(p.missingCount) || p.missingCount < 0 || p.missingCount > 2) throw Error('invalid_candidate');
        sources.set(p.url, p);
    }
    const ids = new Set(), urls = new Set();
    return reviews.articles.filter(a => {
        if (!validReview(a) || ids.has(a.id) || urls.has(a.url)) throw Error('invalid_review: ' + (a?.id || 'unknown'));
        ids.add(a.id); urls.add(a.url);
        const source = sources.get(a.url);
        return a.status === 'reviewed' && source?.hash === a.sourceHash && source.kind === a.kind && source.missingCount < 2;
    }).map(a => ({ ...a, publishedAt: sources.get(a.url).publishedAt.slice(0, 10), sourceHash: undefined, reviewer: undefined }));
}
module.exports = { BLOG_ID, safeUrl, clean, classify, parseEntry, validReview, compileCatalog };
