(function (root, factory) {
    const api = typeof module === 'object' && module.exports
        ? factory(require('./scripts/lib/mygopen-catalog.cjs').compileCatalog(require('./data/mygopen-reviews.json'), require('./data/mygopen-candidates.json')))
        : factory(root.MyGoPenCatalog || []);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ArticleSearch = api;
})(globalThis, function (articles) {
    const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF\s]/g, '').replace(/e-mail/g, 'email');
    const safeUrl = value => {
        try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.mygopen.com' &&
            !url.username && !url.password && !url.port && /^\/\d{4}\/\d{2}\/[a-z0-9-]+\.html$/.test(url.pathname) && !url.search && !url.hash; }
        catch { return false; }
    };
    const contains = (text, term) => {
        const token = normalize(term);
        if (/^[a-z]+$/.test(token)) return new RegExp(`(?:^|[^a-z])${token}(?:$|[^a-z])`).test(text);
        return text.includes(token);
    };
    function search(lines, { ruleIds = [], catalog = articles, now = Date.now() } = {}) {
        if (!Array.isArray(lines)) return [];
        const rows = lines.slice(0, 200).map(row => Number.isFinite(row?.confidence) && row.confidence >= 80 && row.confidence <= 100
            ? normalize(String(row.text || '').slice(0, 500)
                .replace(/https?:\/\/[^\s<>"'，。；、）)]+/gi, '')
                .replace(/[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi, '')) : '');
        // Windows retain unreadable gaps. Never assemble a phrase across a missing row.
        const windows = rows.flatMap((row, i) => row ? [rows.slice(i, i + 8).join('\n')] : []);
        const nowDay = new Date(now).toISOString().slice(0, 10);
        const results = catalog.filter(article => article.status === 'reviewed' && safeUrl(article.url) &&
            article.reviewedAt <= nowDay && article.publishedAt <= nowDay &&
            now - Date.parse(article.reviewedAt) <= 366 * 86400000).flatMap(article => {
            let best = null;
            for (const window of windows) {
                // Join adjacent rows for OCR wrapping, but never across an unreadable gap.
                const segments = window.split('\n\n').map(part => part.replace(/\n/g, ''));
                const matches = article.groups.filter(g => segments.some(text => g.terms.some(term => contains(text, term))));
                if (!article.required.every(id => matches.some(g => g.id === id))) continue;
                // Count concepts once: keyword repetition cannot inflate rank.
                const ruleMatch = article.rules.some(id => ruleIds.includes(id));
                const score = matches.reduce((n, g) => n + g.weight, 0) + (ruleMatch ? 12 : 0);
                if (!best || score > best.score) best = { id: article.id, title: article.title, url: article.url,
                    publishedAt: article.publishedAt, reviewedAt: article.reviewedAt, kind: article.kind,
                    reasons: matches.map(g => g.label), matchType: ruleMatch ? 'rule' : 'phrases', score };
            }
            return best ? [best] : [];
        });
        const seen = new Set();
        return results.sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))
            .filter(item => !seen.has(item.url) && seen.add(item.url)).slice(0, 3);
    }
    return { articles, search, safeUrl };
});
