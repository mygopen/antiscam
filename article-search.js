(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ArticleSearch = api;
})(globalThis, function () {
    const reviewedAt = '2026-09-15';
    const group = (id, label, terms, weight = 3) => ({ id, label, terms, weight });
    // Reviewed, canonical articles only. No screenshot data or remote search API.
    const articles = [
        { id: 'work-group-qr', title: '收到公司高層 Email？要你建立 LINE 群組？詐團假冒！要求代墊費用騙匯款',
            url: 'https://www.mygopen.com/2025/12/email-qrcode.html', publishedAt: '2025-12-13',
            tags: ['假主管', '郵件', '群組邀請'], rules: ['message-work-group-qr-v1'], required: ['work', 'group', 'invite'],
            groups: [group('work', '工作或主管情境', ['工作', '主管', '長官', '公司', '公務', '老闆']),
                group('group', 'LINE 群組', ['LINE群組', 'LINE群聊', 'LINE群']),
                group('invite', '邀請碼／QR Code', ['QRCode', '二維碼', '邀請碼']),
                group('return', '回傳或寄送邀請', ['回傳', '傳送至', '轉寄', '寄回', '寄給']),
                group('isolation', '暫不邀請其他人', ['不要邀請其他', '別邀請其他', '只有你', '暫不邀請'], 4)] },
        { id: 'tax-email', title: '北區國稅局寄來的退稅通知 Email？當心釣魚網站！',
            url: 'https://www.mygopen.com/2026/06/tax-email.html', publishedAt: '2026-06-13',
            tags: ['退稅', '假公務機關', '郵件'], rules: [], required: ['tax', 'refund', 'action'],
            groups: [group('tax', '稅務機關或所得稅', ['國稅局', '財政部', '所得稅', '稅務入口網']),
                group('refund', '退稅通知', ['退稅', '溢繳', '溢收稅款']),
                group('action', '帳戶確認或催告', ['帳戶確認', '確認帳戶', '金融帳戶', '帳戶資料', '書面催告', '最終通知', '信用卡']),
                group('mail', '電子郵件', ['Email', '電子郵件', '寄件者', '收件者'])] },
        { id: 'myship-verification', title: '收到 7-11 賣貨便先收款後配送的實名認證網址？假客服！釣魚網站手法解析',
            url: 'https://www.mygopen.com/2025/12/7-11.html', publishedAt: '2025-12-02',
            tags: ['賣貨便', '假客服', '收款認證'], rules: ['message-seller-advance-payment-v1'], required: ['brand', 'verification'],
            groups: [group('brand', '賣貨便', ['賣貨便', 'myship']),
                group('verification', '收款或身分認證', ['實名認證', '賣家認證', '收款認證', '開通收款', '帳戶凍結', '金流服務']),
                group('action', '匯款或客服聯繫', ['匯款', '轉帳', 'LINE客服', '保證金', 'QRCode'])] },
        { id: 'vote-account', title: '親戚家小孩參加繪畫比賽幫忙投票？要輸入簡訊驗證碼？當心 LINE 帳號遭盜用',
            url: 'https://www.mygopen.com/2026/08/vote-scam.html', publishedAt: '2026-08-24',
            tags: ['假投票', '帳號盜用'], rules: [], required: ['vote', 'account'],
            groups: [group('vote', '比賽投票', ['繪畫比賽', '繪畫投票', '幫忙投票', '幫我投票', '投個票']),
                group('account', '驗證碼或帳號登入', ['驗證碼', 'OTP', 'LINE登入', '登入LINE', '帳號密碼']),
                group('friend', '親友請託', ['親戚', '小朋友', '小孩', '朋友'])] },
        { id: 'taipower-refund', title: '台電帳單計算錯誤通知郵件？點連結申請退款？當心釣魚網站！',
            url: 'https://www.mygopen.com/2025/11/taipower.html', publishedAt: '2025-11-18',
            tags: ['台電', '退款', '郵件'], rules: [], required: ['brand', 'refund', 'action'],
            groups: [group('brand', '台電或電費', ['台電', '臺電', '台灣電力', '臺灣電力', '電費']),
                group('refund', '退款或帳單錯誤', ['退款', '退費', '帳單計算錯誤', '溢收']),
                group('action', '連結或卡號', ['連結', '網址', '信用卡', '卡號']),
                group('mail', '電子郵件', ['Email', '電子郵件', '寄件者'])] }
    ].map(article => ({ ...article, status: 'reviewed', reviewedAt }));
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
                    publishedAt: article.publishedAt, reviewedAt: article.reviewedAt,
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
