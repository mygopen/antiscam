const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadRiskConfig() {
    const source = fs.readFileSync(path.join(repoRoot, 'risk-config.js'), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.RISK_CONFIG;
}

const riskConfig = loadRiskConfig();

function matchesDomainList(domain, list) {
    const lowerDomain = domain.toLowerCase();
    return list.some(item => {
        const lowerItem = item.toLowerCase();
        return lowerDomain === lowerItem || lowerDomain.endsWith('.' + lowerItem);
    });
}

function extractNestedUrls(rawUrl) {
    const variants = [String(rawUrl || '')];
    for (let i = 0; i < 2; i++) {
        try {
            const decoded = decodeURIComponent(variants[variants.length - 1]);
            if (!variants.includes(decoded)) variants.push(decoded);
        } catch (e) {
            break;
        }
    }

    const found = [];
    try {
        const parsed = new URL(rawUrl);
        parsed.searchParams.forEach(value => {
            if (!value || value.length < 12 || !/^[A-Za-z0-9+/=_-]+$/.test(value)) return;
            const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
            const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=');
            try {
                const decoded = Buffer.from(paddedValue, 'base64').toString('utf8');
                if (/https?:\/\//i.test(decoded)) {
                    const matches = decoded.match(/https?:\/\/[^\s"'<>]+/gi) || [];
                    matches.forEach(match => {
                        try {
                            found.push({ href: new URL(match).href, allowSameHost: true });
                        } catch (e) { }
                    });
                }
            } catch (e) { }
        });
    } catch (e) { }

    for (let i = 0; i < variants.length; i++) {
        const text = variants[i];
        const embeddedProtocolPattern = /\/https?:\/\//gi;
        let embeddedMatch;
        while ((embeddedMatch = embeddedProtocolPattern.exec(text)) !== null) {
            const embedded = text.slice(embeddedMatch.index + 1);
            if (!variants.includes(embedded)) variants.push(embedded);
        }
        const normalized = text.replace(/https?:\/(?!\/)/gi, match => `${match}/`);
        const matches = normalized.match(/https?:\/\/[^\s"'<>]+/gi) || [];
        matches.forEach(match => {
            try {
                const parsed = new URL(match.replace(/[),.]+$/, ''));
                found.push({ href: parsed.href, allowSameHost: false });
            } catch (e) { }
        });
    }

    try {
        const parsedInput = new URL(rawUrl);
        const unique = [];
        found.forEach(item => {
            if (!unique.some(existing => existing.href === item.href)) unique.push(item);
        });
        return unique.filter(item => {
            try {
                const parsed = new URL(item.href);
                if (parsed.href === parsedInput.href) return false;
                if (!item.allowSameHost && parsed.hostname === parsedInput.hostname) return false;
                return item.allowSameHost || !parsedInput.href.startsWith(parsed.href);
            } catch (e) { return true; }
        }).map(item => item.href);
    } catch (e) {
        return [...new Set(found.map(item => item.href))];
    }
}

function isEmailTrackingRedirector(hostname) {
    return matchesDomainList(hostname, riskConfig.emailTrackingRedirectors);
}

function hasFinancialPhishingText(text) {
    const haystack = decodeSignalText(text || '');
    return riskConfig.financialPhishingKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function analyzeEmailTrackingRisk(rawUrl) {
    const parsed = new URL(rawUrl);
    const domain = parsed.hostname.toLowerCase();
    const nestedUrls = extractNestedUrls(rawUrl);
    const nestedDomains = nestedUrls.map(url => new URL(url).hostname.toLowerCase());
    const isEmailTrackingDomain = isEmailTrackingRedirector(domain);
    const hasEmailTrackingRedirect = isEmailTrackingDomain && nestedUrls.length > 0;
    const hasFinancialPhishingSignal = hasFinancialPhishingText(rawUrl + '\n' + nestedUrls.join('\n'));
    const isDeepSubdomain = domain.split('.').length >= 5;
    const isHighEntropy = hasHighEntropySubdomain(domain);
    const hasSuspiciousEmailTrackingHost = isEmailTrackingDomain &&
        nestedUrls.length === 0 &&
        (isDeepSubdomain || isHighEntropy);
    const hasPattern = hasEmailTrackingRedirect && (isDeepSubdomain || isHighEntropy || hasFinancialPhishingSignal);

    return {
        domain,
        nestedDomains,
        isEmailTrackingDomain,
        hasEmailTrackingRedirect,
        hasFinancialPhishingSignal,
        hasSuspiciousEmailTrackingHost,
        hasPattern
    };
}

function getHighRiskSummaryReasons(scanData) {
    if (!scanData || !scanData.checks) return [];

    const checks = scanData.checks;
    const reasons = [];
    const addReason = (condition, reason) => {
        if (condition && !reasons.includes(reason)) reasons.push(reason);
    };

    addReason(checks.googleSafeBrowsing?.status === 'danger', 'Google 安全庫已標記危險');
    addReason(checks.apkCheck?.status === 'danger', '誘導下載可疑 App 或 APK');
    addReason(checks.redirect?.status === 'danger', '郵件追蹤跳板或隱藏轉址');
    addReason(checks.domainAnalysis?.status === 'danger', checks.domainAnalysis?.details || '網域特徵異常');
    addReason(checks.externalResources?.status === 'danger', '表單或外部資源送往可疑網域');
    addReason(checks.brandSimilarity?.status === 'danger', '網域疑似仿冒知名品牌');
    addReason(checks.params?.status === 'danger', '網址含敏感驗證或認證參數');
    addReason(checks.entropy?.status === 'danger', '網址含高隨機亂碼特徵');
    addReason(checks.age?.status === 'danger', '3 個月內新註冊網域');
    addReason(checks.siteContent?.status === 'danger' && reasons.length === 0, checks.siteContent?.details || '網站內容具高風險特徵');

    return reasons.slice(0, 3);
}

function enforceFinalRiskConsistency(scanData) {
    if (!scanData || scanData.isInvalid || scanData.isSocialMedia || scanData.blocklistListed) return scanData;

    const reasons = getHighRiskSummaryReasons(scanData);
    if (reasons.length > 0 && scanData.riskScore < 70) {
        scanData.riskScore = 70;
    }
    scanData.summaryReasons = reasons;
    return scanData;
}

function hasHighRiskTld(domain) {
    return riskConfig.highRiskTlds.some(suffix => domain.toLowerCase().endsWith(suffix));
}

function hasSuspiciousTld(domain) {
    return riskConfig.suspiciousTlds.some(suffix => domain.toLowerCase().endsWith(suffix));
}

function isFakeGov(domain, isWhitelisted = false) {
    const lowerDomain = domain.toLowerCase();
    return lowerDomain.includes('gov') &&
        !lowerDomain.endsWith('.gov') &&
        !lowerDomain.endsWith('.gov.tw') &&
        !isWhitelisted;
}

function calculateEntropy(str) {
    const len = str.length;
    const frequencies = {};

    for (let i = 0; i < len; i++) {
        const char = str[i];
        frequencies[char] = (frequencies[char] || 0) + 1;
    }

    let entropy = 0;
    for (const char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
    }

    return entropy;
}

function hasHighEntropySubdomain(domain) {
    const subdomainPart = domain.toLowerCase().split('.')[0];
    const entropy = calculateEntropy(subdomainPart);
    const isLongGibberish = entropy > 3.6 || /^[a-z0-9]{12,30}$/.test(subdomainPart);
    const lacksVowels = subdomainPart.length >= 5 && !/[aeiou]/i.test(subdomainPart);
    const hasConsecutiveConsonants = /[bcdfghjklmnpqrstvwxz]{4,}/i.test(subdomainPart);

    return (isLongGibberish || lacksVowels || hasConsecutiveConsonants) && subdomainPart !== 'www';
}

function traceRisk({ redirectCount, chain, maxRedirects = 6 }) {
    if (redirectCount >= maxRedirects) {
        return {
            isHighRisk: true,
            riskReason: `轉址路徑過深 (超過 ${maxRedirects} 層)，強制中止。正常網站極少轉址這麼多次。`
        };
    }

    if (redirectCount >= 5) {
        return {
            isHighRisk: true,
            riskReason: `偵測到多重轉址 (${redirectCount} 次)，常見於詐騙連結規避掃描。`
        };
    }

    const riskyShorteners = ['i.gal', 'bit.do', 'is.gd', 'tiny.cc', 't.cn'];
    const hasRiskyShortener = chain.some(hop => riskyShorteners.some(risk => hop.url.includes(risk)));

    if (hasRiskyShortener && redirectCount >= 1) {
        return {
            isHighRisk: true,
            riskReason: '使用了常被詐騙集團濫用的短網址服務。'
        };
    }

    return { isHighRisk: false, riskReason: '' };
}

function normalizeRiskLine(line) {
    const cleaned = (line || '').replace(/[*#_`~]/g, '').replace(/【|】/g, '').trim();
    const riskText = cleaned.replace(/^⚠️\s*風險：?/, '').trim();

    if (/(未發現|未偵測|無明顯|沒有明顯)/.test(riskText)) {
        return '⚠️ 風險：未發現';
    }

    const hasHigh = /高/.test(riskText);
    const hasMedium = /中/.test(riskText);
    const hasLow = /低/.test(riskText);
    const riskCount = [hasHigh, hasMedium, hasLow].filter(Boolean).length;

    if (riskCount === 1) {
        if (hasHigh) return '⚠️ 風險：高風險';
        if (hasMedium) return '⚠️ 風險：中風險';
        if (hasLow) return '⚠️ 風險：未發現';
    }

    return '⚠️ 風險：未發現';
}

function isSensitiveFormField(attrs) {
    const type = (attrs.type || '').toLowerCase();
    const haystack = [
        type,
        attrs.name,
        attrs.id,
        attrs.placeholder,
        attrs.autocomplete,
        attrs.ariaLabel
    ].filter(Boolean).join(' ').toLowerCase();

    const isSensitiveType = ['password', 'tel', 'email'].includes(type);
    const matchedKeyword = riskConfig.sensitiveFormKeywords.find(keyword => haystack.includes(keyword.toLowerCase()));
    return isSensitiveType || !!matchedKeyword;
}

function isExternalResource(rawUrl, fullUrl) {
    const domainHostname = new URL(fullUrl).hostname;
    const parsed = new URL(rawUrl, fullUrl);
    return !matchesDomainList(parsed.hostname, [domainHostname]) &&
        !matchesDomainList(parsed.hostname, riskConfig.trustedResourceDomains);
}

function comparableDomainText(hostname) {
    return hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

function damerauLevenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => {
        const row = Array(b.length + 1).fill(0);
        row[0] = i;
        return row;
    });
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
            }
        }
    }

    return matrix[a.length][b.length];
}

function checkBrandSimilarity(hostname, whitelist = []) {
    const domainText = comparableDomainText(hostname);

    for (const brand of riskConfig.protectedBrands) {
        if (matchesDomainList(hostname, brand.domains) || matchesDomainList(hostname, whitelist)) continue;

        for (const keyword of brand.keywords) {
            const normalizedKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!normalizedKeyword || normalizedKeyword.length < 3) continue;
            if (domainText.includes(normalizedKeyword)) return { matched: true, brandName: brand.name };

            for (let i = 0; i <= domainText.length - normalizedKeyword.length; i++) {
                const segment = domainText.slice(i, i + normalizedKeyword.length);
                if (damerauLevenshteinDistance(segment, normalizedKeyword) <= 1) {
                    return { matched: true, brandName: brand.name };
                }
            }
        }
    }

    return { matched: false };
}

function hasPublicUtilityScamText(text) {
    const haystack = decodeSignalText(text || '');
    return riskConfig.publicUtilityScamKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function hasLogisticsScamText(text) {
    const haystack = decodeSignalText(text || '');
    return riskConfig.logisticsScamKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function hasOfficialFlowPath(fullUrl) {
    const haystack = decodeSignalText(fullUrl || '');
    return riskConfig.officialFlowPathKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function hasPunycodeOrUnicodeHostname(hostname, rawUrl = '') {
    return String(hostname || '').toLowerCase().includes('xn--') || /[^\x00-\x7F]/.test(String(rawUrl || ''));
}

function analyzePageBrandSignals({ hostname, text }) {
    const haystack = decodeSignalText(text || '');
    for (const brand of riskConfig.protectedBrands) {
        if (matchesDomainList(hostname, brand.domains)) continue;
        const keywords = [brand.name, ...brand.keywords].filter(Boolean);
        const matchedKeyword = keywords.find(keyword => haystack.includes(keyword.toLowerCase()));
        if (matchedKeyword) return { matched: true, brandName: brand.name, keyword: matchedKeyword };
    }
    return { matched: false };
}

function analyzeUrgencySignals(text) {
    const haystack = decodeSignalText(text || '');
    const examples = riskConfig.urgencyScamKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
    return { count: examples.length, examples };
}

function getDomainParts(hostname) {
    const parts = hostname.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
    const secondLevelTLDs = [
        'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw',
        'co.uk', 'org.uk', 'gov.uk',
        'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
        'com.hk', 'org.hk',
        'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn'
    ];
    const lastTwo = parts.slice(-2).join('.');
    const registeredSize = secondLevelTLDs.includes(lastTwo) ? 3 : 2;
    return {
        subdomainLabels: parts.length > registeredSize ? parts.slice(0, -registeredSize) : [],
        rootLabel: parts.length >= registeredSize ? parts[parts.length - registeredSize] : (parts[0] || '')
    };
}

function hasReadableVowelPattern(text) {
    return /[aeiou]/i.test(text) && !/[bcdfghjklmnpqrstvwxz]{4,}/i.test(text);
}

function analyzeSuspiciousSubdomain(hostname) {
    const { subdomainLabels, rootLabel } = getDomainParts(hostname);
    const rootTokens = rootLabel.split(/[-_]+/).filter(token => token.length >= 3);
    const suspiciousReasons = [];
    const candidateLabels = subdomainLabels.filter(label => {
        const clean = label.toLowerCase();
        return clean && !riskConfig.safeSubdomainLabels.includes(clean);
    });

    candidateLabels.forEach(label => {
        const cleanLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const compactLabel = cleanLabel.replace(/-/g, '');
        if (!compactLabel || compactLabel.length < 2) return;

        const segments = cleanLabel.split('-').filter(Boolean);
        const hasHyphen = cleanLabel.includes('-');
        const hasTopicOverlap = rootTokens.some(token => compactLabel.includes(token) || token.includes(compactLabel));
        const hasShortRandomSegment = segments.some(segment => {
            if (!/[a-z]/.test(segment) || segment.length < 2 || segment.length > 8) return false;
            return !/[aeiou]/.test(segment) || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(segment);
        });
        const looksUnreadable = compactLabel.length >= 6 &&
            compactLabel.length <= 20 &&
            (!hasReadableVowelPattern(compactLabel) || calculateEntropy(compactLabel) > 3.4);

        if (hasHyphen && !hasTopicOverlap) suspiciousReasons.push('子網域含連字號且與主網域主題無明顯關聯');
        if (hasShortRandomSegment) suspiciousReasons.push('子網域包含短隨機片段');
        if (looksUnreadable) suspiciousReasons.push('子網域長度 6-20 且不易讀成自然詞');
    });

    return {
        matched: suspiciousReasons.length > 0,
        label: candidateLabels[0] || '',
        reasons: [...new Set(suspiciousReasons)]
    };
}

function capWeakSignalRisk(score, hasStrongRiskSignal) {
    return !hasStrongRiskSignal && score > 60 ? 60 : score;
}

function decodeSignalText(text) {
    const raw = String(text || '');
    const variants = [raw];
    try { variants.push(decodeURIComponent(raw)); } catch (e) { }
    return [...new Set(variants)].join('\n').toLowerCase();
}

function analyzeSuspiciousDownloadPath(fullUrl) {
    const pathName = new URL(fullUrl).pathname.toLowerCase();
    const matched = riskConfig.suspiciousDownloadPathFragments.filter(fragment => pathName.includes(fragment.toLowerCase()));
    return { matched: matched.length > 0, fragments: matched };
}

function analyzeDownloadSignals({ html = '', url }) {
    const haystack = decodeSignalText(`${html}\n${url}`);
    const apkMatches = haystack.match(/(?:https?:\/\/|\/|[\w.-])[\w./?=&%:+-]*\.apk(?:[?#][\w./?=&%:+-]*)?/gi) || [];
    const installKeywords = riskConfig.apkInstallKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const dynamicPatterns = [
        /(?:window\.)?open\s*\(/i,
        /location\.(?:href|assign|replace)\s*[=(]/i,
        /createelement\s*\(\s*['"]a['"]\s*\)/i,
        /\.click\s*\(\s*\)/i,
        /download\s*=/i,
        /fetch\s*\(/i
    ];
    const suspiciousPath = analyzeSuspiciousDownloadPath(url);

    return {
        apkUrlCount: [...new Set(apkMatches)].length,
        installKeywordCount: installKeywords.length,
        dynamicDownloadCount: dynamicPatterns.filter(pattern => pattern.test(haystack)).length,
        suspiciousPath: suspiciousPath.matched,
        suspiciousPathFragments: suspiciousPath.fragments
    };
}

function isDownloadPhishingSignal(signals) {
    const hasInstallKeywordSignal = signals.installKeywordCount >= 2 ||
        (signals.installKeywordCount > 0 && signals.suspiciousPath);
    const hasDynamicDownloadSignal = signals.dynamicDownloadCount >= 2 &&
        (signals.installKeywordCount > 0 || signals.suspiciousPath);
    const hasSuspiciousDownloadLanding = signals.suspiciousPath &&
        (signals.installKeywordCount > 0 || signals.dynamicDownloadCount > 0 || signals.suspiciousPathFragments.length >= 2);
    return signals.apkUrlCount === 0 &&
        (hasInstallKeywordSignal || hasDynamicDownloadSignal || hasSuspiciousDownloadLanding);
}

test('白名單支援完全符合與子網域符合', () => {
    const whitelist = ['example.com', 'trusted.org.tw'];

    assert.equal(matchesDomainList('example.com', whitelist), true);
    assert.equal(matchesDomainList('login.example.com', whitelist), true);
    assert.equal(matchesDomainList('fake-example.com', whitelist), false);
    assert.equal(matchesDomainList('trusted.org.tw', whitelist), true);
    assert.equal(matchesDomainList('service.trusted.org.tw', whitelist), true);
});

test('社群平台使用設定檔清單做完全符合與子網域符合', () => {
    assert.equal(matchesDomainList('facebook.com', riskConfig.socialMediaDomains), true);
    assert.equal(matchesDomainList('m.facebook.com', riskConfig.socialMediaDomains), true);
    assert.equal(matchesDomainList('notfacebook.com', riskConfig.socialMediaDomains), false);
});

test('高風險 TLD 會被標記', () => {
    assert.equal(hasHighRiskTld('promo.shop'), true);
    assert.equal(hasHighRiskTld('verify-login.xyz'), true);
    assert.equal(hasHighRiskTld('mygopen.com'), false);
    assert.equal(hasHighRiskTld('infodemic.cc'), false);
    assert.equal(hasSuspiciousTld('infodemic.cc'), true);
});

test('假政府網域只攔截非正式政府後綴', () => {
    assert.equal(isFakeGov('gov-tw-login.shop'), true);
    assert.equal(isFakeGov('service.gov.tw'), false);
    assert.equal(isFakeGov('agency.gov'), false);
    assert.equal(isFakeGov('gov-tw-login.shop', true), false);
});

test('電子發票 nat 偽裝網域會命中受保護品牌，官方網域不誤判', () => {
    const suspicious = checkBrandSimilarity('www-invoicenat.tw');
    assert.equal(suspicious.matched, true);
    assert.equal(suspicious.brandName, '財政部電子發票');

    const official = checkBrandSimilarity('einvoice.nat.gov.tw');
    assert.equal(official.matched, false);
    assert.equal(riskConfig.fakeServiceKeywords.includes('invoicenat'), true);
});

test('短網址使用嚴格網域符合，避免 t.co 類誤殺', () => {
    assert.equal(matchesDomainList('bit.ly', riskConfig.urlShorteners), true);
    assert.equal(matchesDomainList('link.t.co', riskConfig.urlShorteners), true);
    assert.equal(matchesDomainList('not.co', riskConfig.urlShorteners), false);
    assert.equal(matchesDomainList('static.com', riskConfig.urlShorteners), false);
});

test('亂碼網域會抓到無母音、連續子音與長隨機字串', () => {
    assert.equal(hasHighEntropySubdomain('xsddk.com'), true);
    assert.equal(hasHighEntropySubdomain('bcdfgh.com'), true);
    assert.equal(hasHighEntropySubdomain('a1b2c3d4e5f6g7h8.com'), true);
    assert.equal(hasHighEntropySubdomain('www.example.com'), false);
    assert.equal(hasHighEntropySubdomain('store.example.com'), false);
});

test('轉址風險會抓到過深轉址、多重轉址與高風險短網址', () => {
    assert.equal(traceRisk({ redirectCount: 6, chain: [] }).isHighRisk, true);
    assert.equal(traceRisk({ redirectCount: 5, chain: [] }).isHighRisk, true);

    const riskyShortenerTrace = traceRisk({
        redirectCount: 1,
        chain: [{ url: 'https://tiny.cc/sample', status: 301 }]
    });

    assert.equal(riskyShortenerTrace.isHighRisk, true);
    assert.equal(traceRisk({ redirectCount: 1, chain: [{ url: 'https://example.com', status: 301 }] }).isHighRisk, false);
});

test('截圖分析風險 parsing 會正規化明確與不明確結果', () => {
    assert.equal(normalizeRiskLine('⚠️ 風險：高風險'), '⚠️ 風險：高風險');
    assert.equal(normalizeRiskLine('⚠️ 風險：中風險'), '⚠️ 風險：中風險');
    assert.equal(normalizeRiskLine('⚠️ 風險：低風險'), '⚠️ 風險：未發現');
    assert.equal(normalizeRiskLine('⚠️ 風險：判斷為【高、中 或 低】風險。'), '⚠️ 風險：未發現');
    assert.equal(normalizeRiskLine(''), '⚠️ 風險：未發現');
});

test('表單敏感欄位會抓到密碼、OTP 與金融資料欄位', () => {
    assert.equal(isSensitiveFormField({ type: 'password', name: 'password' }), true);
    assert.equal(isSensitiveFormField({ type: 'text', name: 'otp_code' }), true);
    assert.equal(isSensitiveFormField({ type: 'text', placeholder: '請輸入信用卡卡號' }), true);
    assert.equal(isSensitiveFormField({ type: 'text', name: 'nickname' }), false);
});

test('外部資源與 form action 會排除同網域與信任 CDN', () => {
    assert.equal(isExternalResource('/login', 'https://example.com'), false);
    assert.equal(isExternalResource('https://static.example.com/app.js', 'https://example.com'), false);
    assert.equal(isExternalResource('https://www.googletagmanager.com/gtag/js', 'https://example.com'), false);
    assert.equal(isExternalResource('https://d111111abcdef8.cloudfront.net/app.js', 'https://example.com'), false);
    assert.equal(isExternalResource('https://evil-submit.example.net/form', 'https://example.com'), true);
});

test('品牌相似網域會抓到仿冒與 typo，並排除官方/白名單網域', () => {
    assert.equal(checkBrandSimilarity('ctbcbank-login.shop').matched, true);
    assert.equal(checkBrandSimilarity('ctbcbamk-login.shop').matched, true);
    assert.equal(checkBrandSimilarity('taipwoer.com.tw').matched, true);
    assert.equal(checkBrandSimilarity('ctbcbank.com').matched, false);
    assert.equal(checkBrandSimilarity('fubonlife.tw', ['fubonlife.tw']).matched, false);
});

test('頁面品牌與官方網域不一致應視為強風險訊號', () => {
    const fakePage = analyzePageBrandSignals({
        hostname: 'secure-login.example.shop',
        text: '<title>中國信託信用卡交易驗證</title><img alt="中國信託">'
    });
    const officialPage = analyzePageBrandSignals({
        hostname: 'ctbcbank.com',
        text: '<title>中國信託信用卡服務</title>'
    });

    assert.equal(fakePage.matched, true);
    assert.equal(fakePage.brandName, '中國信託');
    assert.equal(officialPage.matched, false);
});

test('官方流程 path 關鍵字會抓到登入驗證與領取流程', () => {
    assert.equal(hasOfficialFlowPath('https://example.shop/account/verify?token=abc'), true);
    assert.equal(hasOfficialFlowPath('https://example.shop/reward/claim'), true);
    assert.equal(hasOfficialFlowPath('https://example.com/about/company'), false);
});

test('限時與帳戶異常話術會被偵測', () => {
    const result = analyzeUrgencySignals('帳戶異常，請立即驗證，逾期將失效');

    assert.equal(result.count >= 3, true);
    assert.ok(result.examples.includes('帳戶異常'));
});

test('Punycode 或 Unicode 混淆網域會被偵測', () => {
    assert.equal(hasPunycodeOrUnicodeHostname('xn--paypa1-3ve.com'), true);
    assert.equal(hasPunycodeOrUnicodeHostname('paypal.com', 'https://例子.com'), true);
    assert.equal(hasPunycodeOrUnicodeHostname('paypal.com', 'https://paypal.com'), false);
});

test('新網域搭配 3 個月內新核發 HTTPS 憑證應升高風險', () => {
    const domainAgeDays = 30;
    const certAgeDays = 20;
    const isVeryNewDomain = domainAgeDays < 90;
    const isVeryNewCertificate = certAgeDays < 90;
    const isNewDomainWithNewCertificate = isVeryNewDomain && isVeryNewCertificate;

    assert.equal(isNewDomainWithNewCertificate, true);
});

test('缺少註冊時間時應以 HTTPS 憑證最近核發日代入', () => {
    const rdapDate = null;
    const certNotBefore = '2026-05-07T00:00:00.000Z';
    const effectiveRegistrationDate = rdapDate || certNotBefore || null;
    const isRegistrationDateFromCertificate = !rdapDate && !!certNotBefore;

    assert.equal(effectiveRegistrationDate, certNotBefore);
    assert.equal(isRegistrationDateFromCertificate, true);
});

test('可疑子網域模式會抓到 hyphen、短隨機片段與難讀命名', () => {
    const suspicious = analyzeSuspiciousSubdomain('sb-sumiclen.discover-news.tokyo');
    assert.equal(suspicious.matched, true);
    assert.equal(suspicious.label, 'sb-sumiclen');
    assert.ok(suspicious.reasons.includes('子網域含連字號且與主網域主題無明顯關聯'));
    assert.ok(suspicious.reasons.includes('子網域包含短隨機片段'));

    assert.equal(analyzeSuspiciousSubdomain('www.example.com').matched, false);
    assert.equal(analyzeSuspiciousSubdomain('api.example.com').matched, false);
    assert.equal(analyzeSuspiciousSubdomain('shop.example.com').matched, false);
    assert.equal(analyzeSuspiciousSubdomain('news.discover-news.tokyo').matched, false);
});

test('弱訊號不應單獨疊成高風險', () => {
    assert.equal(capWeakSignalRisk(85, false), 60);
    assert.equal(capWeakSignalRisk(85, true), 85);
    assert.equal(capWeakSignalRisk(45, false), 45);
});

test('APK 與下載誘導訊號會抓到明確與動態下載', () => {
    const explicitApk = analyzeDownloadSignals({
        url: 'https://cms.tulingwangluo.com/publiccms/dxz/index.html',
        html: '<a href="/files/security.apk">立即下載 Android APP</a>'
    });
    assert.equal(explicitApk.apkUrlCount, 1);
    assert.equal(explicitApk.suspiciousPath, true);

    const dynamicDownload = analyzeDownloadSignals({
        url: 'https://cms.tulingwangluo.com/publiccms/dxz/index.html',
        html: '<button onclick="window.open(apiUrl)">下载安装</button><script>location.href = nextUrl; fetch("/api/app")</script>'
    });
    assert.equal(dynamicDownload.apkUrlCount, 0);
    assert.equal(dynamicDownload.installKeywordCount >= 1, true);
    assert.equal(dynamicDownload.dynamicDownloadCount >= 2, true);
    assert.equal(isDownloadPhishingSignal(dynamicDownload), true);
});

test('一般 index.html 不應只因路徑被判成下載釣魚', () => {
    const normalPage = analyzeDownloadSignals({
        url: 'https://example.com/index.html',
        html: '<main>Company profile</main>'
    });
    assert.equal(normalPage.suspiciousPath, true);
    assert.equal(isDownloadPhishingSignal(normalPage), false);
});

test('郵件追蹤跳板會解析 encoded 目的地並升為強風險', () => {
    const url = 'https://rsnk3yff.r.us-east-2.awstrack.me/L0/https:%2F%2Fu20993664.ct.sendgrid.net%2Fls%2Fclick%3Fupn=u001.ctbc-card-verify/1/token';
    const result = analyzeEmailTrackingRisk(url);

    assert.equal(result.isEmailTrackingDomain, true);
    assert.equal(result.hasEmailTrackingRedirect, true);
    assert.deepEqual(result.nestedDomains, ['u20993664.ct.sendgrid.net']);
    assert.equal(result.hasFinancialPhishingSignal, true);
    assert.equal(result.hasPattern, true);
});

test('完整 awstrack/sendgrid 郵件跳板即使無金融明文也應升為高風險', () => {
    const url = 'https://rsnk3yff.r.us-east-2.awstrack.me/L0/https:%2F%2Fu20993664.ct.sendgrid.net%2Fls%2Fclick%3Fupn=u001.EoUuycmzOzB7iY6mIj-2BdPS1cPSTao2FYuTsJolqlUCrpKkKG-2BGf4m8gTrNXYDFFuGC2c_cu2GZKluXNWAOD2CALnJIh3lWCrBGiObaK-2BiRQWRIChIgjstkL5EEB7UQIlPFRYateNZH5KG78IOKH-2Bnl-2FlZhejWijUWnqyU4guJivT5Xh6QQumWusUWvzsNjrbpnGU61RARtShq2cbxP-2Bm-2Fb-2Fst5bOrFpZSJyWF8y9u-2BX04YfTWug3jT66VAejwC6hl7GWab1Bvm93A0-2B2LuXnVSdyM6g-3D-3D/1/010f019e0be730c5-c86fbdd3-dc20-4e59-b0c4-8ea3b0f7315a-000000/VDDvJfRKLoNifqbvwEQKjY8jC_4=258';
    const result = analyzeEmailTrackingRisk(url);
    const riskScore = result.hasPattern ? 85 : 0;

    assert.equal(result.isEmailTrackingDomain, true);
    assert.equal(result.hasEmailTrackingRedirect, true);
    assert.deepEqual(result.nestedDomains, ['u20993664.ct.sendgrid.net']);
    assert.equal(result.hasFinancialPhishingSignal, false);
    assert.equal(result.hasPattern, true);
    assert.equal(riskScore >= 70, true);
});

test('深層亂碼郵件追蹤裸網域應升為高風險', () => {
    const result = analyzeEmailTrackingRisk('https://rsnk3yff.r.us-east-2.awstrack.me/');
    const riskScore = result.hasSuspiciousEmailTrackingHost ? 75 : 0;

    assert.equal(result.isEmailTrackingDomain, true);
    assert.equal(result.hasEmailTrackingRedirect, false);
    assert.equal(result.hasSuspiciousEmailTrackingHost, true);
    assert.equal(riskScore >= 70, true);
});

test('一般可讀郵件追蹤裸網域不應單獨升為高風險', () => {
    const result = analyzeEmailTrackingRisk('https://click.example.awstrack.me/');
    const riskScore = result.hasSuspiciousEmailTrackingHost ? 75 : 0;

    assert.equal(result.isEmailTrackingDomain, true);
    assert.equal(result.hasEmailTrackingRedirect, false);
    assert.equal(result.hasSuspiciousEmailTrackingHost, false);
    assert.equal(riskScore < 70, true);
});

test('危險細節應拉高 summary 分數下限', () => {
    const scanData = enforceFinalRiskConsistency({
        riskScore: capWeakSignalRisk(20, true),
        checks: {
            redirect: { status: 'danger', details: '偵測到郵件追蹤跳板與 encoded 目的地' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(scanData.riskScore, 70);
    assert.deepEqual(scanData.summaryReasons, ['郵件追蹤跳板或隱藏轉址']);
});

test('台電 typo 與 base64 參數會被視為公共事業釣魚強風險', () => {
    const url = 'https://taipwoer.com.tw/menghuan.html?c=aHR0cHM6Ly90YWlwd29lci5jb20udHc=#/';
    const nestedUrls = extractNestedUrls(url);
    const brandSimilarity = checkBrandSimilarity('taipwoer.com.tw');
    const hasPublicUtilitySignal = hasPublicUtilityScamText(`${url}\n${nestedUrls.join('\n')}`) || brandSimilarity.brandName === '台灣電力公司';
    const riskScore = brandSimilarity.matched && hasPublicUtilitySignal && nestedUrls.length > 0 ? 90 : 0;

    assert.deepEqual(nestedUrls, ['https://taipwoer.com.tw/']);
    assert.equal(brandSimilarity.matched, true);
    assert.equal(brandSimilarity.brandName, '台灣電力公司');
    assert.equal(hasPublicUtilitySignal, true);
    assert.equal(riskScore >= 70, true);
});

test('DHL 物流品牌仿冒應升為高風險並排除官方網域', () => {
    const suspicious = checkBrandSimilarity('ecommerce-dhl.com');
    const official = checkBrandSimilarity('dhl.com');
    const officialTw = checkBrandSimilarity('dhl.com.tw');
    const hasLogisticsSignal = hasLogisticsScamText('https://ecommerce-dhl.com parcel delivery tracking shipping');
    const riskScore = suspicious.matched && suspicious.brandName === 'DHL' && hasLogisticsSignal ? 90 : 0;

    assert.equal(suspicious.matched, true);
    assert.equal(suspicious.brandName, 'DHL');
    assert.equal(official.matched, false);
    assert.equal(officialTw.matched, false);
    assert.equal(hasLogisticsSignal, true);
    assert.equal(riskScore >= 70, true);
});

test('3 個月內新註冊網域應視為強風險訊號', () => {
    const domainAgeDays = 45;
    const isVeryNewDomain = domainAgeDays < 90;
    const riskScore = isVeryNewDomain ? 95 : 0;

    assert.equal(isVeryNewDomain, true);
    assert.equal(riskScore >= 70, true);
});
