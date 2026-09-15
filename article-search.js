(function (root, factory) {
    const api = typeof module === 'object' && module.exports
        ? factory(require('./scripts/lib/mygopen-catalog.cjs').compileCatalog(require('./data/mygopen-reviews.json'), require('./data/mygopen-candidates.json')),
            require('./scripts/lib/fraud-method-catalog.cjs').compileMethods(require('./data/fraud-method-reviews.json')))
        : factory(root.MyGoPenCatalog || [], root.FraudMethodCatalog || []);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ArticleSearch = api;
})(globalThis, function (articles, methods) {
    const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF\s]/g, '').replace(/e-mail/g, 'email');
    const safeUrl = value => {
        try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.mygopen.com' &&
            !url.username && !url.password && !url.port && /^\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.html$/.test(url.pathname) && !url.search && !url.hash; }
        catch { return false; }
    };
    const safeMethodUrl = value => {
        try { const url = new URL(value); return url.origin === 'https://165dashboard.tw' &&
            !url.username && !url.password && !url.search && !url.hash && /^\/fraud-method\/\d+$/.test(url.pathname); }
        catch { return false; }
    };
    const contains = (text, term) => {
        const token = normalize(term);
        if (/^[a-z]+$/.test(token)) return new RegExp(`(?:^|[^a-z])${token}(?:$|[^a-z])`).test(text);
        return text.includes(token);
    };
    const affirmative = (text, term) => {
        const token = normalize(term);
        let at = text.indexOf(token);
        while (at !== -1) {
            // Negation applies within the preceding clause, not across sentences.
            // A secrecy phrase beginning with "不要" is itself a requested action.
            const prefix = text.slice(Math.max(0, at - 16), at).split(/[，,。.!！?？;；:：\n]/).pop();
            if (!/(?:請勿|切勿|不要|不得|不可|不應|不需|無需|不必|不會|沒有要求)/.test(prefix)) return true;
            at = text.indexOf(token, at + token.length);
        }
        return false;
    };
    function rank(lines, { ruleIds = [], catalog, now = Date.now() }, isMethod = false) {
        if (!Array.isArray(lines)) return [];
        const rows = lines.slice(0, 200).map(row => Number.isFinite(row?.confidence) && row.confidence >= 80 && row.confidence <= 100
            ? normalize(String(row.text || '').slice(0, 500).normalize('NFKC')
                .replace(/(?:https?:\/\/|www\.)[^\s<>"'，。；、）)]+/gi, '')
                .replace(/[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}/gu, '')) : '');
        // Windows retain unreadable gaps. Never assemble a phrase across a missing row.
        const windows = rows.flatMap((row, i) => row ? [rows.slice(i, i + 8).join('\n')] : []);
        const nowDay = new Date(now).toISOString().slice(0, 10);
        const results = catalog.filter(article => article.status === 'reviewed' && (isMethod ? safeMethodUrl : safeUrl)(article.url) &&
            article.reviewedAt <= nowDay && (isMethod || article.publishedAt <= nowDay) &&
            now - Date.parse(article.reviewedAt) <= 366 * 86400000).flatMap(article => {
            let best = null;
            for (const window of windows) {
                // Join adjacent rows for OCR wrapping, but never across an unreadable gap.
                const segments = window.split('\n\n').map(part => part.replace(/\n/g, ''));
                // Behavior combinations require one contiguous readable segment.
                for (const scope of isMethod ? segments.map(segment => [segment]) : [segments]) {
                    const matches = article.groups.filter(g => scope.some(text => g.terms.some(term => (isMethod ? affirmative : contains)(text, term))));
                    if (!article.required.every(id => matches.some(g => g.id === id))) continue;
                    // Count concepts once: keyword repetition cannot inflate rank.
                    const ruleMatch = !isMethod && article.rules.some(id => ruleIds.includes(id));
                    const score = matches.reduce((n, g) => n + g.weight, 0) + (ruleMatch ? 12 : 0);
                    if (!best || score > best.score) best = { id: article.id, title: article.title, url: article.url,
                        publishedAt: article.publishedAt, reviewedAt: article.reviewedAt, kind: article.kind,
                        ...(isMethod ? { source: '165', advice: article.advice } : {}),
                        reasons: matches.map(g => g.label), matchType: ruleMatch ? 'rule' : 'phrases', score };
                }
            }
            return best ? [best] : [];
        });
        const seen = new Set();
        return results.sort((a, b) => b.score - a.score || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.id.localeCompare(b.id))
            .filter(item => !seen.has(item.url) && seen.add(item.url)).slice(0, isMethod ? 2 : 3);
    }
    const search = (lines, options = {}) => rank(lines, { catalog: articles, ...options });
    const searchMethods = (lines, options = {}) => rank(lines, { catalog: methods, ...options, ruleIds: [] }, true);
    return { articles, methods, search, searchMethods, safeUrl, safeMethodUrl };
});
