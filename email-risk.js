(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EmailRisk = api;
})(globalThis, function () {
    // Website ownership is not mail authorization. Entries are deliberately non-exhaustive.
    const brands = [{
        id: 'fetc', name: '遠通電收', aliases: ['遠通', 'eTag', 'FETC'],
        senderDomains: [{ domain: 'fetc.net.tw', includeSubdomains: false, purpose: '電子帳單' }],
        delegatedSenderDomains: [], exhaustive: false, verifiedAt: '2026-09-05',
        sources: ['https://www.fetc.net.tw/ContentFiles_UX/HTMLContent/electronic_bill/index.html',
            'https://www.fetc.net.tw/ContentFiles_UX/CompanyNews/334/index.html?t=638290736677412836']
    }];
    const hasBrand = (text, brand) => brand.aliases.some(alias => /^[a-z]+$/i.test(alias)
        ? new RegExp(`\\b${alias}\\b`, 'i').test(text) : text.includes(alias));
    const normalize = text => String(text || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, '$1')
        .replace(/([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)[ \t]*@[ \t]*((?:[a-z0-9-]+[ \t]*\.[ \t]*)+[a-z]{2,})/gi,
            (_, local, domain) => `${local}@${domain.replace(/[ \t]/g, '')}`);
    const matchesDomain = (domain, entry) => domain === entry.domain ||
        (entry.includeSubdomains === true && domain.endsWith('.' + entry.domain));

    function assess(lines, registry = brands, now = Date.now()) {
        const rows = (Array.isArray(lines) ? lines : []).slice(0, 200).flatMap((line, index) => {
            if (typeof line?.text !== 'string' || !line.text.trim() || !Number.isFinite(line.confidence)) return [];
            return [{ text: normalize(line.text).slice(0, 500), confidence: line.confidence, line: index + 1 }];
        });
        const reliable = rows.filter(row => row.confidence >= 80 && row.confidence <= 100);
        const brand = registry.find(item => reliable.some(row => hasBrand(row.text, item)));
        const context = /^(?:防詐(?:宣導|提醒|公告)|詐騙(?:範例|案例|解析)|查核報告|以下(?:是|為).{0,8}詐騙範例)/.test(reliable[0]?.text.trim() || '') ? 'education_or_quote' : 'message';
        const addresses = [];
        let previousLabel = '';
        let previousLine = 0;
        for (const row of reliable) {
            const value = row.text.trim();
            const recipient = /^(?:收件(?:者|人)|寄給|副本|密件副本|to\s*:|cc\s*:|bcc\s*:)/i.test(value);
            const sender = /^(?:寄件(?:者|人)|發件(?:者|人)|from\s*:)/i.test(value);
            const label = recipient ? 'recipient' : sender ? 'sender' : '';
            const mixedLabels = /(?:寄件者|寄件人|發件人|from\s*:)/i.test(value) && /(?:收件者|收件人|to\s*:)/i.test(value);
            const emails = [...value.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})\b/gi)];
            for (const match of emails) {
                const role = mixedLabels ? 'unknown' : label || (previousLine === row.line - 1 ? previousLabel : '') || (brand && hasBrand(value, brand) && /[<〈]/.test(value) ? 'claimed_sender' : 'body');
                addresses.push({ domain: match[1].toLowerCase(), role, line: row.line, confidence: row.confidence });
            }
            previousLabel = !emails.length && /^(?:收件(?:者|人)|寄件(?:者|人)|發件(?:者|人)|to|from)\s*[:：]?$/i.test(value) ? label : '';
            previousLine = row.line;
        }
        const signals = [];
        const amounts = [];
        for (const row of reliable) {
            for (const match of row.text.matchAll(/(?:新臺幣|新台幣|NT\$)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi)) {
                const value = Number(match[1].replace(/,/g, ''));
                if (Number.isFinite(value)) amounts.push({ currency: 'TWD', value, line: row.line });
            }
        }
        const add = (id, pattern) => {
            const evidence = reliable.filter(row => pattern.test(row.text));
            if (evidence.length) signals.push({ id, lines: evidence.map(row => row.line) });
        };
        add('payment_failure', /(?:代扣|扣款|扣繳|付款|繳費).{0,6}(?:失敗|未成功|異常)|(?:欠費|尚未繳納|補繳通知)/);
        add('account_action', /(?:請|立即|務必|點擊|點選).{0,14}(?:登入|登錄|驗證.{0,3}(?:帳|賬)戶|更新.{0,3}(?:付款|信用卡)|確認.{0,6}(?:帳務|賬務))/);
        add('sensitive_request', /(?:請|提供|輸入|回傳).{0,10}(?:密碼|驗證碼|信用卡卡號)/);
        const senderDomains = addresses.filter(a => ['sender', 'claimed_sender'].includes(a.role));
        const entries = brand ? [...brand.senderDomains, ...brand.delegatedSenderDomains] : [];
        const fresh = brand && Number.isFinite(Date.parse(brand.verifiedAt)) && now - Date.parse(brand.verifiedAt) <= 366 * 86400000 && now >= Date.parse(brand.verifiedAt);
        const unlisted = senderDomains.filter(a => !entries.some(entry => matchesDomain(a.domain, entry)));
        const senderStatus = !brand || !senderDomains.length ? 'unknown' : !fresh ? 'stale_reference' : unlisted.length ? 'not_in_verified_records' : 'listed_not_authenticated';
        const has = id => signals.some(signal => signal.id === id);
        const high = context === 'message' && fresh && unlisted.length > 0 && has('payment_failure') && has('account_action');
        return {
            risk: high ? 'high' : 'unknown', ruleId: high ? 'mail-brand-unlisted-payment-login-v1' : null,
            needsContentReview: !high && context === 'message' && !!brand && has('payment_failure') && has('account_action') && senderStatus !== 'listed_not_authenticated',
            context, brand: brand ? { id: brand.id, name: brand.name, verifiedAt: brand.verifiedAt, sources: brand.sources } : null,
            addresses, senderStatus, signals, amounts,
            subjectLines: reliable.filter(row => /^(?:主旨|subject\s*:)/i.test(row.text) || (row.line === 1 && brand && hasBrand(row.text, brand))).map(row => row.line),
            authentication: 'not_available_from_screenshot', linkDestination: 'not_verified',
            vehiclePlate: reliable.some(row => /車(?:號|牌)\s*[:：]\s*[A-Z0-9]+-[A-Z0-9]+/i.test(row.text)) ? 'visible_not_verified' : 'not_visible_in_excerpt',
            analysis: high ? `疑似冒用${brand.name}：畫面中的寄件信箱網域未列於已驗證資料，並以扣款異常引導登入或確認帳務。` : '郵件證據不足以由組合規則判定；寄件名單相符也不代表通過郵件驗證。',
            advice: '請自行開啟官方 App 或官網查詢，勿透過郵件提供密碼或驗證碼。'
        };
    }

    function report(result) {
        const domains = [...new Set(result.addresses.filter(a => ['sender', 'claimed_sender'].includes(a.role)).map(a => a.domain))];
        return `⚠️ 風險：${result.risk === 'high' ? '高風險' : '無法判定'}\n🔍 分析：${result.analysis}\n寄件線索：${domains.join('、') || '未確認'}（僅為畫面資訊）\n真正寄件來源與連結目的地：未確認\n🛡️ 建議：${result.advice}`;
    }
    function domainEvidence(words) {
        return (Array.isArray(words) ? words : []).flatMap(word => {
            const match = typeof word.text === 'string' && word.text.match(/@((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i);
            if (!match) return [];
            let confidence = word.confidence;
            if (Array.isArray(word.symbols) && word.symbols.map(s => s.text).join('') === word.text) {
                const start = match.index + 1, end = start + match[1].length;
                let offset = 0;
                const scores = [];
                for (const symbol of word.symbols) {
                    const next = offset + symbol.text.length;
                    if (offset < end && next > start) scores.push(symbol.confidence);
                    offset = next;
                }
                confidence = scores.length && scores.every(Number.isFinite) ? Math.min(...scores) : 0;
            }
            return Number.isFinite(confidence) && confidence >= 80 && confidence <= 100
                ? [{ domain: match[1].toLowerCase(), confidence }] : [];
        });
    }
    return { brands, assess, report, domainEvidence, normalizeOcrText: normalize };
});
