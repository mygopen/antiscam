(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ScanPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function finalize(scan) {
        if (!scan || scan.isInvalid) return scan;
        const checks = scan.checks || {};
        const vote = scan.details?.siteStatus?.pageSignals?.voteAccountSignals;
        if (vote?.status === 'danger' || vote?.status === 'warning') {
            checks.voteAccountPhishing = { ...vote, label: '投票活動／帳號索取' };
        }
        const flags = scan.riskFlags || {};
        const strong = checks.voteAccountPhishing?.status === 'danger' || scan.reportedShortLink || scan.blocklistListed || flags.confirmedScamDomain || flags.manualHighRiskDomain ||
            ['googleSafeBrowsing', 'officialAlerts', 'userAgentCloaking', 'redirect'].some(key => checks[key]?.status === 'danger') ||
            flags.sensitiveExternalForm || scan.sensitiveExternalForm;
        if (strong) {
            scan.riskScore = Math.max(90, scan.riskScore || 0);
            scan.isTrustedAllowlist = false;
            scan.conditionalCompanyTrustApplied = false;
            scan.risk_flag = true;
        }
        const unavailable = [];
        if (scan.unresolvedShortener) unavailable.push('縮網址最終目的地尚未確認');
        const site = scan.details?.siteStatus?.status;
        if (!['ok', 'trusted'].includes(site)) unavailable.push('網頁內容未完整取得');
        if (checks.googleSafeBrowsing?.status !== 'safe' && checks.googleSafeBrowsing?.status !== 'danger') unavailable.push('Google 安全庫未完成查詢');
        scan.assessment = scan.riskScore >= 70 ? 'high' : unavailable.length ? 'unknown' : scan.riskScore >= 30 ? 'medium' : 'low';
        scan.incompleteReasons = unavailable;
        return scan;
    }
    function presentation(scan) {
        finalize(scan);
        const level = scan?.assessment || 'unknown';
        return {
            level,
            label: { high: '高度風險', medium: '中度風險', low: '低度風險', unknown: '資料不足／尚未確認' }[level],
            title: { high: '危險！請勿點擊或提供個資', medium: '警告！此網站存在風險', low: '未發現明顯風險，仍請保持警覺', unknown: '資料不足，無法確認安全' }[level],
            reasons: scan?.incompleteReasons || []
        };
    }
    function attachShortLinkContext(scan, inputUrl, isShortener, records = []) {
        if (!scan || !isShortener) return scan;
        scan.shortLinkNotice = '詐騙集團可能濫用縮網址或檔案託管服務，隱藏真正目的地或散布假活動頁。縮網址本身不等於詐騙，平台知名度也不代表連結安全；請勿在不明投票頁輸入 LINE 密碼、簡訊驗證碼或掃描登入 QR Code。';
        let match;
        try {
            const url = new URL(inputUrl);
            // Short codes are case-sensitive. Never extend a report to the provider domain.
            match = records.find(record => url.hostname === record.hostname && url.pathname === record.pathname);
        } catch {}
        scan.checks = scan.checks || {};
        if (match) {
            scan.reportedShortLink = { ...match };
            scan.isInvalid = false;
            scan.checks.reportedShortLink = { status: 'danger', label: '特定縮網址回報', details: `${match.category}。來源：${match.source}（${match.reviewedAt}）；${match.verification}。基於此筆回報採高風險處置，不代表整個縮網址平台有問題。` };
        }
        return finalize(scan);
    }
    function analyzeVotePage(doc, pageUrl) {
        const body = doc.body?.cloneNode(true);
        body?.querySelectorAll('script,style,noscript').forEach(node => node.remove());
        const text = body?.textContent || '';
        const activity = /繪畫|畫作|攝影|寵物|票選|投票|拉票|幫.{0,8}投|vot(?:e|ing)|contest/i.test(text);
        if (!activity) return { status: 'none' };
        const lineContext = /\bLINE\b|賴帳號/i.test(text);
        const credential = [...doc.querySelectorAll('form')].some(form => {
            const formContext = [form.textContent, form.getAttribute('aria-label'), ...[...form.querySelectorAll('img')].map(img => img.getAttribute('alt'))].join(' ');
            if (!/\bLINE\b|賴帳號/i.test(formContext)) return false;
            return [...form.querySelectorAll('input')].some(input => input.getAttribute('type') !== 'hidden' &&
                /password|passwd|\botp\b|one-time-code|verification.?code|驗證碼|簡訊碼|密碼/i.test(['type','name','id','placeholder','autocomplete'].map(key => input.getAttribute(key) || '').join(' ')));
        });
        let officialLogin = false;
        try { const url = new URL(pageUrl); officialLogin = url.protocol === 'https:' && url.hostname === 'access.line.me'; } catch {}
        if (lineContext && credential && !officialLogin) return { status: 'danger', details: '投票／比賽頁在非 LINE 官方登入網域直接收取密碼或驗證碼，疑似帳號釣魚。請勿輸入帳密或交付簡訊驗證碼。' };
        if (lineContext && !officialLogin) return { status: 'warning', details: '活動頁含 LINE 登入或聯絡脈絡，請查證主辦單位；目前未取得直接索取帳密的強證據，不能只因使用 LINE 就判定詐騙。' };
        return { status: 'none' };
    }
    return { finalize, presentation, attachShortLinkContext, analyzeVotePage };
});
