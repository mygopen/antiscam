(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ScanPolicy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function finalize(scan) {
        if (!scan || scan.isInvalid) return scan;
        const checks = scan.checks || {};
        const flags = scan.riskFlags || {};
        const strong = scan.blocklistListed || flags.confirmedScamDomain || flags.manualHighRiskDomain ||
            ['googleSafeBrowsing', 'officialAlerts', 'cofactsReports', 'userAgentCloaking', 'redirect'].some(key => checks[key]?.status === 'danger') ||
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
    function cofactsPresentation(data) {
        const sources = data?.sources;
        const sync = sources?.synced;
        const syncLabels = { ready: '已同步', disabled: '未啟用／等待授權', stale: '資料已過期', unavailable: '更新時間無法確認' };
        const coverage = sources ? `人工收錄 ${sources.manual?.records || 0} 筆（最後審核：${sources.manual?.lastReviewedAt || '尚無紀錄'}）；自動同步：${syncLabels[sync?.state] || '無法確認'}，${sync?.records || 0} 筆（更新：${sync?.generatedAt || '尚未同步'}${sync?.queriedSince ? `；查詢起日：${sync.queriedSince}` : ''}）。僅涵蓋收錄索引，不是 Cofacts 全站即時搜尋。` : '資料來源狀態無法確認，不能視為已完成 Cofacts 全站查詢。';
        if (!data?.matched) return {
            status: data?.status === 'ok' && sync?.state === 'ready' ? 'info' : 'unknown',
            details: data?.status === 'ok' ? `未命中本機收錄索引。${coverage}` : `Cofacts 索引查詢未完成。${coverage}`,
            sources: sources || null
        };
        const match = data.matches?.[0];
        return {
            status: data.hasConflict || !data.riskScore ? 'info' : data.strongRisk && data.riskScore >= 60 ? 'danger' : 'warning',
            details: `${data.label}；${match?.collection === 'manual' ? '人工收錄' : match?.collection === 'synced' ? '自動同步' : '收錄來源未註明'}，要求查核 ${Number(match?.replyRequestCount || 0)} 次、查核回應 ${Number(match?.replyCount || 0)} 筆${data.hasConflict ? '；查核意見有歧異，不自動列為高風險' : ''}${data.riskScore <= 25 ? '；民眾回報本身不是已確認詐騙結論' : ''}。${coverage}`,
            sources: sources || null
        };
    }
    return { finalize, presentation, cofactsPresentation };
});
