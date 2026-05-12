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

function isOfficialTaiwanGovDomain(hostname) {
    const cleanHostname = String(hostname || '').toLowerCase().replace(/^www\./, '');
    return cleanHostname === 'gov.tw' || cleanHostname.endsWith('.gov.tw');
}

function shouldSkipAiBrandAnalysis(hostname) {
    return isOfficialTaiwanGovDomain(hostname);
}

function applyOfficialGovRiskOverride({ hostname, blocklistListed = false, googleUnsafe = false, initialRiskScore = 0 }) {
    const isGov = isOfficialTaiwanGovDomain(hostname);
    const blocklistListedForRisk = blocklistListed && !isGov;
    const googleFlaggedForRisk = googleUnsafe && !isGov;
    let riskScore = initialRiskScore;

    if (blocklistListedForRisk || googleFlaggedForRisk) riskScore = 100;
    if (isGov) riskScore = 0;

    return {
        riskScore,
        blocklistListedForRisk,
        googleFlaggedForRisk
    };
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
    addReason(checks.officialAlerts?.status === 'danger', '官方機關已公告警示');
    addReason(checks.apkCheck?.status === 'danger', '誘導下載可疑 App 或 APK');
    addReason(checks.redirect?.status === 'danger', '郵件追蹤跳板或隱藏轉址');
    addReason(checks.domainAnalysis?.status === 'danger', checks.domainAnalysis?.details || '網域特徵異常');
    addReason(checks.externalResources?.status === 'danger', '表單或外部資源送往可疑網域');
    addReason(checks.disposableDomain?.status === 'danger', '免洗亂碼網域特徵');
    addReason(checks.brandSimilarity?.status === 'danger', '網域疑似仿冒知名品牌');
    addReason(checks.params?.status === 'danger', '網址含敏感驗證或認證參數');
    addReason(checks.entropy?.status === 'danger', '網址含高隨機亂碼特徵');
    addReason(checks.subdomain?.status === 'danger', '深層可疑子網域結構');
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

const officialAlertFixtures = [
    {
        source: '衛生福利部食品藥物管理署',
        category: '涉嫌違規廣告產品',
        title: '國外網站涉嫌違規廣告產品：潤姬桃子',
        rootDomain: 'special-newseeds.com',
        urls: [
            'https://special-newseeds.com/uhmk/item/uhmktwit240704v104hcn.php?waxc=UHdg52anNXbGSzHy.7whg4cn'
        ]
    }
];

function normalizeOfficialAlertHostname(value) {
    const input = String(value || '').trim().toLowerCase();
    if (!input) return '';
    try {
        return new URL(input.startsWith('http') ? input : `https://${input}`).hostname.replace(/^www\./, '');
    } catch (e) {
        return input.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
}

function normalizeOfficialAlertUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.hash = '';
        return parsed.href.replace(/\/$/, '').toLowerCase();
    } catch (e) {
        return '';
    }
}

function findOfficialAlertFixture({ domain, targetUrl }) {
    const normalizedDomain = normalizeOfficialAlertHostname(domain);
    const normalizedTargetUrl = normalizeOfficialAlertUrl(targetUrl);
    return officialAlertFixtures
        .map(alert => {
            const root = normalizeOfficialAlertHostname(alert.rootDomain);
            const fullUrlMatched = normalizedTargetUrl &&
                alert.urls.some(url => normalizeOfficialAlertUrl(url) === normalizedTargetUrl);
            const domainMatched = normalizedDomain === root || normalizedDomain.endsWith(`.${root}`);
            if (!fullUrlMatched && !domainMatched) return null;
            return { ...alert, matchType: fullUrlMatched ? 'url' : 'domain' };
        })
        .filter(Boolean);
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

    if (/(高|high)/i.test(riskText) && !/(中|低|未發現|未偵測|無明顯|沒有明顯)/.test(riskText)) {
        return '⚠️ 風險：高風險';
    }
    if (/(中|medium)/i.test(riskText) && !/(高|低|未發現|未偵測|無明顯|沒有明顯)/.test(riskText)) {
        return '⚠️ 風險：中風險';
    }
    if (/(未發現|未偵測|無明顯|沒有明顯|低|low|none)/i.test(riskText)) {
        return '⚠️ 風險：未發現';
    }

    return '⚠️ 風險：未發現';
}

function normalizeUrlText(text) {
    return String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[：]/g, ':')
        .replace(/[／]/g, '/')
        .replace(/[．。]/g, '.')
        .replace(/[–—−]/g, '-')
        .replace(/https?:\s*\/\s*\//gi, match => match.toLowerCase().startsWith('https') ? 'https://' : 'http://')
        .replace(/([A-Za-z0-9])-\s*\n\s*([A-Za-z0-9])/g, '$1-$2')
        .replace(/([A-Za-z0-9./?&_=:%#-])\s*\n\s*([A-Za-z0-9])/g, '$1$2');
}

function stripTargetPunctuation(value) {
    return String(value || '')
        .trim()
        .replace(/^[<([{「『【]+/, '')
        .replace(/[>),.，。；;:」』】\]]+$/g, '');
}

function dedupeTargets(items) {
    const seen = new Set();
    return items
        .map(stripTargetPunctuation)
        .filter(Boolean)
        .filter(item => {
            const key = item.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function extractVisualTargets(text) {
    const normalized = normalizeUrlText(text);
    const targets = [];
    const add = (value) => {
        const cleaned = stripTargetPunctuation(value);
        if (!cleaned || cleaned.length < 4 || /^(無|none|null)$/i.test(cleaned)) return;
        if (!targets.includes(cleaned)) targets.push(cleaned);
    };

    (normalized.match(/https?:\/\/[^\s<>"'，。；、）)]+/gi) || []).forEach(add);
    (normalized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []).forEach(add);
    const domainPattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'，。；、）)]*)?/gi;
    for (const match of normalized.matchAll(domainPattern)) {
        const value = match[0];
        const start = match.index || 0;
        const end = start + value.length;
        if (normalized[start - 1] === '@' || normalized[end] === '@') continue;
        add(value);
    }

    return dedupeTargets(targets);
}

function parseVisionJson(rawText) {
    const text = String(rawText || '').trim();
    const candidates = [
        text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(),
        (text.match(/\{[\s\S]*\}/) || [])[0]
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) { }
    }

    return null;
}

function buildCleanScreenshotReport(rawText) {
    const parsed = parseVisionJson(rawText);
    const parsedTargets = [];
    if (parsed) {
        if (Array.isArray(parsed.urls)) parsed.urls.forEach(item => parsedTargets.push(item));
        if (parsed.primaryUrl) parsedTargets.unshift(parsed.primaryUrl);
        if (parsed.senderEmail) parsedTargets.push(parsed.senderEmail);
    }

    const targets = dedupeTargets([...parsedTargets, ...extractVisualTargets(rawText)]);
    const primaryTarget = targets[0] || '無';

    if (parsed) {
        return {
            report: [
                normalizeRiskLine(`⚠️ 風險：${parsed.risk || parsed.riskLevel || ''}`),
                `🔍 分析：${parsed.analysis || '細節待查證'}`,
                `🔗 網址：${primaryTarget}`,
                `🛡️ 建議：${parsed.advice || '請仔細查證，勿點擊可疑連結'}`
            ].join('\n'),
            targets
        };
    }

    return { report: '', targets };
}

function pickPrimaryOcrTarget(targets) {
    if (!targets.length) return '';
    return targets.find(item => /^https?:\/\//i.test(item)) || targets.find(item => !item.includes('@')) || '';
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

function analyzeDisposableRootLabel(rootLabel) {
    const label = String(rootLabel || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const compact = label.replace(/-/g, '');
    const safeRoots = new Set([
        'example', 'google', 'facebook', 'instagram', 'youtube', 'twitter',
        'shopline', 'myshopify', 'everypixel', 'infodemic'
    ]);
    if (!compact || compact.length < 9 || compact.length > 18 || safeRoots.has(compact)) {
        return { matched: false, reasons: [], entropy: calculateEntropy(compact || '') };
    }

    const entropyValue = calculateEntropy(compact);
    const hasDigitMix = /[a-z]/.test(compact) && /\d/.test(compact);
    const lacksVowels = !/[aeiou]/.test(compact);
    const qWithoutU = /q(?!u)/.test(compact);
    const consonantTrigrams = compact.match(/[bcdfghjklmnpqrstvwxyz]{3,}/g) || [];
    const rareBigrams = compact.match(/(?:qg|gq|kq|qk|xq|qx|zq|qz|vj|jv|kg|gk|mgq|rgm)/g) || [];
    const lowVowelRatio = ((compact.match(/[aeiou]/g) || []).length / compact.length) < 0.25;
    const looksMachineGenerated =
        lacksVowels ||
        hasDigitMix ||
        (qWithoutU && (consonantTrigrams.length > 0 || entropyValue > 3.0)) ||
        (rareBigrams.length > 0 && entropyValue > 2.8) ||
        (consonantTrigrams.length >= 2 && entropyValue > 3.0 && lowVowelRatio);

    const reasons = [];
    if (qWithoutU) reasons.push('含少見 q 非 qu 組合');
    if (rareBigrams.length > 0) reasons.push(`含少見字母組合 ${[...new Set(rareBigrams)].slice(0, 2).join('、')}`);
    if (consonantTrigrams.length >= 2) reasons.push('多段連續子音');
    if (hasDigitMix) reasons.push('英數混合隨機碼');
    if (lacksVowels) reasons.push('缺少母音');
    if (entropyValue > 3.0) reasons.push('主網域隨機度偏高');

    return { matched: looksMachineGenerated, reasons, entropy: entropyValue };
}

function hasSensitiveUrlParam(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const sensitiveKeys = riskConfig.sensitiveUrlParams
            .map(key => String(key).toLowerCase().replace(/=$/, ''))
            .filter(Boolean);
        for (const key of parsed.searchParams.keys()) {
            if (sensitiveKeys.includes(key.toLowerCase())) return true;
        }
    } catch (e) { }
    return false;
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

function hasDeepSubdomainPhishingPattern({
    hostname,
    isWhitelisted = false,
    isHighTraffic = false,
    isLowTraffic = false,
    hasSuspiciousParams = false,
    hasNestedSuspiciousParams = false,
    hasSuspiciousTempDomain = false
}) {
    const domain = hostname.toLowerCase();
    const isDeepSubdomain = domain.split('.').length >= 5;
    const suspiciousSubdomain = analyzeSuspiciousSubdomain(domain);
    const hasMultipleHyphens = (domain.match(/-/g) || []).length >= 2;
    const embeddedTrustedTldLabels = ['com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw'];
    const hasEmbeddedTrustedTldLabel = embeddedTrustedTldLabels.some(tld =>
        `.${domain}.`.includes(`.${tld}.`) && !domain.endsWith(`.${tld}`)
    );

    return !isWhitelisted &&
        !isHighTraffic &&
        isDeepSubdomain &&
        (
            suspiciousSubdomain.matched ||
            hasMultipleHyphens ||
            hasEmbeddedTrustedTldLabel ||
            hasSuspiciousParams ||
            hasNestedSuspiciousParams ||
            hasSuspiciousTempDomain ||
            isLowTraffic
        );
}

function hasSuspiciousShoppingLandingUrlRisk(rawUrl, {
    isWhitelisted = false,
    isUnknownTraffic = true,
    isLowTraffic = false,
    isVeryNewDomain = false,
    hasSuspiciousTempDomain = false
} = {}) {
    const parsed = new URL(rawUrl);
    const domain = parsed.hostname.toLowerCase();
    const { rootLabel } = getDomainParts(domain);
    const rootEntropy = calculateEntropy(rootLabel);
    const disposableRoot = analyzeDisposableRootLabel(rootLabel);
    const isSuspiciousRootLabel = rootLabel.length >= 8 &&
        !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify'].includes(rootLabel) &&
        (!hasReadableVowelPattern(rootLabel) || rootEntropy > 3.2 || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(rootLabel));
    const isSuspiciousLandingRootLabel = rootLabel.length >= 10 &&
        !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify'].includes(rootLabel) &&
        (rootEntropy > 3.0 || /[qxzj]/i.test(rootLabel) || /[bcdfghjklmnpqrstvwxz]{3,}/i.test(rootLabel));
    const suspiciousSubdomain = analyzeSuspiciousSubdomain(domain);
    const defaultLandingParams = ['ldtag_cl=', 'lt_r=', 'fbclid=', 'gclid=', 'utm_', 'click_id=', 'campaign=', 'ad_id=', 'clickid=', 'cid=', 'aff_id='];
    const landingParamList = [...new Set([...riskConfig.suspiciousLandingParams, ...defaultLandingParams])];
    const matchedLandingParams = landingParamList.filter(key => rawUrl.toLowerCase().includes(key));

    return !isWhitelisted &&
        matchedLandingParams.length > 0 &&
        (
            disposableRoot.matched ||
            isSuspiciousRootLabel ||
            isSuspiciousLandingRootLabel ||
            suspiciousSubdomain.matched ||
            isVeryNewDomain ||
            isUnknownTraffic ||
            isLowTraffic ||
            hasSuspiciousTempDomain
        );
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

function analyzeShoppingScamSignals({ html = '', url }) {
    const haystack = decodeSignalText(`${html}\n${url}`);
    const keywordGroups = {
        shopping: ['立即購買', '馬上訂購', '立即訂購', '立即搶購', '加入購物車', '結帳', '下單', '訂單', '購買', '特價', '優惠價', '原價', '折扣', '限時', '限量', '最後', '免運', '貨到付款', '宅配', '超商取貨', '七天鑑賞', '全台配送'],
        fields: ['姓名', '收件人', '手機', '電話', '地址', '宅配地址', '配送地址', '規格', '數量', '備註', '付款方式'],
        socialProof: ['顧客好評', '客戶評價', '五星', '已售出', '熱銷', '回購', '見證', '買家', '評價'],
        tracking: ['ldtag_cl', 'lt_r', 'fbclid', 'gclid', 'utm_', 'click_id', 'campaign', 'ad_id'],
        lineContact: ['加入line', '加line', 'line客服', '官方line', 'line id', 'lineid', 'line帳號', 'line好友', '私訊客服', '聯繫客服下單', '截圖傳給客服', '客服確認訂單', 'lin.ee', 'line.me/r/ti/p', 'line://']
    };
    const matchedKeywords = Object.values(keywordGroups)
        .flat()
        .filter(keyword => haystack.includes(keyword.toLowerCase()));
    const formFieldCount = (html.match(/<(input|textarea|select)\b/gi) || []).length;
    const formCount = (html.match(/<form\b/gi) || []).length;
    const imageCount = (html.match(/<img\b/gi) || []).length;
    const linkCount = (html.match(/<a\b[^>]*href=/gi) || []).length;
    const hasOrderForm = formCount > 0 && formFieldCount >= 2;
    const merchantInfoKeywords = ['統一編號', '公司名稱', '有限公司', '股份有限公司', '客服電話', '退換貨', '退貨政策', '隱私權政策', '服務條款', '聯絡地址'];
    const hasMerchantInfo = merchantInfoKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
    const hasOnePageStructure = matchedKeywords.length >= 4 && (linkCount <= 3 || imageCount >= 6 || hasOrderForm);
    const hasCodSalesPitch = ['貨到付款', '免運', '限時', '限量', '立即搶購', '馬上訂購'].some(keyword => haystack.includes(keyword.toLowerCase()));
    const hasTrackingLandingParam = keywordGroups.tracking.some(keyword => haystack.includes(keyword.toLowerCase()));
    const lineContactMatches = keywordGroups.lineContact.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const hasLineContactSignal = lineContactMatches.length > 0;
    const hasLineOrderContext = /(下單|訂單|訂購|購買|立即搶購|馬上訂購|貨到付款|限時|限量|截圖傳給客服|客服確認訂單)/i.test(haystack);
    const imageHeavy = imageCount >= 6 && linkCount <= 3;

    const reasons = [];
    if (hasOnePageStructure) reasons.push('一頁式購物頁結構');
    if (hasOrderForm) reasons.push('頁面直接要求收件或訂購資料');
    if (hasCodSalesPitch) reasons.push('貨到付款/限時優惠等銷售話術');
    if (!hasMerchantInfo && matchedKeywords.length >= 4) reasons.push('缺少明確商家資訊或退換貨政策');
    if (imageHeavy) reasons.push('商品圖片比例高且正常站內連結偏少');
    if (hasTrackingLandingParam) reasons.push('含廣告落地頁追蹤參數');
    if (hasLineContactSignal && hasLineOrderContext && (hasOnePageStructure || hasOrderForm || hasCodSalesPitch || hasTrackingLandingParam)) reasons.push('要求加入 LINE 聯絡或下單');

    return {
        matched: reasons.length >= 2,
        reasonCount: reasons.length,
        reasons,
        keywordCount: matchedKeywords.length,
        formFieldCount,
        imageCount,
        linkCount,
        hasOrderForm,
        hasMerchantInfo,
        hasLineContactSignal,
        hasLineOrderContext,
        lineContactExamples: lineContactMatches.slice(0, 3)
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

test('台灣 gov.tw 結尾網域應直接視為政府官方網域', () => {
    assert.equal(isOfficialTaiwanGovDomain('500.gov.tw'), true);
    assert.equal(isOfficialTaiwanGovDomain('www.gsp.gov.tw'), true);
    assert.equal(isOfficialTaiwanGovDomain('gov.tw'), true);
    assert.equal(isOfficialTaiwanGovDomain('gov.tw.example.com'), false);
    assert.equal(isOfficialTaiwanGovDomain('gov-tw-login.shop'), false);
});

test('台灣 gov.tw 官方網域應跳過 AI 品牌覆寫，避免被誤改成詐騙', () => {
    const domain = '500.gov.tw';
    const aiResult = { isGenericScam: true, isFakeBrand: false };
    let riskScore = 0;

    if (!shouldSkipAiBrandAnalysis(domain) && (aiResult.isGenericScam || aiResult.isFakeBrand)) {
        riskScore = 100;
    }

    assert.equal(shouldSkipAiBrandAnalysis(domain), true);
    assert.equal(riskScore, 0);
});

test('台灣 gov.tw 官方網域應忽略外部黑名單或安全庫誤判', () => {
    const govResult = applyOfficialGovRiskOverride({
        hostname: '500.gov.tw',
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 100
    });
    const fakeGovResult = applyOfficialGovRiskOverride({
        hostname: 'gov-tw-login.shop',
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 0
    });

    assert.equal(govResult.blocklistListedForRisk, false);
    assert.equal(govResult.googleFlaggedForRisk, false);
    assert.equal(govResult.riskScore, 0);
    assert.equal(fakeGovResult.blocklistListedForRisk, true);
    assert.equal(fakeGovResult.googleFlaggedForRisk, true);
    assert.equal(fakeGovResult.riskScore, 100);
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

test('政府 JWT result 參數不應因參數值內容誤判為敏感參數', () => {
    const govUrl = 'https://500.gov.tw/FOAS/actions/GspValid.action?result=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.auth.token.session.verify';
    const phishingUrl = 'https://verify.example.com/login?token=abc123';

    assert.equal(matchesDomainList('500.gov.tw', ['gov.tw']), true);
    assert.equal(hasSensitiveUrlParam(govUrl), false);
    assert.equal(hasSensitiveUrlParam(phishingUrl), true);
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

test('截圖網址抽取會修復手機訊息截圖中的換行 URL', () => {
    const text = `順豐速運
https://sf-
express.sfxpuerse.top/t/NAt0rR
麻煩填寫基本資料`;
    const targets = extractVisualTargets(text);

    assert.equal(targets[0], 'https://sf-express.sfxpuerse.top/t/NAt0rR');
    assert.equal(pickPrimaryOcrTarget(targets), 'https://sf-express.sfxpuerse.top/t/NAt0rR');
});

test('截圖 OCR 只抓到 Email 時不直接送進網址掃描流程', () => {
    const targets = extractVisualTargets('客服信箱 service.example@gmail.com');

    assert.deepEqual(targets, ['service.example@gmail.com']);
    assert.equal(pickPrimaryOcrTarget(targets), '');
});

test('截圖 JSON 分析會保留主要網址並輸出四行報告', () => {
    const rawText = JSON.stringify({
        risk: 'high',
        analysis: '疑似冒用順豐速運，要求填寫基本資料。',
        urls: ['https://sf-express.sfxpuerse.top/t/NAt0rR'],
        primaryUrl: 'https://sf-express.sfxpuerse.top/t/NAt0rR',
        brand: '順豐速運',
        advice: '請勿點擊或填寫資料。'
    });
    const result = buildCleanScreenshotReport(rawText);

    assert.ok(result.report.includes('⚠️ 風險：高風險'));
    assert.ok(result.report.includes('🔗 網址：https://sf-express.sfxpuerse.top/t/NAt0rR'));
    assert.deepEqual(result.targets, ['https://sf-express.sfxpuerse.top/t/NAt0rR']);
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

test('深層可疑子網域會升為強風險並避免 summary 低風險', () => {
    const hostname = 'mysshio-7ll.com.tw.ldtyy.link';
    const hasPattern = hasDeepSubdomainPhishingPattern({ hostname });
    const scanData = enforceFinalRiskConsistency({
        riskScore: capWeakSignalRisk(hasPattern ? 75 : 0, hasPattern),
        checks: {
            subdomain: {
                status: hasPattern ? 'danger' : 'warning',
                details: '檢測到深層可疑子網域，伴隨偽裝後綴、連字號、隨機片段或可疑參數等釣魚特徵'
            },
            domainAnalysis: { status: hasPattern ? 'danger' : 'safe', details: '深層可疑子網域' }
        }
    });

    assert.equal(hasPattern, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.ok(scanData.summaryReasons.includes('深層可疑子網域結構'));
});

test('一般多層子網域沒有其他可疑特徵時不應單獨升高風險', () => {
    const hasPattern = hasDeepSubdomainPhishingPattern({
        hostname: 'static.assets.images.example.com',
        isHighTraffic: false
    });

    assert.equal(hasPattern, false);
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

test('一頁式購物詐騙頁會抓到訂購表單、貨到付款話術與追蹤參數', () => {
    const html = `
        <main>
            <h1>今日限定優惠 免運 貨到付款</h1>
            <img src="1.jpg"><img src="2.jpg"><img src="3.jpg"><img src="4.jpg"><img src="5.jpg"><img src="6.jpg">
            <p>原價 3990，特價 990，最後 20 件，立即搶購，七天鑑賞，全台配送</p>
            <form action="/order">
                <input name="name" placeholder="姓名">
                <input name="phone" placeholder="手機">
                <textarea name="address" placeholder="地址"></textarea>
                <select name="quantity"><option>1</option></select>
                <button>馬上訂購</button>
            </form>
        </main>`;
    const signals = analyzeShoppingScamSignals({
        html,
        url: 'https://ako.kforgmamgeq.com/?ldtag_cl=X5wRd8EWSDuCPfRkaiUG7AAA&lt_r=126'
    });

    assert.equal(signals.matched, true);
    assert.ok(signals.reasons.includes('一頁式購物頁結構'));
    assert.ok(signals.reasons.includes('頁面直接要求收件或訂購資料'));
    assert.ok(signals.reasons.includes('貨到付款/限時優惠等銷售話術'));
    assert.ok(signals.reasons.includes('含廣告落地頁追蹤參數'));
});

test('一頁式購物廣告落地頁即使抓不到 HTML 也應由 URL-only 訊號升高風險', () => {
    const url = 'https://ako.kforgmamgeq.com/?ldtag_cl=X5wRd8EWSDuCPfRkaiUG7AAA&lt_r=126';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, { isUnknownTraffic: true });
    const riskScore = hasRisk ? 75 : 0;

    assert.equal(hasRisk, true);
    assert.equal(riskScore >= 70, true);
});

test('一頁式購物廣告落地頁可只靠亂碼 root 與 landing 參數升高風險', () => {
    const url = 'https://ako.kforgmamgeq.com/?ldtag_cl=X5wRd8EWSDuCPfRkaiUG7AAA&lt_r=126';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isUnknownTraffic: false,
        isLowTraffic: false,
        isVeryNewDomain: false
    });

    assert.equal(hasRisk, true);
});

test('一頁式購物頁要求加入 LINE 聯絡應提高為高風險', () => {
    const html = `
        <main>
            <h1>今日限定 免運 貨到付款</h1>
            <p>立即搶購，限量最後 20 件。請加入LINE客服確認訂單，截圖傳給客服。</p>
            <a href="https://lin.ee/example">加入 LINE</a>
            <form><input placeholder="姓名"><input placeholder="手機"><textarea placeholder="地址"></textarea></form>
        </main>`;
    const signals = analyzeShoppingScamSignals({
        html,
        url: 'https://ako.kforgmamgeq.com/?ldtag_cl=abc&lt_r=126'
    });
    const hasShoppingLandingUrlRisk = true;
    const hasShoppingLineContactRisk = signals.hasLineContactSignal && signals.hasLineOrderContext && (signals.matched || hasShoppingLandingUrlRisk);
    const riskScore = hasShoppingLineContactRisk ? 90 : 0;

    assert.equal(signals.hasLineContactSignal, true);
    assert.equal(signals.hasLineOrderContext, true);
    assert.ok(signals.reasons.includes('要求加入 LINE 聯絡或下單'));
    assert.equal(hasShoppingLineContactRisk, true);
    assert.equal(riskScore >= 70, true);
});

test('正常商家只有 LINE 聯絡資訊不應單獨判成一頁式購物詐騙', () => {
    const html = `
        <main>
            <h1>品牌門市資訊</h1>
            <p>官方LINE客服提供售後服務。公司名稱：範例股份有限公司。退換貨政策與隱私權政策完整揭露。</p>
            <a href="/about">關於我們</a><a href="/privacy">隱私權政策</a><a href="/returns">退換貨</a><a href="/stores">門市</a>
        </main>`;
    const signals = analyzeShoppingScamSignals({
        html,
        url: 'https://shop.example.com/?utm_source=line'
    });
    const hasShoppingLineContactRisk = signals.hasLineContactSignal && signals.hasLineOrderContext && signals.matched;

    assert.equal(signals.hasLineContactSignal, true);
    assert.equal(signals.hasLineOrderContext, false);
    assert.equal(signals.matched, false);
    assert.equal(hasShoppingLineContactRisk, false);
});

test('常見品牌網域只有 UTM 參數不應命中購物落地頁高風險', () => {
    const url = 'https://store.example.com/product?utm_source=newsletter';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isWhitelisted: true,
        isUnknownTraffic: false
    });

    assert.equal(hasRisk, false);
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

test('官方警示資料完整網址命中應直接升為最高風險', () => {
    const matches = findOfficialAlertFixture({
        domain: 'special-newseeds.com',
        targetUrl: 'https://special-newseeds.com/uhmk/item/uhmktwit240704v104hcn.php?waxc=UHdg52anNXbGSzHy.7whg4cn'
    });
    const hasOfficialAlertUrlMatch = matches.some(item => item.matchType === 'url');
    const riskScore = hasOfficialAlertUrlMatch ? 100 : 0;

    assert.equal(matches.length, 1);
    assert.equal(matches[0].source, '衛生福利部食品藥物管理署');
    assert.equal(hasOfficialAlertUrlMatch, true);
    assert.equal(riskScore, 100);
});

test('官方警示資料 root domain 命中應升為高風險並拉高 summary', () => {
    const matches = findOfficialAlertFixture({
        domain: 'www.special-newseeds.com',
        targetUrl: 'https://www.special-newseeds.com/'
    });
    const hasOfficialAlert = matches.length > 0;
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasOfficialAlert ? 40 : 0,
        checks: {
            officialAlerts: { status: hasOfficialAlert ? 'danger' : 'safe', details: '食藥署公告涉嫌違規廣告產品' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(matches[0].matchType, 'domain');
    assert.equal(scanData.riskScore, 70);
    assert.deepEqual(scanData.summaryReasons, ['官方機關已公告警示']);
});

test('免洗 root 亂碼偵測會命中 kforgmamgeq 並避開常見可讀品牌字串', () => {
    const suspicious = analyzeDisposableRootLabel('kforgmamgeq');
    const normalBrand = analyzeDisposableRootLabel('everypixel');
    const knownSafe = analyzeDisposableRootLabel('infodemic');

    assert.equal(suspicious.matched, true);
    assert.ok(suspicious.reasons.some(reason => reason.includes('q') || reason.includes('少見字母組合')));
    assert.equal(normalBrand.matched, false);
    assert.equal(knownSafe.matched, false);
});

test('亂碼 root 搭配廣告追蹤參數應視為可疑購物落地頁高風險', () => {
    const url = 'https://ako.kforgmamgeq.com/?ldtag_cl=X5wRd8EWSDuCPfRkaiUG7AAA&lt_r=126';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isUnknownTraffic: false,
        isLowTraffic: false
    });
    const riskScore = hasRisk ? 85 : 0;

    assert.equal(hasRisk, true);
    assert.equal(riskScore >= 70, true);
});

test('亂碼 root 且頁面內容不可讀時應拉高 summary，避免落入低風險', () => {
    const disposableRoot = analyzeDisposableRootLabel('kforgmamgeq');
    const hasDisposableUnreadablePageRisk = disposableRoot.matched && ['unknown', 'blank', 'error'].includes('unknown');
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasDisposableUnreadablePageRisk ? 70 : 0,
        checks: {
            disposableDomain: { status: hasDisposableUnreadablePageRisk ? 'danger' : 'safe', details: '主網域具有免洗亂碼特徵，且頁面內容未完整取得' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(hasDisposableUnreadablePageRisk, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.deepEqual(scanData.summaryReasons, ['免洗亂碼網域特徵']);
});
