(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WebsiteScreenshot = api;
})(globalThis, function () {
    const official = {
        name: '財政部電子發票整合服務平台',
        hosts: ['www.einvoice.nat.gov.tw', 'einvoice.nat.gov.tw'],
        url: 'https://www.einvoice.nat.gov.tw/',
        source: 'https://www.mof.gov.tw/singlehtml/979b54e408fb499eae3c1d9efe978868?cntId=54767ac72c924e56bbeebf50cf6a7c2a',
        verifiedAt: '2026-09-17'
    };
    const fetc = {
        name: '遠通電收', hosts: ['www.fetc.net.tw', 'fetc.net.tw', 'css.fetc.net.tw', 'epksa.fetc.net.tw', 'dealer.fetc.net.tw'],
        relatedHosts: ['www.utaggo.com.tw', 'utaggo.com.tw', 'link.utaggo.com.tw'],
        url: 'https://www.fetc.net.tw/', verifiedAt: '2026-09-17',
        source: 'https://www.fetc.net.tw/ContentFiles_UX/HTMLContent/electronic_bill/index.html',
        relatedSource: 'https://www.fetci.com/tw/page/parking-as-a-service'
    };
    const normalize = text => String(text || '').normalize('NFKC').replace(/\s/g, '');
    const hosts = text => [...new Set((String(text || '').match(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi) || [])
        .filter(host => !String(text).includes('@' + host)).map(host => host.toLowerCase()))];
    const reliable = row => Number.isFinite(row?.confidence) && row.confidence >= 80 && row.confidence <= 100;
    const inToolbar = (box, height) => box && Number.isFinite(height) && height > 0 &&
        [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) && (box.y1 < height * 0.22 || box.y0 > height * 0.82);
    const mailRetryAllowed = (row, height) => /[a-z0-9._%+-]\s*@\s*[a-z0-9]/i.test(row.text || '') &&
        (!inToolbar(row.bbox, height) || /寄件|收件|from:|to:/i.test(row.text));
    const fallbackRegions = (width, height) => Number.isFinite(width) && Number.isFinite(height) && width >= 300 && height >= width * 1.2
        ? [{ x0: width * 0.08, x1: width * 0.92, y0: height * 0.02, y1: height * 0.21 },
            { x0: width * 0.08, x1: width * 0.92, y0: height * 0.87, y1: height * 0.98 }] : [];
    function domainWords(data) {
        const words = data?.words || data?.lines?.flatMap(line => line.words || []) || [];
        return [...new Set(words.flatMap(word => {
            if (!reliable(word)) return [];
            if (word.symbols?.length && word.symbols.some(symbol => !reliable(symbol))) return [];
            return hosts(word.text);
        }))];
    }
    function consensus(first, second) {
        const a = domainWords(first), b = domainWords(second);
        return a.length === 1 && b.length === 1 && a[0] === b[0] ? a[0] : null;
    }
    function addressRows(lines, height) {
        if (!Number.isFinite(height) || height <= 0) return [];
        return (lines || []).filter(row => {
            const box = row.bbox;
            return inToolbar(box, height) && hosts(row.text).length === 1 && !row.text.includes('@');
        }).slice(0, 2);
    }
    function assess(lines, addresses = [], { now = Date.now() } = {}) {
        const text = (lines || []).filter(reliable).map(row => normalize(row.text)).join('\n');
        const raw = (lines || []).map(row => normalize(row.text)).join('\n');
        const invoiceClaim = /電子發票整合服務平台/.test(text) || (/財政部/.test(text) && /E-InvoicePlatform/i.test(text));
        const fetcContext = /車號查詢|車主.{0,5}(?:證|編號)|會員登入/.test(raw);
        const fetcClaim = /遠通電收/.test(text) || (/\betag\b/i.test(text) && /儲值|通行費|車號/.test(text));
        const profile = !invoiceClaim && fetcContext ? fetc : official;
        const claimed = profile === fetc ? fetcClaim : invoiceClaim;
        const related = claimed || /E-InvoicePlatform|電子發票整合服務平台/i.test(raw) || fetcContext;
        if (!related) return null;
        const credentials = profile === fetc ? /(?:輸入|查詢).{0,8}車號|車號查詢/.test(text) && /(?:車主)?身[分份]證|(?:車主)?統一編號/.test(text)
            : /手機號碼/.test(text) && /驗證碼[（(]密碼[）)]/.test(text) && /手機條碼/.test(text);
        const educational = /詐騙範例|防詐宣導|釣魚範例|示範圖片/.test(text);
        const unique = [...new Set(addresses.filter(a => a?.verified === true && hosts(a.host).length === 1 && hosts(a.host)[0] === a.host).map(a => a.host))];
        const host = unique.length === 1 ? unique[0] : null;
        const reviewedAt = Date.parse(profile.verifiedAt + 'T00:00:00+08:00');
        const fresh = now >= reviewedAt && now - reviewedAt <= 366 * 86400000;
        const matched = host && profile.hosts.includes(host);
        // Related services and unreviewed subhosts require verification, not an impersonation verdict.
        const relatedHost = profile === fetc && host && (fetc.relatedHosts.includes(host) || host.endsWith('.fetc.net.tw') || host.endsWith('.utaggo.com.tw'));
        const high = claimed && credentials && host && !matched && !relatedHost && fresh && !educational;
        return { kind: 'website', risk: high ? 'high' : 'unknown', host, claimed, credentials,
            officialMatched: !!matched, source: profile.source, officialUrl: profile.url, brand: profile.name,
            analysis: high ? (profile === fetc ? '畫面使用遠通電收品牌，但網址列與已查證官方入口不符，並要求車號及身分證／統一編號資訊，高度疑似偽冒。' : '畫面自稱財政部電子發票平台，但網址列與已查證官方入口不符，且出現手機號碼及登入密碼欄位，高度疑似偽冒。') :
                matched ? '辨識到的網址列符合已查證官方入口；截圖不能驗證目前連線與網站內容安全。' :
                profile === fetc && !claimed ? '已辨識到車號查詢脈絡，但品牌名稱尚未可靠讀出，不能判定為安全。請裁切品牌名稱重新辨識，或直接檢查辨識出的網址；不要在未確認的網站提供個資。' :
                    `畫面疑似${profile.name}服務，但網址、平台名稱或服務授權尚未可靠確認，不能判定為安全。請裁切網址列與平台名稱重新辨識，或貼上實際網址。`,
            advice: profile === fetc ? '請勿在可疑頁面輸入車號、身分證、帳密或信用卡資料。請自行開啟遠通官網或官方 App 查詢；車號查詢欄位本身不代表詐騙。' : '請勿在可疑頁面輸入資料，請自行開啟財政部官方平台查詢。圖形驗證碼與「驗證碼（密碼）」不等於簡訊 OTP。' };
    }
    function report(result) {
        return `⚠️ 風險：${result.risk === 'high' ? '高風險' : '無法判定'}\n🔍 分析：${result.analysis}\n畫面類型：網站登入頁截圖\n網址列：${result.host || '尚未確認'}（僅為截圖辨識，未驗證實際連線）\n🛡️ 建議：${result.advice}\n官方查證入口：${result.officialUrl || official.url}`;
    }
    return { official, fetc, hosts, reliable, domainWords, consensus, addressRows, inToolbar, mailRetryAllowed, fallbackRegions, assess, report };
});
