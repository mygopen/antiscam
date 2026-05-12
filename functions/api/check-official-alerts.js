const officialAlerts = [
    {
        source: '衛生福利部食品藥物管理署',
        category: '涉嫌違規廣告產品',
        title: '國外網站涉嫌違規廣告產品：潤姬桃子',
        productName: '潤姬桃子',
        rootDomain: 'special-newseeds.com',
        urls: [
            'https://special-newseeds.com/uhmk/item/uhmktwit240704v104hcn.php?waxc=UHdg52anNXbGSzHy.7whg4cn'
        ],
        publishedDate: '2024-07-18',
        monitoredDate: '2024-07-05',
        violationType: '違反食品安全衛生管理法第28條規定',
        warning: '食藥署公告此網址涉嫌違規廣告產品，提醒消費者勿信勿購買。',
        claimSummary: '宣稱消除痘疤、斑點、法令紋、臨床實驗確認等誇大療效或易生誤解詞句。',
        sourceUrl: 'https://www.fda.gov.tw/tc/newsContent.aspx?cid=5085&id=113P1066&type=pmds'
    }
];

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

function isSameOrSubdomain(hostname, rootDomain) {
    const host = normalizeHostname(hostname);
    const root = normalizeHostname(rootDomain);
    return host === root || host.endsWith(`.${root}`);
}

function findOfficialAlerts({ domain, targetUrl }) {
    const normalizedDomain = normalizeHostname(domain);
    const normalizedTargetUrl = normalizeUrl(targetUrl);

    return officialAlerts
        .map(alert => {
            const fullUrlMatched = normalizedTargetUrl &&
                alert.urls.some(url => normalizeUrl(url) === normalizedTargetUrl);
            const domainMatched = normalizedDomain && isSameOrSubdomain(normalizedDomain, alert.rootDomain);

            if (!fullUrlMatched && !domainMatched) return null;

            return {
                ...alert,
                matchType: fullUrlMatched ? 'url' : 'domain'
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
        matches
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
}
