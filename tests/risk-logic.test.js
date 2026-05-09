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
                if (levenshteinDistance(segment, normalizedKeyword) <= 1) {
                    return { matched: true, brandName: brand.name };
                }
            }
        }
    }

    return { matched: false };
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
    assert.equal(isExternalResource('https://evil-submit.example.net/form', 'https://example.com'), true);
});

test('品牌相似網域會抓到仿冒與 typo，並排除官方/白名單網域', () => {
    assert.equal(checkBrandSimilarity('ctbcbank-login.shop').matched, true);
    assert.equal(checkBrandSimilarity('ctbcbamk-login.shop').matched, true);
    assert.equal(checkBrandSimilarity('ctbcbank.com').matched, false);
    assert.equal(checkBrandSimilarity('fubonlife.tw', ['fubonlife.tw']).matched, false);
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
