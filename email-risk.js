(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EmailRisk = api;
})(globalThis, function () {
    // Website ownership is not mail authorization. Entries are deliberately non-exhaustive.
    const website = (domain, source, purpose = '官方查證入口') => ({ domain, includeSubdomains: false, purpose, source });
    const reference = (id, name, aliases, domain, source, category) => ({
        id, name, aliases, category, websiteDomains: [website(domain, source), ...(domain.startsWith('www.') ? [website(domain.slice(4), source)] : [])], shortDomains: [],
        senderDomains: [], delegatedSenderDomains: [], exhaustive: false,
        verifiedAt: '2026-09-05', sources: [source]
    });
    const chtSource = 'https://www.cht.com.tw/home/chtweb/ebill/FAQ.html';
    const cathaySource = 'https://www.cathaybk.com.tw/cathaybk/Personal/about/news/announcement/announcement/2023/CUBEApp_FP/';
    const brands = [{
        id: 'fetc', name: '遠通電收', aliases: ['遠通', 'eTag', 'FETC'],
        category: 'billing', websiteDomains: [website('www.fetc.net.tw', 'https://www.fetc.net.tw/ContentFiles_UX/HTMLContent/electronic_bill/index.html')], shortDomains: [],
        senderDomains: [{ domain: 'fetc.net.tw', includeSubdomains: false, purpose: '電子帳單', source: 'https://www.fetc.net.tw/ContentFiles_UX/HTMLContent/electronic_bill/index.html' }],
        delegatedSenderDomains: [], exhaustive: false, verifiedAt: '2026-09-05',
        sources: ['https://www.fetc.net.tw/ContentFiles_UX/HTMLContent/electronic_bill/index.html',
            'https://www.fetc.net.tw/ContentFiles_UX/CompanyNews/334/index.html?t=638290736677412836']
    }, reference('taipower', '台灣電力公司', ['台電', '台灣電力', '臺灣電力'], 'www.taipower.com.tw',
        'https://hc2.taipower.com.tw/2289/2323/2333/65523/', 'billing'),
    { ...reference('cht', '中華電信', ['中華電信', 'Chunghwa Telecom'], '123.cht.com.tw', chtSource, 'telecom'),
        websiteDomains: ['123.cht.com.tw', 'member.cht.com.tw', 'www.cht.com.tw', 'cht.com.tw'].map(domain => website(domain, chtSource)),
        senderDomains: [{ domain: 'cht.com.tw', includeSubdomains: false, purpose: '電子帳單', source: chtSource }],
        shortDomains: [website('cht.tw', chtSource, '帳單簡訊縮網址，仍需查核最終目的地')] },
    reference('mvdis', '監理服務網', ['監理服務網', '監理所', '監理站'], 'www.mvdis.gov.tw',
        'https://www.mvdis.gov.tw/m3-emv-cht/public/newsDetail?id=22954', 'traffic'),
    { ...reference('cathaybk', '國泰世華銀行', ['國泰世華', 'CUBE銀行'], 'www.cathaybk.com.tw', cathaySource, 'bank'),
        websiteDomains: ['www.cathaybk.com.tw', 'cathaybk.com.tw', 'www.cathay-cube.com.tw', 'www.cathayrobo.com'].map(domain => website(domain, cathaySource)),
        shortDomains: [website('cathaybk.tw', cathaySource, '官方簡訊縮網址，仍需查核最終目的地')] },
    reference('post', '中華郵政', ['中華郵政', '郵局', '郵政'], 'www.post.gov.tw',
        'https://www.post.gov.tw/post/internet/Anti-Fraud/anti_form.jsp', 'delivery'),
    reference('myship', '7-ELEVEN 賣貨便', ['賣貨便'], 'myship.7-11.com.tw',
        'https://myship.7-11.com.tw/Home/NewsList?area=%E8%B3%A3%E8%B2%A8%E4%BE%BF&no=711', 'marketplace'),
    reference('shopee', '蝦皮購物', ['蝦皮', 'Shopee'], 'help.shopee.tw',
        'https://help.shopee.tw/portal/4/article/79725', 'marketplace')];
    const hasBrand = (text, brand) => brand.aliases.some(alias => /^[a-z]+$/i.test(alias)
        ? new RegExp(`\\b${alias}\\b`, 'i').test(text) : text.includes(alias));
    const normalize = text => String(text || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/([\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/g, '$1')
        .replace(/([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)[ \t]*@[ \t]*((?:[a-z0-9-]+[ \t]*\.[ \t]*)+[a-z]{2,})/gi,
            (_, local, domain) => `${local}@${domain.replace(/[ \t]/g, '')}`);
    const matchesDomain = (domain, entry) => domain === entry.domain ||
        (entry.includeSubdomains === true && domain.endsWith('.' + entry.domain));
    const isFresh = (brand, now) => Number.isFinite(Date.parse(brand.verifiedAt)) &&
        now >= Date.parse(brand.verifiedAt) && now - Date.parse(brand.verifiedAt) <= 366 * 86400000;
    const brandSummary = brand => ({ id: brand.id, name: brand.name, verifiedAt: brand.verifiedAt, sources: brand.sources });
    // Negative advice must not become an instruction to hand over secrets. Check clauses,
    // not the whole message: a harmless footer must not erase an earlier request.
    const negated = text => /(?:請勿|切勿|不要|不得|不需|無需|不必|不會|避免|勿將|勿提供|毋須|已(?:完成|解除|取消)|do not|never)/i.test(text);
    const urlPattern = /https?:\/\/[^\s<>"'，。；、）)]+/gi;
    const clauses = rows => rows.flatMap(row => {
        const parts = [];
        let start = 0;
        const add = end => parts.push({ ...row, start, end, text: row.text.slice(start, end).replace(urlPattern, '') });
        // URL query punctuation is not a sentence boundary, and URL path text is not
        // an instruction. Keep offsets so action wording can be tied to a visible link.
        for (const match of row.text.matchAll(/https?:\/\/[^\s<>"'，。；、）)]+|[，,。；;！？!?]/gi)) {
            if (/^https?:/i.test(match[0])) continue;
            add(match.index);
            start = match.index + 1;
        }
        add(row.text.length);
        return parts;
    });
    const ruleDefinitions = [
        { id: 'message-secret-handoff-v1', label: '要求交付密碼或驗證碼', requires: ['secret_handoff', 'service_context'],
            source: 'https://www.cathaybk.com.tw/cathaybk/Personal/about/news/announcement/announcement/2023/CUBEApp_FP/',
            description: '以服務或帳戶處理為由，要求將密碼或驗證碼交給他人。' },
        { id: 'message-atm-cancel-installment-v1', label: '解除分期卻要求操作 ATM 或網銀', requires: ['cancel_installment', 'atm_action'],
            source: 'https://myship.7-11.com.tw/Home/NewsList?area=%E8%B3%A3%E8%B2%A8%E4%BE%BF&no=711',
            description: '以解除分期或重複扣款為由，要求操作 ATM 或網銀。' },
        { id: 'message-seller-advance-payment-v1', label: '收款認證要求先付款', requires: ['seller_activation', 'advance_payment'],
            source: 'https://myship.7-11.com.tw/Home/NewsList?area=%E8%B3%A3%E8%B2%A8%E4%BE%BF&no=711',
            description: '以開通收款或賣家認證為由，要求先匯款或繳交保證金。' },
        { id: 'message-financial-remote-control-v1', label: '處理帳務要求遠端控制', requires: ['financial_problem', 'remote_control'],
            source: 'https://support.anydesk.com/docs/zh-hant/abuse-management',
            description: '以帳務或退款問題為由，要求安裝或開啟遠端控制工具。' }
    ];

    function assess(lines, registry = brands, now = Date.now()) {
        const rows = (Array.isArray(lines) ? lines : []).slice(0, 200).flatMap((line, index) => {
            if (typeof line?.text !== 'string' || !line.text.trim() || !Number.isFinite(line.confidence)) return [];
            return [{ text: normalize(line.text).slice(0, 500), confidence: line.confidence, line: index + 1 }];
        });
        const reliable = rows.filter(row => row.confidence >= 80 && row.confidence <= 100);
        const matchedBrands = registry.filter(item => reliable.some(row => hasBrand(row.text, item)));
        const brand = matchedBrands.length === 1 ? matchedBrands[0] : null;
        const context = /^(?:(?:.{0,20})?防詐(?:宣導|提醒|公告|專區)|詐騙(?:範例|案例|解析)|查核報告|以下(?:是|為).{0,8}詐騙範例)/.test(reliable[0]?.text.trim() || '') ? 'education_or_quote' : 'message';
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
                const role = mixedLabels ? 'unknown' : label || (previousLine === row.line - 1 ? previousLabel : '') || (matchedBrands.some(item => hasBrand(value, item)) && /[<〈]/.test(value) ? 'claimed_sender' : 'body');
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
        const positive = clauses(reliable).filter(row => !negated(row.text));
        const add = (id, pattern) => {
            const evidence = positive.filter(row => pattern.test(row.text));
            if (evidence.length) signals.push({ id, lines: [...new Set(evidence.map(row => row.line))] });
        };
        add('payment_failure', /(?:代扣|扣款|扣繳|付款|繳費).{0,6}(?:失敗|未成功|異常)|(?:欠費|尚未繳納|補繳通知)/);
        add('account_action', /(?:請|立即|務必|點擊|點選).{0,14}(?:登入|登錄|驗證.{0,3}(?:帳|賬)戶|更新.{0,3}(?:付款|信用卡)|確認.{0,6}(?:帳務|賬務))/);
        add('sensitive_request', /(?:請|提供|輸入|回傳).{0,10}(?:密碼|驗證碼|信用卡卡號)/);
        add('service_context', /(?:客服|帳戶|帳號|賬戶|銀行|電信|電費|包裹|訂單|收款|退款|驗證|認證|罰鍰)/);
        add('secret_handoff', /(?:請|務必|需要|立即).{0,12}(?:回傳|告知|寄回|傳送|傳給|提供給).{0,16}(?:密碼|驗證碼|OTP)|(?:請|務必|立即).{0,8}(?:將|把).{0,12}(?:密碼|驗證碼|OTP).{0,12}(?:回傳|告知|寄回|傳給|提供給)/i);
        add('cancel_installment', /(?:解除|取消).{0,6}(?:分期|重複扣款)|(?:誤設|誤訂).{0,6}分期/);
        add('atm_action', /(?:請|立即|務必|需要).{0,14}(?:操作|前往|使用|登入).{0,8}(?:ATM|自動櫃員機|網銀|網路銀行)/i);
        add('seller_activation', /(?:開通|啟用|認證|驗證|解除|更新).{0,8}(?:收款|賣家|金流|交易限制)|(?:賣家|收款|金流).{0,8}(?:認證|驗證|未開通|凍結|受限)/);
        add('advance_payment', /(?:請|必須|需要|須|先).{0,10}(?:匯款|轉帳|支付|繳交).{0,12}(?:保證金|認證金|驗證金|保障金|解凍金)|(?:請|必須|需要|須).{0,8}先.{0,6}(?:匯款|轉帳)/);
        add('financial_problem', /(?:扣款|付款|帳戶|帳號|賬戶).{0,6}(?:失敗|異常|凍結|鎖定)|退款|欠費|重複扣款/);
        add('remote_control', /(?:請|立即|需要|務必).{0,10}(?:安裝|下載|開啟|啟用).{0,14}(?:AnyDesk|TeamViewer|RustDesk|遠端控制|遠端操控)/i);
        add('refund', /退款|退費|溢繳|溢收/);
        add('traffic_fine', /(?:交通|違規).{0,8}(?:罰鍰|罰款|罰單)|罰鍰未繳/);
        add('delivery_problem', /(?:包裹|配送|投遞|收件地址).{0,10}(?:失敗|錯誤|不完整|異常|補繳|未繳)|重新配送/);
        add('urgent_threat', /(?:帳戶|帳號|服務|門號).{0,8}(?:凍結|停用|停話|鎖定)|(?:限時|逾期|否則).{0,12}(?:停電|停用|罰款|停話)/);
        add('link_action', /(?:請|立即|務必|點擊|點選).{0,14}(?:連結|網址|登入|登錄|繳費|補款|退款|更新|驗證)/);
        add('card_request', /(?:請|需要|務必).{0,12}(?:輸入|提供|填寫).{0,10}(?:信用卡|卡號|安全碼)/);
        const senderDomains = addresses.filter(a => ['sender', 'claimed_sender'].includes(a.role));
        const entries = brand ? [...brand.senderDomains, ...brand.delegatedSenderDomains] : [];
        const fresh = brand && isFresh(brand, now);
        const unlisted = senderDomains.filter(a => !entries.some(entry => matchesDomain(a.domain, entry)));
        const senderStatus = matchedBrands.length > 1 ? 'ambiguous_brand' : !brand || !senderDomains.length ? 'unknown' : !fresh ? 'stale_reference' : !entries.length ? 'no_sender_reference' : unlisted.length ? 'not_in_verified_records' : 'listed_not_authenticated';
        const has = id => signals.some(signal => signal.id === id);
        const websites = matchedBrands.filter(item => isFresh(item, now)).flatMap(item => [...(item.websiteDomains || []), ...(item.shortDomains || [])]);
        const links = reliable.flatMap(row => [...row.text.matchAll(urlPattern)].flatMap(match => {
            try {
                const parsed = new URL(match[0]);
                if (!parsed.hostname.includes('.') || parsed.username || parsed.password) return [];
                const actionable = positive.some(clause => clause.line === row.line && clause.start <= match.index && clause.end >= match.index + match[0].length && /(?:點擊|點選|請.{0,10}(?:登入|繳費|補款|退款|填寫|驗證|更新))/.test(clause.text));
                return [{ domain: parsed.hostname, line: row.line, actionable,
                    status: !websites.length ? 'unknown' : websites.some(entry => matchesDomain(parsed.hostname, entry)) ? 'listed_not_authenticated' : 'not_in_verified_records' }];
            } catch { return []; }
        }));
        const related = required => signals.filter(signal => required.includes(signal.id)).some(anchor => anchor.lines.some(line =>
            required.every(id => signals.find(signal => signal.id === id)?.lines.some(other => Math.abs(line - other) <= 5))));
        const ruleMatches = context === 'message' ? ruleDefinitions.filter(rule => rule.requires.every(has) && related(rule.requires)).map(rule => ({
            id: rule.id, label: rule.label, description: rule.description, signals: rule.requires,
            lines: [...new Set(signals.filter(s => rule.requires.includes(s.id)).flatMap(s => s.lines))], sources: rule.source ? [rule.source] : []
        })) : [];
        const addRule = (id, description, required, sources) => ruleMatches.push({ id,
            label: id === 'mail-brand-unlisted-payment-login-v1' ? '寄件線索與帳務登入要求不一致' : '未列入資料的操作網址要求信用卡資料', description, signals: required,
            lines: [...new Set(signals.filter(s => required.includes(s.id)).flatMap(s => s.lines))], sources });
        if (context === 'message' && fresh && entries.length && unlisted.length > 0 && has('payment_failure') && has('account_action')) {
            addRule('mail-brand-unlisted-payment-login-v1', `疑似冒用${brand.name}：畫面中的寄件信箱網域未列於已驗證資料，並以扣款異常引導登入或確認帳務。`, ['payment_failure', 'account_action'], brand.sources);
            ruleMatches[ruleMatches.length - 1].lines.push(...unlisted.map(item => item.line));
        }
        // These are visible, action-associated hosts, never the hidden hyperlink destination.
        const externalAction = links.some(link => link.actionable && link.status === 'not_in_verified_records');
        const scenario = ['payment_failure', 'refund', 'traffic_fine', 'delivery_problem', 'urgent_threat'].some(has);
        if (context === 'message' && fresh && externalAction && scenario && has('card_request')) {
            addRule('message-brand-external-card-v1', `疑似冒用${brand.name}：帳務或服務通知引導至未列於已查證資料的可見網址，並要求填寫信用卡資料。`, ['link_action', 'card_request', ...signals.filter(s => ['payment_failure', 'refund', 'traffic_fine', 'delivery_problem', 'urgent_threat'].includes(s.id)).map(s => s.id)], brand.sources);
            ruleMatches[ruleMatches.length - 1].lines.push(...links.filter(link => link.actionable && link.status === 'not_in_verified_records').map(link => link.line));
        }
        ruleMatches.forEach(rule => { rule.lines = [...new Set(rule.lines)].sort((a, b) => a - b); });
        const high = ruleMatches.length > 0;
        const needsContentReview = !high && context === 'message' &&
            ((scenario && (has('link_action') || has('account_action') || has('sensitive_request'))) || has('secret_handoff') || has('remote_control') || has('advance_payment'));
        return {
            risk: high ? 'high' : 'unknown', ruleId: ruleMatches[0]?.id || null, ruleMatches,
            needsContentReview, context, brand: brand ? brandSummary(brand) : null, brands: matchedBrands.map(brandSummary),
            addresses, senderStatus, signals, amounts, links,
            subjectLines: reliable.filter(row => /^(?:主旨|subject\s*:)/i.test(row.text) || (row.line === 1 && brand && hasBrand(row.text, brand))).map(row => row.line),
            authentication: 'not_available_from_screenshot', linkDestination: 'not_verified',
            vehiclePlate: reliable.some(row => /車(?:號|牌)\s*[:：]\s*[A-Z0-9]+-[A-Z0-9]+/i.test(row.text)) ? 'visible_not_verified' : 'not_visible_in_excerpt',
            analysis: high ? ruleMatches.map(rule => rule.description).join(' ') : context === 'education_or_quote' ? '畫面可能是防詐宣導或引用範例，未將引用內容直接判為詐騙；不代表畫面內連結安全。' : needsContentReview ? '畫面具有帳務、服務異常或敏感操作要求，寄件資訊尚未可靠確認或證據不足，不能判定為安全。' : '目前可讀取的證據不足以判定內容風險；寄件名單或官網相符也不代表整則訊息安全。',
            advice: '請自行開啟官方 App 或官網查詢，勿透過郵件提供密碼或驗證碼。'
        };
    }

    function report(result) {
        const domains = [...new Set(result.addresses.filter(a => ['sender', 'claimed_sender'].includes(a.role)).map(a => a.domain))];
        const evidence = (result.ruleMatches || []).map(rule => `${rule.label}（第 ${rule.lines.join('、')} 行）`).join('；');
        const sources = [...new Set([...(result.brands || []).flatMap(brand => brand.sources), ...(result.ruleMatches || []).flatMap(rule => rule.sources)])];
        return `⚠️ 風險：${result.risk === 'high' ? '高風險' : '無法判定'}\n🔍 分析：${result.analysis}\n寄件線索：${domains.join('、') || '未確認'}（僅為畫面資訊）${evidence ? '\n判斷依據：' + evidence : ''}\n真正寄件來源與連結目的地：未確認\n🛡️ 建議：${result.advice}${sources.length ? '\n查證參考（非本信件驗證）：\n' + sources.join('\n') : ''}`;
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
    const references = [...brands.flatMap(brand => brand.sources.map(url => ({ url, title: `${brand.name}官方資料` }))),
        ...ruleDefinitions.filter(rule => rule.source).map(rule => ({ url: rule.source, title: '防詐參考資料' }))];
    return { brands, references, assess, report, domainEvidence, normalizeOcrText: normalize };
});
