import { manualCofactsRiskSignals } from './manual-cofacts-risk-signals.js';
import {
    cofactsSyncMetadata,
    syncedCofactsRiskSignals
} from './synced-cofacts-risk-signals.js';

const COFACTS_ATTRIBUTION = '本編輯資料取自「Cofacts 真的假的」訊息回報機器人與查證協作社群，採 CC BY-SA 4.0 授權提供。';
const TRACKING_PARAM_PATTERNS = [
    /^utm_/i,
    /^(?:fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ldtag_cl|lt_r)$/i
];

function normalizeHostname(value = '') {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
        return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
    } catch {
        return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
}

export function normalizeCofactsUrl(value = '') {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.hash = '';
        parsed.hostname = normalizeHostname(parsed.hostname);
        parsed.protocol = 'https:';
        for (const key of [...parsed.searchParams.keys()]) {
            if (TRACKING_PARAM_PATTERNS.some(pattern => pattern.test(key))) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.searchParams.sort();
        const pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
        const query = parsed.searchParams.toString();
        return `${parsed.hostname}${pathname}${query ? `?${query}` : ''}`.toLowerCase();
    } catch {
        return '';
    }
}

function isSameOrSubdomain(hostname, rootDomain) {
    const host = normalizeHostname(hostname);
    const root = normalizeHostname(rootDomain);
    return !!host && !!root && (host === root || host.endsWith(`.${root}`));
}

function isActiveRecord(record, now = Date.now()) {
    if (!record || record.status === 'deleted' || record.status === 'blocked') return false;
    if (!record.expiresAt) return true;
    const expiresAt = Date.parse(record.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt > now;
}

function dedupeRecords(records) {
    const byKey = new Map();
    for (const record of records) {
        const key = `${record.articleId || ''}|${normalizeCofactsUrl(record.reportedUrl)}`;
        const previous = byKey.get(key);
        if (!previous || String(record.checkedAt || '') > String(previous.checkedAt || '')) {
            byKey.set(key, record);
        }
    }
    return [...byKey.values()];
}

export const cofactsRiskSignals = dedupeRecords([
    ...manualCofactsRiskSignals,
    ...syncedCofactsRiskSignals
]);

export function findCofactsMatches({ domain = '', targetUrl = '', records = cofactsRiskSignals, now = Date.now() } = {}) {
    const normalizedDomain = normalizeHostname(domain || targetUrl);
    const normalizedTargetUrl = normalizeCofactsUrl(targetUrl);

    return records
        .filter(record => isActiveRecord(record, now))
        .map(record => {
            const normalizedReportedUrl = normalizeCofactsUrl(record.reportedUrl);
            const exactUrlMatched = !!normalizedTargetUrl && !!normalizedReportedUrl && normalizedTargetUrl === normalizedReportedUrl;
            const domainMatched = record.matchScope === 'domain' && isSameOrSubdomain(normalizedDomain, record.rootDomain || record.hostname);
            if (!exactUrlMatched && !domainMatched) return null;
            return {
                ...record,
                matchType: exactUrlMatched ? 'url' : 'domain'
            };
        })
        .filter(Boolean)
        .sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0));
}

export function summarizeCofactsMatches(matches = []) {
    if (!matches.length) {
        return {
            matched: false,
            level: 'none',
            riskScore: 0,
            strongRisk: false,
            hasConflict: false,
            label: '未查得 Cofacts 群眾回報紀錄'
        };
    }

    const hasRumor = matches.some(item => Number(item.rumorReplyCount || 0) > 0);
    const hasNotRumor = matches.some(item => Number(item.notRumorReplyCount || 0) > 0);
    const hasConflict = hasRumor && hasNotRumor;
    const top = matches[0];
    const riskScore = hasConflict ? Math.min(25, Number(top.riskScore || 0)) : Number(top.riskScore || 0);

    return {
        matched: true,
        level: hasConflict ? 'conflicting' : (top.level || 'reported'),
        riskScore,
        strongRisk: !hasConflict && !!top.strongRisk && riskScore >= 60,
        hasConflict,
        label: hasConflict ? 'Cofacts 查核回應有歧異，需人工確認' : (top.label || 'Cofacts 有相關紀錄')
    };
}

export async function onRequest(context) {
    const requestUrl = new URL(context.request.url);
    const domain = requestUrl.searchParams.get('domain') || '';
    const targetUrl = requestUrl.searchParams.get('url') || '';
    const matches = findCofactsMatches({ domain, targetUrl });
    const summary = summarizeCofactsMatches(matches);

    return new Response(JSON.stringify({
        ...summary,
        count: matches.length,
        matches,
        attribution: {
            text: COFACTS_ATTRIBUTION,
            license: 'CC BY-SA 4.0',
            sourceUrl: 'https://cofacts.tw/',
            lineBotUrl: 'https://line.me/ti/p/@cofacts'
        },
        sync: cofactsSyncMetadata
    }), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
