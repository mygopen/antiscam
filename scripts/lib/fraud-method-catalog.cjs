const safeMethodUrl = value => {
    try {
        const u = new URL(value);
        return u.origin === 'https://165dashboard.tw' && !u.username && !u.password &&
            !u.search && !u.hash && /^\/fraud-method\/\d+$/.test(u.pathname);
    } catch { return false; }
};
function compileMethods(data) {
    if (data?.schemaVersion !== 1 || !Array.isArray(data.methods) || data.methods.length > 100) throw Error('invalid_method_catalog');
    const ids = new Set(), urls = new Set();
    const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    return data.methods.map(m => {
        if (!m || !text(m.id, 100) || ids.has(m.id) || !safeMethodUrl(m.url) || urls.has(m.url) ||
            !text(m.title, 100) || !text(m.advice, 300) || !text(m.reviewer, 100) || !validDate(m.reviewedAt) ||
            !['reviewed', 'withdrawn'].includes(m.status) || !Array.isArray(m.groups) || m.groups.length > 10 ||
            !m.groups.every(g => g && text(g.id, 50) && text(g.label, 80) && Number.isFinite(g.weight) && g.weight > 0 && g.weight <= 10 &&
                Array.isArray(g.terms) && g.terms.length > 0 && g.terms.length <= 40 && g.terms.every(t => text(t, 80) && t.length >= 2)) ||
            new Set(m.groups.map(g => g.id)).size !== m.groups.length || !Array.isArray(m.required) || new Set(m.required).size < 2 ||
            !m.required.every(id => m.groups.some(g => g.id === id))) throw Error('invalid_method_review: ' + (m?.id || 'unknown'));
        ids.add(m.id); urls.add(m.url);
        return { id: m.id, title: m.title, url: m.url, advice: m.advice, status: m.status,
            reviewedAt: m.reviewedAt, required: m.required, groups: m.groups, rules: [], kind: 'method' };
    }).filter(m => m.status === 'reviewed');
}
module.exports = { compileMethods, safeMethodUrl };
