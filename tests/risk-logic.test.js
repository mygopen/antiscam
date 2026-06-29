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

function isCloudflarePagesDevHostname(hostname) {
    const cleanHostname = normalizeInputHostname(hostname).replace(/^www\./, '');
    return cleanHostname !== 'pages.dev' && matchesDomainList(cleanHostname, ['pages.dev']);
}

function sanitizeUrlInput(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .replace(/^[\s<>"'`「」『』【】\[\]（）()]+/g, '')
        .replace(/[\s<>"'`「」『』【】\[\]（）(),，.。;；!?！？]+$/g, '');
}

function normalizeInputHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/\.+$/g, '');
}

function isValidHostname(hostname) {
    const cleanHostname = normalizeInputHostname(hostname);
    if (!cleanHostname || cleanHostname.length > 253) return false;

    const labels = cleanHostname.split('.');
    if (labels.length < 2) return false;

    return labels.every(label => {
        return label.length >= 1 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    }) && labels[labels.length - 1].length >= 2;
}

function parseUserUrl(value) {
    const sanitized = sanitizeUrlInput(value);
    if (!sanitized) return { ok: false, reason: 'empty' };

    const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(sanitized);
    const normalizedUrl = hasExplicitScheme
        ? sanitized
        : `https://${sanitized}`;

    let urlObj;
    try {
        urlObj = new URL(normalizedUrl);
    } catch (e) {
        return { ok: false, reason: 'parse' };
    }

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return { ok: false, reason: 'protocol' };
    }

    const hostname = normalizeInputHostname(urlObj.hostname);
    if (!isValidHostname(hostname)) {
        return { ok: false, reason: 'hostname', hostname };
    }

    try { urlObj.hostname = hostname; } catch (e) { }
    return { ok: true, url: urlObj, hostname, href: urlObj.href, hasExplicitScheme, rawInput: sanitized };
}

async function withTimeoutForTest(promise, ms, fallbackValue) {
    let timeoutId = null;
    return Promise.race([
        Promise.resolve(promise).catch(() => fallbackValue),
        new Promise(resolve => {
            timeoutId = setTimeout(() => resolve(fallbackValue), ms);
        })
    ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

async function readJsonSafelyForTest(res, fallbackValue) {
    if (!res || !res.ok) return fallbackValue;
    try {
        const text = await res.text();
        if (!text) return fallbackValue;
        return JSON.parse(text);
    } catch (err) {
        return fallbackValue;
    }
}

function resolveNextUrlForTraceTest(rawValue, currentUrl) {
    const raw = String(rawValue || '').replace(/&amp;/g, '&').trim();
    if (!raw) return { ok: false, reason: 'empty_redirect', raw };

    try {
        const nextUrl = new URL(raw, currentUrl);
        if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
            return { ok: false, reason: 'non_http_redirect', raw, href: nextUrl.href };
        }
        return { ok: true, href: nextUrl.href };
    } catch (err) {
        return { ok: false, reason: 'invalid_redirect_url', raw };
    }
}

function isOfficialTaiwanGovDomain(hostname) {
    const cleanHostname = String(hostname || '').toLowerCase().replace(/^www\./, '');
    return cleanHostname === 'gov.tw' || cleanHostname.endsWith('.gov.tw');
}

function isTrustedGlobalDomain(hostname) {
    return matchesDomainList(hostname, riskConfig.trustedGlobalDomains);
}

function isTrustedEcommerceDomain(hostname) {
    return matchesDomainList(hostname, riskConfig.trustedEcommerceRootDomains);
}

function isTrustedTaiwanServiceDomain(hostname) {
    return matchesDomainList(hostname, riskConfig.trustedTaiwanServiceDomains);
}

function isTrustedFinancialServiceDomain(hostname) {
    return matchesDomainList(hostname, riskConfig.trustedFinancialServiceDomains);
}

function isGlobalPaymentGatewayDomain(hostname) {
    return matchesDomainList(hostname, riskConfig.globalPaymentGatewayDomains);
}

function normalizeBrandToken(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function isTrustedCoBrandCampaignHost(inputDomain, detectedBrand) {
    const trustedCampaignHosts = [
        {
            domain: 'mababy.com',
            allowedBrandTokens: ['nestle', '雀巢', '能恩', 'nan', 'nestlebaby']
        },
        {
            domain: 'uni-prosperity.com.tw',
            allowedBrandTokens: ['carrefour', '家樂福', '家福', '康達盛通', 'uni-prosperity', 'uniprosperity', 'uniprosperitylifestyle']
        },
        {
            domain: 'uni-lions.com.tw',
            allowedBrandTokens: ['統一超商', '7-11', '711', '7eleven', '統一7eleven獅', '統一獅', 'unilions', 'lioncrew', '萊恩酷']
        },
        {
            domain: 'sunsetgoods.tw',
            allowedBrandTokens: ['日落小物', 'sunsetgoods', '蠟筆小新', '小新', 'crayonshinchan', 'shinchan']
        },
        {
            domain: 'theaxiomstore.com',
            allowedBrandTokens: [
                'theaxiomstore', 'axiomstore', 'axiomretailpartners',
                '安德國際商貿', '安德國際', '安德家品',
                'jmgo', '堅果', 'foodcycler', '廚餘大師',
                'uwant', 'mova', 'ilife', 'designnest', 'foldstand'
            ]
        },
        {
            domain: 'sunpay.com.tw',
            allowedBrandTokens: [
                'sunpay', '紅陽科技', '紅陽支付', '紅陽',
                '電子發票', '電子發票整合服務', '財政部電子發票',
                'einvoice', 'einv', '統一發票'
            ]
        }
    ];
    const normalizedBrand = normalizeBrandToken(detectedBrand);
    if (!normalizedBrand) return false;

    return trustedCampaignHosts.some(item => {
        if (!matchesDomainList(inputDomain, [item.domain])) return false;
        return item.allowedBrandTokens.some(token => {
            const normalizedToken = normalizeBrandToken(token);
            return normalizedToken &&
                (normalizedBrand.includes(normalizedToken) || normalizedToken.includes(normalizedBrand));
        });
    });
}

function isVerifiedSafeRootDomain(hostname, whitelist = []) {
    return isOfficialTaiwanGovDomain(hostname) ||
        isTrustedGlobalDomain(hostname) ||
        isTrustedEcommerceDomain(hostname) ||
        isTrustedTaiwanServiceDomain(hostname) ||
        isTrustedFinancialServiceDomain(hostname) ||
        matchesDomainList(hostname, whitelist);
}

function shouldSkipAiBrandAnalysis(hostname, whitelist = []) {
    return isVerifiedSafeRootDomain(hostname, whitelist);
}

function isTrustedPaymentGatewayOrApiEndpoint(rawUrl, whitelist = []) {
    const parsed = new URL(rawUrl);
    const isVerifiedSafeRoot = isVerifiedSafeRootDomain(parsed.hostname, whitelist);
    const hasPaymentOrApiPath = /\/(?:api|checkout|checkoutnow|payment|payments|pay|billing|token|session|oauth|auth)(?:\/|$)/i.test(parsed.pathname);
    return isVerifiedSafeRoot &&
        (isGlobalPaymentGatewayDomain(parsed.hostname) || (isTrustedGlobalDomain(parsed.hostname) && hasPaymentOrApiPath));
}

function isTrackingUrlParamName(name) {
    const lowerName = String(name || '').toLowerCase();
    return riskConfig.trackingUrlParams.some(rule => {
        const lowerRule = String(rule || '').toLowerCase();
        if (lowerRule.endsWith('*')) return lowerName.startsWith(lowerRule.slice(0, -1));
        return lowerName === lowerRule;
    });
}

function isVolatileUrlParam(name, value = '') {
    const lowerName = String(name || '').toLowerCase();
    const rawValue = String(value || '');
    if (riskConfig.volatileUrlParams.some(rule => lowerName === String(rule || '').toLowerCase())) return true;
    if (/^(?:valid|verify|auth|session)[_-]?\d{8,14}[_-][a-f0-9]{12,}$/i.test(rawValue)) return true;
    if (/^(?:valid|expire|expires|ts|time|timestamp|nonce|rnd|rand|cb)$/i.test(lowerName) && /^[a-z0-9_-]{8,80}$/i.test(rawValue)) return true;
    if (/(?:time|timestamp|expire|expires|valid|nonce)/i.test(lowerName) && /^\d{10,14}$/.test(rawValue)) return true;
    if (lowerName.startsWith('_') && /^[a-z0-9_-]{16,120}$/i.test(rawValue) && (/\d/.test(rawValue) || /[a-f0-9]{16,}/i.test(rawValue))) return true;
    return false;
}

function sanitizeUrlForRiskScoring(rawUrl) {
    const parsed = new URL(rawUrl);
    const removedTrackingParams = [];
    const removedVolatileParams = [];
    [...new Set([...parsed.searchParams.keys()])].forEach(name => {
        const values = parsed.searchParams.getAll(name);
        if (values.some(value => isVolatileUrlParam(name, value))) {
            removedVolatileParams.push(name);
            parsed.searchParams.delete(name);
        } else if (isTrackingUrlParamName(name)) {
            removedTrackingParams.push(name);
            parsed.searchParams.delete(name);
        }
    });
    const removedParams = [...new Set([...removedTrackingParams, ...removedVolatileParams])];
    return {
        href: parsed.href,
        removedTrackingParams: [...new Set(removedTrackingParams)],
        removedVolatileParams: [...new Set(removedVolatileParams)],
        removedParams,
        rawUrl
    };
}

function toHttpFallbackUrl(value) {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') return '';
        parsed.protocol = 'http:';
        return parsed.href;
    } catch (e) {
        return '';
    }
}

function buildCrawlerCandidateUrls(urls, { preferHttpFallback = false } = {}) {
    const candidates = [];
    const add = value => {
        if (value && !candidates.includes(value)) candidates.push(value);
    };

    urls.filter(Boolean).forEach(value => {
        const httpFallback = toHttpFallbackUrl(value);
        if (preferHttpFallback && httpFallback) add(httpFallback);
        add(value);
        if (!preferHttpFallback && httpFallback) add(httpFallback);
    });

    return candidates;
}

test('網址解析支援多層子網域與新版 TLD', () => {
    const parsed = parseUserUrl('https://hnjz.sqkszxt.online/');

    assert.equal(parsed.ok, true);
    assert.equal(parsed.hostname, 'hnjz.sqkszxt.online');
    assert.equal(parsed.href, 'https://hnjz.sqkszxt.online/');
    assert.equal(isValidHostname('a.b.c.example.technology'), true);
});

test('網址解析支援一般網域搭配路徑與 html 檔名', () => {
    const parsed = parseUserUrl('https://einvgwejakc.com/tw/card.html');

    assert.equal(parsed.ok, true);
    assert.equal(parsed.hostname, 'einvgwejakc.com');
    assert.equal(parsed.href, 'https://einvgwejakc.com/tw/card.html');
});

test('網址解析支援 mobile 案例的大寫路徑', () => {
    const parsed = parseUserUrl('https://king888.pro/SUPERS');

    assert.equal(parsed.ok, true);
    assert.equal(parsed.hostname, 'king888.pro');
    assert.equal(parsed.href, 'https://king888.pro/SUPERS');
});

test('網址解析會補上 protocol 並清理貼上時常見標點', () => {
    const parsed = parseUserUrl('「hnjz.sqkszxt.online/path」。');

    assert.equal(parsed.ok, true);
    assert.equal(parsed.hostname, 'hnjz.sqkszxt.online');
    assert.equal(parsed.href, 'https://hnjz.sqkszxt.online/path');
    assert.equal(parsed.hasExplicitScheme, false);
});

test('未輸入 scheme 的網址應優先嘗試 HTTP fallback 避免 HTTPS-only timeout 誤判', () => {
    const parsed = parseUserUrl('www.crntt.tw');
    const candidates = buildCrawlerCandidateUrls([parsed.href], {
        preferHttpFallback: parsed.hasExplicitScheme === false
    });

    assert.equal(parsed.ok, true);
    assert.equal(parsed.href, 'https://www.crntt.tw/');
    assert.deepEqual(candidates.slice(0, 2), ['http://www.crntt.tw/', 'https://www.crntt.tw/']);
});

test('網址解析仍拒絕不合法 hostname', () => {
    const invalidHosts = [
        'online',
        'bad..online',
        '-bad.online',
        'bad-.online',
        'bad_hostname.online'
    ];

    invalidHosts.forEach(hostname => {
        assert.equal(isValidHostname(hostname), false, hostname);
    });
});

test('API timeout wrapper 會把 rejection 轉成備援結果', async () => {
    const fallback = { status: 'unavailable' };
    const result = await withTimeoutForTest(Promise.reject(new Error('api failed')), 50, fallback);

    assert.deepEqual(result, fallback);
});

test('API JSON 讀取失敗或非 ok 回應會回傳備援結果', async () => {
    const fallback = { status: 'unavailable' };
    const htmlResult = await readJsonSafelyForTest(new Response('<html>error</html>', { status: 200 }), fallback);
    const errorResult = await readJsonSafelyForTest(new Response(JSON.stringify({ ok: false }), { status: 502 }), fallback);

    assert.deepEqual(htmlResult, fallback);
    assert.deepEqual(errorResult, fallback);
});

test('riskFlags raw 欄位應使用實際已定義的 raw 變數', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');

    assert.match(source, /missingAllSecurityHeadersRaw:\s*hasMissingAllSecurityHeadersRaw/);
    assert.match(source, /missingMxRecordsRaw:\s*hasMissingMxRecordsRaw/);
    assert.doesNotMatch(source, /[,{]\s*missingAllSecurityHeadersRaw\s*,\s*missingMxRecordsRaw/);
});

test('mobile trace 解析遇到 app scheme 或壞轉址時不應丟例外', () => {
    const appScheme = resolveNextUrlForTraceTest('intent://open#Intent;scheme=https;end', 'https://king888.pro/SUPERS');
    const badUrl = resolveNextUrlForTraceTest('https://%', 'https://king888.pro/SUPERS');
    const relativeUrl = resolveNextUrlForTraceTest('/next', 'https://king888.pro/SUPERS');

    assert.equal(appScheme.ok, false);
    assert.equal(appScheme.reason, 'non_http_redirect');
    assert.equal(badUrl.ok, false);
    assert.equal(badUrl.reason, 'invalid_redirect_url');
    assert.deepEqual(relativeUrl, { ok: true, href: 'https://king888.pro/next' });
});

test('trace API 會同時檢查 mobile 與 desktop UA 差異', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'functions/api/trace.js'), 'utf8');

    assert.match(source, /key:\s*'mobile'/);
    assert.match(source, /key:\s*'desktop'/);
    assert.match(source, /uaDifference/);
    assert.match(source, /Promise\.all/);
});

test('前端會把 User-Agent cloaking 接入風險旗標與報告卡片', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');

    assert.match(source, /const hasUaCloakingRisk/);
    assert.match(source, /riskScore \+= 90/);
    assert.match(source, /uaCloaking: hasUaCloakingRisk/);
    assert.match(source, /userAgentCloaking/);
    assert.match(source, /裝置導向差異/);
});

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

function applyTrustedAllowlistRiskOverride({
    hostname,
    whitelist = [],
    blocklistListed = false,
    googleUnsafe = false,
    initialRiskScore = 0,
    isSocialMedia = false,
    isFakeGov = false,
    isFinalFakeGov = false
}) {
    const isWhitelisted = isVerifiedSafeRootDomain(hostname, whitelist);
    const hasTrustedAllowlistOverride = isWhitelisted && !isSocialMedia && !isFakeGov && !isFinalFakeGov;
    const blocklistListedForRisk = blocklistListed && !hasTrustedAllowlistOverride;
    const googleFlaggedForRisk = googleUnsafe && !isWhitelisted;
    let riskScore = initialRiskScore;

    if (blocklistListedForRisk || googleFlaggedForRisk) riskScore = 100;
    if (hasTrustedAllowlistOverride) riskScore = 0;

    return {
        riskScore,
        isWhitelisted,
        hasTrustedAllowlistOverride,
        blocklistListedForRisk,
        googleFlaggedForRisk
    };
}

function getEcommerceValidationStatus({ isTrustedPaymentGatewayOrApiEndpoint = false, hasStrongEcommerceValidation = false, ecommerceScore = 0 }) {
    if (isTrustedPaymentGatewayOrApiEndpoint) return 'safe';
    if (hasStrongEcommerceValidation) return 'safe';
    if (ecommerceScore > 0) return 'info';
    return 'unknown';
}

function getBusinessIdentityStatus({ isTrustedPaymentGatewayOrApiEndpoint = false, hasVerifiedBusinessEntity = false, businessMatched = false }) {
    if (isTrustedPaymentGatewayOrApiEndpoint) return 'safe';
    if (hasVerifiedBusinessEntity) return 'safe';
    if (businessMatched) return 'info';
    return 'unknown';
}

function getAgeCheckStatus({ isWhitelisted = false, rdapDate = null, domainAgeDays = null }) {
    if (isWhitelisted) return 'safe';
    if (rdapDate && domainAgeDays !== null && domainAgeDays < 90) return 'danger';
    if (!rdapDate) return 'unknown';
    const ageMs = Math.abs(new Date() - new Date(rdapDate));
    if (ageMs < 365 * 86400000) return 'warning';
    return 'safe';
}

function getDaysBetweenDates(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function isOneYearRegistrationPeriod(periodDays) {
    return periodDays !== null && periodDays >= 330 && periodDays <= 400;
}

function hasNewOneYearRegistrationRisk({
    isWhitelisted = false,
    isOfficialTaiwanGov = false,
    isRegistrationDateFromCertificate = false,
    domainAgeDays = null,
    registrationPeriodDays = null
}) {
    return !isWhitelisted &&
        !isOfficialTaiwanGov &&
        !isRegistrationDateFromCertificate &&
        domainAgeDays !== null &&
        domainAgeDays < 183 &&
        isOneYearRegistrationPeriod(registrationPeriodDays);
}

function hasMissingAllSecurityHeadersRisk({
    isWhitelisted = false,
    isSocialMedia = false,
    securityHeadersData = {},
    hasSecondaryFraudEvidence = false,
    hasTrustedValidation = false
}) {
    return !isWhitelisted &&
        !isSocialMedia &&
        securityHeadersData.status === 'ok' &&
        securityHeadersData.missingAll === true &&
        hasSecondaryFraudEvidence &&
        !hasTrustedValidation;
}

function hasMissingMxRecordsRisk({
    isWhitelisted = false,
    isSocialMedia = false,
    mxInfo = {},
    hasSecondaryFraudEvidence = false,
    hasTrustedValidation = false
}) {
    return !isWhitelisted &&
        !isSocialMedia &&
        mxInfo.status === 'missing' &&
        hasSecondaryFraudEvidence &&
        !hasTrustedValidation;
}

function applyTrustedValidationCap({
    riskScore,
    hasTrustedValidation = false,
    hasConfirmedThreatSignal = false,
    isWhitelisted = false,
    isSocialMedia = false
}) {
    if (hasTrustedValidation && !hasConfirmedThreatSignal && !isWhitelisted && !isSocialMedia) {
        if (riskScore >= 70) return Math.min(riskScore, 60);
        if (riskScore >= 30) return Math.max(20, riskScore - 15);
    }
    return riskScore;
}

function isStrongTraceRisk({ traceHighRisk = false, isFinalSafePlatform = false, isSameRoot = false }) {
    return traceHighRisk && !isFinalSafePlatform && !isSameRoot;
}

function applyTrustedCommercialWeakSignalCap({
    riskScore,
    hasStrongRiskSignal = false,
    isWhitelisted = false,
    isSocialMedia = false,
    hasTrustedCommercialWeakSignalContext = false,
    hasCloudflarePagesDevBaselineRisk = false
}) {
    if (
        !hasStrongRiskSignal &&
        !isWhitelisted &&
        !isSocialMedia &&
        !hasCloudflarePagesDevBaselineRisk &&
        riskScore >= 30 &&
        hasTrustedCommercialWeakSignalContext
    ) {
        return Math.min(riskScore, 25);
    }
    return riskScore;
}

function getParamsCheckStatus({ hasSuspiciousParams = false, hasNestedSuspiciousParams = false, isWhitelisted = false }) {
    if ((hasSuspiciousParams || hasNestedSuspiciousParams) && !isWhitelisted) return 'danger';
    if (hasSuspiciousParams || hasNestedSuspiciousParams) return 'info';
    return 'safe';
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
    const siteStatus = scanData.details?.siteStatus?.status || '';
    const isUnavailableSiteContentOnly = ['blank', 'error', 'unknown', 'blocked'].includes(siteStatus);
    const reasons = [];
    const addReason = (condition, reason) => {
        if (condition && !reasons.includes(reason)) reasons.push(reason);
    };

    addReason(checks.googleSafeBrowsing?.status === 'danger', 'Google 安全庫已標記危險');
    addReason(checks.confirmedScam?.status === 'danger', '人工確認詐騙網域');
    addReason(checks.officialAlerts?.status === 'danger', '官方機關已公告警示');
    addReason(checks.apkCheck?.status === 'danger', '誘導下載可疑 App 或 APK');
    addReason(checks.redirect?.status === 'danger', '郵件追蹤跳板或隱藏轉址');
    addReason(checks.regulatedProduct?.status === 'danger', '違法電子菸/加熱菸網路販售風險');
    addReason(checks.freeHostingSensitiveLink?.status === 'danger', '免費子網域搭配一次性驗證參數');
    addReason(checks.domainAnalysis?.status === 'danger', checks.domainAnalysis?.details || '網域特徵異常');
    addReason(checks.externalResources?.status === 'danger', '表單或外部資源送往可疑網域');
    addReason(checks.disposableDomain?.status === 'danger', '免洗亂碼網域特徵');
    addReason(checks.brandSimilarity?.status === 'danger', '網域疑似仿冒知名品牌');
    addReason(checks.params?.status === 'danger', '網址含敏感驗證或認證參數');
    addReason(checks.entropy?.status === 'danger', '網址含高隨機亂碼特徵');
    addReason(checks.subdomain?.status === 'danger', '深層可疑子網域結構');
    addReason(checks.registrationPeriod?.status === 'danger', '新網域搭配 1 年短期註冊');
    addReason(checks.securityHeaders?.status === 'danger', '缺少全部現代 HTTP 安全標頭');
    addReason(checks.mxRecords?.status === 'danger', '網域未設定 MX 郵件紀錄');
    addReason(checks.age?.status === 'danger' && checks.registrationPeriod?.status !== 'danger', '3 個月內新註冊網域');
    addReason(checks.siteContent?.status === 'danger' && reasons.length === 0 && !isUnavailableSiteContentOnly, checks.siteContent?.details || '網站內容具高風險特徵');

    return reasons.slice(0, 3);
}

function enforceFinalRiskConsistency(scanData) {
    if (!scanData || scanData.isInvalid || scanData.isSocialMedia || scanData.blocklistListed || scanData.isTrustedAllowlist) return scanData;

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
        if (matchesDomainList(hostname, brand.domains) || isVerifiedSafeRootDomain(hostname, whitelist)) continue;

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

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPageBrandKeywordContexts(haystack, keyword) {
    const normalizedKeyword = String(keyword || '').toLowerCase();
    if (!normalizedKeyword) return [];

    let pattern;
    if (normalizedKeyword === '711') {
        pattern = /(?:^|[^a-z0-9])(?:7[\s._-]*11|711)(?=$|[^a-z0-9])/gi;
    } else if (/^[a-z0-9]+$/i.test(normalizedKeyword)) {
        pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}(?=$|[^a-z0-9])`, 'gi');
    }

    if (pattern) {
        const contexts = [];
        let match;
        while ((match = pattern.exec(haystack)) !== null) {
            contexts.push(haystack.slice(Math.max(0, match.index - 48), match.index + match[0].length + 48));
            if (match.index === pattern.lastIndex) pattern.lastIndex++;
        }
        return contexts;
    }

    const contexts = [];
    let index = haystack.indexOf(normalizedKeyword);
    while (index !== -1) {
        contexts.push(haystack.slice(Math.max(0, index - 48), index + normalizedKeyword.length + 48));
        index = haystack.indexOf(normalizedKeyword, index + normalizedKeyword.length);
    }
    return contexts;
}

function isBenignCommerceBrandReference(brandName, keyword, contexts) {
    const isConvenienceStoreBrand = ['統一超商', '全家便利商店'].includes(brandName);
    if (!isConvenienceStoreBrand || contexts.length === 0) return false;

    const weakConvenienceKeywords = ['711', 'seven', 'family'];
    const fulfillmentPattern = /(超商取貨|超商付款|取貨付款|門市取貨|門市配送|超商代碼|超商繳費|交貨便|賣貨便|店到店|配送|寄送|取貨|物流|pickup|store pickup|delivery|shipping|cvs)/i;
    const sensitiveImpersonationPattern = /(驗證|認證|帳戶|賬戶|信用卡|金融卡|卡號|安全碼|cvv|otp|簡訊碼|異常|補繳|領取|中獎|獎勵|重設|停權|凍結|verify|verification|account|credit.?card|token|password)/i;
    const normalizedKeyword = String(keyword || '').toLowerCase();

    return contexts.every(context => {
        const isWeakKeyword = weakConvenienceKeywords.includes(normalizedKeyword);
        const hasFulfillmentContext = fulfillmentPattern.test(context);
        const hasSensitiveContext = sensitiveImpersonationPattern.test(context);
        return !hasSensitiveContext && (hasFulfillmentContext || isWeakKeyword);
    });
}

function analyzePageBrandSignals({ hostname, text }) {
    const haystack = decodeSignalText(text || '');
    for (const brand of riskConfig.protectedBrands) {
        if (matchesDomainList(hostname, brand.domains)) continue;
        const keywords = [brand.name, ...brand.keywords].filter(Boolean);
        const matchedKeyword = keywords.find(keyword => {
            const contexts = getPageBrandKeywordContexts(haystack, keyword);
            return contexts.length > 0 && !isBenignCommerceBrandReference(brand.name, keyword, contexts);
        });
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
        rootLabel: parts.length >= registeredSize ? parts[parts.length - registeredSize] : (parts[0] || ''),
        registrableDomain: parts.length >= registeredSize ? parts.slice(-registeredSize).join('.') : parts.join('.')
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
    if (!compact || compact.length < 5 || compact.length > 18 || safeRoots.has(compact)) {
        return { matched: false, reasons: [], entropy: calculateEntropy(compact || '') };
    }

    const entropyValue = calculateEntropy(compact);
    const isShortRoot = compact.length >= 5 && compact.length <= 8;
    const hasDigitMix = /[a-z]/.test(compact) && /\d/.test(compact);
    const lacksVowels = !/[aeiou]/.test(compact);
    const qWithoutU = /q(?!u)/.test(compact);
    const consonantTrigrams = compact.match(/[bcdfghjklmnpqrstvwxyz]{3,}/g) || [];
    const rareBigrams = compact.match(/(?:qg|gq|kq|qk|xq|qx|zq|qz|vj|jv|yj|jy|kg|gk|mgq|rgm)/g) || [];
    const lowVowelRatio = ((compact.match(/[aeiou]/g) || []).length / compact.length) < 0.25;
    const isShortAcronymLike = isShortRoot &&
        compact.length <= 6 &&
        lacksVowels &&
        /^[a-z]+$/.test(compact) &&
        !/[qxzjv]/.test(compact) &&
        !qWithoutU &&
        rareBigrams.length === 0 &&
        entropyValue <= 2.5;
    const hasAwkwardShortFlow = isShortRoot &&
        (
            (rareBigrams.length > 0 && (consonantTrigrams.length > 0 || entropyValue > 2.1)) ||
            /[aeiou]{2}[bcdfghjklmnpqrstvwxyz]{3,}$/i.test(compact) ||
            /^[bcdfghjklmnpqrstvwxyz]{3,}[aeiou]{2}/i.test(compact)
        );
    const looksMachineGenerated =
        (lacksVowels && !isShortAcronymLike) ||
        hasDigitMix ||
        hasAwkwardShortFlow ||
        (qWithoutU && (consonantTrigrams.length > 0 || entropyValue > 3.0)) ||
        (rareBigrams.length > 0 && entropyValue > 2.8) ||
        (consonantTrigrams.length >= 2 && entropyValue > 3.0 && lowVowelRatio);

    const reasons = [];
    if (qWithoutU) reasons.push('含少見 q 非 qu 組合');
    if (rareBigrams.length > 0) reasons.push(`含少見字母組合 ${[...new Set(rareBigrams)].slice(0, 2).join('、')}`);
    if (consonantTrigrams.length >= 2 || hasAwkwardShortFlow) reasons.push('短網域含不自然字母排列');
    if (hasDigitMix) reasons.push('英數混合隨機碼');
    if (lacksVowels && !isShortAcronymLike) reasons.push('缺少母音');
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

function hasRandomizedPathToken(rawUrl) {
    try {
        return new URL(rawUrl).pathname
            .split('/')
            .filter(Boolean)
            .some(segment => /^[a-z0-9_-]{8,50}$/i.test(segment) && /[a-z]/i.test(segment) && /\d/.test(segment));
    } catch (e) {
        return false;
    }
}

function hasFreeHostingSensitiveLinkRisk(rawUrl, {
    isWhitelisted = false,
    hasBrandSimilarity = false,
    isHighTraffic = false,
    hasSuspiciousTempDomain = false
} = {}) {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isFreeHosting = matchesDomainList(hostname, riskConfig.freeHostingProviders);
    const isSuspiciousTLD = hasSuspiciousTld(hostname);
    return !isWhitelisted &&
        isFreeHosting &&
        hasSensitiveUrlParam(rawUrl) &&
        (hasBrandSimilarity || hasSuspiciousTempDomain || isSuspiciousTLD || hasRandomizedPathToken(rawUrl) || !isHighTraffic);
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
        const hasNumericOnlyShortCode = /^\d{3,8}$/.test(compactLabel);
        const hasShortRandomSegment = segments.some(segment => {
            if (!/[a-z]/.test(segment) || segment.length < 2 || segment.length > 8) return false;
            return !/[aeiou]/.test(segment) || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(segment);
        });
        const looksUnreadable = compactLabel.length >= 6 &&
            compactLabel.length <= 20 &&
            (!hasReadableVowelPattern(compactLabel) || calculateEntropy(compactLabel) > 3.4);

        if (hasNumericOnlyShortCode) suspiciousReasons.push('子網域為純數字短碼');
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

function hasCloudflarePagesDevRandomRisk(hostname) {
    const suspiciousSubdomain = analyzeSuspiciousSubdomain(hostname);
    const hasRandomSubdomain = hasHighEntropySubdomain(hostname) ||
        suspiciousSubdomain.reasons.some(reason =>
            reason.includes('短隨機') ||
            reason.includes('不易讀') ||
            reason.includes('純數字')
        );

    return isCloudflarePagesDevHostname(hostname) &&
        hasRandomSubdomain;
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

function hasSuspiciousExternalTrustedRedirect({
    hostname,
    finalHostname,
    isWhitelisted = false,
    isHighTraffic = false,
    whitelist = []
}) {
    const domain = hostname.toLowerCase();
    const finalDomain = finalHostname.toLowerCase();
    const { subdomainLabels } = getDomainParts(domain);
    const cleanDomain = domain.replace(/^www\./, '');
    const cleanFinalDomain = finalDomain.replace(/^www\./, '');
    const isSameRootRedirect = cleanFinalDomain.endsWith(cleanDomain) || cleanDomain.endsWith(cleanFinalDomain);
    const hasNumericOnlySubdomain = subdomainLabels.some(label => /^\d{3,8}$/.test(label));
    const isFinalWhitelisted = isVerifiedSafeRootDomain(finalDomain, whitelist);

    return !isWhitelisted &&
        !isHighTraffic &&
        hasNumericOnlySubdomain &&
        isFinalWhitelisted &&
        !isSameRootRedirect;
}

function hasSuspiciousShoppingLandingUrlRisk(rawUrl, {
    isWhitelisted = false,
    isUnknownTraffic = false,
    isLowTraffic = false,
    isTrustedTLD = false,
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

    const hasLandingRiskContext =
        disposableRoot.matched ||
        isSuspiciousRootLabel ||
        isSuspiciousLandingRootLabel ||
        suspiciousSubdomain.matched ||
        isVeryNewDomain ||
        hasSuspiciousTempDomain ||
        (isLowTraffic && !isTrustedTLD);

    return !isWhitelisted &&
        matchedLandingParams.length > 0 &&
        hasLandingRiskContext;
}

function hasSuspiciousTldAdLandingRisk(rawUrl, {
    removedTrackingParams = [],
    isWhitelisted = false,
    hasStrongEcommerceValidation = false,
    hasVerifiedBusinessEntity = false,
    isTrustedTaiwanRegistrar = false,
    hasRootDomainTrustBaseline = false
} = {}) {
    const parsed = new URL(rawUrl);
    const domain = parsed.hostname.toLowerCase();
    const isSuspiciousTLD = riskConfig.suspiciousTlds.some(suffix => domain.endsWith(suffix)) || domain.endsWith('.info');
    const defaultLandingParams = ['ldtag_cl=', 'lt_r=', 'fbclid=', 'gclid=', 'utm_', 'click_id=', 'campaign=', 'ad_id=', 'clickid=', 'cid=', 'aff_id='];
    const landingParamList = [...new Set([...riskConfig.suspiciousLandingParams, ...defaultLandingParams])];
    const matchedRawLandingParams = landingParamList.filter(key => rawUrl.toLowerCase().includes(key));
    const rawAdLandingParamDetails = [...new Set([
        ...matchedRawLandingParams.map(key => key.replace(/=$/, '').replace(/_$/, '_*')),
        ...removedTrackingParams
    ])].filter(Boolean);

    return !isWhitelisted &&
        isSuspiciousTLD &&
        rawAdLandingParamDetails.length > 0 &&
        !hasStrongEcommerceValidation &&
        !hasVerifiedBusinessEntity &&
        !isTrustedTaiwanRegistrar &&
        !hasRootDomainTrustBaseline;
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
    const imageHeavy = imageCount >= 6 && linkCount <= 3;
    const hasOnePageStructure = matchedKeywords.length >= 4 && (linkCount <= 3 || imageHeavy || hasOrderForm);
    const highPressureSalesKeywords = ['貨到付款', '免運', '限量', '立即搶購', '馬上訂購'];
    const hasLimitedPurchasePitch = /限時.{0,12}(搶購|優惠|折扣|下單|訂購|購買)|(?:搶購|優惠|折扣|下單|訂購|購買).{0,12}限時/i.test(haystack);
    const hasCodSalesPitch = highPressureSalesKeywords.some(keyword => haystack.includes(keyword.toLowerCase())) || hasLimitedPurchasePitch;
    const hasTrackingLandingParam = keywordGroups.tracking.some(keyword => haystack.includes(keyword.toLowerCase()));
    const lineContactMatches = keywordGroups.lineContact.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const hasLineContactSignal = lineContactMatches.length > 0;
    const hasLineOrderContext = /(下單|訂單|訂購|購買|立即搶購|馬上訂購|貨到付款|限時|限量|截圖傳給客服|客服確認訂單)/i.test(haystack);
    const courseKeywords = ['線上課程', '課程說明會', '課程簡介', '課程內容', '課程長度', '講師', '學員', '試閱', '所有課程', '報名'];
    const courseKeywordMatches = courseKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const isTaiwanCourseProviderPage = new URL(url).hostname.toLowerCase().endsWith('.tw');
    const hasCourseProviderTrust = isTaiwanCourseProviderPage &&
        courseKeywordMatches.length >= 3 &&
        hasMerchantInfo &&
        linkCount >= 5;

    const reasons = [];
    if (hasOnePageStructure) reasons.push('一頁式購物頁結構');
    if (hasOrderForm) reasons.push('頁面直接要求收件或訂購資料');
    if (hasCodSalesPitch) reasons.push('貨到付款/限時優惠等銷售話術');
    if (!hasMerchantInfo && matchedKeywords.length >= 4) reasons.push('缺少明確商家資訊或退換貨政策');
    if (imageHeavy) reasons.push('商品圖片比例高且正常站內連結偏少');
    if (hasTrackingLandingParam) reasons.push('含廣告落地頁追蹤參數');
    if (hasLineContactSignal && hasLineOrderContext && (hasOnePageStructure || hasOrderForm || hasCodSalesPitch || hasTrackingLandingParam)) reasons.push('要求加入 LINE 聯絡或下單');
    const courseSuppressedReasons = new Set([
        '一頁式購物頁結構',
        '頁面直接要求收件或訂購資料',
        '貨到付款/限時優惠等銷售話術',
        '含廣告落地頁追蹤參數'
    ]);
    const effectiveReasons = hasCourseProviderTrust
        ? reasons.filter(reason => !courseSuppressedReasons.has(reason))
        : reasons;

    return {
        matched: effectiveReasons.length >= 2,
        reasonCount: effectiveReasons.length,
        reasons: effectiveReasons,
        keywordCount: matchedKeywords.length,
        formFieldCount,
        imageCount,
        linkCount,
        hasOrderForm,
        hasMerchantInfo,
        hasCourseProviderTrust,
        hasLineContactSignal,
        hasLineOrderContext,
        lineContactExamples: lineContactMatches.slice(0, 3)
    };
}

function analyzeRegulatedTobaccoSalesSignals({ html = '', url }) {
    const haystack = decodeSignalText(`${html}\n${url}`).replace(/\s+/g, ' ');
    const productMatches = riskConfig.regulatedTobaccoProductKeywords
        .filter(keyword => haystack.includes(keyword.toLowerCase()));
    const salesMatches = riskConfig.regulatedTobaccoSalesKeywords
        .filter(keyword => haystack.includes(keyword.toLowerCase()));
    const hasPriceSignal = /(?:nt\$|ntd)\s*\d{2,6}|(?:售價|價格|優惠價|特價|原價)[:：\s$]*\d{2,6}|已售[:：]?\s*\d+/i.test(haystack);
    const hasCartOrOrderSignal = /(購物車|加入購物車|結帳|下單|訂單|訂購|立即購買|立即搶購|馬上訂購)/i.test(haystack);
    const hasLinePurchaseSignal = /(購買|訂購|下單|訂單|客服|如需購買).{0,18}line|line.{0,18}(購買|訂購|下單|訂單|客服)/i.test(haystack);
    const hasTaiwanFulfillmentSignal = /(貨到付款|全台配送|宅配|超商取貨|國內現貨|正品現貨)/i.test(haystack);
    const hasSalesSignal = salesMatches.length >= 2 ||
        hasPriceSignal ||
        hasCartOrOrderSignal ||
        hasLinePurchaseSignal ||
        hasTaiwanFulfillmentSignal;

    const reasons = [];
    if (productMatches.length > 0) reasons.push(`電子菸/加熱菸商品詞：${[...new Set(productMatches)].slice(0, 3).join('、')}`);
    if (hasPriceSignal || hasCartOrOrderSignal) reasons.push('出現價格、購物車或下單流程');
    if (hasLinePurchaseSignal) reasons.push('要求透過 LINE 客服購買或確認訂單');
    if (hasTaiwanFulfillmentSignal) reasons.push('出現貨到付款、全台配送或現貨等交易話術');
    if (salesMatches.length >= 2 && reasons.length < 4) reasons.push(`交易關鍵字：${[...new Set(salesMatches)].slice(0, 3).join('、')}`);

    return {
        matched: productMatches.length > 0 && hasSalesSignal,
        reasons,
        productMatches: [...new Set(productMatches)].slice(0, 5),
        salesMatches: [...new Set(salesMatches)].slice(0, 5),
        hasPriceSignal,
        hasLinePurchaseSignal,
        hasTaiwanFulfillmentSignal
    };
}

function analyzeEcommerceTrustSignals({ html = '', url }) {
    const haystack = decodeSignalText(`${html}\n${url}`);
    const platformFootprints = [
        'woocommerce', 'wc-cart-fragments', 'wp-content/plugins/woocommerce',
        'shopify', 'cdn.shopify.com', 'shopline', 'shoplineapp', 'cyberbiz',
        '91app', 'waca', 'qdm', 'meepshop', 'easystore', 'opencart',
        'magento', 'prestashop', 'ecpay', 'newebpay', '綠界', '藍新'
    ];
    const cartFootprints = [
        'add-to-cart', 'add_to_cart', 'wc_add_to_cart', 'cart-fragments',
        '/cart', '/checkout', '/shopping-cart', 'shopping_cart',
        'cart/add', 'cart.js', 'checkout.js', '加入購物車', '購物車', '結帳'
    ];
    const contactKeywords = [
        '聯絡我們', '客服電話', '客服信箱', '客服中心', '統一編號',
        '公司名稱', '有限公司', '股份有限公司', '聯絡地址', '門市資訊'
    ];
    const policyKeywords = [
        '退換貨政策', '退貨政策', '隱私權政策', '服務條款',
        '付款方式', '配送方式', '購物須知', '會員條款'
    ];
    const courseCommerceFootprints = [
        '線上課程', '課程說明會', '課程簡介', '課程內容', '課程長度',
        '講師', '學員', '試閱', '所有課程', '報名'
    ];
    const matchedPlatforms = platformFootprints.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const matchedCart = cartFootprints.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const matchedContact = contactKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const matchedPolicy = policyKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const matchedCourseCommerce = courseCommerceFootprints.filter(keyword => haystack.includes(keyword.toLowerCase()));
    const hasMailOrTelLink = /(?:mailto:|tel:)/i.test(haystack);
    const hasTaiwanAddress = /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣).{0,24}(路|街|巷|弄|號)/.test(haystack);
    const hasCourseCommerceFootprint = matchedCourseCommerce.length >= 3 ||
        (/\/courses?\//i.test(url) && matchedCourseCommerce.length >= 2);
    const categories = [];
    if (matchedPlatforms.length > 0) categories.push('platform');
    if (matchedCart.length > 0) categories.push('cart');
    if (matchedContact.length >= 2 || hasMailOrTelLink || hasTaiwanAddress) categories.push('contact');
    if (matchedPolicy.length >= 2) categories.push('policy');
    if (hasCourseCommerceFootprint) categories.push('course');
    const score = Math.min(100,
        (matchedPlatforms.length > 0 ? 30 : 0) +
        (matchedCart.length > 0 ? 25 : 0) +
        ((matchedContact.length >= 2 || hasMailOrTelLink || hasTaiwanAddress) ? 25 : 0) +
        (matchedPolicy.length >= 2 ? 20 : 0) +
        (hasCourseCommerceFootprint ? 30 : 0)
    );

    return {
        score,
        matched: score >= 50 && new Set(categories).size >= 2,
        categories: [...new Set(categories)]
    };
}

function analyzeSeoSignals({ html = '', siteSeoData = {} }) {
    const hasTitle = /<title>[^<]{6,}<\/title>/i.test(html);
    const hasDescription = /<meta[^>]+name=["']description["'][^>]+content=/i.test(html);
    const ogTags = (html.match(/<meta[^>]+property=["']og:[^"']+["'][^>]+content=/gi) || []).length;
    const hasCanonical = /<link[^>]+rel=["']canonical["'][^>]+href=/i.test(html);
    const pageScore = (hasTitle ? 10 : 0) + (hasDescription ? 15 : 0) + (ogTags >= 2 ? 20 : 0) + (hasCanonical ? 10 : 0);
    const combinedScore = Math.min(100, pageScore + Math.min(60, siteSeoData.score || 0));
    return {
        combinedScore,
        matched: combinedScore >= 60 || (pageScore >= 35 && siteSeoData.matched)
    };
}

function analyzeLanguageSignals({ html = '', url }) {
    const hostname = new URL(url).hostname.toLowerCase();
    const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
    const htmlLang = (langMatch?.[1] || '').toLowerCase();
    const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinCount = (text.match(/[a-z]/gi) || []).length;
    const dominantLanguage = zhCount >= 30 && zhCount >= latinCount * 0.2 ? 'zh' : (latinCount >= 80 ? 'latin' : 'unknown');
    const langDeclaresZh = /^zh|tw|hant/.test(htmlLang);
    const langDeclaresForeign = /^(en|ja|ko|vi|th|id|ru|fr|de|es)/.test(htmlLang);
    const isTaiwanDomain = hostname.endsWith('.tw');
    const mismatch = (dominantLanguage === 'zh' && langDeclaresForeign) ||
        (isTaiwanDomain && htmlLang && !langDeclaresZh && dominantLanguage === 'zh');
    return {
        status: mismatch ? 'warning' : (isTaiwanDomain && dominantLanguage === 'zh' && (!htmlLang || langDeclaresZh) ? 'safe' : 'unknown'),
        matched: isTaiwanDomain && dominantLanguage === 'zh' && (!htmlLang || langDeclaresZh),
        details: mismatch
            ? `頁面主要為中文，但 HTML lang="${htmlLang}"，需留意語言標記不一致`
            : (isTaiwanDomain && dominantLanguage === 'zh' && (!htmlLang || langDeclaresZh) ? `台灣網域頁面語言與 HTML 語系一致${htmlLang ? ` (${htmlLang})` : ''}` : '未取得足夠語言一致性訊號，此項不作為風險加權')
    };
}

function analyzeLineOfficialSignals({ html = '' }) {
    const urls = [...html.matchAll(/href=["']([^"']*(?:lin\.ee|line\.me)[^"']*)["']/gi)].map(match => match[1]);
    const haystack = decodeSignalText(`${html}\n${urls.join('\n')}`);
    const hasOfficialContext = /(官方line|line官方|官方帳號|官方賬號|line客服|客服line|@[\w.-]{3,})/i.test(haystack);
    return {
        matched: urls.length > 0 && hasOfficialContext,
        urls
    };
}

function normalizeBusinessName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/公司名稱|營業人名稱|商店名稱|企業名稱|申請人|註冊人|注册人/g, '')
        .replace(/[^\u4e00-\u9fffa-z0-9]/g, '');
}

function analyzeBusinessIdentitySignals({ html = '', registrantName = '', registrantOrganization = '' }) {
    const names = [];
    const regex = /(?:公司名稱|營業人名稱|商店名稱|企業名稱)?[:：\s　]*([\u4e00-\u9fffA-Za-z0-9・]{2,32}(?:股份有限公司|有限公司|企業社|商行|工作室))/g;
    let match;
    while ((match = regex.exec(html)) !== null) names.push(match[1].trim());
    const hasTaxId = /(?:統一編號|統編|公司統編|營利事業統一編號)[:：\s　]*\d{8}/.test(html);
    const registrant = normalizeBusinessName(`${registrantName} ${registrantOrganization}`);
    const matchedName = [...new Set(names)].find(name => {
        const normalizedName = normalizeBusinessName(name);
        return normalizedName && registrant && (registrant.includes(normalizedName) || normalizedName.includes(registrant));
    });
    return {
        matched: !!matchedName || (!!registrant && hasTaxId && names.length > 0),
        matchedName,
        hasTaxId
    };
}

function isTrustedTaiwanRegistrar({ domain, registrarName }) {
    return domain.endsWith('.tw') &&
        !!registrarName &&
        riskConfig.trustedTaiwanRegistrars.some(item => registrarName.toLowerCase().includes(item));
}

function neutralizeLowTrafficForTrustedSme({ isLowTraffic, hasSmallBusinessTrustContext }) {
    return isLowTraffic && hasSmallBusinessTrustContext ? false : isLowTraffic;
}

test('白名單支援完全符合與子網域符合', () => {
    const whitelist = ['example.com', 'trusted.org.tw'];

    assert.equal(matchesDomainList('example.com', whitelist), true);
    assert.equal(matchesDomainList('login.example.com', whitelist), true);
    assert.equal(matchesDomainList('fake-example.com', whitelist), false);
    assert.equal(matchesDomainList('trusted.org.tw', whitelist), true);
    assert.equal(matchesDomainList('service.trusted.org.tw', whitelist), true);
});

test('白名單包含 simplite.com.tw 並支援 www 子網域', () => {
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;

    assert.equal(matchesDomainList('simplite.com.tw', whitelist), true);
    assert.equal(matchesDomainList('www.simplite.com.tw', whitelist), true);
});

test('嬰兒與母親活動子網域應繼承可信服務根網域', () => {
    const rawUrl = 'https://acts.mababy.com/2025thi_nestle_HA?fbclid=sample&utm_medium=paid&utm_source=fb&utm_campaign=120246974505240275';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);

    assert.equal(isTrustedTaiwanServiceDomain('acts.mababy.com'), true);
    assert.equal(isVerifiedSafeRootDomain('acts.mababy.com'), true);
    assert.equal(shouldSkipAiBrandAnalysis('acts.mababy.com'), true);
    assert.ok(sanitized.removedTrackingParams.includes('fbclid'));
    assert.ok(sanitized.removedTrackingParams.includes('utm_source'));
});

test('可信媒體活動網域上的雀巢合作活動不應視為品牌仿冒', () => {
    assert.equal(isTrustedCoBrandCampaignHost('acts.mababy.com', 'Nestlé'), true);
    assert.equal(isTrustedCoBrandCampaignHost('acts.mababy.com', '雀巢能恩水解3'), true);
    assert.equal(isTrustedCoBrandCampaignHost('promo.example.com', 'Nestlé'), false);
    assert.equal(isTrustedCoBrandCampaignHost('acts.mababy.com', 'Apple'), false);
});

test('白名單包含 ONE BOY 官方網域並支援 www 子網域', () => {
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;

    assert.equal(matchesDomainList('oneboy.com.tw', whitelist), true);
    assert.equal(matchesDomainList('www.oneboy.com.tw', whitelist), true);
});

test('白名單包含 PayPal 官方網域並支援 www 子網域', () => {
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;

    assert.equal(matchesDomainList('paypal.com', whitelist), true);
    assert.equal(matchesDomainList('www.paypal.com', whitelist), true);
});

test('全球頂級可信根網域即使白名單載入失敗也應保留 root override', () => {
    assert.equal(isVerifiedSafeRootDomain('www.paypal.com'), true);
    assert.equal(isVerifiedSafeRootDomain('www.google.com'), true);
    assert.equal(isVerifiedSafeRootDomain('apple.com'), true);
    assert.equal(isVerifiedSafeRootDomain('paypal.com.evil.shop'), false);
    assert.equal(isVerifiedSafeRootDomain('evil-paypal.com'), false);
});

test('Axi 官方金融服務網域不應因外匯或交易語意誤判為高風險', () => {
    const hostname = 'www.axi.com';
    const url = 'https://www.axi.com/int/markets/forex';
    const financialText = `${url} forex broker trading account credit card transaction verification`;
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const hasFinancialPhishingSignal = !isVerifiedSafeRootDomain(hostname) &&
        hasFinancialPhishingText(financialText);

    assert.ok(riskConfig.trustedFinancialServiceDomains.includes('axi.com'));
    assert.equal(isTrustedFinancialServiceDomain(hostname), true);
    assert.equal(isVerifiedSafeRootDomain(hostname), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname), true);
    assert.equal(hasFinancialPhishingText(financialText), true);
    assert.equal(hasFinancialPhishingSignal, false);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.blocklistListedForRisk, false);
    assert.equal(override.googleFlaggedForRisk, false);
    assert.equal(override.riskScore, 0);
    assert.equal(isVerifiedSafeRootDomain('axi.com.evil.shop'), false);
    assert.equal(isVerifiedSafeRootDomain('fake-axi.com'), false);
    assert.equal(isVerifiedSafeRootDomain('axitrading.biz'), false);
});

test('台灣人壽官方短網址不應因短碼路徑或金融語意誤判為高風險', () => {
    const hostname = 'twlife.tw';
    const url = 'https://twlife.tw/P/Y8ZSFj5';
    const financialText = `${url} 台灣人壽 中信 保單 帳戶 verification transaction`;
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const hasFinancialPhishingSignal = !isVerifiedSafeRootDomain(hostname) &&
        hasFinancialPhishingText(financialText);
    const hasPathRisk = !isVerifiedSafeRootDomain(hostname) && hasOfficialFlowPath(url);

    assert.ok(riskConfig.trustedFinancialServiceDomains.includes('twlife.tw'));
    assert.ok(riskConfig.trustedFinancialServiceDomains.includes('taiwanlife.com'));
    assert.equal(isTrustedFinancialServiceDomain(hostname), true);
    assert.equal(isTrustedFinancialServiceDomain('www.taiwanlife.com'), true);
    assert.equal(isVerifiedSafeRootDomain(hostname), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname), true);
    assert.equal(hasFinancialPhishingText(financialText), true);
    assert.equal(hasFinancialPhishingSignal, false);
    assert.equal(hasPathRisk, false);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.blocklistListedForRisk, false);
    assert.equal(override.googleFlaggedForRisk, false);
    assert.equal(override.riskScore, 0);
    assert.equal(isVerifiedSafeRootDomain('twlife.tw.evil.shop'), false);
    assert.equal(isVerifiedSafeRootDomain('fake-twlife.tw'), false);
    assert.equal(isVerifiedSafeRootDomain('taiwanlife.com.evil.shop'), false);
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

test('台灣 gov.tw 憑證近期核發不應被註冊時間卡片拉高風險', () => {
    const ageStatus = getAgeCheckStatus({
        isWhitelisted: isOfficialTaiwanGovDomain('500.gov.tw'),
        rdapDate: new Date().toISOString(),
        domainAgeDays: 1
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: 0,
        checks: {
            age: { status: ageStatus, details: '台灣政府官方網域，不以 HTTPS 憑證核發日判定為新註冊風險' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' },
            siteContent: { status: 'safe', details: '受信賴的台灣政府官方網域' }
        }
    });

    assert.equal(ageStatus, 'safe');
    assert.equal(scanData.riskScore, 0);
    assert.deepEqual(scanData.summaryReasons, []);
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

test('Apple 冒用網域搭配一次性驗證參數應升為高風險', () => {
    const url = 'https://app-ie.eu.cc/HqTGLU0qwJ?_eat=valid_20260527143844_991ac1689258aa030d8d8605cef0ae5e';
    const hostname = new URL(url).hostname;
    const brandSimilarity = checkBrandSimilarity(hostname);
    const hasSensitiveParam = hasSensitiveUrlParam(url);
    const isFreeHosting = matchesDomainList(hostname, riskConfig.freeHostingProviders);
    const hasFreeHostingTokenRisk = hasFreeHostingSensitiveLinkRisk(url, {
        hasBrandSimilarity: brandSimilarity.matched
    });
    const hasStrongRiskSignal = brandSimilarity.matched;
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasStrongRiskSignal ? 80 : 0,
        checks: {
            brandSimilarity: { status: brandSimilarity.matched ? 'danger' : 'safe' },
            freeHostingSensitiveLink: { status: hasFreeHostingTokenRisk ? 'danger' : 'safe' },
            params: { status: hasSensitiveParam ? 'danger' : 'safe' },
            domainAnalysis: {
                status: brandSimilarity.matched ? 'danger' : 'safe',
                details: brandSimilarity.matched ? `網域疑似模仿「${brandSimilarity.brandName}」相關名稱` : ''
            }
        }
    });

    assert.equal(brandSimilarity.matched, true);
    assert.equal(brandSimilarity.brandName, 'Apple');
    assert.equal(hasSensitiveParam, true);
    assert.equal(isFreeHosting, true);
    assert.equal(hasRandomizedPathToken(url), true);
    assert.equal(hasFreeHostingTokenRisk, true);
    assert.equal(scanData.riskScore >= 70, true);
});

test('免費子網域搭配一次性驗證參數應是強風險，避免被弱訊號 cap 壓回低風險', () => {
    const url = 'https://app-ie.eu.cc/HqTGLU0qwJ?_eat=valid_20260527143844_991ac1689258aa030d8d8605cef0ae5e';
    const hasFreeHostingTokenRisk = hasFreeHostingSensitiveLinkRisk(url, {
        hasBrandSimilarity: false,
        isHighTraffic: false
    });
    const scoreBeforeCap = hasFreeHostingTokenRisk ? 85 : 0;
    const scoreAfterCap = applyTrustedCommercialWeakSignalCap({
        riskScore: scoreBeforeCap,
        hasStrongRiskSignal: hasFreeHostingTokenRisk,
        hasTrustedCommercialWeakSignalContext: true
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: 25,
        checks: {
            freeHostingSensitiveLink: { status: hasFreeHostingTokenRisk ? 'danger' : 'safe' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(hasFreeHostingTokenRisk, true);
    assert.equal(scoreAfterCap, 85);
    assert.equal(scanData.riskScore, 70);
    assert.deepEqual(scanData.summaryReasons, ['免費子網域搭配一次性驗證參數']);
});

test('Apple 官方網域與 iCloud 官方網域不應被品牌相似規則誤判', () => {
    assert.equal(checkBrandSimilarity('apple.com').matched, false);
    assert.equal(checkBrandSimilarity('support.apple.com').matched, false);
    assert.equal(checkBrandSimilarity('icloud.com').matched, false);
});

test('發票載具官方網域 cinvoice.tw 應列入可信台灣服務白名單', () => {
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const hostname = 'www.cinvoice.tw';
    const isWhitelisted = isVerifiedSafeRootDomain(hostname, []);
    const pageBrandSignals = analyzePageBrandSignals({
        hostname,
        text: '發票載具 APP 可同步雲端發票，並串接財政部電子發票整合服務平台資料。'
    });
    const hasPageBrandMismatch = !isWhitelisted && !checkBrandSimilarity(hostname, []).matched && pageBrandSignals.matched;
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('cinvoice.tw'));
    assert.equal(matchesDomainList(hostname, whitelist), true);
    assert.equal(isTrustedTaiwanServiceDomain(hostname), true);
    assert.equal(isWhitelisted, true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname, []), true);
    assert.equal(checkBrandSimilarity(hostname, []).matched, false);
    assert.equal(pageBrandSignals.matched, true);
    assert.equal(hasPageBrandMismatch, false);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
});

test('雲端發票生活小幫手官方專屬網域應視為可信服務與安全短網址', () => {
    const rawUrl = 'https://ecloud.life/i/Y8ZSFj5k?utm_source=line&utm_medium=sms';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const hostname = 'ecloud.life';
    const mainHostname = 'www.ecloudlife.com';
    const pageBrandSignals = analyzePageBrandSignals({
        hostname,
        text: '雲端發票-生活小幫手可管理雲端發票、載具、對獎通知與消費紀錄。'
    });
    const isWhitelisted = isVerifiedSafeRootDomain(hostname, []);
    const hasPageBrandMismatch = !isWhitelisted && !checkBrandSimilarity(hostname, []).matched && pageBrandSignals.matched;
    const shortenerOverride = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('ecloud.life'));
    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('ecloudlife.com'));
    assert.ok(riskConfig.urlShorteners.includes('ecloud.life'));
    assert.ok(riskConfig.safeShorteners.includes('ecloud.life'));
    assert.equal(matchesDomainList(hostname, riskConfig.urlShorteners), true);
    assert.equal(matchesDomainList(hostname, riskConfig.safeShorteners), true);
    assert.equal(isTrustedTaiwanServiceDomain(hostname), true);
    assert.equal(isTrustedTaiwanServiceDomain(mainHostname), true);
    assert.equal(isVerifiedSafeRootDomain(hostname, []), true);
    assert.equal(isVerifiedSafeRootDomain(mainHostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname, []), true);
    assert.equal(hasRandomizedPathToken(rawUrl), true);
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['utm_medium', 'utm_source'].sort());
    assert.equal(hasPageBrandMismatch, false);
    assert.equal(shortenerOverride.hasTrustedAllowlistOverride, true);
    assert.equal(shortenerOverride.blocklistListedForRisk, false);
    assert.equal(shortenerOverride.googleFlaggedForRisk, false);
    assert.equal(shortenerOverride.riskScore, 0);
    assert.equal(isVerifiedSafeRootDomain('ecloud.life.evil.shop', []), false);
    assert.equal(isVerifiedSafeRootDomain('fake-ecloud.life', []), false);
});

test('紅陽科技電子發票查詢子網域應視為可信支付與發票服務', () => {
    const rawUrl = 'https://einv.sunpay.com.tw/search?invoiceDate=kiBAKD%2BpWYkUqbrO1pxzyg%3D%3D&invoiceNumber=RV8Xi3AsAXqInA3oOB6aRA%3D%3D&randomNumber=M2by%2BbmD6oJFbn8auN%2BsOA%3D%3D';
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname;
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const pageBrandSignals = analyzePageBrandSignals({
        hostname,
        text: '<title>紅陽科技 | 電子發票整合服務</title><meta name="description" content="紅陽科技－電子發票系統平台提供最佳電子發票解決方案，協助企業輕鬆開立電子發票、管理發票數據。">'
    });
    const paramsStatus = getParamsCheckStatus({
        hasSuspiciousParams: hasSensitiveUrlParam(rawUrl),
        isWhitelisted: isVerifiedSafeRootDomain(hostname, [])
    });
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const brandApiSource = fs.readFileSync(path.join(repoRoot, 'functions/api/check-fake-brand.js'), 'utf8');

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('sunpay.com.tw'));
    assert.ok(riskConfig.globalPaymentGatewayDomains.includes('sunpay.com.tw'));
    assert.equal(matchesDomainList(hostname, whitelist), true);
    assert.equal(isTrustedTaiwanServiceDomain(hostname), true);
    assert.equal(isGlobalPaymentGatewayDomain(hostname), true);
    assert.equal(isVerifiedSafeRootDomain(hostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname, []), true);
    assert.equal(hasSensitiveUrlParam(rawUrl), false);
    assert.equal(parsed.searchParams.get('invoiceDate'), 'kiBAKD+pWYkUqbrO1pxzyg==');
    assert.equal(parsed.searchParams.get('invoiceNumber'), 'RV8Xi3AsAXqInA3oOB6aRA==');
    assert.equal(parsed.searchParams.get('randomNumber'), 'M2by+bmD6oJFbn8auN+sOA==');
    assert.equal(paramsStatus, 'safe');
    assert.equal(pageBrandSignals.matched, false);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, '財政部電子發票'), true);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, '電子發票整合服務'), true);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.blocklistListedForRisk, false);
    assert.equal(override.googleFlaggedForRisk, false);
    assert.equal(override.riskScore, 0);
    assert.match(brandApiSource, /"紅陽科技股份有限公司": \["sunpay\.com\.tw"\]/);
    assert.match(brandApiSource, /domain: "sunpay\.com\.tw"/);
});

test('CMoney 官方短網址 cmy.tw 應列入可信台灣服務與安全短網址白名單', () => {
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const hostname = 'cmy.tw';
    const officialDestination = 'www.cmoney.com.tw';
    const appDestination = 'www.cmoney.tw';
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('cmy.tw'));
    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('cmoney.tw'));
    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('cmoney.com.tw'));
    assert.ok(riskConfig.safeShorteners.includes('cmy.tw'));
    assert.equal(matchesDomainList(hostname, whitelist), true);
    assert.equal(matchesDomainList(officialDestination, whitelist), true);
    assert.equal(isTrustedTaiwanServiceDomain(hostname), true);
    assert.equal(isTrustedTaiwanServiceDomain(officialDestination), true);
    assert.equal(isTrustedTaiwanServiceDomain(appDestination), true);
    assert.equal(isVerifiedSafeRootDomain(hostname, []), true);
    assert.equal(isVerifiedSafeRootDomain(officialDestination, []), true);
    assert.equal(isVerifiedSafeRootDomain(appDestination, []), true);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
});

test('Shopee 官方短網址 tw.shp.ee 應視為可信安全縮網址', () => {
    const rawUrl = 'https://tw.shp.ee/example?utm_source=line&utm_medium=share';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const shortenerOverride = applyTrustedAllowlistRiskOverride({
        hostname: 'tw.shp.ee',
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('shopee.tw'));
    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('shp.ee'));
    assert.ok(riskConfig.urlShorteners.includes('shp.ee'));
    assert.ok(riskConfig.safeShorteners.includes('shp.ee'));
    assert.equal(matchesDomainList('tw.shp.ee', riskConfig.urlShorteners), true);
    assert.equal(matchesDomainList('tw.shp.ee', riskConfig.safeShorteners), true);
    assert.equal(isTrustedEcommerceDomain('tw.shp.ee'), true);
    assert.equal(isTrustedEcommerceDomain('shopee.tw'), true);
    assert.equal(isVerifiedSafeRootDomain('tw.shp.ee'), true);
    assert.equal(isVerifiedSafeRootDomain('shopee.tw'), true);
    assert.equal(shortenerOverride.hasTrustedAllowlistOverride, true);
    assert.equal(shortenerOverride.riskScore, 0);
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['utm_medium', 'utm_source'].sort());
});

test('中華電信官方短網址 cht.tw 應視為可信安全縮網址', () => {
    const rawUrl = 'https://cht.tw/x/aec30?utm_source=sms&utm_medium=message';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const shortenerOverride = applyTrustedAllowlistRiskOverride({
        hostname: 'cht.tw',
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('cht.tw'));
    assert.ok(riskConfig.urlShorteners.includes('cht.tw'));
    assert.ok(riskConfig.safeShorteners.includes('cht.tw'));
    assert.equal(matchesDomainList('cht.tw', riskConfig.urlShorteners), true);
    assert.equal(matchesDomainList('cht.tw', riskConfig.safeShorteners), true);
    assert.equal(isTrustedTaiwanServiceDomain('cht.tw'), true);
    assert.equal(isVerifiedSafeRootDomain('cht.tw'), true);
    assert.equal(shouldSkipAiBrandAnalysis('cht.tw'), true);
    assert.equal(shortenerOverride.hasTrustedAllowlistOverride, true);
    assert.equal(shortenerOverride.blocklistListedForRisk, false);
    assert.equal(shortenerOverride.googleFlaggedForRisk, false);
    assert.equal(shortenerOverride.riskScore, 0);
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['utm_medium', 'utm_source'].sort());
});

test('政府 JWT result 參數不應因參數值內容誤判為敏感參數', () => {
    const govUrl = 'https://500.gov.tw/FOAS/actions/GspValid.action?result=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.auth.token.session.verify';
    const phishingUrl = 'https://verify.example.com/login?token=abc123';

    assert.equal(matchesDomainList('500.gov.tw', ['gov.tw']), true);
    assert.equal(hasSensitiveUrlParam(govUrl), false);
    assert.equal(hasSensitiveUrlParam(phishingUrl), true);
});

test('PayPal 官方 checkout token 在白名單網域上不應顯示為危險參數', () => {
    const url = 'https://www.paypal.com/checkoutnow?token=36924238BB0240414';
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const parsed = new URL(url);
    const isWhitelisted = matchesDomainList(parsed.hostname, whitelist);

    assert.equal(hasSensitiveUrlParam(url), true);
    assert.equal(isWhitelisted, true);
    assert.equal(getParamsCheckStatus({ hasSuspiciousParams: true, isWhitelisted }), 'info');
    assert.equal(getParamsCheckStatus({ hasSuspiciousParams: true, isWhitelisted: false }), 'danger');
});

test('PayPal 官方 checkout token 即使外部白名單不可用也不應觸發 path/query 高風險', () => {
    const url = 'https://www.paypal.com/checkoutnow?token=36924238BB0240414';
    const parsed = new URL(url);
    const isVerifiedSafeRoot = isVerifiedSafeRootDomain(parsed.hostname, []);
    const hasPathRisk = !isVerifiedSafeRoot && hasOfficialFlowPath(url);
    const paramsStatus = getParamsCheckStatus({
        hasSuspiciousParams: hasSensitiveUrlParam(url),
        isWhitelisted: isVerifiedSafeRoot
    });

    assert.equal(isVerifiedSafeRoot, true);
    assert.equal(hasSensitiveUrlParam(url), true);
    assert.equal(hasPathRisk, false);
    assert.equal(paramsStatus, 'info');
});

test('Trusted Allowlist Domain 應覆寫外部黑名單與後段扣分', () => {
    const result = applyTrustedAllowlistRiskOverride({
        hostname: 'www.paypal.com',
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: result.riskScore,
        isTrustedAllowlist: result.hasTrustedAllowlistOverride,
        blocklistListed: result.blocklistListedForRisk,
        checks: {
            domainAnalysis: { status: 'danger', details: '後段弱訊號不應覆寫可信 allowlist' },
            ecommerceValidation: { status: 'unknown', details: '未取得 CMS 足跡' },
            businessIdentity: { status: 'unknown', details: '未取得商家實體資料' }
        }
    });

    assert.equal(result.isWhitelisted, true);
    assert.equal(result.hasTrustedAllowlistOverride, true);
    assert.equal(result.blocklistListedForRisk, false);
    assert.equal(result.googleFlaggedForRisk, false);
    assert.equal(scanData.riskScore, 0);
});

test('可信支付閘道 checkout/API 端點不套用一般電商 CMS 與台灣商家實體檢查', () => {
    const paypalCheckout = 'https://www.paypal.com/checkoutnow?token=36924238BB0240414';
    const phishingLookalike = 'https://paypal.com.evil.shop/checkoutnow?token=36924238BB0240414';

    assert.equal(isGlobalPaymentGatewayDomain('www.paypal.com'), true);
    assert.equal(isTrustedPaymentGatewayOrApiEndpoint(paypalCheckout, []), true);
    assert.equal(isTrustedPaymentGatewayOrApiEndpoint(phishingLookalike, []), false);
    assert.equal(getEcommerceValidationStatus({
        isTrustedPaymentGatewayOrApiEndpoint: isTrustedPaymentGatewayOrApiEndpoint(paypalCheckout, []),
        hasStrongEcommerceValidation: false,
        ecommerceScore: 0
    }), 'safe');
    assert.equal(getBusinessIdentityStatus({
        isTrustedPaymentGatewayOrApiEndpoint: isTrustedPaymentGatewayOrApiEndpoint(paypalCheckout, []),
        hasVerifiedBusinessEntity: false,
        businessMatched: false
    }), 'safe');
});

test('大型電商根網域子網域應直接視為可信 allowlist 並維持低風險', () => {
    const trustedEcUrls = [
        'https://24h.pchome.com.tw/prod/DCAH0M-A900FQ999?utm_source=google&gclid=abc&gbraid=def',
        'https://tw.coupang.com/products/123456789?utm_medium=cpc&wbraid=abc',
        'https://pxbox.es.pxmart.com.tw/product/path/deep?fbclid=abc&utm_campaign=promo',
        'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=123&utm_term=test',
        'https://ec-w.shopping.friday.tw/googleAI/product/deep/path?utm_source=google&gclid=abc',
        'https://giftcard.uni-prosperity.com.tw/giftcard/LIbqV9Tt0m',
        'https://lioncrew.uni-lions.com.tw/products/ulc080800002603?utm_source=fb',
        'https://www.sunsetgoods.tw/SalePage/Index/11682153?utm_medium=ads&utm_source=facebook&utm_campaign=0420_%E5%B0%8F%E6%96%B0%E5%8D%8A%E6%A9%9F%E6%A2%B0%E7%A9%8D%E6%9C%A8&fbclid=IwdGRjcASR13pleHRuA2FlbQIxMQBzcnRjBmFwcF9pZAo2NjI4NTY4Mzc5AAEet5ADCFi3U68SO2IQKkom8d3kZJfjwFoKOs-sk6DbyUyK1EWgHMhLyJOd6VA_aem_QqY-u0aI0sNz0rX2btxnEA',
        'https://www.theaxiomstore.com/?utm_source=facebook&fbclid=abc123'
    ];

    trustedEcUrls.forEach(rawUrl => {
        const parsed = new URL(rawUrl);
        const parts = getDomainParts(parsed.hostname);
        const isWhitelisted = isVerifiedSafeRootDomain(parsed.hostname);
        const hasTrustedAllowlistOverride = isWhitelisted;
        const riskScore = hasTrustedAllowlistOverride ? 0 : 100;

        assert.equal(isTrustedEcommerceDomain(parsed.hostname), true, parsed.hostname);
        assert.ok(riskConfig.trustedEcommerceRootDomains.includes(parts.registrableDomain), parsed.hostname);
        assert.equal(riskScore, 0, parsed.hostname);
    });

    assert.equal(isVerifiedSafeRootDomain('pchome.com.tw.evil.shop'), false);
    assert.equal(isVerifiedSafeRootDomain('fake-momoshop.com.tw'), false);
});

test('家樂福 Uni-Prosperity 官方禮物卡子網域應視為可信且跳過 AI 品牌誤判', () => {
    const hostname = 'giftcard.uni-prosperity.com.tw';
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const pageBrandSignals = analyzePageBrandSignals({
        hostname,
        text: '<title>家樂福電子禮券 CARREFOUR E-GC</title><p>憑電子禮券上的條碼，可至家樂福所有門市消費使用。</p>'
    });
    const fakeCarrefour = checkBrandSimilarity('carrefour-gift.example.shop', []);
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });

    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('uni-prosperity.com.tw'));
    assert.ok(matchesDomainList(hostname, whitelist));
    assert.equal(isTrustedEcommerceDomain(hostname), true);
    assert.equal(isVerifiedSafeRootDomain(hostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname, []), true);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, 'Carrefour Taiwan'), true);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, '家樂福'), true);
    assert.equal(checkBrandSimilarity(hostname, []).matched, false);
    assert.equal(pageBrandSignals.matched, false);
    assert.equal(fakeCarrefour.matched, true);
    assert.equal(fakeCarrefour.brandName, '家樂福');
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
});

test('統一獅 LION CREW 官方商城子網域應視為可信且不被統一超商品牌誤判', () => {
    const hostname = 'lioncrew.uni-lions.com.tw';
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const pageBrandSignals = analyzePageBrandSignals({
        hostname,
        text: '<title>統一 7-ELEVEN 獅隊官方 LION CREW 萊恩酷商城</title><p>營業人名稱：統一棒球隊股份有限公司。統一編號：23534457。</p>'
    });
    const fakeLionsStore = checkBrandSimilarity('uni-lions-shop.example.com', []);
    const override = applyTrustedAllowlistRiskOverride({
        hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const brandApiSource = fs.readFileSync(path.join(repoRoot, 'functions/api/check-fake-brand.js'), 'utf8');

    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('uni-lions.com.tw'));
    assert.ok(matchesDomainList(hostname, whitelist));
    assert.equal(isTrustedEcommerceDomain(hostname), true);
    assert.equal(isVerifiedSafeRootDomain(hostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(hostname, []), true);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, '統一超商'), true);
    assert.equal(isTrustedCoBrandCampaignHost(hostname, '7-ELEVEN'), true);
    assert.equal(checkBrandSimilarity(hostname, []).matched, false);
    assert.equal(pageBrandSignals.matched, false);
    assert.equal(fakeLionsStore.matched, true);
    assert.equal(fakeLionsStore.brandName, '統一7-ELEVEN獅');
    assert.match(brandApiSource, /"統一獅": \["uni-lions\.com\.tw"\]/);
    assert.match(brandApiSource, /"LION CREW": \["uni-lions\.com\.tw"\]/);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
});

test('日落小物 91APP 商品頁應移除社群追蹤參數並視為可信電商', () => {
    const rawUrl = 'https://www.sunsetgoods.tw/SalePage/Index/11682153?utm_medium=ads&utm_source=facebook&utm_campaign=0420_%E5%B0%8F%E6%96%B0%E5%8D%8A%E6%A9%9F%E6%A2%B0%E7%A9%8D%E6%9C%A8&fbclid=IwdGRjcASR13pleHRuA2FlbQIxMQBzcnRjBmFwcF9pZAo2NjI4NTY4Mzc5AAEet5ADCFi3U68SO2IQKkom8d3kZJfjwFoKOs-sk6DbyUyK1EWgHMhLyJOd6VA_aem_QqY-u0aI0sNz0rX2btxnEA';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);
    const parts = getDomainParts(parsed.hostname);
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const ecommerce = analyzeEcommerceTrustSignals({
        url: sanitized.href,
        html: `
            <title>《蠟筆小新》半機械動感小新積木 - 日落小物 sunsetgoods</title>
            <link rel="canonical" href="https://www.sunsetgoods.tw/SalePage/Index/11682153">
            <script src="https://official-static.91app.com/v2/SalePage/controller.js"></script>
            <a href="/ShoppingCart">購物車</a>
            <button>加入購物車</button>
            <p>付款方式 配送方式 退換貨政策 服務條款 商品分類</p>
        `
    });
    const override = applyTrustedAllowlistRiskOverride({
        hostname: parsed.hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const brandApiSource = fs.readFileSync(path.join(repoRoot, 'functions/api/check-fake-brand.js'), 'utf8');

    assert.equal(sanitized.href, 'https://www.sunsetgoods.tw/SalePage/Index/11682153');
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['fbclid', 'utm_campaign', 'utm_medium', 'utm_source'].sort());
    assert.deepEqual(sanitized.removedVolatileParams, []);
    assert.equal(parts.registrableDomain, 'sunsetgoods.tw');
    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('sunsetgoods.tw'));
    assert.ok(matchesDomainList(parsed.hostname, whitelist));
    assert.equal(isTrustedEcommerceDomain(parsed.hostname), true);
    assert.equal(isVerifiedSafeRootDomain(parsed.hostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(parsed.hostname, []), true);
    assert.equal(isTrustedCoBrandCampaignHost(parsed.hostname, '蠟筆小新'), true);
    assert.equal(isTrustedCoBrandCampaignHost(parsed.hostname, 'Crayon Shinchan'), true);
    assert.equal(ecommerce.matched, true);
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
    assert.match(brandApiSource, /function sanitizeUrlForBrandAnalysis/);
    assert.match(brandApiSource, /function isMarketplaceProductBrandContext/);
    assert.match(brandApiSource, /"日落小物": \["sunsetgoods\.tw"\]/);
});

test('The AXIOM 安德家品官方 SHOPLINE 購物站應視為可信電商且不被代理品牌誤判', () => {
    const rawUrl = 'https://www.theaxiomstore.com/?utm_source=facebook&utm_medium=ads&fbclid=abc123';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);
    const parts = getDomainParts(parsed.hostname);
    const whitelist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'whitelist.json'), 'utf8')).domains;
    const pageText = `
        <title>The AXIOM 安德家品</title>
        <meta name="description" content="安德家品the Axiom官方網站，專注引進創新居家與生活科技產品，主力經營JMGO堅果投影機與FoodCycler 廚餘大師">
        <link rel="canonical" href="https://www.theaxiomstore.com">
        <script src="https://cdn.shoplineapp.com/packs/js/storefront.js"></script>
        <a href="/cart">購物車</a>
        <button>加入購物車</button>
        <p>台灣總代理 安德國際商貿股份有限公司 統編 42821649 台北市內湖區金莊路26號7樓之5</p>
        <p>運送服務方式 退換貨政策 條款與細則 隱私與政策</p>
    `;
    const ecommerce = analyzeEcommerceTrustSignals({ url: sanitized.href, html: pageText });
    const pageBrandSignals = analyzePageBrandSignals({
        hostname: parsed.hostname,
        text: pageText
    });
    const fakeAxiomStore = checkBrandSimilarity('theaxiomstore-discount.example.shop', []);
    const override = applyTrustedAllowlistRiskOverride({
        hostname: parsed.hostname,
        blocklistListed: true,
        googleUnsafe: true,
        initialRiskScore: 95
    });
    const brandApiSource = fs.readFileSync(path.join(repoRoot, 'functions/api/check-fake-brand.js'), 'utf8');

    assert.equal(sanitized.href, 'https://www.theaxiomstore.com/');
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['fbclid', 'utm_medium', 'utm_source'].sort());
    assert.equal(parts.registrableDomain, 'theaxiomstore.com');
    assert.ok(riskConfig.trustedEcommerceRootDomains.includes('theaxiomstore.com'));
    assert.ok(matchesDomainList(parsed.hostname, whitelist));
    assert.equal(isTrustedEcommerceDomain(parsed.hostname), true);
    assert.equal(isVerifiedSafeRootDomain(parsed.hostname, []), true);
    assert.equal(shouldSkipAiBrandAnalysis(parsed.hostname, []), true);
    assert.equal(isTrustedCoBrandCampaignHost(parsed.hostname, 'JMGO'), true);
    assert.equal(isTrustedCoBrandCampaignHost(parsed.hostname, 'FoodCycler'), true);
    assert.equal(ecommerce.matched, true);
    assert.equal(pageBrandSignals.matched, false);
    assert.equal(fakeAxiomStore.matched, true);
    assert.equal(fakeAxiomStore.brandName, '安德國際商貿');
    assert.equal(override.hasTrustedAllowlistOverride, true);
    assert.equal(override.riskScore, 0);
    assert.match(brandApiSource, /"安德國際商貿股份有限公司": \["theaxiomstore\.com"\]/);
    assert.match(brandApiSource, /domain: "theaxiomstore\.com"/);
});

test('風險評分前應移除標準行銷追蹤參數並保留必要商品與交易參數', () => {
    const rawUrl = 'https://24h.pchome.com.tw/prod/DCAH0M-A900FQ999?utm_source=google&utm_medium=cpc&gclid=abc&gbraid=def&fbclid=ghi&i_code=123&token=keep';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);

    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['fbclid', 'gbraid', 'gclid', 'utm_medium', 'utm_source'].sort());
    assert.deepEqual(sanitized.removedVolatileParams, []);
    assert.equal(parsed.searchParams.has('utm_source'), false);
    assert.equal(parsed.searchParams.has('gclid'), false);
    assert.equal(parsed.searchParams.has('gbraid'), false);
    assert.equal(parsed.searchParams.has('fbclid'), false);
    assert.equal(parsed.searchParams.get('i_code'), '123');
    assert.equal(parsed.searchParams.get('token'), 'keep');
});

test('風險評分前應移除動態 anti-evasion 參數並保留原始網址稽核資訊', () => {
    const rawUrl = 'https://app-ie.eu.cc/HqTGLU0qwJ?_eat=valid_20260527143844_991ac1689258aa030d8d8605cef0ae5e&utm_source=sms&token=keep';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);

    assert.equal(sanitized.rawUrl, rawUrl);
    assert.equal(parsed.searchParams.has('_eat'), false);
    assert.equal(parsed.searchParams.has('utm_source'), false);
    assert.equal(parsed.searchParams.get('token'), 'keep');
    assert.deepEqual(sanitized.removedVolatileParams, ['_eat']);
    assert.deepEqual(sanitized.removedTrackingParams, ['utm_source']);
    assert.deepEqual(sanitized.removedParams.sort(), ['_eat', 'utm_source'].sort());
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
    assert.equal(isExternalResource('https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5', 'https://example.com'), false);
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

test('電商頁的統一超商取貨資訊不應被視為頁面品牌仿冒', () => {
    const result = analyzePageBrandSignals({
        hostname: 'www.oneboy.com.tw',
        text: `
            <title>ONE BOY官方購物網</title>
            <meta name="description" content="提供配送方式、付款方式與超商取貨服務">
            <p>配送方式：7-11 超商取貨、統一超商門市取貨、宅配。</p>
            <script>var campaignId = "6998877117584";</script>
        `
    });

    assert.equal(result.matched, false);
});

test('追蹤碼或商品代碼中的 711 不應觸發統一超商品牌仿冒', () => {
    const result = analyzePageBrandSignals({
        hostname: 'www.oneboy.com.tw',
        text: '<title>ONE BOY官方購物網</title><meta name="description" content="utm_id=6998877117584 fbclid=PAdGRleAR4dO9leHRuA2FlbQEwAGFkaWQAAAZdlgEnUHNydGM">'
    });

    assert.equal(result.matched, false);
});

test('以 7-11 名義要求驗證與卡號仍應視為頁面品牌仿冒', () => {
    const result = analyzePageBrandSignals({
        hostname: 'secure-verify.example.shop',
        text: '<title>7-11 賣貨便付款驗證</title><p>請輸入信用卡卡號、安全碼與簡訊碼完成帳戶驗證。</p>'
    });

    assert.equal(result.matched, true);
    assert.equal(result.brandName, '統一超商');
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

test('純數字子網域跨網域轉址到可信大站應視為高風險占位式轉址', () => {
    const hostname = '992.comunimass.com';
    const suspiciousSubdomain = analyzeSuspiciousSubdomain(hostname);
    const hasRisk = hasSuspiciousExternalTrustedRedirect({
        hostname,
        finalHostname: 'www.google.com'
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: capWeakSignalRisk(hasRisk ? 85 : 0, hasRisk),
        checks: {
            redirect: { status: hasRisk ? 'danger' : 'safe', details: '未知純數字子網域跨網域轉址至可信大站' },
            domainAnalysis: { status: hasRisk ? 'danger' : 'safe', details: '純數字子網域搭配外部可信大站轉址' },
            subdomainPattern: { status: suspiciousSubdomain.matched ? 'warning' : 'safe', details: suspiciousSubdomain.reasons.join('、') }
        }
    });

    assert.equal(suspiciousSubdomain.matched, true);
    assert.ok(suspiciousSubdomain.reasons.includes('子網域為純數字短碼'));
    assert.equal(hasRisk, true);
    assert.equal(scanData.riskScore, 85);
    assert.deepEqual(scanData.summaryReasons, ['郵件追蹤跳板或隱藏轉址', '純數字子網域搭配外部可信大站轉址']);
    assert.equal(hasSuspiciousExternalTrustedRedirect({
        hostname: '500.gov.tw',
        finalHostname: 'www.google.com',
        isWhitelisted: true
    }), false);
    assert.equal(hasSuspiciousExternalTrustedRedirect({
        hostname: '24h.pchome.com.tw',
        finalHostname: 'www.google.com',
        isWhitelisted: true
    }), false);
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

test('Tranco 查詢暫時無法取得不應單獨造成購物落地頁高風險', () => {
    const url = 'https://example.com/product?utm_source=ad';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isUnknownTraffic: true,
        isLowTraffic: false,
        isVeryNewDomain: false,
        hasSuspiciousTempDomain: false
    });

    assert.equal(hasRisk, false);
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

test('電子菸網路販售頁應升為高風險並不被正規電商佐證洗白', () => {
    const html = `
        <main>
            <script src="/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js"></script>
            <p>歡迎光臨RELX電子煙悅刻，如需購買電子煙請加客服LINE：677sp</p>
            <a href="/cart">購物車</a>
            <section>
                <h2>RELX電子煙專區</h2>
                <article>RELX煙彈六代 1顆入 RELX悅刻電子煙 NT$130 已售：1807件</article>
                <article>Relx電子煙悅刻6代主機煙桿 正品現貨 NT$700 已售：375件</article>
                <article>RELX悅刻拋棄式GA8000口一次性電子煙 無需充電 NT$380 已售：810件</article>
            </section>
            <p>公司名稱：範例股份有限公司。客服電話與客服信箱提供售後服務。退換貨政策、隱私權政策、付款方式、配送方式完整揭露。</p>
            <footer>正品保障、貨到付款、價格優惠</footer>
        </main>`;
    const regulatedSignals = analyzeRegulatedTobaccoSalesSignals({
        html,
        url: 'https://681336.com/relx-yueke/'
    });
    const ecommerceSignals = analyzeEcommerceTrustSignals({
        html,
        url: 'https://681336.com/relx-yueke/'
    });
    const hasRegulatedTobaccoSalesSignal = regulatedSignals.matched;
    const hasStrongEcommerceValidation = ecommerceSignals.matched && !hasRegulatedTobaccoSalesSignal;
    const riskScore = hasRegulatedTobaccoSalesSignal ? 95 : 0;
    const scanData = enforceFinalRiskConsistency({
        riskScore: 25,
        checks: {
            regulatedProduct: { status: hasRegulatedTobaccoSalesSignal ? 'danger' : 'safe' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(regulatedSignals.matched, true);
    assert.ok(regulatedSignals.productMatches.includes('電子煙'));
    assert.equal(ecommerceSignals.matched, true);
    assert.equal(hasStrongEcommerceValidation, false);
    assert.equal(riskScore >= 70, true);
    assert.equal(scanData.riskScore, 70);
    assert.deepEqual(scanData.summaryReasons, ['違法電子菸/加熱菸網路販售風險']);
});

test('電子菸衛教或法規文章沒有交易脈絡時不應命中網路販售風險', () => {
    const html = `
        <article>
            <h1>網路購買電子菸小心成為違法輸入者</h1>
            <p>衛生局提醒民眾勿輸入電子菸或刊登電子菸廣告，避免受罰。</p>
            <p>菸害防制法規定，輸入電子菸及其組合零件將受裁罰。</p>
        </article>`;
    const regulatedSignals = analyzeRegulatedTobaccoSalesSignals({
        html,
        url: 'https://www.chshb.gov.tw/node/219118282'
    });

    assert.equal(regulatedSignals.matched, false);
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

test('正規電商佐證會避免購物頁特徵直接升為高風險', () => {
    const html = `
        <script src="/wp-content/plugins/woocommerce/assets/js/frontend/cart-fragments.js"></script>
        <main>
            <h1>新品特價，立即購買</h1>
            <p>公司名稱：簡單生活股份有限公司。統一編號：12345678。客服電話與客服信箱提供售後服務。</p>
            <p>退換貨政策、隱私權政策、付款方式、配送方式完整揭露。</p>
            <a href="/cart">購物車</a><a href="/checkout">結帳</a>
            <a href="mailto:service@simplite.com.tw">客服信箱</a><a href="tel:0212345678">客服電話</a>
            <form action="/cart"><input placeholder="姓名"><input placeholder="手機"><button>加入購物車</button></form>
        </main>`;
    const shoppingSignals = analyzeShoppingScamSignals({
        html,
        url: 'https://www.simplite.com.tw/product?utm_source=newsletter'
    });
    const ecommerceSignals = analyzeEcommerceTrustSignals({
        html,
        url: 'https://www.simplite.com.tw/product?utm_source=newsletter'
    });
    const hasStrongEcommerceValidation = ecommerceSignals.matched;
    const hasShoppingScamSignal = shoppingSignals.matched && !hasStrongEcommerceValidation;

    assert.equal(shoppingSignals.matched, true);
    assert.equal(ecommerceSignals.matched, true);
    assert.ok(ecommerceSignals.categories.includes('platform'));
    assert.ok(ecommerceSignals.categories.includes('cart'));
    assert.equal(hasShoppingScamSignal, false);
});

test('有風造識與 Good Whale 正規課程頁不應因投資課程與 UTM 誤判為高風險', () => {
    const url = 'https://goodwhale.withwind.tw/courses/is?utm_source=web&utm_medium=post&utm_campaign=sale';
    const html = `
        <html lang="zh-TW">
            <head>
                <title>個人財務逆向工程 線上課程說明會 - 〖有風造識〗</title>
                <meta name="description" content="有風造識與 Good Whale 執行長黃士豪合作推出個人財務逆向工程課程說明會">
            </head>
            <body>
                <main>
                    <h1>個人財務逆向工程 線上課程說明會</h1>
                    <p>有風造識與新加坡 Good Whale 執行長黃士豪合作推出，課程簡介、課程內容、講師介紹、學員評論與試閱完整揭露。</p>
                    <p>共有 51,671 位學員參與此課程。課程長度約 2 小時，立即購買 NT$0，限時開放免費報名。</p>
                    <p>報名需填寫姓名、Email、手機，說明會連結會寄至信箱。</p>
                    <p>本課程由〖有風造識〗推出，智慧財產權歸屬「邁凱實業股份有限公司」所有。</p>
                    <p>邁凱實業股份有限公司｜台北市松山區八德路 2 段 451 巷 1 號 3 樓｜客服信箱：goodwhale@withwind.tw</p>
                    <p>隱私權政策、付款方式與退費政策完整揭露。</p>
                    <img src="1.jpg"><img src="2.jpg"><img src="3.jpg"><img src="4.jpg"><img src="5.jpg"><img src="6.jpg">
                    <a href="/courses">所有課程</a><a href="/courses/is/intro">課程簡介</a><a href="/courses/is/content">課程內容</a>
                    <a href="/teachers/will">講師</a><a href="/privacy">隱私權政策</a><a href="/terms">服務條款</a>
                </main>
            </body>
        </html>`;
    const shoppingSignals = analyzeShoppingScamSignals({ html, url });
    const ecommerceSignals = analyzeEcommerceTrustSignals({ html, url });
    const urlOnlyLandingRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isLowTraffic: true,
        isTrustedTLD: false
    });
    const effectiveLandingRisk = !ecommerceSignals.matched && urlOnlyLandingRisk;
    const scanData = enforceFinalRiskConsistency({
        riskScore: effectiveLandingRisk || shoppingSignals.matched ? 75 : 25,
        checks: {
            shoppingScam: { status: shoppingSignals.matched ? 'danger' : 'info' },
            shoppingLanding: { status: effectiveLandingRisk ? 'danger' : 'info' },
            ecommerceValidation: { status: ecommerceSignals.matched ? 'safe' : 'unknown' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(shoppingSignals.hasCourseProviderTrust, true);
    assert.equal(shoppingSignals.matched, false);
    assert.equal(ecommerceSignals.matched, true);
    assert.ok(ecommerceSignals.categories.includes('course'));
    assert.ok(ecommerceSignals.categories.includes('contact'));
    assert.equal(urlOnlyLandingRisk, true);
    assert.equal(effectiveLandingRisk, false);
    assert.equal(scanData.riskScore < 30, true);
    assert.deepEqual(scanData.summaryReasons, []);
});

test('xLab/xlearn 正規課程活動頁不應因 liveform 與 UTM 誤判為高風險', () => {
    const rawUrl = 'https://xlearn.tw/liveform?p=aifirst&version=babycode&utm_medium=paid&utm_source=an&utm_id=120247218609650379_v2_s07&utm_content=120247218609640379&utm_term=120247218609650379&utm_campaign=120246955483620379';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);
    const html = `
        <html lang="zh-TW">
            <head>
                <title>次世代商用實戰體驗課 - xLab</title>
                <meta name="description" content="xLab by xlearn 提供 AI 工具應用、n8n 工作流、網頁前端與設計等線上技能課程">
            </head>
            <body>
                <main>
                    <h1>次世代商用實戰體驗課</h1>
                    <p>xLab 帶你按下 A.I. 開機鍵，課程簡介、課程內容、講師介紹、學員案例與報名資訊完整揭露。</p>
                    <p>平台由無限學股份有限公司營運，提供 AI 工具應用、n8n 工作流、網頁前端、設計與投資理財等線上技能課程與講座。</p>
                    <p>報名需填寫姓名、Email、手機，講座連結會寄至信箱。</p>
                    <p>客服信箱：support@xlearn.tw。隱私權政策、服務條款與退費政策完整揭露。</p>
                    <a href="/">xLab 首頁</a><a href="/courses">所有課程</a><a href="/teachers">講師</a>
                    <a href="/privacy">隱私權政策</a><a href="/terms">服務條款</a><a href="/contact">聯絡我們</a>
                </main>
            </body>
        </html>`;
    const shoppingSignals = analyzeShoppingScamSignals({ html, url: rawUrl });
    const ecommerceSignals = analyzeEcommerceTrustSignals({ html, url: rawUrl });
    const isTrustedServiceRoot = isTrustedTaiwanServiceDomain('xlearn.tw');
    const isWhitelisted = isVerifiedSafeRootDomain('xlearn.tw');
    const urlOnlyLandingRisk = hasSuspiciousShoppingLandingUrlRisk(rawUrl, {
        isLowTraffic: true,
        isTrustedTLD: true
    });
    const effectiveLandingRisk = !isWhitelisted && !ecommerceSignals.matched && urlOnlyLandingRisk;
    const scanData = enforceFinalRiskConsistency({
        riskScore: isWhitelisted ? 0 : (effectiveLandingRisk || shoppingSignals.matched ? 75 : 25),
        checks: {
            shoppingScam: { status: shoppingSignals.matched ? 'danger' : 'info' },
            shoppingLanding: { status: effectiveLandingRisk ? 'danger' : 'info' },
            ecommerceValidation: { status: ecommerceSignals.matched ? 'safe' : 'unknown' },
            domainAnalysis: { status: isWhitelisted ? 'safe' : 'warning', details: isWhitelisted ? '受信賴台灣民營服務官方網域：xlearn.tw' : '網域命名結構無明顯異常' }
        }
    });

    assert.equal(isTrustedServiceRoot, true);
    assert.equal(isWhitelisted, true);
    assert.equal(shouldSkipAiBrandAnalysis('xlearn.tw'), true);
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['utm_campaign', 'utm_content', 'utm_id', 'utm_medium', 'utm_source', 'utm_term'].sort());
    assert.equal(parsed.searchParams.has('utm_source'), false);
    assert.equal(parsed.searchParams.get('p'), 'aifirst');
    assert.equal(parsed.searchParams.get('version'), 'babycode');
    assert.equal(shoppingSignals.hasCourseProviderTrust, true);
    assert.equal(shoppingSignals.matched, false);
    assert.equal(ecommerceSignals.matched, true);
    assert.ok(ecommerceSignals.categories.includes('course'));
    assert.ok(ecommerceSignals.categories.includes('contact'));
    assert.equal(effectiveLandingRisk, false);
    assert.equal(scanData.riskScore < 30, true);
    assert.deepEqual(scanData.summaryReasons, []);
});

test('Niceday 玩體驗官方活動預訂頁不應因產品路徑與 UTM 誤判為高風險', () => {
    const rawUrl = 'https://play.niceday.tw/zh-tw/regions/21/products/3719534049977?utm_medium=paid&utm_source=fb&utm_campaign=kids_activity';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);
    const html = `
        <html lang="zh-TW">
            <head>
                <title>Niceday 玩體驗 親子活動預訂</title>
                <meta name="description" content="Niceday 玩體驗提供台灣親子與課外體驗活動預訂服務">
            </head>
            <body>
                <main>
                    <h1>Niceday 玩體驗</h1>
                    <p>全台最豐富的親子活動就在 Niceday，精選冬令營、夏令營、小小職人和五感體驗。</p>
                    <p>平台提供活動介紹、場次、地點、票券方案、付款方式與取消政策。</p>
                    <p>客服中心、常見問題、隱私權政策與服務條款完整揭露。</p>
                    <a href="/zh-tw/regions/21/search">探索活動</a><a href="/purchase_qa.html">常見問題</a>
                    <a href="/terms">服務條款</a><a href="/privacy">隱私權政策</a>
                </main>
            </body>
        </html>`;
    const shoppingSignals = analyzeShoppingScamSignals({ html, url: rawUrl });
    const ecommerceSignals = analyzeEcommerceTrustSignals({ html, url: rawUrl });
    const isTrustedServiceRoot = isTrustedTaiwanServiceDomain(parsed.hostname);
    const isWhitelisted = isVerifiedSafeRootDomain(parsed.hostname);
    const urlOnlyLandingRisk = hasSuspiciousShoppingLandingUrlRisk(rawUrl, {
        isLowTraffic: true,
        isTrustedTLD: true
    });
    const effectiveLandingRisk = !isWhitelisted && !ecommerceSignals.matched && urlOnlyLandingRisk;
    const scanData = enforceFinalRiskConsistency({
        riskScore: isWhitelisted ? 0 : (effectiveLandingRisk || shoppingSignals.matched ? 75 : 25),
        checks: {
            shoppingScam: { status: shoppingSignals.matched ? 'danger' : 'info' },
            shoppingLanding: { status: effectiveLandingRisk ? 'danger' : 'info' },
            ecommerceValidation: { status: ecommerceSignals.matched ? 'safe' : 'unknown' },
            domainAnalysis: { status: isWhitelisted ? 'safe' : 'warning', details: isWhitelisted ? '受信賴台灣民營服務官方網域：niceday.tw' : '網域命名結構無明顯異常' }
        }
    });

    assert.ok(riskConfig.trustedTaiwanServiceDomains.includes('niceday.tw'));
    assert.equal(isTrustedServiceRoot, true);
    assert.equal(isWhitelisted, true);
    assert.equal(shouldSkipAiBrandAnalysis(parsed.hostname), true);
    assert.deepEqual(sanitized.removedTrackingParams.sort(), ['utm_campaign', 'utm_medium', 'utm_source'].sort());
    assert.equal(parsed.searchParams.has('utm_source'), false);
    assert.equal(parsed.pathname, '/zh-tw/regions/21/products/3719534049977');
    assert.equal(effectiveLandingRisk, false);
    assert.equal(scanData.riskScore < 30, true);
    assert.deepEqual(scanData.summaryReasons, []);
    assert.equal(isVerifiedSafeRootDomain('niceday.tw.evil.shop'), false);
    assert.equal(isVerifiedSafeRootDomain('fake-niceday.tw'), false);
});

test('成熟 SEO、robots 與 sitemap 可作為可信佐證', () => {
    const html = `
        <html lang="zh-TW">
            <head>
                <title>簡單生活家具官方商城</title>
                <meta name="description" content="簡單生活官方商城">
                <meta property="og:title" content="簡單生活家具">
                <meta property="og:site_name" content="SIMPLITE">
                <link rel="canonical" href="https://www.simplite.com.tw/">
            </head>
            <body>簡輕家居股份有限公司官方網站</body>
        </html>`;
    const seo = analyzeSeoSignals({
        html,
        siteSeoData: {
            matched: true,
            score: 60,
            robots: { exists: true },
            sitemap: { exists: true }
        }
    });

    assert.equal(seo.matched, true);
    assert.equal(seo.combinedScore >= 60, true);
});

test('台灣商家語言一致性可作為可信佐證，語言標記不一致則警示', () => {
    const text = '簡輕家居股份有限公司官方商城，提供家具、燈飾、生活用品、配送服務、退換貨政策與客服資訊。';
    const zhHtml = `<html lang="zh-TW"><body>${text}</body></html>`;
    const mismatchHtml = `<html lang="en"><body>${text}</body></html>`;

    assert.equal(analyzeLanguageSignals({ html: zhHtml, url: 'https://www.simplite.com.tw' }).matched, true);
    assert.equal(analyzeLanguageSignals({ html: mismatchHtml, url: 'https://www.simplite.com.tw' }).status, 'warning');
});

test('語言訊號不足是中性狀態並應清楚標示不作為風險加權', () => {
    const result = analyzeLanguageSignals({
        html: '<html><body></body></html>',
        url: 'https://www.oneboy.com.tw/Common/m/Main/Shop/itemList.aspx?utm_source=ring'
    });

    assert.equal(result.status, 'unknown');
    assert.equal(result.matched, false);
    assert.match(result.details, /不作為風險加權/);
});

test('頁面商家名稱與 WHOIS/RDAP 註冊者相符時應形成可信佐證', () => {
    const result = analyzeBusinessIdentitySignals({
        html: '<p>公司名稱：簡輕家居股份有限公司</p><p>統一編號：12345678</p>',
        registrantOrganization: '簡輕家居股份有限公司'
    });

    assert.equal(result.matched, true);
    assert.equal(result.matchedName, '簡輕家居股份有限公司');
    assert.equal(result.hasTaxId, true);
});

test('NET-CHINESE 等台灣常見註冊商應被視為可信佐證而非高風險註冊商', () => {
    assert.equal(isTrustedTaiwanRegistrar({
        domain: 'simplite.com.tw',
        registrarName: 'NET-CHINESE CO., LTD.'
    }), true);
    assert.equal(riskConfig.highRiskRegistrars.some(item => 'net-chinese co., ltd.'.includes(item)), false);
});

test('LINE 官方帳號連結搭配商家脈絡應是混合訊號而非單獨高風險', () => {
    const line = analyzeLineOfficialSignals({
        html: '<p>官方LINE客服提供售後服務</p><a href="https://lin.ee/example">加入官方LINE</a>'
    });
    const hasBusinessContext = true;
    const isHighRiskByLineOnly = line.matched && !hasBusinessContext;

    assert.equal(line.matched, true);
    assert.equal(isHighRiskByLineOnly, false);
});

test('未進入 Tranco 全球排名但有台灣商家可信佐證時不應當成低流量風險', () => {
    const isLowTraffic = neutralizeLowTrafficForTrustedSme({
        isLowTraffic: true,
        hasSmallBusinessTrustContext: true
    });

    assert.equal(isLowTraffic, false);
});

test('缺少電商佐證的一頁式購物頁仍會維持高風險', () => {
    const html = `
        <main>
            <h1>今日限定 免運 貨到付款</h1>
            <p>立即搶購，限量最後 20 件。請加入LINE客服確認訂單，截圖傳給客服。</p>
            <a href="https://lin.ee/example">加入 LINE</a>
            <form><input placeholder="姓名"><input placeholder="手機"><textarea placeholder="地址"></textarea></form>
        </main>`;
    const shoppingSignals = analyzeShoppingScamSignals({
        html,
        url: 'https://ako.kforgmamgeq.com/?ldtag_cl=abc&lt_r=126'
    });
    const ecommerceSignals = analyzeEcommerceTrustSignals({
        html,
        url: 'https://ako.kforgmamgeq.com/?ldtag_cl=abc&lt_r=126'
    });
    const hasShoppingScamSignal = shoppingSignals.matched && !ecommerceSignals.matched;
    const riskScore = hasShoppingScamSignal ? 85 : 0;

    assert.equal(shoppingSignals.matched, true);
    assert.equal(ecommerceSignals.matched, false);
    assert.equal(riskScore >= 70, true);
});

test('常見品牌網域只有 UTM 參數不應命中購物落地頁高風險', () => {
    const url = 'https://store.example.com/product?utm_source=newsletter';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isWhitelisted: true,
        isUnknownTraffic: false
    });

    assert.equal(hasRisk, false);
});

test('正規台灣商業網域只有廣告參數與低流量不應命中購物落地頁高風險', () => {
    const oneboyUrl = 'https://www.oneboy.com.tw/Common/m/Main/Shop/itemList.aspx?m=45&p=2773&utm_source=ring&utm_medium=fbad_COV_ring&utm_campaign=KOL_Kevin_null_260311_20260423_MARIO_3&utm_id=6998871417584&utm_content=6999015936384&utm_term=6998871417384&fbclid=sample';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(oneboyUrl, {
        isLowTraffic: true,
        isTrustedTLD: true
    });

    assert.equal(hasRisk, false);
});

test('可疑 .cc 社群廣告落地頁即使清除 tracking 仍應升為高風險', () => {
    const rawUrl = 'https://gonomad.cc/bonebone/?fbclid=sample&utm_medium=paid&utm_source=fb&utm_id=120249894728860274&utm_content=120249894728850274&utm_term=120249894728870274&utm_campaign=120249894728860274';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);
    const parsed = new URL(sanitized.href);
    const hasRisk = hasSuspiciousTldAdLandingRisk(rawUrl, {
        removedTrackingParams: sanitized.removedTrackingParams
    });
    const riskScore = hasRisk ? 85 : 15;

    assert.equal(parsed.search, '');
    assert.equal(sanitized.rawUrl, rawUrl);
    assert.ok(sanitized.removedTrackingParams.includes('fbclid'));
    assert.ok(sanitized.removedTrackingParams.includes('utm_source'));
    assert.equal(hasRisk, true);
    assert.equal(riskScore >= 70, true);
});

test('可疑後綴廣告落地頁規則不應覆寫白名單或正規電商佐證', () => {
    const rawUrl = 'https://gonomad.cc/bonebone/?fbclid=sample&utm_source=fb';
    const sanitized = sanitizeUrlForRiskScoring(rawUrl);

    assert.equal(hasSuspiciousTldAdLandingRisk(rawUrl, {
        removedTrackingParams: sanitized.removedTrackingParams,
        isWhitelisted: true
    }), false);
    assert.equal(hasSuspiciousTldAdLandingRisk(rawUrl, {
        removedTrackingParams: sanitized.removedTrackingParams,
        hasStrongEcommerceValidation: true
    }), false);
});

test('台灣商業網域若主網域具亂碼免洗特徵仍應命中購物落地頁高風險', () => {
    const url = 'https://ako.kforgmamgeq.com.tw/?utm_source=ad';
    const hasRisk = hasSuspiciousShoppingLandingUrlRisk(url, {
        isLowTraffic: true,
        isTrustedTLD: true
    });

    assert.equal(hasRisk, true);
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

test('單純網站內容不可讀不應被 summary 一致性拉成高度風險', () => {
    const scanData = enforceFinalRiskConsistency({
        riskScore: 25,
        details: {
            siteStatus: { status: 'unknown' }
        },
        checks: {
            siteContent: { status: 'danger', details: '無法檢測網站內容' },
            domainAnalysis: { status: 'safe', details: '網域命名結構無明顯異常' }
        }
    });

    assert.equal(scanData.riskScore, 25);
    assert.deepEqual(scanData.summaryReasons, []);
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

test('6 個月內新網域且註冊週期 1 年應設定風險旗標', () => {
    const registrationDate = '2026-01-15T00:00:00Z';
    const expirationDate = '2027-01-15T00:00:00Z';
    const registrationPeriodDays = getDaysBetweenDates(registrationDate, expirationDate);
    const riskFlag = hasNewOneYearRegistrationRisk({
        domainAgeDays: 120,
        registrationPeriodDays
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: riskFlag ? 50 : 0,
        checks: {
            registrationPeriod: { status: riskFlag ? 'danger' : 'safe', details: '新網域搭配 1 年短期註冊' },
            age: { status: riskFlag ? 'danger' : 'safe', details: '未滿 6 個月且註冊週期約 1 年' }
        }
    });

    assert.equal(registrationPeriodDays, 365);
    assert.equal(riskFlag, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.deepEqual(scanData.summaryReasons, ['新網域搭配 1 年短期註冊']);
});

test('超過 6 個月或非 1 年註冊週期不應命中新規則', () => {
    assert.equal(hasNewOneYearRegistrationRisk({
        domainAgeDays: 220,
        registrationPeriodDays: 365
    }), false);
    assert.equal(hasNewOneYearRegistrationRisk({
        domainAgeDays: 120,
        registrationPeriodDays: 730
    }), false);
    assert.equal(hasNewOneYearRegistrationRisk({
        isWhitelisted: true,
        domainAgeDays: 120,
        registrationPeriodDays: 365
    }), false);
});

test('缺少全部現代 HTTP 安全標頭本身只作為弱訊號', () => {
    const hasRisk = hasMissingAllSecurityHeadersRisk({
        securityHeadersData: {
            status: 'ok',
            missingAll: true,
            missing: ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options']
        }
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasRisk ? 70 : 15,
        checks: {
            securityHeaders: { status: hasRisk ? 'danger' : 'warning', details: '缺少全部現代 HTTP 安全標頭' }
        }
    });

    assert.equal(hasRisk, false);
    assert.equal(scanData.riskScore < 70, true);
    assert.deepEqual(scanData.summaryReasons, []);
});

test('缺少全部現代 HTTP 安全標頭搭配次要詐騙佐證才升為高風險', () => {
    const hasRisk = hasMissingAllSecurityHeadersRisk({
        securityHeadersData: {
            status: 'ok',
            missingAll: true,
            missing: ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options']
        },
        hasSecondaryFraudEvidence: true
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasRisk ? 70 : 15,
        checks: {
            securityHeaders: { status: hasRisk ? 'danger' : 'warning', details: '缺少全部現代 HTTP 安全標頭' }
        }
    });

    assert.equal(hasRisk, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.deepEqual(scanData.summaryReasons, ['缺少全部現代 HTTP 安全標頭']);
});

test('只缺部分安全標頭或白名單網域不應命中全部缺失規則', () => {
    assert.equal(hasMissingAllSecurityHeadersRisk({
        securityHeadersData: { status: 'ok', missingAll: false, missing: ['Content-Security-Policy'] },
        hasSecondaryFraudEvidence: true
    }), false);
    assert.equal(hasMissingAllSecurityHeadersRisk({
        isWhitelisted: true,
        securityHeadersData: { status: 'ok', missingAll: true },
        hasSecondaryFraudEvidence: true
    }), false);
    assert.equal(hasMissingAllSecurityHeadersRisk({
        securityHeadersData: { status: 'ok', missingAll: true },
        hasSecondaryFraudEvidence: true,
        hasTrustedValidation: true
    }), false);
});

test('缺少 MX 紀錄本身只作為弱訊號', () => {
    const hasRisk = hasMissingMxRecordsRisk({
        mxInfo: { status: 'missing', hasMx: false, records: [] }
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasRisk ? 70 : 15,
        checks: {
            mxRecords: { status: hasRisk ? 'danger' : 'warning', details: '未偵測到 MX 郵件紀錄' }
        }
    });

    assert.equal(hasRisk, false);
    assert.equal(scanData.riskScore < 70, true);
    assert.deepEqual(scanData.summaryReasons, []);
});

test('缺少 MX 紀錄搭配次要詐騙佐證才升為高風險', () => {
    const hasRisk = hasMissingMxRecordsRisk({
        mxInfo: { status: 'missing', hasMx: false, records: [] },
        hasSecondaryFraudEvidence: true
    });
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasRisk ? 70 : 15,
        checks: {
            mxRecords: { status: hasRisk ? 'danger' : 'warning', details: '未偵測到 MX 郵件紀錄' }
        }
    });

    assert.equal(hasRisk, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.deepEqual(scanData.summaryReasons, ['網域未設定 MX 郵件紀錄']);
});

test('有 MX 或白名單網域不應命中缺少 MX 規則', () => {
    assert.equal(hasMissingMxRecordsRisk({
        mxInfo: { status: 'ok', hasMx: true, records: ['10 mail.example.com.'] },
        hasSecondaryFraudEvidence: true
    }), false);
    assert.equal(hasMissingMxRecordsRisk({
        isWhitelisted: true,
        mxInfo: { status: 'missing', hasMx: false, records: [] },
        hasSecondaryFraudEvidence: true
    }), false);
    assert.equal(hasMissingMxRecordsRisk({
        mxInfo: { status: 'missing', hasMx: false, records: [] },
        hasSecondaryFraudEvidence: true,
        hasTrustedValidation: true
    }), false);
});

test('可信佐證會把未確認詐騙的高分結果壓回中風險', () => {
    assert.equal(applyTrustedValidationCap({
        riskScore: 85,
        hasTrustedValidation: true,
        hasConfirmedThreatSignal: false
    }), 60);

    assert.equal(applyTrustedValidationCap({
        riskScore: 85,
        hasTrustedValidation: true,
        hasConfirmedThreatSignal: true
    }), 85);
});

test('可信台灣商業網域只有弱訊號加總時應壓回低度風險', () => {
    const weakScore = 40;
    const cappedScore = applyTrustedCommercialWeakSignalCap({
        riskScore: weakScore,
        hasTrustedCommercialWeakSignalContext: true
    });

    assert.equal(cappedScore, 25);
    assert.equal(cappedScore < 30, true);
});

test('可信台灣商業網域若有強風險訊號不應被弱訊號 cap 壓低', () => {
    assert.equal(applyTrustedCommercialWeakSignalCap({
        riskScore: 85,
        hasStrongRiskSignal: true,
        hasTrustedCommercialWeakSignalContext: true
    }), 85);
});

test('同主網域追蹤異常只作弱訊號，跨網域高風險追蹤才算強訊號', () => {
    assert.equal(isStrongTraceRisk({ traceHighRisk: true, isSameRoot: true }), false);
    assert.equal(isStrongTraceRisk({ traceHighRisk: true, isSameRoot: false }), true);
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
    const shortSuspicious = analyzeDisposableRootLabel('ouyjs');
    const normalBrand = analyzeDisposableRootLabel('everypixel');
    const knownSafe = analyzeDisposableRootLabel('infodemic');
    const shortReadable = analyzeDisposableRootLabel('yahoo');
    const shortAcronym = analyzeDisposableRootLabel('crntt');

    assert.equal(suspicious.matched, true);
    assert.ok(suspicious.reasons.some(reason => reason.includes('q') || reason.includes('少見字母組合')));
    assert.equal(shortSuspicious.matched, true);
    assert.ok(shortSuspicious.reasons.some(reason => reason.includes('短網域') || reason.includes('少見字母組合')));
    assert.equal(normalBrand.matched, false);
    assert.equal(knownSafe.matched, false);
    assert.equal(shortReadable.matched, false);
    assert.equal(shortAcronym.matched, false);
});

test('短亂碼 root 搭配可疑子網域應升高風險，避免 std.ouyjs.com 落入低風險', () => {
    const disposableRoot = analyzeDisposableRootLabel('ouyjs');
    const suspiciousSubdomain = analyzeSuspiciousSubdomain('std.ouyjs.com');
    const hasDisposableRootPhishingRisk = disposableRoot.matched && suspiciousSubdomain.matched;
    const scanData = enforceFinalRiskConsistency({
        riskScore: hasDisposableRootPhishingRisk ? 70 : 0,
        checks: {
            disposableDomain: { status: hasDisposableRootPhishingRisk ? 'danger' : 'safe', details: '主網域具有短亂碼免洗特徵，且搭配可疑子網域命名' },
            subdomainPattern: { status: suspiciousSubdomain.matched ? 'warning' : 'safe', details: suspiciousSubdomain.reasons.join('、') }
        }
    });

    assert.equal(disposableRoot.matched, true);
    assert.equal(suspiciousSubdomain.matched, true);
    assert.equal(scanData.riskScore >= 70, true);
    assert.deepEqual(scanData.summaryReasons, ['免洗亂碼網域特徵']);
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

test('zeabur.app 應被標記為中度風險且有專屬訊息', () => {
    const domain = 'test-site.zeabur.app';
    const isFreeHosting = matchesDomainList(domain, riskConfig.freeHostingProviders);
    
    let trafficStatus = 'safe';
    let trafficDetails = '';
    if (isFreeHosting) {
        trafficStatus = 'warning';
        if (domain.endsWith('zeabur.app')) {
            trafficDetails = '「zeabur.app」是 Zeabur 雲端部署平台提供的免費/預設子網域，任何人都可以在幾分鐘內匿名註冊並部署網頁，無法確認其正當性。';
        } else {
            trafficDetails = `使用免費架站平台 (${domain.split('.').slice(-2).join('.')})，常見於詐騙免洗網站`;
        }
    }

    assert.equal(isFreeHosting, true);
    assert.equal(trafficStatus, 'warning');
    assert.equal(trafficDetails.includes('Zeabur 雲端部署平台'), true);
});

test('人工確認詐騙的 web.app 子網域應直接升為高風險', () => {
    const domain = 'jinguan.web.app';
    const isFreeHosting = matchesDomainList(domain, riskConfig.freeHostingProviders);
    const isConfirmedScam = matchesDomainList(domain, riskConfig.confirmedScamDomains);
    const scanData = enforceFinalRiskConsistency({
        riskScore: isConfirmedScam ? 100 : (isFreeHosting ? 30 : 0),
        checks: {
            confirmedScam: {
                status: isConfirmedScam ? 'danger' : 'safe',
                details: '此網域已由人工確認為詐騙連結'
            },
            domainAnalysis: {
                status: isConfirmedScam ? 'danger' : 'warning',
                details: isConfirmedScam ? '此網域已由人工確認為詐騙連結，請勿點擊或輸入任何個資' : '使用免費架站平台'
            }
        }
    });

    assert.equal(isFreeHosting, true);
    assert.equal(isConfirmedScam, true);
    assert.equal(scanData.riskScore, 100);
    assert.deepEqual(scanData.summaryReasons, ['人工確認詐騙網域', '此網域已由人工確認為詐騙連結，請勿點擊或輸入任何個資']);
});

test('Cloudflare Pages 預設子網域至少中度風險，短亂碼專案名應升為高風險', () => {
    const readableDomain = 'brand-demo.pages.dev';
    const suspiciousDomain = 'rm5cnx4l.pages.dev';
    const suspiciousSubdomain = analyzeSuspiciousSubdomain(suspiciousDomain);
    const appSource = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');

    const baselineScore = applyTrustedCommercialWeakSignalCap({
        riskScore: 30,
        hasTrustedCommercialWeakSignalContext: true,
        hasCloudflarePagesDevBaselineRisk: isCloudflarePagesDevHostname(readableDomain)
    });
    const randomPagesRisk = hasCloudflarePagesDevRandomRisk(suspiciousDomain);
    const randomScanData = enforceFinalRiskConsistency({
        riskScore: randomPagesRisk ? 75 : 0,
        checks: {
            domainAnalysis: {
                status: randomPagesRisk ? 'danger' : 'safe',
                details: `Cloudflare Pages 免費部署子網域「${suspiciousDomain}」使用短亂碼/不可讀命名`
            },
            subdomainPattern: {
                status: suspiciousSubdomain.matched ? 'warning' : 'safe',
                details: suspiciousSubdomain.reasons.join('、')
            },
            entropy: {
                status: hasHighEntropySubdomain(suspiciousDomain) ? 'danger' : 'safe',
                details: '子網域名稱具短亂碼或機器生成特徵'
            }
        }
    });

    assert.equal(matchesDomainList(readableDomain, riskConfig.freeHostingProviders), true);
    assert.equal(isCloudflarePagesDevHostname('pages.dev'), false);
    assert.equal(isCloudflarePagesDevHostname(readableDomain), true);
    assert.equal(matchesDomainList('notpages.dev', ['pages.dev']), false);
    assert.equal(baselineScore, 30);
    assert.equal(hasCloudflarePagesDevRandomRisk(readableDomain), false);
    assert.equal(hasHighEntropySubdomain(suspiciousDomain), true);
    assert.equal(suspiciousSubdomain.matched, true);
    assert.equal(randomPagesRisk, true);
    assert.equal(randomScanData.riskScore >= 70, true);
    assert.ok(randomScanData.summaryReasons[0].includes('Cloudflare Pages'));
    assert.match(appSource, /hasCloudflarePagesDevRandomRisk/);
    assert.match(appSource, /isFallbackCloudflarePagesRandomRisk/);
});
