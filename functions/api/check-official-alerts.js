import { manualOfficialAlerts } from './manual-official-alerts.js';
import {
    officialPenaltySyncMetadata,
    syncedOfficialPenaltyRecords
} from './synced-official-penalty-records.js';
import {
    fdaAdSyncMetadata,
    syncedFdaAdAlerts
} from './synced-fda-ad-alerts.js';

const officialAlerts = mergeOfficialAlerts([
    ...manualOfficialAlerts,
    ...syncedOfficialPenaltyRecords,
    ...syncedFdaAdAlerts
]);

function normalizeHostname(value) {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
        return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
    } catch (e) {
        return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
}

function normalizeUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.hash = '';
        return parsed.href.replace(/\/$/, '').toLowerCase();
    } catch (e) {
        return '';
    }
}

function isUrlPrefixMatch(targetUrl, urlPrefix) {
    const normalizedPrefix = normalizeUrl(urlPrefix);
    if (!targetUrl || !normalizedPrefix) return false;

    return targetUrl === normalizedPrefix ||
        targetUrl.startsWith(`${normalizedPrefix}?`) ||
        targetUrl.startsWith(`${normalizedPrefix}/`);
}

function isSameOrSubdomain(hostname, rootDomain) {
    const host = normalizeHostname(hostname);
    const root = normalizeHostname(rootDomain);
    return host === root || host.endsWith(`.${root}`);
}

function getAlertRootDomains(alert) {
    const roots = [
        alert.rootDomain,
        ...(Array.isArray(alert.rootDomains) ? alert.rootDomains : [])
    ];

    return [...new Set(roots.map(normalizeHostname).filter(Boolean))];
}

function hasDomainMatch(hostname, alert) {
    return getAlertRootDomains(alert).some(rootDomain => isSameOrSubdomain(hostname, rootDomain));
}

function allowsDomainMatch(alert) {
    const scope = String(alert.matchScope || '').toLowerCase();
    return !['url-prefix', 'url-prefix-only', 'product', 'product-only'].includes(scope);
}

function mergeOfficialAlerts(alerts) {
    const seen = new Set();
    return alerts.filter(alert => {
        const rootKey = getAlertRootDomains(alert).join(',');
        const urlKey = (alert.urls || []).map(normalizeUrl).join(',');
        const urlPrefixKey = (alert.urlPrefixes || []).map(normalizeUrl).join(',');
        const key = `${alert.sourceUrl || ''}|${rootKey}|${urlKey}|${urlPrefixKey}|${alert.matchScope || ''}|${alert.title || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function findOfficialAlerts({ domain, targetUrl }) {
    const normalizedDomain = normalizeHostname(domain);
    const normalizedTargetUrl = normalizeUrl(targetUrl);

    return officialAlerts
        .map(alert => {
            const fullUrlMatched = normalizedTargetUrl &&
                (alert.urls || []).some(url => normalizeUrl(url) === normalizedTargetUrl);
            const urlPrefixMatched = normalizedTargetUrl &&
                (alert.urlPrefixes || []).some(prefix => isUrlPrefixMatch(normalizedTargetUrl, prefix));
            const domainMatched = allowsDomainMatch(alert) &&
                normalizedDomain &&
                hasDomainMatch(normalizedDomain, alert);

            if (!fullUrlMatched && !urlPrefixMatched && !domainMatched) return null;

            return {
                ...alert,
                matchType: fullUrlMatched ? 'url' : (urlPrefixMatched ? 'url-prefix' : 'domain')
            };
        })
        .filter(Boolean);
}

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain') || '';
    const targetUrl = url.searchParams.get('url') || '';
    const matches = findOfficialAlerts({ domain, targetUrl });

    return new Response(JSON.stringify({
        matched: matches.length > 0,
        count: matches.length,
        matches,
        sources: {
            manualCount: manualOfficialAlerts.length,
            syncedPenaltyCount: syncedOfficialPenaltyRecords.length,
            syncedFdaAdCount: syncedFdaAdAlerts.length,
            officialPenaltySync: officialPenaltySyncMetadata,
            fdaAdSync: fdaAdSyncMetadata
        }
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
