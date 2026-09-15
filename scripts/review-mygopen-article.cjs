const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { validReview } = require('./lib/mygopen-catalog.cjs');
const { reviewReport } = require('./sync-mygopen-articles.cjs');
function approveArticle(reviews, snapshot, { url, profile, kind, reviewer, confirm, now = new Date().toISOString().slice(0, 10) }) {
    if (!confirm || !reviewer?.trim()) throw Error('explicit_confirmation_and_reviewer_required');
    const source = snapshot.posts.find(p => p.url === url);
    const template = reviews.articles.find(a => a.id === profile);
    if (!source || source.missingCount || !template || source.kind !== kind) throw Error('source_profile_or_kind_mismatch');
    const old = reviews.articles.find(a => a.url === url);
    const article = { ...template, id: old?.id || 'mygopen-' + source.id.split('.post-')[1], url,
        title: old?.title || source.title, kind, status: 'reviewed', reviewedAt: now, reviewer: reviewer.trim(),
        sourceHash: source.hash, publishedAt: source.publishedAt.slice(0, 10), tags: source.labels,
        rules: old?.rules || [] };
    if (!validReview(article)) throw Error('invalid_review_configuration');
    return { schemaVersion: 1, articles: old ? reviews.articles.map(a => a.url === url ? article : a) : [...reviews.articles, article] };
}
function main() {
    const { values } = parseArgs({ options: { url: { type: 'string' }, profile: { type: 'string' }, kind: { type: 'string' },
        reviewer: { type: 'string' }, confirm: { type: 'boolean' } } });
    const root = path.resolve(__dirname, '..'); const file = path.join(root, 'data/mygopen-reviews.json');
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data/mygopen-candidates.json')));
    const next = approveArticle(JSON.parse(fs.readFileSync(file)), snapshot, values);
    fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2) + '\n'); fs.renameSync(file + '.tmp', file);
    fs.writeFileSync(path.join(root, 'docs/mygopen-review-queue.md'), reviewReport(snapshot, next));
    console.log('Review recorded. Run build/tests and review the Git diff before publishing.');
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { approveArticle };
