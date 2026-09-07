(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = { create: factory };
    else root.ScanCore = { create: factory };
})(typeof window !== 'undefined' ? window : globalThis, function ({ riskConfig = {}, policy, fetch = globalThis.fetch, DOMParser = globalThis.DOMParser, services = {} } = {}) {
    const window = { ScanPolicy: policy };
    const RISK_CONFIG = riskConfig;
    const getRiskList = key => Array.isArray(RISK_CONFIG[key]) ? RISK_CONFIG[key] : [];
        const getPseudoRandom = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash) / 2147483647;
        };

        const withTimeout = (promise, ms, fallbackValue) => {
            let timeoutId = null;
            return Promise.race([
                Promise.resolve(promise).catch(err => {
                    console.warn('檢測 API 回應失敗，改用備援結果', err);
                    return fallbackValue;
                }),
                new Promise(resolve => {
                    timeoutId = setTimeout(() => resolve(fallbackValue), ms);
                })
            ]).finally(() => {
                if (timeoutId) clearTimeout(timeoutId);
            });
        };

        const readJsonSafely = async (res, fallbackValue) => {
            if (!res || !res.ok) return fallbackValue;
            try {
                const text = await res.text();
                if (!text) return fallbackValue;
                return JSON.parse(text);
            } catch (err) {
                console.warn('API 回傳非 JSON，改用備援結果', err);
                return fallbackValue;
            }
        };

        const fetchJsonSafely = async (url, fallbackValue, options = {}) => {
            try {
                const res = await fetch(url, options);
                return await readJsonSafely(res, fallbackValue);
            } catch (err) {
                console.warn('API 連線失敗，改用備援結果', err);
                return fallbackValue;
            }
        };

        const calculateEntropy = (str) => {
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
        };

        const normalizeHostname = (hostname) => String(hostname || '').toLowerCase().replace(/^www\./, '');

        const sanitizeUrlInput = (value) => {
            return String(value || '')
                .normalize('NFKC')
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                .trim()
                .replace(/^[\s<>"'`「」『』【】\[\]（）()]+/g, '')
                .replace(/[\s<>"'`「」『』【】\[\]（）(),，.。;；!?！？]+$/g, '');
        };

        const normalizeInputHostname = (hostname) => {
            return String(hostname || '').toLowerCase().replace(/\.+$/g, '');
        };

        const isValidHostname = (hostname) => {
            const cleanHostname = normalizeInputHostname(hostname);
            if (!cleanHostname || cleanHostname.length > 253) return false;

            const labels = cleanHostname.split('.');
            if (labels.length < 2) return false;

            return labels.every(label => {
                return label.length >= 1 &&
                    label.length <= 63 &&
                    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
            }) && labels[labels.length - 1].length >= 2;
        };

        const parseUserUrl = (value) => {
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
        };

        const isTrackingUrlParamName = (name) => {
            const lowerName = String(name || '').toLowerCase();
            return getRiskList('trackingUrlParams').some(rule => {
                const lowerRule = String(rule || '').toLowerCase();
                if (lowerRule.endsWith('*')) return lowerName.startsWith(lowerRule.slice(0, -1));
                return lowerName === lowerRule;
            });
        };

        const isVolatileUrlParam = (name, value = '') => {
            const lowerName = String(name || '').toLowerCase();
            const rawValue = String(value || '');
            const lowerValue = rawValue.toLowerCase();
            if (getRiskList('volatileUrlParams').some(rule => lowerName === String(rule || '').toLowerCase())) return true;
            if (/^(?:valid|verify|auth|session)[_-]?\d{8,14}[_-][a-f0-9]{12,}$/i.test(rawValue)) return true;
            if (/^(?:valid|expire|expires|ts|time|timestamp|nonce|rnd|rand|cb)$/i.test(lowerName) && /^[a-z0-9_-]{8,80}$/i.test(rawValue)) return true;
            if (/(?:time|timestamp|expire|expires|valid|nonce)/i.test(lowerName) && /^\d{10,14}$/.test(rawValue)) return true;
            if (lowerName.startsWith('_') && /^[a-z0-9_-]{16,120}$/i.test(rawValue) && (/\d/.test(rawValue) || /[a-f0-9]{16,}/i.test(rawValue))) return true;
            return false;
        };

        const sanitizeUrlForRiskScoring = (rawUrl) => {
            try {
                const parsed = new URL(rawUrl);
                const removedTrackingParams = [];
                const removedVolatileParams = [];
                [...new Set([...parsed.searchParams.keys()])].forEach(name => {
                    const values = parsed.searchParams.getAll(name);
                    const removeAsVolatile = values.some(value => isVolatileUrlParam(name, value));
                    if (removeAsVolatile) {
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
                    rawHref: rawUrl,
                    rawUrl
                };
            } catch (e) {
                return { href: rawUrl, rawHref: rawUrl, rawUrl, removedTrackingParams: [], removedVolatileParams: [], removedParams: [] };
            }
        };

        const toHttpFallbackUrl = (value) => {
            try {
                const parsed = new URL(value);
                if (parsed.protocol !== 'https:') return '';
                parsed.protocol = 'http:';
                return parsed.href;
            } catch (e) {
                return '';
            }
        };

        const buildCrawlerCandidateUrls = (urls, options = {}) => {
            const preferHttpFallback = options.preferHttpFallback === true;
            const candidates = [];
            const add = (value) => {
                if (value && !candidates.includes(value)) candidates.push(value);
            };

            urls.filter(Boolean).forEach(value => {
                const httpFallback = toHttpFallbackUrl(value);
                if (preferHttpFallback && httpFallback) add(httpFallback);
                add(value);
                if (!preferHttpFallback && httpFallback) add(httpFallback);
            });

            return candidates;
        };

        const isOfficialTaiwanGovDomain = (hostname) => {
            const cleanHostname = normalizeHostname(String(hostname || ''));
            return cleanHostname === 'gov.tw' || cleanHostname.endsWith('.gov.tw');
        };

        const isSameRootDomain = (a, b) => {
            const cleanA = normalizeHostname(a);
            const cleanB = normalizeHostname(b);
            return cleanA === cleanB || cleanA.endsWith('.' + cleanB) || cleanB.endsWith('.' + cleanA);
        };

        const isKnownUrlShortenerDomain = (hostname) => {
            const cleanHostname = normalizeHostname(hostname);
            return getRiskList('urlShorteners').some(domain => {
                const cleanDomain = normalizeHostname(domain);
                return cleanHostname === cleanDomain || cleanHostname.endsWith('.' + cleanDomain);
            });
        };

        const getOfficialShortenerDestinationDomains = (hostname) => {
            const cleanHostname = normalizeHostname(hostname);
            const policies = RISK_CONFIG.officialShortenerDestinations || {};
            const policyDomain = Object.keys(policies).find(domain => {
                const cleanDomain = normalizeHostname(domain);
                return cleanHostname === cleanDomain || cleanHostname.endsWith('.' + cleanDomain);
            });
            return policyDomain ? policies[policyDomain] : [];
        };

        const isVerifiedOfficialShortenerDestination = (inputHostname, destinationHostname) => {
            const allowedDestinations = getOfficialShortenerDestinationDomains(inputHostname);
            const cleanDestination = normalizeHostname(destinationHostname);
            return allowedDestinations.length > 0 && allowedDestinations.some(domain => {
                const cleanDomain = normalizeHostname(domain);
                return cleanDestination === cleanDomain || cleanDestination.endsWith('.' + cleanDomain);
            });
        };

        const isTrustedGlobalDomain = (hostname) => {
            return getRiskList('trustedGlobalDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isTrustedEcommerceDomain = (hostname) => {
            return getRiskList('trustedEcommerceRootDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isTrustedTaiwanServiceDomain = (hostname) => {
            return getRiskList('trustedTaiwanServiceDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isTrustedFinancialServiceDomain = (hostname) => {
            return getRiskList('trustedFinancialServiceDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isTrustedGovernmentServiceDomain = (hostname) => {
            return getRiskList('trustedGovernmentServiceDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isTrustedPublicInterestDomain = (hostname) => {
            return getRiskList('trustedPublicInterestDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isGlobalPaymentGatewayDomain = (hostname) => {
            return getRiskList('globalPaymentGatewayDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isConfirmedScamDomain = (hostname) => {
            return getRiskList('confirmedScamDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isManualHighRiskDomain = (hostname) => {
            return getRiskList('manualHighRiskDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isVerifiedSafeRootDomain = (hostname, whitelist = []) => {
            return isOfficialTaiwanGovDomain(hostname) ||
                isTrustedGlobalDomain(hostname) ||
                isTrustedEcommerceDomain(hostname) ||
                isTrustedTaiwanServiceDomain(hostname) ||
                isTrustedFinancialServiceDomain(hostname) ||
                isTrustedGovernmentServiceDomain(hostname) ||
                isTrustedPublicInterestDomain(hostname) ||
                whitelist.some(domain => isSameRootDomain(hostname, domain));
        };

        const shouldSkipAiBrandAnalysis = (hostname, whitelist = []) => isVerifiedSafeRootDomain(hostname, whitelist);

        const isTrustedResourceDomain = (hostname) => {
            const trustedDomains = getRiskList('trustedResourceDomains');
            return trustedDomains.some(domain => isSameRootDomain(hostname, domain));
        };

        const hasRiskyHostnamePattern = (hostname) => {
            const lowerHostname = normalizeHostname(hostname);
            const riskyTlds = [...getRiskList('highRiskTlds'), ...getRiskList('suspiciousTlds')];
            const riskyDomains = [
                ...getRiskList('urlShorteners'),
                ...getRiskList('freeHostingProviders')
            ];
            return riskyTlds.some(tld => lowerHostname.endsWith(tld)) ||
                riskyDomains.some(domain => isSameRootDomain(lowerHostname, domain));
        };

        const isCloudflarePagesDevHostname = (hostname) => {
            const cleanHostname = normalizeHostname(hostname);
            return cleanHostname !== 'pages.dev' && isSameRootDomain(cleanHostname, 'pages.dev');
        };

        const isNetlifyAppHostname = (hostname) => {
            const cleanHostname = normalizeHostname(hostname);
            return cleanHostname !== 'netlify.app' && isSameRootDomain(cleanHostname, 'netlify.app');
        };

        const isGithubPagesHostname = (hostname) => {
            const cleanHostname = normalizeHostname(hostname);
            return cleanHostname !== 'github.io' && isSameRootDomain(cleanHostname, 'github.io');
        };

        const hasGeneratedNetlifySubdomain = (hostname) => {
            if (!isNetlifyAppHostname(hostname)) return false;
            const projectLabel = normalizeHostname(hostname).split('.')[0] || '';
            return /^[a-z]+-[a-z]+-[a-z0-9]{5,}$/i.test(projectLabel) ||
                /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]{5,}$/i.test(projectLabel);
        };

        const isEmailTrackingRedirector = (hostname) => {
            const trackers = getRiskList('emailTrackingRedirectors');
            return trackers.some(domain => isSameRootDomain(hostname, domain));
        };

        const extractNestedUrls = (rawUrl) => {
            const variants = [String(rawUrl || '')];
            for (let i = 0; i < 2; i++) {
                try {
                    const decoded = decodeURIComponent(variants[variants.length - 1]);
                    if (!variants.includes(decoded)) variants.push(decoded);
                } catch (e) { break; }
            }

            const found = [];
            try {
                const parsed = new URL(rawUrl);
                parsed.searchParams.forEach(value => {
                    if (!value || value.length < 12 || !/^[A-Za-z0-9+/=_-]+$/.test(value)) return;
                    const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
                    const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=');
                    try {
                        const decoded = atob(paddedValue);
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
        };

        const hasFinancialPhishingText = (text) => {
            const haystack = decodeSignalText(text || '');
            return getRiskList('financialPhishingKeywords').some(keyword => haystack.includes(keyword.toLowerCase()));
        };

        const hasPublicUtilityScamText = (text) => {
            const haystack = decodeSignalText(text || '');
            return getRiskList('publicUtilityScamKeywords').some(keyword => haystack.includes(keyword.toLowerCase()));
        };

        const hasLogisticsScamText = (text) => {
            const haystack = decodeSignalText(text || '');
            return getRiskList('logisticsScamKeywords').some(keyword => haystack.includes(keyword.toLowerCase()));
        };

        const hasOfficialFlowPath = (fullUrl) => {
            const haystack = decodeSignalText(fullUrl || '');
            return getRiskList('officialFlowPathKeywords').some(keyword => haystack.includes(keyword.toLowerCase()));
        };

        const hasPunycodeOrUnicodeHostname = (hostname, rawUrl = '') => {
            const lowerHostname = String(hostname || '').toLowerCase();
            return lowerHostname.includes('xn--') || /[^\x00-\x7F]/.test(String(rawUrl || ''));
        };

        const createEmptyPageSignals = () => ({
            sensitiveFields: { count: 0, highRiskCount: 0, lowRiskCount: 0, examples: [] },
            externalResources: { count: 0, formActionCount: 0, iframeCount: 0, suspiciousCount: 0, suspiciousIframeCount: 0, suspiciousScriptCount: 0, examples: [] },
            downloadSignals: { apkUrlCount: 0, installKeywordCount: 0, dynamicDownloadCount: 0, suspiciousPath: false, suspiciousPathFragments: [], examples: [] },
            govAgencySignals: { official: false, matched: false, siteName: '', agencyName: '', rootAgency: '', rootDomain: '', evidence: [], details: '' },
            pageBrandSignals: { matched: false, brandName: null, keyword: null, source: null },
            urgencySignals: { count: 0, examples: [] },
            trustSignals: { score: 0, matched: false, reasons: [] },
            seoSignals: { score: 0, matched: false, reasons: [] },
            languageSignals: { status: 'unknown', matched: false, details: '無法判定頁面語言一致性' },
            businessIdentitySignals: { score: 0, matched: false, names: [], taxIds: [], hasTaxId: false, reasons: [] },
            lineOfficialSignals: { matched: false, urls: [], reason: '' },
            ecommerceTrustSignals: { score: 0, matched: false, reasons: [], categories: [] },
            shoppingScamSignals: { score: 0, matched: false, reasonCount: 0, reasons: [], keywordCount: 0, formFieldCount: 0, imageCount: 0, linkCount: 0, hasOrderForm: false, hasAliziOrderSystem: false, hasMerchantInfo: false, hasCommerceOffer: false, hasTemplateDemoMarker: false, hasOnePageStructure: false, stockImageCount: 0, catalogPriceCount: 0, unverifiedCommerceReasons: [] },
            jobTaskScamSignals: { score: 0, matched: false, reasons: [], jobMatches: [], moneyMatches: [], taskMatches: [], identityMatches: [], hasJobFacade: false, hasMoneyFlow: false, hasTaskMechanics: false, hasIdentityCollection: false },
            regulatedTobaccoSalesSignals: { score: 0, matched: false, reasons: [], productMatches: [], salesMatches: [], hasPriceSignal: false, hasLinePurchaseSignal: false }
        });

        const decodeSignalText = (text) => {
            const raw = String(text || '');
            const variants = [raw];
            try { variants.push(decodeURIComponent(raw)); } catch (e) { }
            return [...new Set(variants)].join('\n').toLowerCase();
        };

        const normalizeBusinessName = (value) => {
            return String(value || '')
                .toLowerCase()
                .replace(/公司名稱|營業人名稱|商店名稱|企業名稱|申請人|註冊人|注册人/g, '')
                .replace(/[^\p{Script=Han}a-z0-9]/gu, '');
        };

        const extractBusinessNames = (text) => {
            const source = String(text || '');
            const matches = [];
            const regex = /(?:公司名稱|營業人名稱|商店名稱|企業名稱)?[:：\s　]*([\u4e00-\u9fffA-Za-z0-9・]{2,32}(?:股份有限公司|有限公司|企業社|商行|工作室))/g;
            let match;
            while ((match = regex.exec(source)) !== null) {
                matches.push(match[1].trim());
            }
            return [...new Set(matches)].slice(0, 6);
        };

        const analyzeSuspiciousDownloadPath = (fullUrl) => {
            try {
                const path = new URL(fullUrl).pathname.toLowerCase();
                const fragments = getRiskList('suspiciousDownloadPathFragments');
                const matched = fragments.filter(fragment => path.includes(fragment.toLowerCase()));
                return { matched: matched.length > 0, fragments: matched };
            } catch (e) {
                return { matched: false, fragments: [] };
            }
        };

        const analyzeDownloadSignals = (doc, rawText, fullUrl) => {
            const textParts = [rawText || '', fullUrl || ''];
            if (doc) {
                doc.querySelectorAll('a[href], area[href], link[href]').forEach(el => textParts.push(el.getAttribute('href') || ''));
                doc.querySelectorAll('[onclick], [data-url], [data-href], [data-download], [data-apk]').forEach(el => {
                    ['onclick', 'data-url', 'data-href', 'data-download', 'data-apk'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                });
                doc.querySelectorAll('script').forEach(el => textParts.push(el.textContent || ''));
                textParts.push(doc.body ? doc.body.textContent : '');
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            const apkMatches = haystack.match(/(?:https?:\/\/|\/|[\w.-])[\w./?=&%:+-]*\.apk(?:[?#][\w./?=&%:+-]*)?/gi) || [];
            const installKeywords = getRiskList('apkInstallKeywords').filter(keyword => haystack.includes(keyword.toLowerCase()));
            const dynamicPatterns = [
                /(?:window\.)?open\s*\(/i,
                /location\.(?:href|assign|replace)\s*[=(]/i,
                /createelement\s*\(\s*['"]a['"]\s*\)/i,
                /\.click\s*\(\s*\)/i,
                /download\s*=/i,
                /fetch\s*\(/i
            ];
            const dynamicDownloadCount = dynamicPatterns.filter(pattern => pattern.test(haystack)).length;
            const suspiciousPath = analyzeSuspiciousDownloadPath(fullUrl);

            return {
                apkUrlCount: [...new Set(apkMatches)].length,
                installKeywordCount: installKeywords.length,
                dynamicDownloadCount,
                suspiciousPath: suspiciousPath.matched,
                suspiciousPathFragments: suspiciousPath.fragments,
                examples: [...new Set([...apkMatches, ...installKeywords, ...suspiciousPath.fragments])].slice(0, 3)
            };
        };

        const getComparableDomainText = (hostname) => {
            return normalizeHostname(hostname).replace(/[^a-z0-9]/g, '');
        };

        const levenshteinDistance = (a, b) => {
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
        };

        const damerauLevenshteinDistance = (a, b) => {
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
        };

        const checkBrandSimilarity = (hostname, currentWhitelist = []) => {
            const domainText = getComparableDomainText(hostname);
            const protectedBrands = getRiskList('protectedBrands');

            for (const brand of protectedBrands) {
                const officialDomains = brand.domains || [];
                const isOfficialDomain = officialDomains.some(domain => isSameRootDomain(hostname, domain));
                const isWhitelisted = isVerifiedSafeRootDomain(hostname, currentWhitelist);
                if (isOfficialDomain || isWhitelisted) continue;

                for (const keyword of (brand.keywords || [])) {
                    const normalizedKeyword = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (!normalizedKeyword || normalizedKeyword.length < 3) continue;

                    const containsBrand = domainText.includes(normalizedKeyword);
                    let closeTypo = false;
                    // Numeric brand codes such as 711 are too short for one-character typo matching:
                    // unrelated labels like tibet311 would otherwise become a false brand impersonation.
                    if (/[a-z]/.test(normalizedKeyword)) {
                        for (let i = 0; i <= domainText.length - normalizedKeyword.length; i++) {
                            const segment = domainText.slice(i, i + normalizedKeyword.length);
                            if (damerauLevenshteinDistance(segment, normalizedKeyword) <= 1) {
                                closeTypo = true;
                                break;
                            }
                        }
                    }

                    if (containsBrand || closeTypo) {
                        return { matched: true, brandName: brand.name, keyword };
                    }
                }
            }

            return { matched: false, brandName: null, keyword: null };
        };

        const getDomainParts = (hostname) => {
            const parts = normalizeHostname(hostname).split('.').filter(Boolean);
            const secondLevelTLDs = [
                'com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw',
                'co.uk', 'org.uk', 'gov.uk',
                'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
                'com.hk', 'org.hk',
                'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn',
                'eu.cc', 'github.io'
            ];
            const lastTwo = parts.slice(-2).join('.');
            const registeredSize = secondLevelTLDs.includes(lastTwo) ? 3 : 2;
            return {
                subdomainLabels: parts.length > registeredSize ? parts.slice(0, -registeredSize) : [],
                rootLabel: parts.length >= registeredSize ? parts[parts.length - registeredSize] : (parts[0] || ''),
                registrableDomain: parts.length >= registeredSize ? parts.slice(-registeredSize).join('.') : parts.join('.')
            };
        };

        const TAIWAN_GOV_ROOT_AGENCY_NAMES = {
            'gov.tw': '中華民國政府',
            'kcg.gov.tw': '高雄市政府',
            'taipei.gov.tw': '臺北市政府',
            'ntpc.gov.tw': '新北市政府',
            'tycg.gov.tw': '桃園市政府',
            'taichung.gov.tw': '臺中市政府',
            'tainan.gov.tw': '臺南市政府'
        };

        const cleanDisplayText = (value) => String(value || '')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const chooseGovernmentSiteName = (candidates = [], rootAgency = '') => {
            const genericTitles = new Set(['首頁', '網站導覽', '最新消息', '公告訊息', '查詢服務']);
            const root = cleanDisplayText(rootAgency);
            for (const rawCandidate of candidates) {
                const cleaned = cleanDisplayText(rawCandidate);
                if (!cleaned) continue;
                const segments = cleaned
                    .split(/\s*(?:[|｜\-–—]|::|＞|>|\/)\s*/)
                    .map(segment => cleanDisplayText(segment))
                    .filter(segment => segment.length >= 2 && !genericTitles.has(segment));
                const preferred = segments.find(segment => root && segment !== root && !segment.includes('javascript')) ||
                    segments.find(segment => !segment.includes('javascript')) ||
                    cleaned;
                if (preferred) return preferred.slice(0, 40);
            }
            return '';
        };

        const extractGovernmentAgencyName = (text) => {
            const source = cleanDisplayText(text);
            const labelPattern = /(主管機關|主辦單位|協辦單位|承辦單位|公告單位|申請單位|服務機關|發布單位|聯絡單位|承辦機關|機關名稱|單位)[:：\s　]*(.{0,80}?)(?=(?:地址|電話|傳真|信箱|服務時間|公告內容|申請時間|諮詢專線|$))/g;
            const agencyPattern = /((?:[\u4e00-\u9fff]{2,4}[市縣])?政府[\u4e00-\u9fff]{1,16}(?:局|處|所|中心|公所|署|部|會|辦公室|管理處|管理署)|[\u4e00-\u9fff]{2,24}(?:部|會|署|局|處|所|公所|中心))/;
            let match;
            while ((match = labelPattern.exec(source)) !== null) {
                const agency = cleanDisplayText(match[2].match(agencyPattern)?.[1] || '');
                if (agency && !/(網站資料開放宣告|隱私權|網路安全政策)/.test(agency)) return agency;
            }

            return cleanDisplayText(source.match(agencyPattern)?.[1] || '');
        };

        const analyzeGovernmentAgencySignals = (doc, rawText = '', fullUrl = '') => {
            let hostname = '';
            try { hostname = new URL(fullUrl).hostname.toLowerCase(); } catch (e) { }
            const normalizedHostname = normalizeHostname(hostname);
            const official = isOfficialTaiwanGovDomain(normalizedHostname);
            if (!official) return createEmptyPageSignals().govAgencySignals;

            const { registrableDomain } = getDomainParts(normalizedHostname);
            const rootAgency = TAIWAN_GOV_ROOT_AGENCY_NAMES[registrableDomain] || '';
            const metaCandidates = [];
            if (doc) {
                doc.querySelectorAll('meta[property="og:title"], meta[property="og:site_name"], meta[name="application-name"]').forEach(el => {
                    metaCandidates.push(el.getAttribute('content') || '');
                });
            }
            const siteName = chooseGovernmentSiteName([doc?.title || '', ...metaCandidates], rootAgency);
            const pageText = [
                rawText || '',
                doc?.title || '',
                doc?.body?.textContent || '',
                ...metaCandidates
            ].join('\n');
            const agencyName = extractGovernmentAgencyName(pageText);
            const evidence = [
                siteName ? { label: '頁面名稱', value: siteName } : null,
                agencyName ? { label: '主管/申請單位', value: agencyName } : null,
                rootAgency && rootAgency !== agencyName ? { label: '政府根網域', value: rootAgency } : null,
                registrableDomain ? { label: '網域根', value: registrableDomain } : null
            ].filter(Boolean);
            const matched = !!agencyName || !!rootAgency;
            const details = matched
                ? `已辨識為台灣政府官方網域${siteName ? `；頁面名稱「${siteName}」` : ''}${agencyName ? `；機關/單位「${agencyName}」` : (rootAgency ? `；政府根網域「${rootAgency}」` : '')}`
                : '已辨識為台灣政府官方網域，但未能從頁面內容擷取明確機關名稱';

            return {
                official,
                matched,
                siteName,
                agencyName,
                rootAgency,
                rootDomain: registrableDomain,
                evidence,
                details
            };
        };

        const hasReadableVowelPattern = (text) => /[aeiou]/i.test(text) && !/[bcdfghjklmnpqrstvwxz]{4,}/i.test(text);

        const analyzeDisposableRootLabel = (rootLabel) => {
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
        };

        const hasSensitiveUrlParam = (rawUrl) => {
            try {
                const parsed = new URL(rawUrl);
                const sensitiveKeys = getRiskList('sensitiveUrlParams')
                    .map(key => String(key).toLowerCase().replace(/=$/, ''))
                    .filter(Boolean);
                for (const key of parsed.searchParams.keys()) {
                    const normalizedKey = key.toLowerCase();
                    if (sensitiveKeys.includes(normalizedKey)) return true;
                }
            } catch (e) { }
            return false;
        };

        const analyzeSuspiciousSubdomain = (hostname) => {
            const { subdomainLabels, rootLabel } = getDomainParts(hostname);
            const safeLabels = getRiskList('safeSubdomainLabels');
            const rootTokens = rootLabel.split(/[-_]+/).filter(token => token.length >= 3);
            const suspiciousReasons = [];

            const candidateLabels = subdomainLabels.filter(label => {
                const clean = label.toLowerCase();
                return clean && !safeLabels.includes(clean);
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

            const uniqueReasons = [...new Set(suspiciousReasons)];
            return {
                matched: uniqueReasons.length > 0,
                label: candidateLabels[0] || '',
                reasons: uniqueReasons
            };
        };

        const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const getPageBrandKeywordContexts = (haystack, keyword) => {
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
        };

        const isBenignCommerceBrandReference = (brandName, keyword, contexts) => {
            const appleMetadataPattern = /(?:-apple-system|apple-system|font-family|apple-touch-icon|apple-touch-startup-image)/i;
            const appleImpersonationPattern = /(apple\s*id|帳戶|賬戶|驗證|認證|異常|停權|凍結|密碼|otp|信用卡|卡號|verify|verification|account|password)/i;
            if (brandName === 'Apple' && contexts.length > 0 && contexts.every(context =>
                appleMetadataPattern.test(context) && !appleImpersonationPattern.test(context)
            )) {
                return true;
            }

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
        };

        const analyzePageBrandSignals = (doc, fullUrl, rawText = '') => {
            let domainHostname = '';
            try { domainHostname = new URL(fullUrl).hostname; } catch (e) { }

            const rawBrandText = String(rawText || '')
                .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
                .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
            const textParts = [rawBrandText, doc?.title || ''];
            if (doc) {
                doc.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:site_name"], img[alt], [aria-label], link[rel*="icon"]').forEach(el => {
                    ['content', 'alt', 'aria-label', 'href'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                });
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            for (const brand of getRiskList('protectedBrands')) {
                const officialDomains = brand.domains || [];
                if (officialDomains.some(domain => isSameRootDomain(domainHostname, domain))) continue;

                const keywords = [brand.name, ...(brand.keywords || [])].filter(Boolean);
                const matchedKeyword = keywords.find(keyword => {
                    const contexts = getPageBrandKeywordContexts(haystack, keyword);
                    return contexts.length > 0 && !isBenignCommerceBrandReference(brand.name, keyword, contexts);
                });
                if (matchedKeyword) {
                    return { matched: true, brandName: brand.name, keyword: matchedKeyword, source: 'page' };
                }
            }

            return { matched: false, brandName: null, keyword: null, source: null };
        };

        const analyzeUrgencySignals = (doc, rawText = '') => {
            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || ''];
            const haystack = decodeSignalText(textParts.join('\n'));
            const examples = getRiskList('urgencyScamKeywords')
                .filter(keyword => haystack.includes(keyword.toLowerCase()))
                .slice(0, 5);

            return { count: examples.length, examples };
        };

        const analyzeTrustSignals = (doc, rawText = '', fullUrl = '') => {
            let domainHostname = '';
            try { domainHostname = new URL(fullUrl).hostname.toLowerCase(); } catch (e) { }

            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || ''];
            if (doc) {
                doc.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:site_name"], link[rel="canonical"]').forEach(el => {
                    ['content', 'href'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                });
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            const { rootLabel } = getDomainParts(domainHostname);
            const compactRoot = String(rootLabel || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const reasons = [];

            if (compactRoot.length >= 5 && haystack.includes(compactRoot)) {
                reasons.push('頁面標題或內容與主網域名稱相符');
            }

            const taiwanOfficialTerms = [
                'ministry of foreign affairs',
                'mofa',
                'republic of china (taiwan)',
                'taiwan today',
                '中華民國外交部',
                '外交部'
            ];
            const hasTaiwanOfficialSemantic = domainHostname.endsWith('.tw') &&
                taiwanOfficialTerms.some(term => haystack.includes(term.toLowerCase()));
            if (hasTaiwanOfficialSemantic) {
                reasons.push('頁面內容出現台灣官方或外交部相關語意');
            }

            const score = Math.min(40, reasons.length * 20);
            return {
                score,
                matched: score >= 20,
                reasons: [...new Set(reasons)]
            };
        };

        const analyzeSeoSignals = (doc, rawText = '') => {
            const text = String(rawText || '');
            const hasTitle = !!doc?.title && doc.title.trim().length >= 6;
            const hasDescription = !!doc?.querySelector('meta[name="description"][content]');
            const ogTags = doc ? doc.querySelectorAll('meta[property^="og:"][content]').length : 0;
            const hasCanonical = !!doc?.querySelector('link[rel="canonical"][href]');
            const hasStructuredData = !!doc?.querySelector('script[type="application/ld+json"]') || /schema\.org/i.test(text);
            const reasons = [];
            if (hasTitle && hasDescription) reasons.push('具備標題與 meta description');
            if (ogTags >= 2) reasons.push('具備 Open Graph 社群分享 metadata');
            if (hasCanonical) reasons.push('具備 canonical URL');
            if (hasStructuredData) reasons.push('具備結構化資料或 schema.org 訊號');
            const score =
                (hasTitle ? 10 : 0) +
                (hasDescription ? 15 : 0) +
                (ogTags >= 2 ? 20 : 0) +
                (hasCanonical ? 10 : 0) +
                (hasStructuredData ? 10 : 0);
            return {
                score: Math.min(65, score),
                matched: score >= 35,
                reasons
            };
        };

        const analyzeLanguageSignals = (doc, rawText = '', fullUrl = '') => {
            let hostname = '';
            try { hostname = new URL(fullUrl).hostname.toLowerCase(); } catch (e) { }
            const htmlLang = (doc?.documentElement?.getAttribute('lang') || '').toLowerCase();
            const visibleText = String(doc?.body?.textContent || rawText || '').replace(/\s+/g, '');
            const zhCount = (visibleText.match(/[\u4e00-\u9fff]/g) || []).length;
            const latinCount = (visibleText.match(/[a-z]/gi) || []).length;
            const dominantLanguage = zhCount >= 30 && zhCount >= latinCount * 0.2 ? 'zh' : (latinCount >= 80 ? 'latin' : 'unknown');
            const langDeclaresZh = /^zh|tw|hant/.test(htmlLang);
            const langDeclaresForeign = /^(en|ja|ko|vi|th|id|ru|fr|de|es)/.test(htmlLang);
            const isTaiwanDomain = hostname.endsWith('.tw');
            const mismatch = (dominantLanguage === 'zh' && langDeclaresForeign) ||
                (isTaiwanDomain && htmlLang && !langDeclaresZh && dominantLanguage === 'zh');
            const matched = isTaiwanDomain && dominantLanguage === 'zh' && (!htmlLang || langDeclaresZh);
            return {
                status: mismatch ? 'warning' : (matched ? 'safe' : 'unknown'),
                matched,
                details: mismatch
                    ? `頁面主要為中文，但 HTML lang="${htmlLang}"，需留意語言標記不一致`
                    : (matched ? `台灣網域頁面語言與 HTML 語系一致${htmlLang ? ` (${htmlLang})` : ''}` : '未取得足夠語言一致性訊號，此項不作為風險加權'),
                dominantLanguage,
                htmlLang
            };
        };

        const analyzeBusinessIdentitySignals = (doc, rawText = '') => {
            const source = [rawText || '', doc?.body?.textContent || '', doc?.title || ''].join('\n');
            const names = extractBusinessNames(source);
            const taxIds = [];
            const taxIdRegex = /(?:統一編號|統編|公司統編|營利事業統一編號|營業人統一編號|vatid)["'\s:=：　-]{0,16}(\d{8})/gi;
            let taxIdMatch;
            while ((taxIdMatch = taxIdRegex.exec(source)) !== null) {
                taxIds.push(taxIdMatch[1]);
            }
            const uniqueTaxIds = [...new Set(taxIds)].slice(0, 3);
            const hasTaxId = uniqueTaxIds.length > 0;
            const reasons = [];
            if (names.length > 0) reasons.push('頁面揭露公司/商家名稱：' + names.slice(0, 2).join('、'));
            if (hasTaxId) reasons.push('頁面揭露統一編號：' + uniqueTaxIds.join('、'));
            const score = Math.min(45, (names.length > 0 ? 25 : 0) + (hasTaxId ? 20 : 0));
            return {
                score,
                matched: score >= 25,
                names,
                taxIds: uniqueTaxIds,
                hasTaxId,
                reasons
            };
        };

        const analyzeLineOfficialSignals = (doc, rawText = '', fullUrl = '') => {
            const urls = [];
            if (doc) {
                doc.querySelectorAll('a[href]').forEach(el => {
                    const href = el.getAttribute('href') || '';
                    try {
                        const parsed = new URL(href, fullUrl);
                        if (/^(lin\.ee|line\.me)$/i.test(parsed.hostname.replace(/^www\./, ''))) {
                            urls.push(parsed.href);
                        }
                    } catch (e) { }
                });
            }
            const haystack = decodeSignalText(`${rawText}\n${urls.join('\n')}`);
            const hasOfficialContext = /(官方line|line官方|官方帳號|官方賬號|line客服|客服line|@[\w.-]{3,})/i.test(haystack);
            return {
                matched: urls.length > 0 && hasOfficialContext,
                urls: [...new Set(urls)].slice(0, 3),
                reason: urls.length > 0
                    ? (hasOfficialContext ? '偵測到 LINE 官方帳號或客服語境連結' : '偵測到 LINE 連結，但缺少官方帳號語境')
                    : '未偵測到 LINE 官方帳號連結'
            };
        };

        const analyzeEcommerceTrustSignals = (doc, rawText = '', fullUrl = '') => {
            let domainHostname = '';
            try { domainHostname = new URL(fullUrl).hostname.toLowerCase(); } catch (e) { }

            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || '', fullUrl || ''];
            if (doc) {
                doc.querySelectorAll('script[src], link[href], form[action], a[href], meta[name="generator"], meta[name="description"], meta[property="og:site_name"]').forEach(el => {
                    ['src', 'href', 'action', 'content'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                    textParts.push(el.textContent || '');
                });
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            const platformFootprints = [
                'woocommerce', 'wc-cart-fragments', 'wp-content/plugins/woocommerce',
                'shopify', 'cdn.shopify.com', 'shopline', 'shoplineapp', 'cyberbiz',
                '91app', 'waca', 'qdm', 'meepshop', 'easystore', 'opencart',
                'quickper', 'cdn.quickper.com', '1shop', '1shop一頁購物',
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
            const hasMailOrTelLink = doc ? !!doc.querySelector('a[href^="mailto:"], a[href^="tel:"]') : /(?:mailto:|tel:)/i.test(haystack);
            const hasTaiwanAddress = /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣).{0,24}(路|街|巷|弄|號)/.test(haystack);
            const hasCourseCommerceFootprint = matchedCourseCommerce.length >= 3 ||
                (/\/courses?\//i.test(fullUrl) && matchedCourseCommerce.length >= 2);
            const hasSameDomainCheckout = doc ? Array.from(doc.querySelectorAll('a[href], form[action]')).some(el => {
                const rawTarget = el.getAttribute('href') || el.getAttribute('action') || '';
                if (!/(cart|checkout|order|payment|結帳|購物車)/i.test(rawTarget + ' ' + (el.textContent || ''))) return false;
                try {
                    const parsed = new URL(rawTarget, fullUrl);
                    return domainHostname && isSameRootDomain(parsed.hostname, domainHostname);
                } catch (e) {
                    return false;
                }
            }) : false;

            const categories = [];
            const reasons = [];
            if (matchedPlatforms.length > 0) {
                categories.push('platform');
                reasons.push(`標準電商/CMS 足跡：${[...new Set(matchedPlatforms)].slice(0, 2).join('、')}`);
            }
            if (matchedCart.length > 0 || hasSameDomainCheckout) {
                categories.push('cart');
                reasons.push('偵測到同網域購物車或結帳流程');
            }
            if (matchedContact.length >= 2 || hasMailOrTelLink || hasTaiwanAddress) {
                categories.push('contact');
                reasons.push('具備可驗證聯絡資訊');
            }
            if (matchedPolicy.length >= 2) {
                categories.push('policy');
                reasons.push('具備退換貨、隱私權或付款配送政策');
            }
            if (hasCourseCommerceFootprint) {
                categories.push('course');
                reasons.push(`具備課程/知識商務頁足跡：${[...new Set(matchedCourseCommerce)].slice(0, 3).join('、')}`);
            }

            const score = Math.min(100,
                (matchedPlatforms.length > 0 ? 30 : 0) +
                ((matchedCart.length > 0 || hasSameDomainCheckout) ? 25 : 0) +
                ((matchedContact.length >= 2 || hasMailOrTelLink || hasTaiwanAddress) ? 25 : 0) +
                (matchedPolicy.length >= 2 ? 20 : 0) +
                (hasCourseCommerceFootprint ? 30 : 0)
            );
            const uniqueCategories = [...new Set(categories)];

            return {
                score,
                matched: score >= 50 && uniqueCategories.length >= 2,
                reasons: [...new Set(reasons)],
                categories: uniqueCategories
            };
        };

        const analyzeShoppingScamSignals = (doc, rawText = '', fullUrl = '') => {
            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || '', fullUrl || ''];
            if (doc) {
                doc.querySelectorAll('input, textarea, select, button, a, img[alt], meta[name="description"], meta[property="og:title"]').forEach(el => {
                    ['name', 'id', 'placeholder', 'value', 'aria-label', 'alt', 'content'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                    textParts.push(el.textContent || '');
                });
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            const keywordGroups = {
                shopping: ['立即購買', '馬上訂購', '立即訂購', '立即搶購', '加入購物車', '結帳', '下單', '訂單', '購買', '特價', '優惠價', '原價', '折扣', '限時', '限量', '最後', '免運', '貨到付款', '宅配', '超商取貨', '七天鑑賞', '全台配送', 'add to cart', 'checkout', 'shop now', 'buy now', 'place order', 'order placed', 'shopping cart', 'my cart', 'browse collection', 'free shipping'],
                fields: ['姓名', '收件人', '手機', '電話', '地址', '宅配地址', '配送地址', '規格', '數量', '備註', '付款方式', 'full name', 'phone number', 'shipping address', 'billing address', 'payment method', 'quantity'],
                socialProof: ['顧客好評', '客戶評價', '五星', '已售出', '熱銷', '回購', '見證', '買家', '評價', 'customer reviews', 'best seller', 'bestseller', 'five stars'],
                tracking: ['ldtag_cl', 'lt_r', 'fbclid', 'gclid', 'utm_', 'click_id', 'campaign', 'ad_id'],
                lineContact: ['加入line', '加line', 'line客服', '官方line', 'line id', 'lineid', 'line帳號', 'line好友', '私訊客服', '聯繫客服下單', '截圖傳給客服', '客服確認訂單', 'lin.ee', 'line.me/r/ti/p', 'line://']
            };
            const matchedKeywords = Object.values(keywordGroups)
                .flat()
                .filter(keyword => haystack.includes(keyword.toLowerCase()));

            const formFieldSelectors = [
                'input[name*="name" i]', 'input[name*="phone" i]', 'input[name*="mobile" i]', 'input[name*="tel" i]', 'input[name*="address" i]',
                'textarea[name*="address" i]', 'input[placeholder*="姓名"]', 'input[placeholder*="手機"]',
                'input[placeholder*="電話"]', 'input[placeholder*="地址"]', 'textarea[placeholder*="地址"]',
                'select[name*="quantity" i]', 'select[name*="qty" i]'
            ];
            const formFieldCount = doc ? formFieldSelectors.reduce((count, selector) => count + doc.querySelectorAll(selector).length, 0) : 0;
            const formCount = doc ? doc.querySelectorAll('form').length : 0;
            const imageCount = doc ? doc.querySelectorAll('img').length : 0;
            const linkCount = doc ? doc.querySelectorAll('a[href]').length : 0;
            const hasOrderForm = formCount > 0 && (formFieldCount >= 2 || keywordGroups.fields.some(keyword => haystack.includes(keyword.toLowerCase())));
            const stockImageCount = (String(rawText || '').match(/(?:images\.pexels\.com|picsum\.photos|images\.unsplash\.com)/gi) || []).length;
            const catalogPriceCount = (haystack.match(/(?:\bprice\s*[:=]\s*["']?\d{1,6}(?:\.\d{1,2})?|\b(?:usd|ntd)\s*\$?\s*\d{1,6}(?:\.\d{1,2})?|[$€£]\s*\d{1,6}(?:\.\d{1,2})?)/gi) || []).length;
            const shoppingKeywordMatches = keywordGroups.shopping.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const hasCartActionKeyword = /(加入購物車|立即購買|馬上訂購|add to cart|checkout|buy now|place order|shopping cart)/i.test(haystack);
            const hasCommerceOffer = shoppingKeywordMatches.length >= 2 && (catalogPriceCount >= 2 || hasOrderForm || hasCartActionKeyword);
            const merchantInfoKeywords = ['統一編號', '公司名稱', '有限公司', '股份有限公司', '客服電話', '退換貨', '退貨政策', '隱私權政策', '服務條款', '聯絡地址'];
            const merchantIdentityKeywords = ['company name', 'business address', 'registered address', 'customer service', 'contact us'];
            const merchantPolicyKeywords = ['privacy policy', 'terms of service', 'refund policy', 'return policy', 'shipping policy'];
            const merchantIdentityMatches = merchantIdentityKeywords.filter(keyword => haystack.includes(keyword));
            const merchantPolicyMatches = merchantPolicyKeywords.filter(keyword => haystack.includes(keyword));
            const hasMerchantInfo = merchantInfoKeywords.some(keyword => haystack.includes(keyword.toLowerCase())) ||
                merchantIdentityMatches.length >= 2 ||
                (merchantIdentityMatches.length >= 1 && merchantPolicyMatches.length >= 2);
            const imageHeavy = imageCount >= 6 && linkCount <= 3;
            const hasOnePageStructure = matchedKeywords.length >= 4 && (linkCount <= 3 || imageHeavy || hasOrderForm);
            const highPressureSalesKeywords = ['貨到付款', '免運', '限量', '立即搶購', '馬上訂購'];
            const hasLimitedPurchasePitch = /限時.{0,12}(搶購|優惠|折扣|下單|訂購|購買)|(?:搶購|優惠|折扣|下單|訂購|購買).{0,12}限時|limited time.{0,24}(buy|shop|offer|deal)|(?:buy|shop|offer|deal).{0,24}limited time/i.test(haystack);
            const hasCodSalesPitch = highPressureSalesKeywords.some(keyword => haystack.includes(keyword.toLowerCase())) || hasLimitedPurchasePitch;
            const hasAliziOrderSystem = /(?:\/public\/alizi\/|alizi-order|alizibooking|www\.alizi\.net)/i.test(haystack);
            const hasTemplateDemoMarker = /(?:demo mode|demo checkout|sample store|test order|order placed.{0,60}demo)/i.test(haystack);
            const hasTrackingLandingParam = keywordGroups.tracking.some(keyword => haystack.includes(keyword.toLowerCase()));
            const lineContactMatches = keywordGroups.lineContact.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const hasLineContactSignal = lineContactMatches.length > 0;
            const hasLineOrderContext = /(下單|訂單|訂購|購買|立即搶購|馬上訂購|貨到付款|限時|限量|截圖傳給客服|客服確認訂單)/i.test(haystack);
            const courseKeywords = ['線上課程', '課程說明會', '課程簡介', '課程內容', '課程長度', '講師', '學員', '試閱', '所有課程', '報名'];
            const courseKeywordMatches = courseKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const isTaiwanCourseProviderPage = (() => {
                try {
                    const hostname = new URL(fullUrl).hostname.toLowerCase();
                    return hostname.endsWith('.tw') || isTrustedTaiwanServiceDomain(hostname);
                } catch (e) {
                    return false;
                }
            })();
            const hasCourseProviderTrust = isTaiwanCourseProviderPage &&
                courseKeywordMatches.length >= 3 &&
                hasMerchantInfo &&
                linkCount >= 5;

            const reasons = [];
            if (hasOnePageStructure) reasons.push('一頁式購物頁結構');
            if (hasOrderForm) reasons.push('頁面直接要求收件或訂購資料');
            if (hasCodSalesPitch) reasons.push('貨到付款/限時優惠等銷售話術');
            if (hasAliziOrderSystem && hasOrderForm && hasCodSalesPitch) reasons.push('Alizi 一頁式下單系統搭配收件表單與貨到付款話術');
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
            const unverifiedCommerceReasons = [];
            if (hasTemplateDemoMarker) unverifiedCommerceReasons.push('英文模板或示範結帳流程');
            if (stockImageCount >= 4) unverifiedCommerceReasons.push('大量商品圖片使用通用圖庫');
            if (hasCommerceOffer && !hasMerchantInfo) unverifiedCommerceReasons.push('提供商品與結帳功能，但缺少明確商家及政策資訊');

            return {
                score: Math.min(100, effectiveReasons.length * 18 + Math.min(30, matchedKeywords.length * 3)),
                matched: effectiveReasons.length >= 2,
                reasonCount: effectiveReasons.length,
                reasons: effectiveReasons,
                keywordCount: matchedKeywords.length,
                formFieldCount,
                imageCount,
                linkCount,
                hasOrderForm,
                hasAliziOrderSystem,
                hasMerchantInfo,
                hasCommerceOffer,
                hasTemplateDemoMarker,
                hasOnePageStructure,
                stockImageCount,
                catalogPriceCount,
                unverifiedCommerceReasons,
                hasCourseProviderTrust,
                hasLineContactSignal,
                hasLineOrderContext,
                lineContactExamples: lineContactMatches.slice(0, 3)
            };
        };

        const analyzeJobTaskScamSignals = (doc, rawText = '', fullUrl = '') => {
            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || '', fullUrl || ''];
            if (doc) {
                doc.querySelectorAll('a, input, button, label, meta[name="description"]').forEach(el => {
                    ['href', 'name', 'id', 'placeholder', 'value', 'content'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                    textParts.push(el.textContent || '');
                });
            }

            const haystack = decodeSignalText(textParts.join('\n'));
            const jobKeywords = ['找工作', '求職', '徵才', '職缺', '應徵', '薪資', '職員登入', '工作首頁', '企業徵才'];
            const moneyKeywords = ['提領資金', '存入資金', '存入提領', '交易紀錄', '儲值', '充值', '入金', '出金', '匯款', '銀行帳戶', '帳戶須為同一人'];
            const taskKeywords = ['機台操作', '每日簽到', '領取能量', '平台代理', '任務佣金', '接單任務'];
            const identityKeywords = ['真實姓名', '手機號碼', '身分證', '銀行帳戶', '本人手機', '帳戶須為同一人'];
            const findMatches = keywords => keywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const jobMatches = findMatches(jobKeywords);
            const moneyMatches = findMatches(moneyKeywords);
            const taskMatches = findMatches(taskKeywords);
            const identityMatches = findMatches(identityKeywords);
            const hasJobFacade = jobMatches.length >= 3;
            const hasMoneyFlow = moneyMatches.length >= 2;
            const hasTaskMechanics = taskMatches.length >= 1;
            const hasIdentityCollection = identityMatches.length >= 2;
            const matched = hasJobFacade && hasMoneyFlow && hasTaskMechanics;
            const reasons = [];
            if (hasJobFacade && hasMoneyFlow) reasons.push('求職/徵才頁混入存入、提領或交易資金功能');
            if (hasTaskMechanics) reasons.push('以機台操作、每日簽到或任務機制包裝工作內容');
            if (hasIdentityCollection) reasons.push('註冊要求真實身分、手機或銀行帳戶資料');

            return {
                score: matched ? Math.min(100, 75 + (hasIdentityCollection ? 15 : 0)) : Math.min(60, reasons.length * 25),
                matched,
                reasons,
                jobMatches,
                moneyMatches,
                taskMatches,
                identityMatches,
                hasJobFacade,
                hasMoneyFlow,
                hasTaskMechanics,
                hasIdentityCollection
            };
        };

        const analyzeRegulatedTobaccoSalesSignals = (doc, rawText = '', fullUrl = '') => {
            const textParts = [rawText || '', doc?.title || '', doc?.body?.textContent || '', fullUrl || ''];
            if (doc) {
                doc.querySelectorAll('a, button, input, textarea, select, img[alt], meta[name="description"], meta[property="og:title"]').forEach(el => {
                    ['name', 'id', 'placeholder', 'value', 'aria-label', 'alt', 'content', 'href', 'src'].forEach(attr => textParts.push(el.getAttribute(attr) || ''));
                    textParts.push(el.textContent || '');
                });
            }

            const haystack = decodeSignalText(textParts.join('\n')).replace(/\s+/g, ' ');
            const matchesProductKeyword = (keyword) => {
                const normalizedKeyword = String(keyword || '').toLowerCase();
                if (!normalizedKeyword) return false;
                if (/^[a-z0-9]+$/i.test(normalizedKeyword)) {
                    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}(?=$|[^a-z0-9])`, 'i').test(haystack);
                }
                return haystack.includes(normalizedKeyword);
            };
            const productMatches = getRiskList('regulatedTobaccoProductKeywords')
                .filter(matchesProductKeyword);
            const salesMatches = getRiskList('regulatedTobaccoSalesKeywords')
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
                score: Math.min(100, (productMatches.length > 0 ? 45 : 0) + Math.min(40, salesMatches.length * 8) + (hasPriceSignal ? 20 : 0) + (hasLinePurchaseSignal ? 20 : 0) + (hasTaiwanFulfillmentSignal ? 15 : 0)),
                matched: productMatches.length > 0 && hasSalesSignal,
                reasons,
                productMatches: [...new Set(productMatches)].slice(0, 5),
                salesMatches: [...new Set(salesMatches)].slice(0, 5),
                hasPriceSignal,
                hasLinePurchaseSignal,
                hasTaiwanFulfillmentSignal
            };
        };

        const analyzePageSignals = (doc, fullUrl, rawText = '') => {
            let domainHostname = '';
            try { domainHostname = new URL(fullUrl).hostname; } catch (e) { }

            const sensitiveKeywords = getRiskList('sensitiveFormKeywords');
            const sensitiveFields = [];
            const sensitiveForms = new Set();
            doc.querySelectorAll('input, textarea, select').forEach(el => {
                const type = (el.getAttribute('type') || '').toLowerCase();
                const haystack = [
                    type,
                    el.getAttribute('name'),
                    el.getAttribute('id'),
                    el.getAttribute('placeholder'),
                    el.getAttribute('autocomplete'),
                    el.getAttribute('aria-label')
                ].filter(Boolean).join(' ').toLowerCase();

                const isStrongSensitiveType = type === 'password';
                const isWeakSensitiveType = ['tel', 'email'].includes(type);
                const matchedKeyword = sensitiveKeywords.find(keyword => haystack.includes(keyword.toLowerCase()));
                const strongSensitivePattern = /(password|passwd|pwd|passcode|otp|pin|creditcard|cardnumber|cvv|cvc|expire|expiry|bank|身分證|身份證|統一編號|信用卡|卡號|驗證碼|簡訊碼|密碼|銀行|金融卡|有效期限|安全碼)/i;
                const isHighRisk = isStrongSensitiveType || strongSensitivePattern.test(haystack) || (matchedKeyword && strongSensitivePattern.test(matchedKeyword));
                if (isStrongSensitiveType || isWeakSensitiveType || matchedKeyword) {
                    if (isHighRisk) sensitiveForms.add(el.form || el.closest?.('form'));
                    sensitiveFields.push({
                        type: type || 'unknown',
                        keyword: matchedKeyword || type,
                        risk: isHighRisk ? 'high' : 'low'
                    });
                }
            });

            const externalResources = [];
            const collectExternalUrl = (rawUrl, kind) => {
                if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('#')) return;
                try {
                    const parsed = new URL(rawUrl, fullUrl);
                    if (!/^https?:$/i.test(parsed.protocol)) return;
                    if (!domainHostname || isSameRootDomain(parsed.hostname, domainHostname) || isTrustedResourceDomain(parsed.hostname)) return;
                    externalResources.push({ kind, hostname: parsed.hostname, url: parsed.href, suspicious: hasRiskyHostnamePattern(parsed.hostname) });
                } catch (e) { }
            };

            doc.querySelectorAll('script[src]').forEach(el => collectExternalUrl(el.getAttribute('src'), 'script'));
            doc.querySelectorAll('iframe[src], frame[src]').forEach(el => collectExternalUrl(el.getAttribute('src'), 'iframe'));
            let sensitiveFormActionCount = 0;
            doc.querySelectorAll('form[action]').forEach(el => {
                const before = externalResources.length;
                collectExternalUrl(el.getAttribute('action'), 'form');
                if (sensitiveForms.has(el) && externalResources.length > before) sensitiveFormActionCount++;
            });

            const externalFormActions = externalResources.filter(item => item.kind === 'form');
            const externalIframeSources = externalResources.filter(item => item.kind === 'iframe');
            const suspiciousExternalResources = externalResources.filter(item => item.suspicious);
            const suspiciousExternalIframes = externalIframeSources.filter(item => item.suspicious);
            const suspiciousExternalScripts = externalResources.filter(item => item.kind === 'script' && item.suspicious);

            return {
                voteAccountSignals: window.ScanPolicy.analyzeVotePage(doc, fullUrl),
                sensitiveFields: {
                    count: sensitiveFields.length,
                    highRiskCount: sensitiveFields.filter(item => item.risk === 'high').length,
                    lowRiskCount: sensitiveFields.filter(item => item.risk === 'low').length,
                    examples: sensitiveFields.slice(0, 3)
                },
                externalResources: {
                    count: externalResources.length,
                    formActionCount: externalFormActions.length,
                    sensitiveFormActionCount,
                    iframeCount: externalIframeSources.length,
                    suspiciousCount: suspiciousExternalResources.length,
                    suspiciousIframeCount: suspiciousExternalIframes.length,
                    suspiciousScriptCount: suspiciousExternalScripts.length,
                    examples: externalResources.slice(0, 3)
                },
                downloadSignals: analyzeDownloadSignals(doc, rawText, fullUrl),
                govAgencySignals: analyzeGovernmentAgencySignals(doc, rawText, fullUrl),
                pageBrandSignals: analyzePageBrandSignals(doc, fullUrl, rawText),
                urgencySignals: analyzeUrgencySignals(doc, rawText),
                trustSignals: analyzeTrustSignals(doc, rawText, fullUrl),
                seoSignals: analyzeSeoSignals(doc, rawText),
                languageSignals: analyzeLanguageSignals(doc, rawText, fullUrl),
                businessIdentitySignals: analyzeBusinessIdentitySignals(doc, rawText),
                lineOfficialSignals: analyzeLineOfficialSignals(doc, rawText, fullUrl),
                ecommerceTrustSignals: analyzeEcommerceTrustSignals(doc, rawText, fullUrl),
                shoppingScamSignals: analyzeShoppingScamSignals(doc, rawText, fullUrl),
                jobTaskScamSignals: analyzeJobTaskScamSignals(doc, rawText, fullUrl),
                regulatedTobaccoSalesSignals: analyzeRegulatedTobaccoSalesSignals(doc, rawText, fullUrl)
            };
        };

        const fetchGeoLocation = async (ip) => {
            try {
                const geoRes = await fetch(`https://ipwho.is/${ip}`);
                const geoData = await geoRes.json();
                if (!geoData.success) throw new Error('Geo failed');
                return {
                    country: `${geoData.country} (${geoData.country_code})`,
                    asn: geoData.connection?.asn ? `AS${geoData.connection.asn}` : '',
                    org: geoData.connection?.org || geoData.connection?.isp || '',
                    isReal: true
                };
            } catch (err) { return null; }
        };

        const fetchNetworkInfo = async (domain) => {
            return await fetchJsonSafely(`/api/network-info?domain=${encodeURIComponent(domain)}`, null);
        };

        const fetchSecurityHeaders = async (fullUrl) => {
            return await fetchJsonSafely(
                `/api/security-headers?url=${encodeURIComponent(fullUrl)}`,
                { status: 'unavailable', missingAll: false, missing: [] }
            );
        };

        const fetchSiteSeoData = async (fullUrl) => {
            return await fetchJsonSafely(
                `/api/site-seo?url=${encodeURIComponent(fullUrl)}`,
                { status: 'unavailable', matched: false, score: 0, robots: {}, sitemap: {} }
            );
        };

        const checkSiteAvailability = async (fullUrl, options = {}) => {
            const rawUrl = options.rawUrl || fullUrl;
            const sanitizedUrl = options.sanitizedUrl || fullUrl;
            const emptySiteStatus = (status, msg, extra = {}) => ({
                status,
                msg,
                hasIframe: false,
                finalUrl: null,
                linkStats: { total: 0, internal: 0, external: 0 },
                hasApk: false,
                analyticsIdentifiers: [],
                pageSignals: createEmptyPageSignals(),
                ...extra
            });
            const detectCrawlerBlock = (text, httpCode = 0) => {
                const haystack = String(text || '').toLowerCase();
                if ([403, 429].includes(Number(httpCode))) return true;
                const directBlockMarkers = [
                    'access denied',
                    'request blocked',
                    'request has been blocked',
                    'verify you are human',
                    'checking your browser',
                    'cf-chl-',
                    '/cdn-cgi/challenge-platform/',
                    'challenges.cloudflare.com/turnstile',
                    'bot detection',
                    'anti-bot'
                ];
                if (directBlockMarkers.some(marker => haystack.includes(marker))) return true;

                const hasWafVendor = /(cloudflare|akamai|incapsula|imperva|datadome)/i.test(haystack);
                const hasChallengeContext = /(captcha|security challenge|security check|challenge required|automated traffic)/i.test(haystack);
                return hasWafVendor && hasChallengeContext;
            };
            const getCrawlerCandidates = () => {
                return buildCrawlerCandidateUrls([sanitizedUrl, fullUrl, rawUrl], {
                    preferHttpFallback: options.inputHadExplicitScheme === false
                });
            };
            const hasActionableStaticPageSignals = (result) => {
                const signals = result?.pageSignals || {};
                const shopping = signals.shoppingScamSignals || {};
                const downloads = signals.downloadSignals || {};
                return !!shopping.hasCommerceOffer ||
                    !!shopping.hasTemplateDemoMarker ||
                    !!signals.regulatedTobaccoSalesSignals?.matched ||
                    !!signals.jobTaskScamSignals?.matched ||
                    !!signals.pageBrandSignals?.matched ||
                    Number(downloads.apkUrlCount || 0) > 0 ||
                    Number(downloads.installKeywordCount || 0) > 0 ||
                    Number(signals.sensitiveFields?.highRiskCount || 0) > 0;
            };
            const isUsableCrawlerResult = (result) => result?.status === 'ok' ||
                (result?.status === 'blank' && hasActionableStaticPageSignals(result));
            const rememberBestCrawlerResult = (best, result) => {
                if (!result) return best;
                if (!best) return result;
                const rank = { ok: 4, blank: 3, blocked: 2, error: 1, unknown: 0 };
                return (rank[result.status] || 0) > (rank[best.status] || 0) ? result : best;
            };
            const analyzeFetchedContent = (data, sourceLabel = 'content-fetch', fetchUrl = fullUrl) => {
                const code = Number(data?.status?.http_code || data?.code || 0);
                const finalUrl = data?.status?.url || data?.finalUrl || null;
                const text = String(data?.contents || '');
                let isBlank = false;
                let hasIframe = /<iframe/i.test(text);
                let hasApk = false;
                let linkStats = { total: 0, internal: 0, external: 0 };
                let pageSignals = createEmptyPageSignals();
                const analyticsIdentifiers = Array.isArray(data?.analyticsIdentifiers) ? data.analyticsIdentifiers : [];

                pageSignals.downloadSignals = analyzeDownloadSignals(null, text, fetchUrl);
                hasApk = pageSignals.downloadSignals.apkUrlCount > 0;

                if (data?.blocked || detectCrawlerBlock(text, code)) {
                    return emptySiteStatus('blocked', '網站可能啟用 WAF/Anti-bot，基礎爬蟲被阻擋', {
                        code,
                        finalUrl,
                        hasIframe,
                        hasApk,
                        source: sourceLabel,
                        fetchUrl,
                        rawUrl,
                        sanitizedUrl,
                        pageSignals,
                        analyticsIdentifiers
                    });
                }

                if (code >= 400) {
                    return emptySiteStatus('error', `網站無法正常存取 (HTTP ${code})`, {
                        code,
                        finalUrl,
                        source: sourceLabel,
                        fetchUrl,
                        rawUrl,
                        sanitizedUrl
                    });
                }

                if (!text) {
                    return emptySiteStatus('unknown', '無法檢測網站內容', {
                        code,
                        finalUrl,
                        source: sourceLabel,
                        fetchUrl,
                        rawUrl,
                        sanitizedUrl
                    });
                }

                if (text.length < 500) isBlank = true;
                else {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(text, 'text/html');
                        const title = doc.title || "";
                        if (title.toLowerCase().includes("index of /")) {
                            return emptySiteStatus('blank', '網站顯示為伺服器目錄 (非正常網頁)', {
                                code: code || 200,
                                hasIframe,
                                finalUrl,
                                linkStats,
                                hasApk,
                                source: sourceLabel,
                                pageSignals,
                                analyticsIdentifiers
                            });
                        }
                        pageSignals = analyzePageSignals(doc, fetchUrl, text);
                        hasApk = pageSignals.downloadSignals.apkUrlCount > 0;
                        const links = doc.querySelectorAll('a');
                        linkStats.total = links.length;
                        let domainHostname = '';
                        try { domainHostname = new URL(fetchUrl).hostname; } catch (e) { }
                        links.forEach(el => {
                            const href = el.getAttribute('href');
                            if (!href) return;
                            let isInternal = false;
                            if (href.startsWith('/') || href.startsWith('.') || href.startsWith('#')) {
                                isInternal = true;
                            } else if (href.startsWith('http')) {
                                try {
                                    const linkUrl = new URL(href);
                                    if (linkUrl.hostname.includes(domainHostname) || domainHostname.includes(linkUrl.hostname)) {
                                        isInternal = true;
                                    }
                                } catch (e) { }
                            } else if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                                isInternal = true;
                            }
                            if (isInternal) linkStats.internal++;
                            else linkStats.external++;
                        });
                        const invisibleTags = doc.querySelectorAll('script, style, link, meta, noscript, svg, path, iframe, frame, object, embed');
                        invisibleTags.forEach(el => el.remove());
                        const visibleText = (doc.body ? doc.body.textContent : "").replace(/\s+/g, '').trim();
                        if (visibleText.length < 800) isBlank = true;
                    } catch (e) {
                        console.warn('Page content analysis failed', e);
                    }
                }

                if (isBlank) {
                    return emptySiteStatus('blank', '網站可視內容過少 (可能是 SPA、WAF 或偽裝頁)', {
                        code: code || 200,
                        hasIframe,
                        finalUrl,
                        linkStats,
                        hasApk,
                        source: sourceLabel,
                        fetchUrl,
                        rawUrl,
                        sanitizedUrl,
                        pageSignals,
                        analyticsIdentifiers
                    });
                }
                return {
                    status: 'ok',
                    code: code || 200,
                    msg: '網站運作正常',
                    hasIframe,
                    finalUrl,
                    linkStats,
                    hasApk,
                    source: sourceLabel,
                    fetchUrl,
                    rawUrl,
                    sanitizedUrl,
                    pageSignals,
                    analyticsIdentifiers
                };
            };
            let bestResult = null;
            const candidates = getCrawlerCandidates();

            for (const candidateUrl of candidates) {
                try {
                    const directRes = await fetch(`/api/site-content?url=${encodeURIComponent(candidateUrl)}&rawUrl=${encodeURIComponent(rawUrl)}`);
                    const directData = await readJsonSafely(directRes, null);
                    if (directData && (directData.contents || directData.status)) {
                        const directResult = analyzeFetchedContent(directData, directData.source || 'direct-browser-ua', directData.fetchUrl || candidateUrl);
                        if (isUsableCrawlerResult(directResult)) return directResult;
                        bestResult = rememberBestCrawlerResult(bestResult, directResult);
                    }
                } catch (e) { }
            }

            for (const candidateUrl of candidates) {
                try {
                    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(candidateUrl)}&disableCache=true`;
                    const res = await fetch(proxyUrl);
                    if (!res.ok) continue;
                    const data = await readJsonSafely(res, null);
                    if (!data) throw new Error('Primary content proxy returned non-json response');
                    const proxyResult = analyzeFetchedContent(data, 'allorigins', candidateUrl);
                    if (isUsableCrawlerResult(proxyResult)) return proxyResult;
                    bestResult = rememberBestCrawlerResult(bestResult, proxyResult);
                } catch (e) { }
            }

            for (const candidateUrl of candidates) {
                try {
                    const backupProxy = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(candidateUrl)}`;
                    const resBackup = await fetch(backupProxy);
                    if (resBackup.ok) {
                        const backupText = await resBackup.text();
                        const backupResult = analyzeFetchedContent({
                            status: { http_code: 200, url: null },
                            contents: backupText
                        }, 'codetabs', candidateUrl);
                        if (isUsableCrawlerResult(backupResult)) return backupResult;
                        bestResult = rememberBestCrawlerResult(bestResult, backupResult);
                    }
                } catch (err) { }
            }

            return bestResult || emptySiteStatus('unknown', '無法檢測網站內容', { rawUrl, sanitizedUrl });
        };

        const checkTrancoRank = async (domain) => {
            const data = await fetchJsonSafely(
                `/api/tranco-rank?domain=${encodeURIComponent(domain)}`,
                { status: 'unavailable', rank: null }
            );
            const rank = Number(data.rank);
            return {
                status: data.status || 'unavailable',
                rank: Number.isFinite(rank) ? rank : null,
                date: data.date || null,
                queriedDomain: data.queriedDomain || domain,
                source: data.source || null,
                reason: data.reason || null,
                attempts: Array.isArray(data.attempts) ? data.attempts : []
            };
        };

        const getDaysBetweenDates = (startDate, endDate) => {
            if (!startDate || !endDate) return null;
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
            return Math.round((end - start) / (1000 * 60 * 60 * 24));
        };

        const getPastAgeDays = (dateValue) => {
            if (!dateValue) return null;
            const date = new Date(dateValue);
            if (Number.isNaN(date.getTime())) return null;
            const elapsedMs = Date.now() - date.getTime();
            if (elapsedMs < 0) return null;
            return Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
        };

        const isOneYearRegistrationPeriod = (periodDays) => {
            return periodDays !== null && periodDays >= 330 && periodDays <= 400;
        };

        // 網域年齡是背景風險，不是詐騙證據；單獨最高只到中度提醒。
        const getDomainAgeRiskScore = (domainAgeDays) => {
            if (domainAgeDays === null) return 0;
            if (domainAgeDays < 90) return 35;
            if (domainAgeDays < 180) return 20;
            if (domainAgeDays < 365) return 10;
            return 0;
        };

        const fetchRDAPData = async (domain) => {
            try {
                const apiUrl = `/api/rdap?domain=${domain}`;
                const fallbackData = { date: null, expirationDate: null, registrationPeriodDays: null, privacyDetected: false, registrarName: null, registrantName: null, registrantOrganization: null, queriedDomain: domain };
                const data = await fetchJsonSafely(apiUrl, fallbackData);
                const events = data.events || [];
                let regEvent =
                    events.find(e => e.eventAction === 'registration') ||
                    events.find(e => e.eventAction === 'created') ||
                    events.find(e => /registration|created|creation/i.test(e.eventAction || ''));
                const expirationEvent = events.find(e => /expiration|expiry|expires|renewal/i.test(e.eventAction || ''));
                const date = (regEvent && regEvent.eventDate)
                    ? regEvent.eventDate
                    : (data.registrationDate || data.createdDate || data.creationDate || data.created || data.registered || null);
                const expirationDate = (expirationEvent && expirationEvent.eventDate)
                    ? expirationEvent.eventDate
                    : (data.expirationDate || data.expiryDate || data.expires || data.registryExpiryDate || data.paidTill || data.renewalDate || null);
                const registrationPeriodDays = getDaysBetweenDates(date, expirationDate);
                let privacyDetected = false;
                const privacyKeywords = ['Privacy', 'Proxy', 'Guard', 'Protect', 'Redacted', 'Whois', 'Masked', 'Contact', 'Private'];
                let registrarName = data.registrarName || data.registrar || data.sponsoringRegistrar || data.sponsor || data.registrationServiceProvider || null;
                const getVcardValue = (entity, field) => {
                    if (!entity?.vcardArray || !Array.isArray(entity.vcardArray) || entity.vcardArray.length < 2) return null;
                    const entry = entity.vcardArray[1]?.find(item => item[0] === field);
                    return typeof entry?.[3] === 'string' ? entry[3] : null;
                };
                let registrantName = data.registrantName || data.registrant || null;
                let registrantOrganization = data.registrantOrganization || data.registrantOrg || data.organization || null;
                const registrantEntity = data.entities?.find(e =>
                    e.roles && e.roles.some(role => /registrant|holder|owner/i.test(role))
                );
                if (registrantEntity) {
                    registrantName = registrantName || getVcardValue(registrantEntity, 'fn') || registrantEntity.name || null;
                    registrantOrganization = registrantOrganization || getVcardValue(registrantEntity, 'org') || null;
                }
                const registrarEntity = data.entities?.find(e =>
                    e.roles && e.roles.some(role => /registrar|sponsor|reseller/i.test(role))
                );
                if (registrarEntity) {
                    if (registrarEntity.vcardArray && registrarEntity.vcardArray.length > 1) {
                        const fnEntry = registrarEntity.vcardArray[1]?.find(item => item[0] === 'fn');
                        if (fnEntry) registrarName = fnEntry[3];
                    }
                    if (!registrarName && registrarEntity.handle) registrarName = registrarEntity.handle;
                    if (!registrarName && registrarEntity.name) registrarName = registrarEntity.name;
                }
                if (!registrarName && data.entities) {
                    const potentialRegistrars = data.entities.filter(e => !e.roles || !e.roles.includes('registrant'));
                    for (const ent of potentialRegistrars) {
                        if (ent.vcardArray) {
                            const fnEntry = ent.vcardArray[1]?.find(item => item[0] === 'fn');
                            if (fnEntry && typeof fnEntry[3] === 'string' && !privacyKeywords.some(kw => fnEntry[3].includes(kw))) {
                                registrarName = fnEntry[3];
                                break;
                            }
                        }
                    }
                }
                const searchEntities = (entities) => {
                    if (!entities || !Array.isArray(entities)) return;
                    for (const entity of entities) {
                        if (entity.vcardArray && Array.isArray(entity.vcardArray) && entity.vcardArray.length > 1) {
                            const vcardProps = entity.vcardArray[1];
                            for (const prop of vcardProps) {
                                if (prop.length >= 4 && typeof prop[3] === 'string') {
                                    if (privacyKeywords.some(kw => prop[3].toLowerCase().includes(kw.toLowerCase()))) {
                                        privacyDetected = true;
                                        return;
                                    }
                                }
                            }
                        }
                        if (entity.handle && privacyKeywords.some(kw => entity.handle.toLowerCase().includes(kw.toLowerCase()))) {
                            privacyDetected = true;
                            return;
                        }
                        if (entity.entities) {
                            searchEntities(entity.entities);
                            if (privacyDetected) return;
                        }
                    }
                };
                searchEntities(data.entities);
                return { date, expirationDate, registrationPeriodDays, privacyDetected, registrarName, registrantName, registrantOrganization, queriedDomain: data.queriedDomain || domain };
            } catch (e) { return { date: null, expirationDate: null, registrationPeriodDays: null, privacyDetected: false, registrarName: null, registrantName: null, registrantOrganization: null, queriedDomain: domain }; }
        };

        const fetchCertificateData = async (domain) => {
            return await fetchJsonSafely(
                `/api/cert-age?domain=${encodeURIComponent(domain)}`,
                { notBefore: null, source: null }
            );
        };

        const fetchTraceData = async (url) => {
            return await fetchJsonSafely(`/api/trace?url=${encodeURIComponent(url)}`, null);
        };

        const resolvePrimaryScanTarget = async (targetDomain, fullUrl, scanOptions = {}) => {
            const inputDomain = normalizeHostname(targetDomain);
            const baseResult = {
                targetDomain: inputDomain,
                fullUrl,
                scanOptions: {
                    ...scanOptions,
                    inputDomain,
                    inputScanUrl: fullUrl,
                    resolvedFromShortener: false,
                    unresolvedShortener: false,
                    officialShortenerPolicyApplied: getOfficialShortenerDestinationDomains(inputDomain).length > 0,
                    officialShortenerDestinationVerified: false
                },
                traceData: null,
                resolvedFromShortener: false,
                unresolvedShortener: false
            };

            if (!isKnownUrlShortenerDomain(inputDomain)) return baseResult;

            const traceData = await withTimeout(fetchTraceData(fullUrl), 11000, null);
            const traceOptions = {
                ...baseResult.scanOptions,
                preResolvedTrace: traceData,
                tracePreflightCompleted: true,
                traceObservedAt: traceData?.observedAt || null
            };
            const hasResolvedDestination = traceData?.resolvedDestination !== false &&
                Number(traceData?.redirectCount || 0) > 0 &&
                !!traceData?.finalUrl;

            if (!hasResolvedDestination) {
                return {
                    ...baseResult,
                    scanOptions: {
                        ...traceOptions,
                        unresolvedShortener: true
                    },
                    traceData,
                    unresolvedShortener: true
                };
            }

            try {
                const finalUrl = new URL(traceData.finalUrl);
                if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') throw new Error('unsupported_protocol');

                const destinationSanitized = sanitizeUrlForRiskScoring(finalUrl.href);
                const destinationDomain = normalizeHostname(finalUrl.hostname);
                const officialShortenerPolicyApplied = getOfficialShortenerDestinationDomains(inputDomain).length > 0;
                const officialShortenerDestinationVerified = officialShortenerPolicyApplied &&
                    isVerifiedOfficialShortenerDestination(inputDomain, destinationDomain);
                return {
                    targetDomain: destinationDomain,
                    fullUrl: destinationSanitized.href,
                    scanOptions: {
                        ...traceOptions,
                        sanitizedUrl: destinationSanitized.href,
                        removedTrackingParams: [...new Set([
                            ...(scanOptions.removedTrackingParams || []),
                            ...destinationSanitized.removedTrackingParams
                        ])],
                        removedVolatileParams: [...new Set([
                            ...(scanOptions.removedVolatileParams || []),
                            ...destinationSanitized.removedVolatileParams
                        ])],
                        removedParams: [...new Set([
                            ...(scanOptions.removedParams || []),
                            ...destinationSanitized.removedParams
                        ])],
                        resolvedFromShortener: true,
                        unresolvedShortener: false,
                        resolvedFinalUrl: finalUrl.href,
                        officialShortenerPolicyApplied,
                        officialShortenerDestinationVerified,
                        primarySanitizedUrl: destinationSanitized.href,
                        destinationRemovedTrackingParams: destinationSanitized.removedTrackingParams,
                        destinationRemovedVolatileParams: destinationSanitized.removedVolatileParams
                    },
                    traceData,
                    resolvedFromShortener: true,
                    unresolvedShortener: false
                };
            } catch (err) {
                return {
                    ...baseResult,
                    scanOptions: {
                        ...traceOptions,
                        unresolvedShortener: true
                    },
                    traceData,
                    unresolvedShortener: true
                };
            }
        };

        const checkOfficialAlerts = async (domain, fullUrl) => {
            try {
                const params = new URLSearchParams({
                    domain,
                    url: fullUrl
                });
                return await fetchJsonSafely(
                    `/api/check-official-alerts?${params.toString()}`,
                    { matched: false, count: 0, matches: [] }
                );
            } catch (e) {
                return { matched: false, count: 0, matches: [] };
            }
        };

        const checkCofactsRiskSignals = async (domain, fullUrl) => {
            try {
                const params = new URLSearchParams({ domain, url: fullUrl, sourceSchema: '2' });
                return await fetchJsonSafely(
                    `/api/check-cofacts?${params.toString()}`,
                    { status: 'unavailable', matched: false, count: 0, matches: [], level: 'none', riskScore: 0, strongRisk: false }
                );
            } catch (e) {
                return { status: 'unavailable', matched: false, count: 0, matches: [], level: 'none', riskScore: 0, strongRisk: false };
            }
        };

        const checkAnalyticsClusterSignals = async (domain, identifiers = []) => {
            const ids = [...new Set((Array.isArray(identifiers) ? identifiers : [])
                .map(item => typeof item === 'string' ? item : item?.id)
                .filter(Boolean))].slice(0, 20);
            const fallback = {
                checked: false,
                matched: false,
                status: ids.length > 0 ? 'info' : 'safe',
                detectedCount: ids.length,
                matchedIdentifierCount: 0,
                knownHighRiskCount: 0,
                items: [],
                evidenceSources: [],
                details: ids.length > 0 ? '已擷取分析識別碼，但站群索引暫時無法查詢。' : '未擷取到支援的分析識別碼。'
            };
            if (ids.length === 0) return fallback;
            try {
                const params = new URLSearchParams({ domain });
                ids.forEach(id => params.append('id', id));
                return await fetchJsonSafely(`/api/check-analytics-cluster?${params.toString()}`, fallback);
            } catch (e) {
                return fallback;
            }
        };

        const checkOrganizationVerification = async (domain, businessSignals = {}) => {
            const fallback = {
                checked: false,
                status: 'unavailable',
                verified: false,
                domainMatched: false,
                registrationMatched: false,
                confidenceScore: 0,
                entities: [],
                companies: [],
                evidence: [],
                disclosure: '組織與法人公開資料服務暫時無法查詢，本項不納入風險計分。'
            };
            if (isOfficialTaiwanGovDomain(domain)) {
                return {
                    ...fallback,
                    status: 'not-applicable',
                    disclosure: '政府機關網域不適用組織／法人登記資料驗證，本項不納入風險計分。'
                };
            }
            try {
                const params = new URLSearchParams({ domain });
                params.set('trustedMapVersion', String(RISK_CONFIG.organizationVerificationVersion || RISK_CONFIG.companyVerificationVersion || 'current'));
                const taxIds = [...new Set(businessSignals.taxIds || [])].slice(0, 3);
                const names = [...new Set(businessSignals.names || [])].slice(0, 4);
                if (taxIds.length > 0) params.set('taxIds', taxIds.join(','));
                if (names.length > 0) params.set('names', names.join('|'));
                return await fetchJsonSafely('/api/organization-verification?' + params.toString(), fallback);
            } catch (e) {
                return fallback;
            }
        };

        const checkGovernmentAgencyVerification = async (domain, govSignals = {}) => {
            const fallback = {
                checked: false,
                status: 'unavailable',
                officialDomain: isOfficialTaiwanGovDomain(domain),
                verified: false,
                directAgencyMatched: false,
                agencies: [],
                evidence: [],
                disclosure: '政府機關公開資料暫時無法查詢，本項先不顯示；.gov.tw 官方網域仍會保留安全判定。'
            };
            if (!isOfficialTaiwanGovDomain(domain)) {
                return {
                    ...fallback,
                    checked: true,
                    status: 'not-applicable',
                    officialDomain: false
                };
            }
            try {
                const params = new URLSearchParams({ domain });
                if (govSignals.siteName) params.set('siteName', govSignals.siteName);
                if (govSignals.agencyName) params.set('agencyName', govSignals.agencyName);
                if (govSignals.rootAgency) params.set('rootAgency', govSignals.rootAgency);
                return await fetchJsonSafely('/api/gov-agency-verification?' + params.toString(), fallback);
            } catch (e) {
                return fallback;
            }
        };

        const checkCommunityBlocklists = async (domain) => {
            const lowerDomain = domain.toLowerCase();
            try {
                const res = await fetch(`/api/check-blacklist?domain=${encodeURIComponent(lowerDomain)}`);
                if (res.ok) {
                    const data = await readJsonSafely(res, { isBlacklisted: false });
                    if (data.isBlacklisted) return true;
                }
            } catch (e) { console.error("黑名單 API 連線失敗", e); }

            try {
                const sources = [
                    'https://cdn.jsdelivr.net/gh/houboyjacky/Ad-Malicious-Scams-Boring-Farm-Filter@master/ScamsSiteGetFromFB_TonyNey.txt',
                    'https://cdn.jsdelivr.net/gh/houboyjacky/Ad-Malicious-Scams-Boring-Farm-Filter@master/ScamSiteGetFromGlobalAntiScamOrg.txt',
                    'https://danny0838.github.io/content-farm-terminator/files/blocklist-ublacklist/scam-sites.txt',
                    'https://cdn.jsdelivr.net/gh/houboyjacky/Ad-Malicious-Scams-Boring-Farm-Filter@master/SimilarURL.txt'
                ];
                const requests = sources.map(url => fetch(url).then(res => res.ok ? res.text() : ''));
                const contents = await Promise.all(requests);
                const combinedText = contents.join('\n');
                if (!combinedText) return false;
                const lines = combinedText.split(/\r?\n/);
                return lines.some(line => {
                    let cleanLine = line.trim();
                    if (!cleanLine || cleanLine.startsWith('!') || cleanLine.startsWith('#')) return false;
                    cleanLine = cleanLine.replace(/^\*:\/\/|^\*\.|\/\*$|^\|\||\^$/g, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
                    cleanLine = cleanLine.toLowerCase();
                    if (!cleanLine) return false;
                    return lowerDomain === cleanLine || lowerDomain.endsWith('.' + cleanLine);
                });
            } catch (e) { return false; }
        };

        // --- Modified simulateScan with refined whitelist and risk scoring ---
        const simulateScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            const rawScanUrl = scanOptions.rawUrl || fullUrl;
            const sanitizedScanUrl = scanOptions.sanitizedUrl || fullUrl;
            const inputDomain = normalizeHostname(scanOptions.inputDomain || targetDomain);
            const inputScanUrl = scanOptions.inputScanUrl || fullUrl;
            const resolvedFromShortener = scanOptions.resolvedFromShortener === true;
            const unresolvedShortener = scanOptions.unresolvedShortener === true;
            const preResolvedTrace = scanOptions.preResolvedTrace || null;
            const tracePreflightCompleted = scanOptions.tracePreflightCompleted === true;
            const removedTrackingParamsForScan = [...new Set(scanOptions.removedTrackingParams || [])];
            const removedVolatileParamsForScan = [...new Set(scanOptions.removedVolatileParams || [])];
            const removedParamsForScan = [...new Set(scanOptions.removedParams || [
                ...removedTrackingParamsForScan,
                ...removedVolatileParamsForScan
            ])];
            const domain = targetDomain.toLowerCase();
            const isOfficialTaiwanGov = isOfficialTaiwanGovDomain(domain);
            const isTrustedGlobalRootDomain = isTrustedGlobalDomain(domain);
            const isConfiguredAllowlistDomain = currentWhitelist.some(allowedDomain => isSameRootDomain(domain, allowedDomain));
            const domainParts = getDomainParts(domain);
            const registrableDomain = domainParts.registrableDomain || domain;
            const isTrustedEcommerceRootDomain = isTrustedEcommerceDomain(domain);
            const isTrustedTaiwanServiceRootDomain = isTrustedTaiwanServiceDomain(domain);
            const isTrustedFinancialServiceRootDomain = isTrustedFinancialServiceDomain(domain);
            const isTrustedGovernmentServiceRootDomain = isTrustedGovernmentServiceDomain(domain);
            const isTrustedPublicInterestRootDomain = isTrustedPublicInterestDomain(domain);

            // 修正 1：嚴謹的白名單判定，並內建全球頂級可信根網域保護。
            const isWhitelisted = isOfficialTaiwanGov || isTrustedGlobalRootDomain || isTrustedEcommerceRootDomain || isTrustedTaiwanServiceRootDomain || isTrustedFinancialServiceRootDomain || isTrustedGovernmentServiceRootDomain || isTrustedPublicInterestRootDomain || isConfiguredAllowlistDomain;
            const isConfirmedScam = isConfirmedScamDomain(domain);
            const confirmedScamProfile = isConfirmedScam ? (RISK_CONFIG.confirmedScamProfiles?.[domain] || null) : null;
            const isManualHighRisk = isManualHighRiskDomain(domain);

            // 👇 判斷是否為社群平台
            const socialMediaDomains = getRiskList('socialMediaDomains');
            const isSocialMedia = socialMediaDomains.some(s => domain === s || domain.endsWith('.' + s));

            const isTrustedTLD = domain.endsWith('.com.tw') ||
                domain.endsWith('.org.tw') ||
                domain.endsWith('.gov.tw') ||
                domain.endsWith('.edu.tw');

            const highRiskSuffixes = getRiskList('highRiskTlds');
            const isVeryHighRiskTLD = highRiskSuffixes.some(s => domain.endsWith(s));
            const suspiciousTlds = getRiskList('suspiciousTlds');
            const isSuspiciousTLD = suspiciousTlds.some(s => domain.endsWith(s)) || domain.endsWith('.info');

            if (!isWhitelisted && isSuspiciousTLD && removedTrackingParamsForScan.length > 0) {
                return createUrlOnlySuspiciousAdLandingResult(targetDomain, fullUrl, scanOptions);
            }

            let resolvedIp = null;
            let prefetchedCofactsRiskData = null;
            try {
                const dnsData = await fetchJsonSafely(`https://dns.google/resolve?name=${targetDomain}&type=A`, null);
                if (dnsData?.Status === 3) {
                    prefetchedCofactsRiskData = await withTimeout(
                        checkCofactsRiskSignals(domain, fullUrl),
                        4000,
                        { matched: false, count: 0, matches: [], level: 'none', riskScore: 0, strongRisk: false }
                    );
                    if (!prefetchedCofactsRiskData?.matched) {
                        return { domain: targetDomain, isInvalid: true, invalidMsg: '此網域尚未註冊或不存在 (NXDOMAIN)' };
                    }
                }
                if (dnsData?.Answer && dnsData.Answer.length > 0) {
                    const aRecord = dnsData.Answer.find(r => r.type === 1);
                    if (aRecord) resolvedIp = aRecord.data;
                }
            } catch (e) { }

            const shorteners = getRiskList('urlShorteners');
            // 修正：改用嚴格的網域比對，避免 t.co 誤殺包含 t.co 的正常網域
            const isInputShortener = shorteners.some(s => inputDomain === s || inputDomain.endsWith('.' + s));
            const hasOfficialShortenerPolicy = getOfficialShortenerDestinationDomains(inputDomain).length > 0;
            const isOfficialInputShortener = isInputShortener &&
                isVerifiedSafeRootDomain(inputDomain, currentWhitelist) &&
                (!hasOfficialShortenerPolicy || scanOptions.officialShortenerDestinationVerified === true);
            const hasUnresolvedPublicShortener = unresolvedShortener && isInputShortener && !isOfficialInputShortener;
            const nestedUrls = extractNestedUrls(fullUrl);
            const nestedDomains = nestedUrls.map(item => {
                try { return new URL(item).hostname.toLowerCase(); } catch (e) { return ''; }
            }).filter(Boolean);
            const isEmailTrackingDomain = isEmailTrackingRedirector(domain);
            const hasNestedUrl = nestedUrls.length > 0;
            const hasEmailTrackingRedirect = isEmailTrackingDomain && hasNestedUrl;
            const defaultSiteStatus = {
                status: 'unknown',
                msg: '頁面內容檢測逾時或 API 暫時無回應',
                hasIframe: false,
                finalUrl: null,
                linkStats: { total: 0, internal: 0, external: 0 },
                analyticsIdentifiers: [],
                pageSignals: createEmptyPageSignals()
            };
            const unresolvedShortenerSiteStatus = {
                ...defaultSiteStatus,
                status: 'unresolved-shortener',
                msg: '公共縮網址的最終目的地尚未解析，不以中介頁內容進行品牌或網站風險判定',
                source: 'shortener-preflight'
            };
            const trustedEcommerceSiteStatus = {
                status: 'trusted',
                code: 200,
                msg: `已驗證電商官方根網域：${registrableDomain}，略過深度爬取與追蹤參數扣分`,
                hasIframe: false,
                finalUrl: fullUrl,
                linkStats: { total: 0, internal: 0, external: 0 },
                hasApk: false,
                source: 'trusted-ecommerce-root',
                analyticsIdentifiers: [],
                pageSignals: createEmptyPageSignals()
            };

            // 將 Google Safe Browsing 加入平行掃描陣列中
            const [geoLocationData, networkInfoData, securityHeadersData, siteSeoData, siteStatusData, blocklistListed, trancoData, rdapData, certData, traceData, safeBrowsingData, officialAlertData, cofactsRiskData] = await Promise.all([
                withTimeout(resolvedIp ? fetchGeoLocation(resolvedIp) : Promise.resolve(null), 2000, null),
                withTimeout(fetchNetworkInfo(domain), 5000, null),
                withTimeout(fetchSecurityHeaders(fullUrl), 5000, { status: 'unavailable', missingAll: false, missing: [] }),
                withTimeout(fetchSiteSeoData(fullUrl), 5000, { status: 'unavailable', matched: false, score: 0, robots: {}, sitemap: {} }),
                withTimeout(
                    (hasUnresolvedPublicShortener
                            ? Promise.resolve(unresolvedShortenerSiteStatus)
                            : (services.checkSiteAvailability || checkSiteAvailability)(fullUrl, {
                                rawUrl: rawScanUrl,
                                sanitizedUrl: sanitizedScanUrl,
                                removedVolatileParams: removedVolatileParamsForScan
                            })),
                    9000,
                    defaultSiteStatus
                ),
                withTimeout((services.checkCommunityBlocklists || checkCommunityBlocklists)(domain), 4000, false),
                withTimeout(checkTrancoRank(domain), 5000, { status: 'unavailable', rank: null }),
                withTimeout(fetchRDAPData(domain), 6000, { date: null, expirationDate: null, registrationPeriodDays: null, privacyDetected: false, registrarName: null, registrantName: null, registrantOrganization: null }),
                withTimeout(fetchCertificateData(domain), 5000, { notBefore: null, source: null }),
                withTimeout(tracePreflightCompleted ? Promise.resolve(preResolvedTrace) : fetchTraceData(fullUrl), 11000, null),
                // 👇 新增：呼叫自己寫好的 Google Safe Browsing 代理 API
                withTimeout(fetchJsonSafely(`/api/safe-browsing?url=${encodeURIComponent(fullUrl)}`, { status: 'unavailable', isUnsafe: null }), 4000, { status: 'timeout', isUnsafe: null }),
                withTimeout(checkOfficialAlerts(domain, fullUrl), 4000, { matched: false, count: 0, matches: [] }),
                prefetchedCofactsRiskData
                    ? Promise.resolve(prefetchedCofactsRiskData)
                    : withTimeout(checkCofactsRiskSignals(domain, fullUrl), 4000, { matched: false, count: 0, matches: [], level: 'none', riskScore: 0, strongRisk: false })
            ]);

            const companyFallback = {
                checked: false,
                status: 'unavailable',
                verified: false,
                domainMatched: false,
                registrationMatched: false,
                confidenceScore: 0,
                entities: [],
                companies: [],
                evidence: [],
                disclosure: '組織與法人公開資料服務暫時無法查詢，本項不納入風險計分。'
            };
            const govAgencyFallback = {
                checked: false,
                status: 'unavailable',
                officialDomain: isOfficialTaiwanGov,
                verified: false,
                directAgencyMatched: false,
                agencies: [],
                evidence: [],
                disclosure: '政府機關公開資料暫時無法查詢，本項先不顯示；.gov.tw 官方網域仍會保留安全判定。'
            };
            const [analyticsClusterData, organizationVerificationData, govAgencyVerificationData] = await Promise.all([
                withTimeout(checkAnalyticsClusterSignals(domain, siteStatusData.analyticsIdentifiers), 2500, {
                    checked: false,
                    matched: false,
                    status: 'safe',
                    detectedCount: Array.isArray(siteStatusData.analyticsIdentifiers) ? siteStatusData.analyticsIdentifiers.length : 0,
                    matchedIdentifierCount: 0,
                    knownHighRiskCount: 0,
                    items: [],
                    evidenceSources: [],
                    details: '詐騙站群關聯索引暫時無法查詢。'
                }),
                withTimeout(
                    checkOrganizationVerification(domain, siteStatusData.pageSignals?.businessIdentitySignals || {}),
                    6500,
                    companyFallback
                ),
                withTimeout(
                    checkGovernmentAgencyVerification(domain, siteStatusData.pageSignals?.govAgencySignals || {}),
                    6500,
                    govAgencyFallback
                )
            ]);

            // TLS 憑證會定期續發，核發日不能代表網域註冊日。
            // 註冊年齡只接受 RDAP/WHOIS 明確的 registration/creation 日期。
            const isSharedEuCcTenant = domain !== 'eu.cc' && domain.endsWith('.eu.cc');
            const isSharedGithubPagesTenant = isGithubPagesHostname(domain);
            const ignoreSharedTenantRegistration = isSharedEuCcTenant || isSharedGithubPagesTenant || !!rdapData.registrationUnavailable;
            const rdapDate = ignoreSharedTenantRegistration ? null : (rdapData.date || null);
            const rdapExpirationDate = ignoreSharedTenantRegistration ? null : (rdapData.expirationDate || null);
            const privacyDetected = ignoreSharedTenantRegistration ? false : rdapData.privacyDetected;
            const registrarName = ignoreSharedTenantRegistration ? '' : (rdapData.registrarName || '');
            const rdapRegistrantName = ignoreSharedTenantRegistration ? null : rdapData.registrantName;
            const rdapRegistrantOrganization = ignoreSharedTenantRegistration ? null : rdapData.registrantOrganization;
            const rdapQueriedDomain = ignoreSharedTenantRegistration
                ? (registrableDomain || domain)
                : (rdapData.queriedDomain || registrableDomain || domain);
            const serverInfo = geoLocationData || networkInfoData;
            const serverIp = serverInfo?.ip || resolvedIp || null;
            const serverCountryDetails = serverInfo?.isReal
                ? `所在國家: ${serverInfo.country}${serverIp ? `；IP: ${serverIp}` : ''}${serverInfo.org ? `；服務商: ${serverInfo.org}` : ''}${serverInfo.asn ? `；ASN: ${serverInfo.asn}` : ''}`
                : '無法自動判定伺服器所在國家';
            const mxInfo = networkInfoData?.dns?.mx || { status: 'unavailable', hasMx: false, records: [] };
            const hasMissingMxRecordsRaw = !isWhitelisted && !isSocialMedia && mxInfo.status === 'missing';
            const hasMissingAllSecurityHeadersRaw = !isWhitelisted &&
                !isSocialMedia &&
                securityHeadersData?.status === 'ok' &&
                !!securityHeadersData.missingAll;
            const traceChain = traceData ? traceData.chain : [];
            const hasUaDifference = !!traceData?.uaDifference;
            const hasUaCloakingRisk = hasUaDifference && !!traceData?.isHighRisk;
            let traceFinalHostname = inputDomain;
            try {
                traceFinalHostname = normalizeHostname(new URL(traceData?.finalUrl || inputScanUrl).hostname);
            } catch (err) { }
            const isTraceHighRiskSameRoot = !!traceData?.isHighRisk && isSameRootDomain(inputDomain, traceFinalHostname);
            const hasHighRiskRedirectTrace = !!traceData?.isHighRisk &&
                (isInputShortener || hasUaDifference || !isTraceHighRiskSameRoot);
            const uaCloakingDetails = hasUaDifference
                ? `Mobile 最終網址: ${traceData.mobileFinalUrl || '無法判定'}；Desktop 最終網址: ${traceData.desktopFinalUrl || '無法判定'}`
                : traceData?.uaComparisonComplete === false
                    ? '部分裝置轉址追蹤未完成，無法確認 Mobile 與 Desktop 目的地是否一致'
                    : 'Mobile 與 Desktop 檢測路徑未發現明顯差異';
            const freeHostingProviders = getRiskList('freeHostingProviders');
            const isFreeHosting = freeHostingProviders.some(p => isSameRootDomain(domain, p));
            const isCloudflarePagesDev = isCloudflarePagesDevHostname(domain);
            const isNetlifyApp = isNetlifyAppHostname(domain);
            const isWeeblyHostedSite = domain !== 'weebly.com' && isSameRootDomain(domain, 'weebly.com');
            const isEuCcHostedSite = isSharedEuCcTenant;
            const isGithubPagesSite = isSharedGithubPagesTenant;
            const blocksSharedProviderTrust = isEuCcHostedSite || isGithubPagesSite;
            const trancoRank = blocksSharedProviderTrust ? null : (trancoData?.rank || null);
            const trancoStatus = blocksSharedProviderTrust ? 'unranked' : (trancoData?.status || 'unavailable');
            const trancoQueriedDomain = blocksSharedProviderTrust ? domain : (trancoData?.queriedDomain || domain);
            const trancoDateText = trancoData?.date ? ` (${trancoData.date})` : '';
            const hasRankedRootDomainFallback = trancoRank !== null &&
                normalizeHostname(trancoQueriedDomain) !== domain &&
                isSameRootDomain(domain, trancoQueriedDomain);
            const hasRootDomainTrustBaseline = hasRankedRootDomainFallback || isTrustedEcommerceRootDomain || isTrustedTaiwanServiceRootDomain || isTrustedFinancialServiceRootDomain || isTrustedGovernmentServiceRootDomain || isTrustedPublicInterestRootDomain;

            // Tranco 查詢失敗不等於低信任；只有明確查無排名才視為低流量。
            const isHighTraffic = (trancoRank !== null || (isWhitelisted && !isFreeHosting) || isTrustedEcommerceRootDomain);
            let isLowTraffic = trancoStatus === 'unranked' && !isHighTraffic;
            const isUnknownTraffic = trancoStatus === 'unavailable' && !isHighTraffic;
            const safeShorteners = getRiskList('safeShorteners');

            let trafficStatus = 'warning';
            let trafficDetails = isUnknownTraffic ? 'Tranco 排名查詢暫時無法取得，不以低流量扣分' : '未進入 Tranco 全球熱門排名 (流量較低)';
            if (trancoRank && !isFreeHosting) {
                trafficStatus = 'safe';
                trafficDetails = `Tranco 全球排名第 ${trancoRank.toLocaleString()} 名${trancoQueriedDomain !== domain ? `（以 ${trancoQueriedDomain} 查詢）` : ''}${trancoDateText} (高流量網站)`;
            } else if (isWhitelisted || isTrustedTLD) {
                trafficStatus = 'safe';
                if (safeShorteners.some(s => domain.endsWith(s))) {
                    trafficDetails = '此為常用縮網址服務，建議留意最終轉址後的網站。';
                } else if (domain.endsWith('mgp.care')) {
                    trafficDetails = 'MyGoPen 官方服務，安全無虞';
                } else if (isTrustedGlobalRootDomain) {
                    trafficDetails = '全球頂級可信根網域，Tranco 暫時無法取得時不以低流量扣分';
                } else if (isTrustedTaiwanServiceRootDomain) {
                    trafficDetails = '受信賴台灣民營服務官方網域，流量排名不足不作為風險加權';
                } else if (isTrustedFinancialServiceRootDomain) {
                    trafficDetails = '受信賴金融服務官方網域，流量排名不足不作為風險加權';
                } else if (isTrustedGovernmentServiceRootDomain) {
                    trafficDetails = '受信賴政府官方服務網域，流量排名不足不作為風險加權';
                } else if (isTrustedPublicInterestRootDomain) {
                    trafficDetails = '受信賴公益/宗教/公共利益資訊網域，流量排名不足不作為風險加權';
                } else if (isConfiguredAllowlistDomain) {
                    trafficDetails = '受信賴白名單網域，流量排名不足不作為風險加權';
                } else {
                    trafficDetails = '受信賴的台灣在地或政府教育網站';
                }
            } else if (isFreeHosting) {
                trafficStatus = 'warning';
                if (isEuCcHostedSite) {
                    trafficDetails = '「eu.cc」是共享子網域服務；目前網域屬個別使用者建立的租戶，不得繼承 eu.cc 根網域的流量、年齡或信任。';
                } else if (isGithubPagesSite) {
                    trafficDetails = '「github.io」是 GitHub Pages 共享架站服務；目前網址是個別使用者建立的租戶，不得繼承 GitHub 母網域的流量、年齡或信任。';
                } else if (domain.endsWith('zeabur.app')) {
                    trafficDetails = '「zeabur.app」是 Zeabur 雲端部署平台提供的免費/預設子網域，任何人都可以在幾分鐘內匿名註冊並部署網頁，無法確認其正當性。';
                } else if (isCloudflarePagesDev) {
                    trafficDetails = '「pages.dev」是 Cloudflare Pages 的免費/預設部署子網域，任何人都可建立專案頁；需視為使用者自建臨時站，而非 Cloudflare 官方內容。';
                } else if (isNetlifyApp) {
                    trafficDetails = '「netlify.app」是 Netlify 免費/預設託管子網域，代表使用者自建臨時站而非 Netlify 官方內容；若專案名呈現隨機字詞與代碼組合，需提高警覺。';
                } else if (isWeeblyHostedSite) {
                    trafficDetails = '「weebly.com」是 Weebly 免費/低門檻架站子網域，代表使用者自建網站而非 Weebly 官方內容；需確認品牌、付款與客服資訊是否可信。';
                } else {
                    trafficDetails = `使用免費架站平台 (${domain.split('.').slice(-2).join('.')})，常見於詐騙免洗網站`;
                }
            } else if (isUnknownTraffic) {
                trafficStatus = 'unknown';
            }

            const subdomainPart = domain.split('.')[0];
            const rootLabel = domainParts.rootLabel || '';
            const entropy = calculateEntropy(subdomainPart);
            const rootEntropy = calculateEntropy(rootLabel);
            
            // 可讀的長英文品牌名不是亂碼；長度規則需同時帶有數字或高亂度。
            const isLongGibberish = entropy > 3.6 ||
                (/^[a-z0-9]{12,30}$/.test(subdomainPart) && /\d/.test(subdomainPart));
            // 👇 新增：極端亂碼檢查 (15碼以上的隨機英數，極高機率為釣魚專屬追蹤碼)
            const isExtremeGibberish = /^[a-z0-9]{15,50}$/.test(subdomainPart);
            // 👇 2. 新增：短亂碼 (DGA 演算法) 暴力檢查法
            // 特徵 A：5個字母以上，卻完全沒有母音 a, e, i, o, u (例如 yqhgw, xsddk)
            const lacksVowels = subdomainPart.length >= 5 && !/[aeiou]/i.test(subdomainPart);
            // 特徵 B：連續出現 4 個以上的子音字母，極度不符合正常英文拼字邏輯
            const hasConsecutiveConsonants = /[bcdfghjklmnpqrstvwxz]{4,}/i.test(subdomainPart);
            const suspiciousSubdomain = analyzeSuspiciousSubdomain(domain);
            const hasNumericOnlySubdomain = domainParts.subdomainLabels.some(label => /^\d{3,8}$/.test(label));
            
            // 只要符合任一項特徵，且不是常見的 www 等，就判定為高風險亂碼
            const isHighEntropy = (isLongGibberish || lacksVowels || hasConsecutiveConsonants) && subdomainPart !== 'www';
            const isSuspiciousRootLabel = rootLabel.length >= 8 &&
                !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify', 'quickper'].includes(rootLabel) &&
                (!hasReadableVowelPattern(rootLabel) || rootEntropy > 3.2 || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(rootLabel));
            const isSuspiciousLandingRootLabel = rootLabel.length >= 10 &&
                !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify', 'quickper'].includes(rootLabel) &&
                (rootEntropy > 3.0 || /[qxzj]/i.test(rootLabel) || /[bcdfghjklmnpqrstvwxz]{3,}/i.test(rootLabel));
            const disposableRoot = analyzeDisposableRootLabel(rootLabel);
            const hasDisposableRootLabel = !isWhitelisted && disposableRoot.matched;
            
            const hyphenCount = (domain.match(/-/g) || []).length;
            const hasMultipleHyphens = hyphenCount >= 2;

            // [修改] 檢查網域是否包含 -tw、-com 或 -online 等常見詐騙字樣
            const suspiciousDomainFragments = getRiskList('suspiciousDomainFragments');
            const hasSuspiciousTempDomain = suspiciousDomainFragments.some(fragment => domain.includes(fragment));

            let isRedirected = false;
            let finalDomain = '';
            let isKnownShortener = false;
            let redirectDetails = '未偵測到跨網域轉址';

            let finalHyphenCount = 0;
            let isFinalFakeGov = false;
            let hasFinalSuspiciousTemp = false;
            let isFinalWhitelisted = false;
            let isSameRootRedirect = false;
            // 👇 新增：判斷最終網域是否為 .top / .xyz 等高危險後綴
            let isFinalVeryHighRiskTLD = false;

            let isFinalSafePlatform = false; // 1. 新增這行：合法開店平台標記

            if (traceData && traceData.finalUrl) siteStatusData.finalUrl = traceData.finalUrl;
            if (siteStatusData.finalUrl) {
                try {
                    const finalUrlObj = new URL(siteStatusData.finalUrl);
                    finalDomain = finalUrlObj.hostname.toLowerCase();
                    const redirectSourceDomain = resolvedFromShortener ? inputDomain : domain;
                    const cleanDomain = redirectSourceDomain.replace(/^www\./, '');
                    const cleanFinalDomain = finalDomain.replace(/^www\./, '');
                    if (resolvedFromShortener || cleanDomain !== cleanFinalDomain) {
                        isRedirected = true;
                        // 修正：同樣改為嚴格的網域比對
                        isKnownShortener = shorteners.some(s => cleanDomain === s || cleanDomain.endsWith('.' + s));

                        // 👇 新增：判斷是否為同一個主網域的子網域互轉 (如 brand.com -> shop.brand.com)
                        const isSameRoot = cleanFinalDomain.endsWith(cleanDomain) || cleanDomain.endsWith(cleanFinalDomain);
                        isSameRootRedirect = isSameRoot;

                        redirectDetails = `偵測到轉址至: ${finalDomain}`;
                        if (isKnownShortener) redirectDetails += ` (由短網址 ${cleanDomain} 解析)`;
                        else if (isSameRoot) redirectDetails += ' (內部子網域跳轉)'; // 標記為內部跳轉

                        finalHyphenCount = (finalDomain.match(/-/g) || []).length;
                        isFinalFakeGov = finalDomain.includes('gov') && !finalDomain.endsWith('.gov') && !finalDomain.endsWith('.gov.tw');
                        hasFinalSuspiciousTemp = suspiciousDomainFragments.some(fragment => finalDomain.includes(fragment));

                        // 👇 檢查最終網域是否使用詐騙後綴
                        isFinalVeryHighRiskTLD = highRiskSuffixes.some(s => finalDomain.endsWith(s));

                        isFinalWhitelisted = isVerifiedSafeRootDomain(finalDomain, currentWhitelist);
                        // 👇 2. 新增：判斷是否導向台灣常見的合法開店平台
                        const safePlatforms = getRiskList('safeCommercePlatforms');
                        isFinalSafePlatform = safePlatforms.some(p => finalDomain === p || finalDomain.endsWith('.' + p));
                    }
                } catch (e) { }
            }

            const highRiskRegistrars = getRiskList('highRiskRegistrars');
            const isHighRiskRegistrar = registrarName && highRiskRegistrars.some(r => registrarName.toLowerCase().includes(r));
            const isDeepSubdomain = domain.split('.').length >= 5;
            const embeddedTrustedTldLabels = ['com.tw', 'org.tw', 'gov.tw', 'edu.tw', 'net.tw'];
            const hasEmbeddedTrustedTldLabel = embeddedTrustedTldLabels.some(tld =>
                `.${domain}.`.includes(`.${tld}.`) && !domain.endsWith(`.${tld}`)
            );
            const hasRemovedVolatileParams = removedVolatileParamsForScan.length > 0;
            const hasSuspiciousParams = hasSensitiveUrlParam(fullUrl) || hasRemovedVolatileParams;
            const trustedEndpointPath = (() => {
                try {
                    return new URL(fullUrl).pathname.toLowerCase();
                } catch (e) {
                    return '';
                }
            })();
            const hasPaymentOrApiPath = /\/(?:api|checkout|checkoutnow|payment|payments|pay|billing|token|session|oauth|auth)(?:\/|$)/i.test(trustedEndpointPath);
            const defaultLandingParams = ['ldtag_cl=', 'lt_r=', 'fbclid=', 'gclid=', 'utm_', 'click_id=', 'campaign=', 'ad_id=', 'clickid=', 'cid=', 'aff_id='];
            const landingParamList = [...new Set([...getRiskList('suspiciousLandingParams'), ...defaultLandingParams])];
            const rawScanUrlLower = String(rawScanUrl || fullUrl || '').toLowerCase();
            const matchedLandingParams = landingParamList.filter(key => fullUrl.toLowerCase().includes(key));
            const matchedRawLandingParams = landingParamList.filter(key => rawScanUrlLower.includes(key));
            const rawAdLandingParamDetails = [...new Set([
                ...matchedRawLandingParams.map(key => key.replace(/=$/, '').replace(/_$/, '_*')),
                ...removedTrackingParamsForScan
            ])].filter(Boolean);
            const hasSuspiciousLandingParams = matchedLandingParams.length > 0;
            const hasRawAdvertisingLandingParams = rawAdLandingParamDetails.length > 0;
            const hasNestedSuspiciousParams = nestedUrls.some(url => hasSensitiveUrlParam(url));
            const hasRandomizedPathToken = (() => {
                try {
                    return new URL(fullUrl).pathname
                        .split('/')
                        .filter(Boolean)
                        .some(segment => /^[a-z0-9_-]{8,50}$/i.test(segment) && /[a-z]/i.test(segment) && /\d/.test(segment));
                } catch (e) {
                    return false;
                }
            })();
            const hasCloudflarePagesDevBaselineRisk = !isWhitelisted && isCloudflarePagesDev;
            const hasNetlifyAppBaselineRisk = !isWhitelisted && isNetlifyApp;
            const hasWeeblyHostedBaselineRisk = !isWhitelisted && isWeeblyHostedSite;
            const hasEuCcHostedBaselineRisk = !isWhitelisted && isEuCcHostedSite;
            const hasGithubPagesBaselineRisk = !isWhitelisted && isGithubPagesSite;
            const hasFreeHostingPlatformBaselineRisk = hasCloudflarePagesDevBaselineRisk || hasNetlifyAppBaselineRisk || hasWeeblyHostedBaselineRisk || hasEuCcHostedBaselineRisk || hasGithubPagesBaselineRisk;
            const hasCloudflarePagesDevRandomSubdomain = isHighEntropy ||
                suspiciousSubdomain.reasons.some(reason =>
                    reason.includes('短隨機') ||
                    reason.includes('不易讀') ||
                    reason.includes('純數字')
                );
            const hasCloudflarePagesDevRandomRisk = hasCloudflarePagesDevBaselineRisk &&
                (hasCloudflarePagesDevRandomSubdomain || hasRandomizedPathToken || hasSuspiciousParams || hasNestedSuspiciousParams);
            const hasNetlifyAppRandomSubdomain = hasGeneratedNetlifySubdomain(domain) ||
                isHighEntropy ||
                suspiciousSubdomain.reasons.some(reason =>
                    reason.includes('短隨機') ||
                    reason.includes('不易讀') ||
                    reason.includes('純數字')
                );
            const hasNetlifyAppRandomRisk = hasNetlifyAppBaselineRisk &&
                (hasNetlifyAppRandomSubdomain || hasRandomizedPathToken || hasSuspiciousParams || hasNestedSuspiciousParams);
            const isFakeGov = domain.includes('gov') && !domain.endsWith('.gov') && !domain.endsWith('.gov.tw') && !isWhitelisted;
            let hasTrustedAllowlistOverride = isWhitelisted && !isSocialMedia && !isFakeGov && !isFinalFakeGov && !hasHighRiskRedirectTrace && !unresolvedShortener;
            const isTrustedPaymentGatewayOrApiEndpoint = hasTrustedAllowlistOverride &&
                (isGlobalPaymentGatewayDomain(domain) || (isTrustedGlobalRootDomain && hasPaymentOrApiPath));
            //新增：判斷是否假冒公共事業 (電子發票、台電、自來水、遠通)
            const fakeServiceKeywords = getRiskList('fakeServiceKeywords');
            const isFakeService = fakeServiceKeywords.some(kw => domain.includes(kw) || finalDomain.includes(kw)) && !isWhitelisted;
            const pageSignals = siteStatusData.pageSignals || defaultSiteStatus.pageSignals;
            const govAgencySignals = pageSignals.govAgencySignals || createEmptyPageSignals().govAgencySignals;
            const pageBrandSignals = pageSignals.pageBrandSignals || createEmptyPageSignals().pageBrandSignals;
            const urgencySignals = pageSignals.urgencySignals || createEmptyPageSignals().urgencySignals;
            const sensitiveFieldCount = pageSignals.sensitiveFields?.count || 0;
            const highRiskSensitiveFieldCount = pageSignals.sensitiveFields?.highRiskCount || 0;
            const lowRiskSensitiveFieldCount = pageSignals.sensitiveFields?.lowRiskCount || 0;
            const externalResourceCount = pageSignals.externalResources?.count || 0;
            const externalFormActionCount = pageSignals.externalResources?.formActionCount || 0;
            const suspiciousExternalResourceCount = pageSignals.externalResources?.suspiciousCount || 0;
            const suspiciousExternalIframeCount = pageSignals.externalResources?.suspiciousIframeCount || 0;
            const suspiciousExternalScriptCount = pageSignals.externalResources?.suspiciousScriptCount || 0;
            const downloadSignals = pageSignals.downloadSignals || createEmptyPageSignals().downloadSignals;
            const apkUrlCount = downloadSignals.apkUrlCount || 0;
            const installKeywordCount = downloadSignals.installKeywordCount || 0;
            const dynamicDownloadCount = downloadSignals.dynamicDownloadCount || 0;
            const suspiciousDownloadPath = !!downloadSignals.suspiciousPath;
            const suspiciousDownloadPathCount = downloadSignals.suspiciousPathFragments?.length || 0;
            const shoppingScamSignals = pageSignals.shoppingScamSignals || createEmptyPageSignals().shoppingScamSignals;
            const jobTaskScamSignals = pageSignals.jobTaskScamSignals || createEmptyPageSignals().jobTaskScamSignals;
            const ecommerceTrustSignals = pageSignals.ecommerceTrustSignals || createEmptyPageSignals().ecommerceTrustSignals;
            const seoSignals = pageSignals.seoSignals || createEmptyPageSignals().seoSignals;
            const languageSignals = pageSignals.languageSignals || createEmptyPageSignals().languageSignals;
            const businessIdentitySignals = pageSignals.businessIdentitySignals || createEmptyPageSignals().businessIdentitySignals;
            const hasOfficialCompanyDomainMatch = !!organizationVerificationData?.verified;
            const hasRegisteredBusinessIdentity = !!organizationVerificationData?.registrationMatched;
            const hasConditionalCompanyTrust = hasOfficialCompanyDomainMatch && !isWhitelisted && !isSocialMedia;
            const verifiedCompany = (organizationVerificationData?.entities || organizationVerificationData?.companies || [])[0] || null;
            const hasVerifiedGovernmentAgency = !!govAgencyVerificationData?.verified;
            const verifiedGovernmentAgency = (govAgencyVerificationData?.agencies || [])[0] || null;
            const lineOfficialSignals = pageSignals.lineOfficialSignals || createEmptyPageSignals().lineOfficialSignals;
            const regulatedTobaccoSalesSignals = pageSignals.regulatedTobaccoSalesSignals || createEmptyPageSignals().regulatedTobaccoSalesSignals;
            const officialAlertMatches = officialAlertData?.matches || [];
            const officialAlertMatch = officialAlertMatches[0] || null;
            const hasOfficialAlert = !!officialAlertData?.matched;
            const hasOfficialAlertUrlMatch = hasOfficialAlert && officialAlertMatches.some(item => ['url', 'url-prefix'].includes(item.matchType));
            const cofactsMatches = cofactsRiskData?.matches || [];
            const cofactsMatch = cofactsMatches[0] || null;
            const hasCofactsRecord = !!cofactsRiskData?.matched;
            const cofactsRiskScore = hasCofactsRecord
                ? Math.max(0, Math.min(75, Number(cofactsRiskData?.riskScore || 0)))
                : 0;
            const hasCofactsFraudEvidence = cofactsRiskScore >= 50;
            const hasStrongCofactsRisk = !!cofactsRiskData?.strongRisk &&
                cofactsRiskScore >= 60 &&
                !cofactsRiskData?.hasConflict;
            const hasInstallKeywordSignal = installKeywordCount >= 2 || (installKeywordCount > 0 && suspiciousDownloadPath);
            const hasDynamicDownloadSignal = dynamicDownloadCount >= 2 && (installKeywordCount >= 2 || suspiciousDownloadPath);
            const hasSuspiciousDownloadLanding = suspiciousDownloadPath &&
                (installKeywordCount > 0 || dynamicDownloadCount > 0 || suspiciousDownloadPathCount >= 2);
            const brandSimilarity = checkBrandSimilarity(domain, currentWhitelist);
            const finalBrandSimilarity = finalDomain ? checkBrandSimilarity(finalDomain, currentWhitelist) : { matched: false };
            const nestedBrandSimilarity = nestedDomains.map(item => checkBrandSimilarity(item, currentWhitelist)).find(item => item.matched) || { matched: false };
            const matchedBrandSimilarity = brandSimilarity.matched ? brandSimilarity : (finalBrandSimilarity.matched ? finalBrandSimilarity : nestedBrandSimilarity);
            const hasBrandSimilarity = !!matchedBrandSimilarity.matched;
            const hasGithubPagesBrandImpersonationRisk = !isWhitelisted && isGithubPagesSite && hasBrandSimilarity;
            const domainAgeDays = getPastAgeDays(rdapDate);
            const isVeryNewDomain = domainAgeDays !== null && domainAgeDays < 90;
            const isNewDomainUnderSixMonths = domainAgeDays !== null && domainAgeDays < 183;
            const registrationPeriodDays = !ignoreSharedTenantRegistration && rdapData.registrationPeriodDays !== null && rdapData.registrationPeriodDays !== undefined
                ? rdapData.registrationPeriodDays
                : getDaysBetweenDates(rdapDate, rdapExpirationDate);
            const hasOneYearRegistrationPeriod = isOneYearRegistrationPeriod(registrationPeriodDays);
            const hasNewOneYearRegistrationRisk = !isWhitelisted &&
                !isOfficialTaiwanGov &&
                isNewDomainUnderSixMonths &&
                hasOneYearRegistrationPeriod;
            const certAgeDays = getPastAgeDays(certData?.notBefore);
            const isVeryNewCertificate = certAgeDays !== null && certAgeDays < 90;
            const certIssuerText = certData?.issuerName ? `；簽發者: ${certData.issuerName}` : '';
            const certExpiryText = certData?.notAfter ? `；有效至: ${new Date(certData.notAfter).toISOString().split('T')[0]}` : '';
            const isNewDomainWithNewCertificate = isVeryNewDomain && isVeryNewCertificate && !isWhitelisted;
            const normalizedRegistrantTextForBusiness = normalizeBusinessName([
                rdapRegistrantName,
                rdapRegistrantOrganization
            ].filter(Boolean).join(' '));
            const matchedBusinessEntityName = (businessIdentitySignals.names || []).find(name => {
                const normalizedName = normalizeBusinessName(name);
                return normalizedName &&
                    normalizedRegistrantTextForBusiness &&
                    (normalizedRegistrantTextForBusiness.includes(normalizedName) ||
                        normalizedName.includes(normalizedRegistrantTextForBusiness));
            }) || '';
            const hasWhoisVerifiedBusinessEntity = !!matchedBusinessEntityName ||
                (!!normalizedRegistrantTextForBusiness && businessIdentitySignals.hasTaxId && businessIdentitySignals.names?.length > 0);
            const hasVerifiedBusinessEntity = hasOfficialCompanyDomainMatch || hasWhoisVerifiedBusinessEntity;
            const trustedTaiwanRegistrars = getRiskList('trustedTaiwanRegistrars');
            const isTrustedTaiwanRegistrar = domain.endsWith('.tw') &&
                registrarName &&
                trustedTaiwanRegistrars.some(r => registrarName.toLowerCase().includes(r));
            const combinedSeoScore = Math.min(100, (seoSignals.score || 0) + Math.min(60, siteSeoData?.score || 0));
            const hasMatureSeoSignals = combinedSeoScore >= 60 || (seoSignals.matched && siteSeoData?.matched);
            const hasPageBrandMismatch = !isWhitelisted && !hasBrandSimilarity && !!pageBrandSignals.matched;
            const hasOfficialFlowPathSignal = !isWhitelisted && hasOfficialFlowPath(fullUrl);
            const hasUrgencyScamSignal = !isWhitelisted && (urgencySignals.count || 0) > 0;
            const hasHomographSignal = !isWhitelisted && hasPunycodeOrUnicodeHostname(domain, fullUrl);
            const hasFinancialPhishingSignal = !isWhitelisted &&
                hasFinancialPhishingText(fullUrl + '\n' + nestedUrls.join('\n')) &&
                !isFinalWhitelisted;
            const hasPublicUtilityScamSignal = !isWhitelisted &&
                (hasPublicUtilityScamText(fullUrl + '\n' + nestedUrls.join('\n')) ||
                    (matchedBrandSimilarity.brandName === '台灣電力公司' && hasNestedUrl)) &&
                !isFinalWhitelisted;
            const hasLogisticsScamSignal = !isWhitelisted &&
                hasLogisticsScamText(fullUrl + '\n' + nestedUrls.join('\n')) &&
                !isFinalWhitelisted;
            const hasLogisticsBrandPhishing = hasBrandSimilarity &&
                matchedBrandSimilarity.brandName === 'DHL' &&
                hasLogisticsScamSignal;
            const hasRegulatedTobaccoSalesSignal = !isWhitelisted &&
                !!regulatedTobaccoSalesSignals.matched;
            const hasJobTaskScamSignal = !isWhitelisted &&
                !!jobTaskScamSignals.matched &&
                (isVeryNewDomain || isLowTraffic || !hasVerifiedBusinessEntity);
            const hasFreeHostingSensitiveLinkRisk = !isWhitelisted &&
                isFreeHosting &&
                (hasSuspiciousParams || hasNestedSuspiciousParams || hasRemovedVolatileParams) &&
                (hasBrandSimilarity || hasSuspiciousTempDomain || isSuspiciousTLD || hasRandomizedPathToken || !isHighTraffic);
            const hasEncodedRedirectRisk = hasNestedUrl &&
                (hasEmailTrackingRedirect || nestedDomains.some(item => hasRiskyHostnamePattern(item)) || hasNestedSuspiciousParams);
            const hasStrongEcommerceValidation = ecommerceTrustSignals.matched &&
                siteStatusData.status === 'ok' &&
                !hasRegulatedTobaccoSalesSignal &&
                !hasBrandSimilarity &&
                !hasPageBrandMismatch &&
                !hasFinancialPhishingSignal &&
                !hasPublicUtilityScamSignal &&
                !hasLogisticsScamSignal &&
                !isFakeGov &&
                !isFakeService &&
                !hasDisposableRootLabel &&
                !hasSuspiciousTempDomain;
            const hasSmallBusinessTrustContext = hasStrongEcommerceValidation ||
                hasVerifiedBusinessEntity ||
                isTrustedTaiwanRegistrar ||
                hasMatureSeoSignals ||
                ((isTrustedTLD || domain.endsWith('.tw')) && domainAgeDays !== null && domainAgeDays >= 365);
            if (isLowTraffic && hasSmallBusinessTrustContext) {
                isLowTraffic = false;
                trafficStatus = 'info';
                trafficDetails = '未進入 Tranco 全球熱門排名；但具備中小型商家/台灣網域可信佐證，不作為風險加權';
            }
            const hasSuspiciousTldAdLandingRisk = !isWhitelisted &&
                isSuspiciousTLD &&
                hasRawAdvertisingLandingParams &&
                !hasStrongEcommerceValidation &&
                !hasVerifiedBusinessEntity &&
                !isTrustedTaiwanRegistrar &&
                !hasRootDomainTrustBaseline;
            const hasShoppingLandingRiskContext =
                hasDisposableRootLabel ||
                isSuspiciousRootLabel ||
                isSuspiciousLandingRootLabel ||
                suspiciousSubdomain.matched ||
                isVeryNewDomain ||
                hasSuspiciousTempDomain ||
                (isLowTraffic && !isTrustedTLD);
            const hasShoppingLandingUrlRisk = !isWhitelisted &&
                !hasStrongEcommerceValidation &&
                hasSuspiciousLandingParams &&
                hasShoppingLandingRiskContext;
            const unreadablePageStatuses = ['blank', 'error', 'unknown', 'blocked'];
            const hasVotePathSignal = (() => {
                try {
                    const decodedPath = decodeURIComponent(new URL(fullUrl).pathname).toLowerCase();
                    return /(?:^|\/)(?:vote|voting|poll|投票)(?:\/|$)/i.test(decodedPath);
                } catch (e) {
                    return false;
                }
            })();
            const hasFreeHostingVotePhishingRisk = !isWhitelisted &&
                isFreeHosting &&
                hasVotePathSignal &&
                unreadablePageStatuses.includes(siteStatusData.status) &&
                (isEuCcHostedSite || hasDisposableRootLabel || suspiciousSubdomain.matched || isLowTraffic);
            const hasDisposableShoppingLandingRisk = !isWhitelisted &&
                hasDisposableRootLabel &&
                hasSuspiciousLandingParams;
            const hasDisposableUnreadablePageRisk = !isWhitelisted &&
                hasDisposableRootLabel &&
                !isHighTraffic &&
                unreadablePageStatuses.includes(siteStatusData.status);
            const hasDisposableRootPhishingRisk = !isWhitelisted &&
                hasDisposableRootLabel &&
                !isHighTraffic &&
                (
                    suspiciousSubdomain.matched ||
                    isLowTraffic ||
                    isVeryNewDomain ||
                    unreadablePageStatuses.includes(siteStatusData.status)
                );
            const hasShoppingScamSignal = !isWhitelisted &&
                !hasStrongEcommerceValidation &&
                shoppingScamSignals.matched &&
                (
                    isLowTraffic ||
                    isHighEntropy ||
                    isSuspiciousRootLabel ||
                    hasSuspiciousTempDomain ||
                    hasSuspiciousParams ||
                    hasSuspiciousLandingParams ||
                    isVeryNewDomain ||
                    externalFormActionCount > 0 ||
                    suspiciousSubdomain.matched
                );
            const hasUnverifiedCommerceRisk = !isWhitelisted &&
                !hasStrongEcommerceValidation &&
                !!shoppingScamSignals.hasCommerceOffer &&
                !shoppingScamSignals.hasMerchantInfo &&
                !hasVerifiedBusinessEntity &&
                !isHighTraffic &&
                (isNewDomainUnderSixMonths || hasNewOneYearRegistrationRisk) &&
                (
                    !!shoppingScamSignals.hasTemplateDemoMarker ||
                    Number(shoppingScamSignals.stockImageCount || 0) >= 4 ||
                    !!shoppingScamSignals.hasOnePageStructure
                );
            const hasShoppingLineContactRisk = !isWhitelisted &&
                !hasStrongEcommerceValidation &&
                !!shoppingScamSignals.hasLineContactSignal &&
                !!shoppingScamSignals.hasLineOrderContext &&
                (hasShoppingScamSignal || hasShoppingLandingUrlRisk);
            const hasSuspiciousEmailTrackingHost = !isWhitelisted &&
                isEmailTrackingDomain &&
                !hasNestedUrl &&
                (isDeepSubdomain || isHighEntropy || suspiciousSubdomain.matched);
            const hasEmailTrackingPhishingPattern = !isWhitelisted &&
                hasEmailTrackingRedirect &&
                (isDeepSubdomain || isHighEntropy || suspiciousSubdomain.matched || hasFinancialPhishingSignal || hasBrandSimilarity);
            const hasDeepSubdomainPhishingPattern = !isWhitelisted &&
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
            const hasSuspiciousExternalTrustedRedirect = !isWhitelisted &&
                !isHighTraffic &&
                isRedirected &&
                isFinalWhitelisted &&
                !isSameRootRedirect &&
                hasNumericOnlySubdomain;

            const isGoogleFlagged = safeBrowsingData && safeBrowsingData.isUnsafe;
            const blocklistListedForRisk = !!blocklistListed;
            const isGoogleFlaggedForRisk = !!isGoogleFlagged;
            const hasSensitiveExternalForm = (pageSignals.externalResources?.sensitiveFormActionCount || 0) > 0;
            if (blocklistListedForRisk || isGoogleFlaggedForRisk || isConfirmedScam || isManualHighRisk ||
                hasOfficialAlert || hasStrongCofactsRisk || hasSensitiveExternalForm) hasTrustedAllowlistOverride = false;
            const isApkSite = (siteStatusData.hasApk || apkUrlCount > 0) && !isWhitelisted;
            const isDownloadPhishingSignal = !isWhitelisted && !isApkSite &&
                (hasInstallKeywordSignal || hasDynamicDownloadSignal || hasSuspiciousDownloadLanding);

            const pageTrustSignals = pageSignals.trustSignals || createEmptyPageSignals().trustSignals;
            const normalizedRegistrantText = [
                rdapRegistrantName,
                rdapRegistrantOrganization,
                registrarName
            ].filter(Boolean).join(' ').toLowerCase();
            const compactRootLabel = rootLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
            const hasRegistrantDomainMatch = compactRootLabel.length >= 5 &&
                normalizedRegistrantText.replace(/[^a-z0-9]/g, '').includes(compactRootLabel);
            const hasTaiwanOfficialRegistrant = domain.endsWith('.tw') &&
                /(ministry of foreign affairs|mofa|外交部|government|gov|taiwan|中華民國)/i.test(normalizedRegistrantText);
            const trustedCertificateIssuers = [
                'digicert',
                'globalsign',
                'sectigo',
                'entrust',
                'google trust services',
                'cloudflare',
                'amazon',
                'let\'s encrypt',
                'zerossl'
            ];
            const certIssuerName = String(certData?.issuerName || '').toLowerCase();
            const hasRecognizedCertificateIssuer = certIssuerName &&
                trustedCertificateIssuers.some(issuer => certIssuerName.includes(issuer));
            const hasStableHttpsCertificate = !blocksSharedProviderTrust && hasRecognizedCertificateIssuer &&
                certAgeDays !== null &&
                certAgeDays >= 30 &&
                certAgeDays < 730;

            const trustValidationSignals = [];
            const addTrustSignal = (condition, score, reason) => {
                if (condition) trustValidationSignals.push({ score, reason });
            };
            const govAgencyTrustLabel = verifiedGovernmentAgency?.name || '';
            addTrustSignal(isOfficialTaiwanGov, 100, govAgencyTrustLabel ? `台灣政府官方網域：${govAgencyTrustLabel}` : '台灣政府官方網域');
            addTrustSignal(isTrustedGlobalRootDomain, 80, '全球頂級可信根網域');
            addTrustSignal(isTrustedEcommerceRootDomain, 90, `Trusted E-commerce Root Domain：${registrableDomain}`);
            addTrustSignal(isTrustedTaiwanServiceRootDomain, 80, `可信台灣民營服務網域：${registrableDomain}`);
            addTrustSignal(isTrustedFinancialServiceRootDomain, 80, `可信金融服務官方網域：${registrableDomain}`);
            addTrustSignal(isTrustedGovernmentServiceRootDomain, 90, `可信政府官方服務網域：${registrableDomain}`);
            addTrustSignal(isTrustedPublicInterestRootDomain, 80, `可信公益/宗教資訊網域：${registrableDomain}`);
            addTrustSignal(isConfiguredAllowlistDomain && !isOfficialTaiwanGov, 70, 'Trusted Allowlist Domain');
            addTrustSignal(isHighTraffic, 40, 'Tranco 可查得流量排名');
            addTrustSignal(hasRankedRootDomainFallback, 35, `Tranco 根網域 ${trancoQueriedDomain} 可查得排名，子網域繼承基線信任`);
            addTrustSignal(isTrustedEcommerceRootDomain, 35, `已驗證電商官方根網域：${registrableDomain}`);
            addTrustSignal(domain.endsWith('.com.tw'), 20, '.com.tw 商業網域具 TWNIC 註冊審核脈絡');
            addTrustSignal((isTrustedTLD || domain.endsWith('.tw')) && domainAgeDays !== null && domainAgeDays >= 365, 25, '台灣常見網域且註冊已超過 1 年');
            addTrustSignal(hasMatureSeoSignals, 25, `成熟 SEO 訊號：${[
                ...(seoSignals.reasons || []),
                siteSeoData?.robots?.exists ? 'robots.txt 可讀' : '',
                siteSeoData?.sitemap?.exists ? 'sitemap.xml 可讀' : ''
            ].filter(Boolean).slice(0, 3).join('、') || '具備 metadata、robots 或 sitemap'}`);
            addTrustSignal(languageSignals.matched, 15, languageSignals.details || '頁面語言與台灣網域一致');
            addTrustSignal(pageTrustSignals.matched, pageTrustSignals.score || 20, pageTrustSignals.reasons?.slice(0, 2).join('、') || '頁面語意與網域相符');
            addTrustSignal(hasStrongEcommerceValidation, 35, `正規電商佐證：${ecommerceTrustSignals.reasons?.slice(0, 2).join('、') || '購物車、聯絡資訊或平台足跡完整'}`);
            addTrustSignal(hasWhoisVerifiedBusinessEntity, 40, matchedBusinessEntityName ? `頁面商家名稱與 WHOIS/RDAP 註冊者相符：${matchedBusinessEntityName}` : '頁面商家資訊與 WHOIS/RDAP 註冊資料具一致性');
            addTrustSignal(hasOfficialCompanyDomainMatch, 35, '多來源官方登記資料可連結組織與本網域');
            addTrustSignal(isTrustedTaiwanRegistrar, 15, `台灣常見註冊商：${registrarName}`);
            addTrustSignal(lineOfficialSignals.matched && (hasStrongEcommerceValidation || hasVerifiedBusinessEntity), 10, 'LINE 官方帳號/客服連結與商家脈絡一致');
            addTrustSignal(hasRegistrantDomainMatch || hasTaiwanOfficialRegistrant, 35, 'WHOIS/RDAP 註冊資料與網域或官方語意相符');
            addTrustSignal(hasStableHttpsCertificate, 15, `HTTPS 憑證由可信 CA 簽發${certData?.issuerName ? ` (${certData.issuerName})` : ''}`);
            addTrustSignal(mxInfo.status === 'ok', 10, '已設定 MX 郵件紀錄');
            addTrustSignal(securityHeadersData?.status === 'ok' && !hasMissingAllSecurityHeadersRaw, 10, '未缺少全部核心安全標頭');

            const trustValidationScore = Math.min(100, trustValidationSignals.reduce((sum, item) => sum + item.score, 0));
            const hasTrustedValidation = trustValidationScore >= 45 ||
                trustValidationSignals.some(item => item.score >= 35);

            const hasConfirmedThreatSignal = blocklistListedForRisk ||
                isConfirmedScam ||
                isManualHighRisk ||
                hasOfficialAlert ||
                hasStrongCofactsRisk ||
                isApkSite ||
                isGoogleFlaggedForRisk ||
                hasEmailTrackingPhishingPattern ||
                hasFinancialPhishingSignal ||
                (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                hasLogisticsBrandPhishing ||
                hasPageBrandMismatch ||
                hasSuspiciousExternalTrustedRedirect ||
                hasHomographSignal ||
                hasUaCloakingRisk ||
                isDownloadPhishingSignal ||
                hasShoppingScamSignal ||
                hasUnverifiedCommerceRisk ||
                hasSuspiciousTldAdLandingRisk ||
                hasFreeHostingSensitiveLinkRisk ||
                hasFreeHostingVotePhishingRisk ||
                hasGithubPagesBrandImpersonationRisk ||
                hasCloudflarePagesDevRandomRisk ||
                hasNetlifyAppRandomRisk ||
                hasRegulatedTobaccoSalesSignal ||
                hasJobTaskScamSignal ||
                hasShoppingLineContactRisk;

            const hasSecondaryFraudEvidence = hasConfirmedThreatSignal ||
                hasCofactsFraudEvidence ||
                hasNewOneYearRegistrationRisk ||
                isVeryNewDomain ||
                isNewDomainWithNewCertificate ||
                isVeryHighRiskTLD ||
                isFinalVeryHighRiskTLD ||
                isFakeGov ||
                isFinalFakeGov ||
                isFakeService ||
                hasBrandSimilarity ||
                hasSuspiciousTempDomain ||
                hasFinalSuspiciousTemp ||
                hasSuspiciousEmailTrackingHost ||
                hasDeepSubdomainPhishingPattern ||
                hasUaCloakingRisk ||
                hasSuspiciousTldAdLandingRisk ||
                hasCloudflarePagesDevRandomRisk ||
                hasNetlifyAppRandomRisk ||
                hasDisposableShoppingLandingRisk ||
                hasDisposableRootPhishingRisk ||
                hasDisposableUnreadablePageRisk ||
                hasShoppingLandingUrlRisk ||
                suspiciousSubdomain.matched ||
                hasEncodedRedirectRisk ||
                hasSuspiciousParams ||
                hasNestedSuspiciousParams ||
                (unreadablePageStatuses.includes(siteStatusData.status) && !isHighTraffic && !isTrustedTLD);

            const isCrawlerBlockedStatus = unreadablePageStatuses.includes(siteStatusData.status);
            const hasCrawlerBlockedTrustedContext = isCrawlerBlockedStatus &&
                !hasConfirmedThreatSignal &&
                (isWhitelisted || isHighTraffic || isTrustedTLD || hasRootDomainTrustBaseline || hasSmallBusinessTrustContext);

            const hasMissingAllSecurityHeaders = hasMissingAllSecurityHeadersRaw &&
                hasSecondaryFraudEvidence &&
                !hasTrustedValidation;
            const hasMissingMxRecords = hasMissingMxRecordsRaw &&
                hasSecondaryFraudEvidence &&
                !hasTrustedValidation;

            // --- [優化版] 精確風險權重判定 ---
            let riskScore = 0;

            if (blocklistListedForRisk) {
                riskScore = 100;
            } else if (isConfirmedScam) {
                riskScore = 100;
            } else if (isManualHighRisk) {
                riskScore = 90;
            } else if (hasGithubPagesBrandImpersonationRisk) {
                riskScore = 95;
            } else if (hasFreeHostingVotePhishingRisk) {
                riskScore = 90;
            } else if (hasOfficialAlertUrlMatch) {
                riskScore = 100;
            } else if (isApkSite) {
                riskScore = 100; // 👈 誘騙下載 APK 強制判死刑 (100分)

            } else if (hasUaCloakingRisk) {
                riskScore = 100;
            } else if (hasHighRiskRedirectTrace) {
                riskScore = 100;
            } else if (isGoogleFlaggedForRisk) {
                // 👇 加入 Google 的防護邏輯 (如果是白名單被 Google 誤判，則尊重白名單)
                riskScore = 100;
            } else {
                // 1. 內容分析優化：區分「惡意阻擋」與「安全防護(WAF)」
                const commonInternationalTLDs = getRiskList('commonInternationalTlds');
                const isCommonInternational = commonInternationalTLDs.some(tld => domain.endsWith(tld));

                if (siteStatusData.status === 'blank' || siteStatusData.status === 'error' || siteStatusData.status === 'blocked') {
                    if (hasCrawlerBlockedTrustedContext || isHighTraffic || isTrustedTLD) {
                        riskScore += 0; // 知名網站或可信根網域，容忍 SPA 空白或 WAF 阻擋
                    } else if (isCommonInternational && siteStatusData.status === 'blank') {
                        // 👇 常見網域的空白頁多半是 React/Vue 等 SPA，或是 Cloudflare 防護，降至 10 分輕微懷疑
                        riskScore += isLowTraffic ? 10 : 5;
                    } else if (siteStatusData.status === 'blocked') {
                        riskScore += 75;
                    } else {
                        riskScore += (siteStatusData.status === 'blank') ? 95 : 80;
                    }
                } else if (siteStatusData.status === 'unknown') {
                    if (isHighTraffic || isTrustedTLD) {
                        riskScore += 0;
                    } else if (isCommonInternational) {
                        // 👇 常見網域被阻擋抓取，通常是 WAF 防護，不予扣分
                        riskScore += 0; 
                    } else {
                        riskScore += 75; // 偏僻網域且抓不到內容，維持高風險
                    }
                }

                // 2. 網域年齡與信譽分析
                if (domainAgeDays !== null) {
                    riskScore += getDomainAgeRiskScore(domainAgeDays);
                } else {
                    // 無法取得日期時，若非高流量網站，則視為潛在風險
                    if (isLowTraffic && isVeryHighRiskTLD) {
                        riskScore += 40;
                    } else if (isLowTraffic && isSuspiciousTLD) {
                        riskScore += 10;
                    } else if (isLowTraffic) {
                        // 👇 降至 10 分，避免因 RDAP API 不穩誤殺合法的老舊或受保護網站
                        riskScore += 10; 
                    }
                }
                if (hasNewOneYearRegistrationRisk) riskScore += 15;
                if (hasMissingAllSecurityHeadersRaw) riskScore += hasMissingAllSecurityHeaders ? 45 : 15;
                if (hasMissingMxRecordsRaw) riskScore += hasMissingMxRecords ? 45 : 15;
                if (isTraceHighRiskSameRoot && !isInputShortener && !isWhitelisted) riskScore += 15;

                // 3. 其他特徵分析 (僅在非白名單時計算)
                if (!isWhitelisted) {
                    // 🚨 來源或最終網域使用了 .top, .xyz 等高風險後綴，直接重罰
                    if (isVeryHighRiskTLD || isFinalVeryHighRiskTLD) riskScore += 75;
                    else if (isSuspiciousTLD) riskScore += 15;

                    if (isRedirected) {
                        const currentCleanDomain = domain.replace(/^www\./, '');
                        const currentCleanFinalDomain = finalDomain.replace(/^www\./, '');
                        const isSameRoot = currentCleanFinalDomain.endsWith(currentCleanDomain) || currentCleanDomain.endsWith(currentCleanFinalDomain);

                        if (isSameRoot || isFinalSafePlatform || isFinalWhitelisted) {
                            riskScore += 0;
                        } else {
                            riskScore += 15;
                        }

                        // 🚨 終點若有明顯詐騙特徵 (假冒政府、高危險後綴等)，給予致命重罰
                        if (isFinalFakeGov || hasFinalSuspiciousTemp || isFinalVeryHighRiskTLD) {
                            riskScore += 80;
                        }
                    }

                    // 公共縮網址若暫時無法解析，只能判定目的地未知，不能視為安全或直接當成詐騙。
                    else if (hasUnresolvedPublicShortener) {
                        riskScore = Math.max(riskScore, 40);
                    }

                    if (hasEmailTrackingPhishingPattern) riskScore += 85;
                    else if (hasSuspiciousEmailTrackingHost) riskScore += 75;
                    else if (hasEncodedRedirectRisk) riskScore += 45;
                    if (hasFinancialPhishingSignal) riskScore += 80;
                    if (hasPublicUtilityScamSignal && hasBrandSimilarity) riskScore += 90;
                    else if (hasPublicUtilityScamSignal) riskScore += 60;
                    if (hasLogisticsBrandPhishing) riskScore += 90;
                    else if (hasLogisticsScamSignal && hasBrandSimilarity) riskScore += 70;
                    if (hasPageBrandMismatch) riskScore += 80;
                    if (hasSuspiciousExternalTrustedRedirect) riskScore += 85;
                    if (hasOfficialFlowPathSignal && (hasBrandSimilarity || hasPageBrandMismatch || isVeryNewDomain || isLowTraffic)) riskScore += 45;
                    else if (hasOfficialFlowPathSignal) riskScore += 15;
                    if (hasUrgencyScamSignal && (hasBrandSimilarity || hasPageBrandMismatch || hasFinancialPhishingSignal || isVeryNewDomain)) riskScore += 45;
                    else if (hasUrgencyScamSignal) riskScore += 10;
                    if (hasHomographSignal) riskScore += 85;
                    if (hasOfficialAlert) riskScore += hasOfficialAlertUrlMatch ? 100 : 90;
                    if (cofactsRiskScore > 0) riskScore += cofactsRiskScore;
                    if (isFakeGov || isFinalFakeGov) riskScore += 90;
                    if (isFakeService) riskScore += 90;
                    if (hasBrandSimilarity) riskScore += 80;
                    if (isDownloadPhishingSignal) riskScore += 80;
                    if (hasShoppingLandingUrlRisk) riskScore += siteStatusData.status === 'ok' ? 50 : 75;
                    if (hasSuspiciousTldAdLandingRisk) riskScore += 85;
                    if (hasDisposableShoppingLandingRisk) riskScore += 85;
                    else if (hasDisposableRootPhishingRisk) riskScore += 70;
                    else if (hasDisposableUnreadablePageRisk) riskScore += 70;
                    if (hasFreeHostingSensitiveLinkRisk) riskScore += 85;
                    if (hasRegulatedTobaccoSalesSignal) riskScore += 95;
                    if (hasJobTaskScamSignal) riskScore += 90;
                    if (hasShoppingScamSignal) riskScore += Math.min(85, 45 + shoppingScamSignals.reasonCount * 10);
                    if (hasUnverifiedCommerceRisk) riskScore = Math.max(riskScore, 85);
                    if (hasShoppingLineContactRisk) riskScore += hasShoppingLandingUrlRisk ? 50 : 40;
                    if (highRiskSensitiveFieldCount > 0 && isLowTraffic) riskScore += Math.min(45, 20 + highRiskSensitiveFieldCount * 10);
                    else if (lowRiskSensitiveFieldCount > 0 && isLowTraffic) riskScore += 10;
                    if (externalFormActionCount > 0) riskScore += 60;
                    else if (suspiciousExternalIframeCount > 0) riskScore += 35;
                    else if (suspiciousExternalScriptCount > 0 && isLowTraffic) riskScore += 20;
                    else if (suspiciousExternalResourceCount > 0 && isLowTraffic) riskScore += 15;

                    // 金融與品牌偽裝強力攔截器
                    const scamKeywords = getRiskList('scamKeywords');
                    const containsScamKeyword = scamKeywords.some(kw => domain.includes(kw));
                    if (containsScamKeyword && !isWhitelisted) {
                        riskScore += 90;
                    }

                    if (hyphenCount >= 3 || finalHyphenCount >= 3) riskScore += 20;
                    if (hasDeepSubdomainPhishingPattern) riskScore += 75;
                    else if (isDeepSubdomain && (isLowTraffic || hasEmailTrackingRedirect)) riskScore += 50;
                    if (hasSuspiciousParams || hasNestedSuspiciousParams) riskScore += 40;
                    if (hasSuspiciousTempDomain || hasFinalSuspiciousTemp) riskScore += 70;
                    if (suspiciousSubdomain.matched && (isLowTraffic || hasEmailTrackingRedirect)) riskScore += Math.min(45, 15 + suspiciousSubdomain.reasons.length * 10);

                    // 👇 修改：精準打擊單頁式詐騙，降低正常老網站的誤殺率 👇
                    if (siteStatusData.linkStats && siteStatusData.linkStats.total <= 1 && isLowTraffic) {
                        let isNewDomain = false;
                        if (rdapDate) {
                            const regDate = new Date(rdapDate);
                            const diffDays = Math.ceil(Math.abs(new Date() - regDate) / (1000 * 60 * 60 * 24));
                            if (diffDays < 365) isNewDomain = true; 
                        } // 查無 WHOIS 則不預設為新網域，交給其他特徵判斷
                        
                        // 判斷是否為外部轉址
                        let isExternalRedirect = false;
                        if (isRedirected && finalDomain) {
                            const cleanD = domain.replace(/^www\./, '');
                            const cleanFD = finalDomain.replace(/^www\./, '');
                            isExternalRedirect = !(cleanFD.endsWith(cleanD) || cleanD.endsWith(cleanFD));
                        }

                        // 如果具備任何一個免洗特徵，加上 0 連結，重罰！
                        if (isVeryHighRiskTLD || hasSuspiciousTempDomain || isFreeHosting || isNewDomain || isExternalRedirect) {
                            riskScore += 45; 
                        } else {
                            // 正常網域 (.com) 但抓不到連結，極可能是 React/Vue 等 SPA，不予懲罰
                            riskScore += 0; 
                        }
                    }
                    // 👆 修改結束 👆

                    if (isFreeHosting) {
                        riskScore += 30;
                        if (isHighEntropy) riskScore += 50;
                    } else if (isHighEntropy && isLowTraffic) {
                        // 👇 修改：如果亂碼長度極端誇張 (>=15)，給予 70 分重罰 (釣魚專屬碼特徵)
                        if (isExtremeGibberish) {
                            riskScore += 70;
                        } else {
                            riskScore += 30;
                        }
                    }
                    if (hasCloudflarePagesDevRandomRisk || hasNetlifyAppRandomRisk) {
                        riskScore = Math.max(riskScore, 75);
                    } else if (hasFreeHostingPlatformBaselineRisk) {
                        riskScore = Math.max(riskScore, 30);
                    }
                } // 👈 關閉 if (!isWhitelisted)

                if (hasTrustedAllowlistOverride) {
                    riskScore = 0;
                }

                // 👇 新增：社群媒體強制攔截，覆寫白名單的「安全」判定
                if (isSocialMedia) {
                    riskScore = 30; // 強制轉為黃色警告燈號
                }
            } // 👈 關閉最外層的 if (!blocklistListed) else 區塊

            if (hasTrustedValidation && !hasConfirmedThreatSignal && !blocklistListedForRisk && !isGoogleFlaggedForRisk && !isApkSite && !isWhitelisted && !isSocialMedia && !hasFreeHostingPlatformBaselineRisk) {
                if (riskScore >= 70) {
                    riskScore = Math.min(riskScore, 60);
                } else if (riskScore >= 30) {
                    riskScore = Math.max(20, riskScore - 15);
                }
            }

            const hasTrustedCommercialWeakSignalContext =
                isTrustedTLD ||
                domain.endsWith('.tw') ||
                hasRootDomainTrustBaseline ||
                isTrustedTaiwanRegistrar ||
                hasSmallBusinessTrustContext ||
                hasTrustedValidation ||
                hasStrongEcommerceValidation;

            const hasStrongRiskSignal = blocklistListedForRisk ||
                isConfirmedScam ||
                isManualHighRisk ||
                hasOfficialAlert ||
                hasStrongCofactsRisk ||
                isApkSite ||
                isGoogleFlaggedForRisk ||
                isVeryHighRiskTLD ||
                isFinalVeryHighRiskTLD ||
                isFakeGov ||
                isFinalFakeGov ||
                isFakeService ||
                isDownloadPhishingSignal ||
                hasEmailTrackingPhishingPattern ||
                hasFinancialPhishingSignal ||
                (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                hasLogisticsBrandPhishing ||
                hasPageBrandMismatch ||
                hasSuspiciousExternalTrustedRedirect ||
                hasHomographSignal ||
                hasUaCloakingRisk ||
                hasMissingAllSecurityHeaders ||
                hasMissingMxRecords ||
                hasBrandSimilarity ||
                hasGithubPagesBrandImpersonationRisk ||
                hasSuspiciousTempDomain ||
                hasFinalSuspiciousTemp ||
                hasFreeHostingSensitiveLinkRisk ||
                hasFreeHostingVotePhishingRisk ||
                hasSuspiciousTldAdLandingRisk ||
                hasSuspiciousEmailTrackingHost ||
                hasDeepSubdomainPhishingPattern ||
                hasCloudflarePagesDevRandomRisk ||
                hasNetlifyAppRandomRisk ||
                hasDisposableShoppingLandingRisk ||
                hasDisposableUnreadablePageRisk ||
                hasShoppingLandingUrlRisk ||
                hasShoppingScamSignal ||
                hasUnverifiedCommerceRisk ||
                hasRegulatedTobaccoSalesSignal ||
                hasJobTaskScamSignal ||
                hasShoppingLineContactRisk ||
                (traceData && traceData.isHighRisk && !isFinalSafePlatform && !isTraceHighRiskSameRoot);

            // 組織官網映射只抵銷弱訊號；任何明確威脅都會阻止條件式信任生效。
            const hasConditionalCompanyTrustBlockingThreat = blocklistListedForRisk ||
                isConfirmedScam ||
                isManualHighRisk ||
                hasOfficialAlert ||
                hasStrongCofactsRisk ||
                isGoogleFlaggedForRisk ||
                isApkSite ||
                isDownloadPhishingSignal ||
                hasHighRiskRedirectTrace ||
                hasUaCloakingRisk ||
                hasEmailTrackingPhishingPattern ||
                hasFinancialPhishingSignal ||
                (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                hasLogisticsBrandPhishing ||
                hasPageBrandMismatch ||
                hasBrandSimilarity ||
                hasGithubPagesBrandImpersonationRisk ||
                hasHomographSignal ||
                hasSuspiciousExternalTrustedRedirect ||
                externalFormActionCount > 0 ||
                hasFreeHostingSensitiveLinkRisk ||
                hasFreeHostingVotePhishingRisk ||
                hasShoppingScamSignal ||
                hasUnverifiedCommerceRisk ||
                hasShoppingLineContactRisk ||
                hasRegulatedTobaccoSalesSignal ||
                hasJobTaskScamSignal ||
                isFakeGov ||
                isFinalFakeGov ||
                isFakeService;
            const hasConditionalCompanyTrustApplied = hasConditionalCompanyTrust && !hasConditionalCompanyTrustBlockingThreat;

            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && riskScore > 60) {
                riskScore = 60;
            }
            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && !hasFreeHostingPlatformBaselineRisk && riskScore >= 30 && hasTrustedCommercialWeakSignalContext) {
                riskScore = Math.min(riskScore, 25);
            }
            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && hasCrawlerBlockedTrustedContext && riskScore > 25) {
                riskScore = 25;
            }

            if (!isWhitelisted && !isSocialMedia) {
                const hasDangerDetail = hasBrandSimilarity ||
                    hasGithubPagesBrandImpersonationRisk ||
                    isConfirmedScam ||
                    isManualHighRisk ||
                    hasOfficialAlert ||
                    hasStrongCofactsRisk ||
                    hasEmailTrackingPhishingPattern ||
                    hasFinancialPhishingSignal ||
                    (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                    hasLogisticsBrandPhishing ||
                    hasPageBrandMismatch ||
                    hasSuspiciousExternalTrustedRedirect ||
                    hasHomographSignal ||
                    hasUaCloakingRisk ||
                    isFakeGov ||
                    isFinalFakeGov ||
                    isFakeService ||
                    isVeryHighRiskTLD ||
                    isFinalVeryHighRiskTLD ||
                    hasSuspiciousTempDomain ||
                    hasFinalSuspiciousTemp ||
                    hasFreeHostingSensitiveLinkRisk ||
                    hasSuspiciousTldAdLandingRisk ||
                    hasSuspiciousEmailTrackingHost ||
                    hasDeepSubdomainPhishingPattern ||
                    hasCloudflarePagesDevRandomRisk ||
                    hasNetlifyAppRandomRisk ||
                    hasDisposableShoppingLandingRisk ||
                    hasDisposableUnreadablePageRisk ||
                    hasShoppingLandingUrlRisk ||
                    hasShoppingScamSignal ||
                    hasUnverifiedCommerceRisk ||
                    hasRegulatedTobaccoSalesSignal ||
                    hasJobTaskScamSignal ||
                    hasShoppingLineContactRisk ||
                    isDownloadPhishingSignal ||
                    isApkSite;
                if (hasDangerDetail && riskScore < 70) riskScore = 70;
            }

            if (hasConditionalCompanyTrustApplied) {
                riskScore = Math.min(riskScore, 20);
            }

            if (hasTrustedAllowlistOverride) riskScore = Math.min(riskScore, 20);
            if (blocklistListedForRisk || isGoogleFlaggedForRisk || isConfirmedScam || isManualHighRisk ||
                hasOfficialAlert || hasStrongCofactsRisk || hasSensitiveExternalForm || hasHighRiskRedirectTrace) riskScore = Math.max(riskScore, 90);

            // 修正：網站內容狀態標籤邏輯
            let siteContentMsg = siteStatusData.msg;
            if (isWhitelisted && hasTrustedAllowlistOverride) {
                siteContentMsg = isOfficialTaiwanGov
                    ? '受信賴的台灣政府官方網域'
                    : (isTrustedEcommerceRootDomain
                        ? `受信賴大型電商根網域：${registrableDomain}`
                        : (isTrustedTaiwanServiceRootDomain
                            ? `受信賴台灣民營服務官方網域：${registrableDomain}`
                            : (isTrustedFinancialServiceRootDomain
                                ? `受信賴金融服務官方網域：${registrableDomain}`
                                : (isTrustedGovernmentServiceRootDomain
                                    ? `受信賴政府官方服務網域：${registrableDomain}`
                                    : (isTrustedPublicInterestRootDomain
                                        ? `受信賴公益/宗教資訊網域：${registrableDomain}`
                                        : '受信賴的白名單網域')))));
            }
            else if (hasConditionalCompanyTrustApplied) siteContentMsg = '組織官網映射已驗證；新網域、低流量與技術設定等弱訊號不提高風險，強威脅仍會優先攔截';
            else if (hasCrawlerBlockedTrustedContext) siteContentMsg = `頁面可能啟用 WAF/Anti-bot，已改以可信根網域 ${registrableDomain} 的排名/信任基線判斷，不因爬蟲阻擋扣為高風險`;

            // 決定網域特徵卡片的 UI 文字
            let domainAnalysisStatus = 'safe';
            let domainAnalysisDetails = '網域命名結構無明顯異常';

            // 👇 新增 APK 專屬的紅色警告卡片
            if (isConfirmedScam) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 ${confirmedScamProfile?.details || '此網域已由人工確認為詐騙連結，請勿點擊或輸入任何個資。'}`;
                siteContentMsg = confirmedScamProfile?.category ? `危險：${confirmedScamProfile.category}` : '危險：已確認為詐騙連結';
            } else if (isManualHighRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `此網域已由人工審查列為高度交易與網站可信度風險；目前偵測到的新站、短期註冊、模板商城或商家資訊不足等證據，尚不等同已有獨立來源確認為詐騙。`;
                siteContentMsg = '高度風險：人工審查列為交易與網站可信度高風險';
            } else if (hasOfficialAlert) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 官方警示資料命中：${officialAlertMatch.source} 已公告「${officialAlertMatch.title}」，${officialAlertMatch.warning}`;
                siteContentMsg = '危險：此網址已出現在官方警示資料';
            } else if (hasStrongCofactsRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 Cofacts 社群查核強風險訊號：${cofactsRiskData.label}。此為群眾協作查核資料，仍應搭配網站證據判斷。`;
                siteContentMsg = '危險：Cofacts 查核回應明確指出詐騙且獲得支持';
            } else if (hasGithubPagesBrandImpersonationRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `偵測到 GitHub Pages 租戶「${domain}」在非官方網域使用「${matchedBrandSimilarity.brandName}」品牌名稱；即使頁面目前為 404、空白或已下架，仍屬高度品牌冒用風險。`;
                siteContentMsg = '危險：GitHub Pages 租戶疑似冒用知名品牌';
            } else if (isApkSite) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到網頁誘導下載不明 APK (Android App)，極可能是夾帶木馬的惡意軟體！';
                siteContentMsg = '危險：包含惡意應用程式下載連結';
            } else if (isDownloadPhishingSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到可疑下載誘導：頁面包含 Android/App 安裝話術、動態下載程式或可疑下載路徑。';
                siteContentMsg = '危險：包含可疑應用程式下載誘導';
            } else if (hasEmailTrackingPhishingPattern) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到郵件追蹤跳板型釣魚：${domain} 透過郵件追蹤服務包裝 encoded 目的地，並伴隨亂碼/深層子網域或金融詐騙特徵。`;
                siteContentMsg = '危險：疑似郵件釣魚追蹤跳板';
            } else if (hasSuspiciousEmailTrackingHost) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到可疑郵件追蹤網域：${domain} 屬於郵件追蹤服務，且使用深層或亂碼子網域，常見於釣魚郵件追蹤連結。`;
                siteContentMsg = '危險：疑似郵件釣魚追蹤網域';
            } else if (hasFinancialPhishingSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到金融機構或信用卡異常交易相關釣魚語意，但網域不是官方網域。';
                siteContentMsg = '危險：疑似金融釣魚連結';
            } else if (hasPublicUtilityScamSignal && hasBrandSimilarity) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到公共事業仿冒：網域疑似模仿「${matchedBrandSimilarity.brandName}」，且網址含節電獎勵、電費補助或領取等詐騙語意。`;
                siteContentMsg = '危險：疑似公共事業獎勵金釣魚連結';
            } else if (hasLogisticsBrandPhishing) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到物流品牌仿冒：網域疑似模仿「${matchedBrandSimilarity.brandName}」，且包含配送、包裹、追蹤或電商物流語意。`;
                siteContentMsg = '危險：疑似物流品牌釣魚連結';
            } else if (hasPageBrandMismatch) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到頁面品牌與網域不一致：頁面看起來像「${pageBrandSignals.brandName}」，但目前網域不是官方網域。`;
                siteContentMsg = '危險：疑似品牌釣魚頁';
            } else if (hasSuspiciousExternalTrustedRedirect) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到可疑占位式轉址：未知網域使用純數字子網域，並跨網域轉址至 ${finalDomain}。這類模式常用來避開內容檢測或暫時隱藏真實頁面。`;
                siteContentMsg = '危險：純數字子網域搭配外部可信大站轉址';
            } else if (hasHomographSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到 Punycode/Unicode 混淆網域，可能利用相似字元偽裝官方網站。';
            } else if (hasUaCloakingRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到裝置導向差異：網站對 Mobile 與 Desktop 回傳不同最終路徑，可能是 User-Agent cloaking。${uaCloakingDetails}`;
            } else if (hasRegulatedTobaccoSalesSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到台灣高風險電子菸/加熱菸網路販售：${regulatedTobaccoSalesSignals.reasons.slice(0, 3).join('、')}。此類非法商品頁常伴隨 LINE 導流、貨到付款或一頁式交易詐騙風險。`;
                siteContentMsg = '危險：疑似電子菸/加熱菸網路販售或交易導流';
            } else if (hasJobTaskScamSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到假求職/任務金流詐騙特徵：${jobTaskScamSignals.reasons.slice(0, 3).join('、')}。`;
                siteContentMsg = '危險：疑似假求職、任務儲值或提領詐騙';
            } else if (hasFreeHostingVotePhishingRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 共享／免費子網域上的投票頁拒絕爬蟲讀取內容，且缺少獨立可信佐證，符合假投票帳號釣魚常見規避型態。';
                siteContentMsg = '危險：疑似假投票帳號釣魚頁';
            } else if (hasSuspiciousTldAdLandingRisk && !hasConditionalCompanyTrustApplied) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到可疑後綴廣告落地頁：${domain} 使用較常被濫用的網域後綴，原始網址含 ${rawAdLandingParamDetails.slice(0, 4).join('、')} 等社群/廣告追蹤參數，且缺少可信白名單、商家實體或正規電商佐證。`;
                siteContentMsg = '危險：可疑網域後綴搭配社群廣告落地頁';
            } else if (hasUnverifiedCommerceRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `偵測到未驗證模板商城高風險組合：${shoppingScamSignals.unverifiedCommerceReasons.slice(0, 3).join('、')}；網域註冊未滿 6 個月，且缺少可核實的公司或商家實體資料。`;
                siteContentMsg = '高度風險：新註冊模板商城缺少可驗證商家資訊';
            } else if (hasShoppingScamSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到一頁式購物詐騙特徵：${shoppingScamSignals.reasons.slice(0, 3).join('、')}。`;
            } else if (hasShoppingLineContactRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到一頁式購物/廣告落地頁要求加入 LINE 聯絡或下單，常見於詐騙導流。';
            } else if (hasConditionalCompanyTrust && externalFormActionCount > 0) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 官網映射有效，但偵測到表單資料送往 ${externalFormActionCount} 個外部網域，因此不套用條件式信任。`;
                siteContentMsg = '危險：表單資料送往外部網域';
            } else if (hasConditionalCompanyTrustApplied) {
                domainAnalysisStatus = 'safe';
                domainAnalysisDetails = `已驗證組織官網映射：${verifiedCompany?.name || domain}；弱風險訊號已降為背景資訊，強威脅仍保留最高優先權。`;
            } else if (hasDisposableShoppingLandingRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到免洗亂碼購物落地頁：主網域「${rootLabel}」具有隨機生成特徵（${disposableRoot.reasons.slice(0, 3).join('、')}），且網址包含 ${matchedLandingParams.slice(0, 3).join('、')} 等廣告追蹤參數。`;
            } else if (hasDisposableUnreadablePageRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到免洗亂碼網域且頁面內容未完整取得：主網域「${rootLabel}」具有隨機生成特徵（${disposableRoot.reasons.slice(0, 3).join('、')}），常見於可快速棄置與更換的新詐騙站。`;
            } else if (hasDisposableRootPhishingRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到可疑免洗亂碼網域：主網域「${rootLabel}」具有隨機生成特徵（${disposableRoot.reasons.slice(0, 3).join('、')}），且缺乏高流量信任訊號或搭配可疑子網域。`;
            } else if (hasShoppingLandingUrlRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到可疑購物/廣告落地頁網址：含 ${matchedLandingParams.slice(0, 3).join('、')} 等追蹤參數，且網域名稱隨機度高或缺乏信任訊號。`;
            } else if (isNewDomainWithNewCertificate) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = '⚠️ RDAP/WHOIS 顯示網域註冊未滿 3 個月；新憑證屬正常建站流程，兩者不視為獨立證據，需搭配其他可疑行為判斷。';
            } else if (hasNewOneYearRegistrationRisk) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = '⚠️ 網域註冊未滿 6 個月，且註冊週期約 1 年；此為背景風險，需搭配其他獨立詐騙訊號判斷。';
            } else if (hasMissingAllSecurityHeaders) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 網站缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項現代安全標頭，常見於低成本臨時詐騙站。';
            } else if (hasMissingMxRecords) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 網域未設定 MX 郵件紀錄，可能是無法收信的免洗或短期詐騙網域。';
            } else if (isSocialMedia) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = '⚠️ 這是社群平台，我們無法看到裡面的貼文，要多加小心留意！';
                siteContentMsg = '社群平台內容受隱私保護，無法自動掃描';
            }
            else if (isInputShortener && traceData?.isHighRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 縮網址轉址追蹤偵測到高風險行為：${traceData.riskReason || '目的地或轉址鏈異常'}。`;
            }
            else if (isRedirected && isKnownShortener && !isFinalWhitelisted) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = `公共縮網址 ${inputDomain} 已解析至 ${finalDomain}；風險評分以最終目的地為主，縮網址服務本身不作為安全背書。`;
            }

            else if (hasUnresolvedPublicShortener) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = `無法確認公共縮網址 ${inputDomain} 的最終目的地；目前只能列為中度提醒，請勿將縮網址服務本身視為安全證明。`;
            }

            else if (isFakeGov || isFinalFakeGov) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '偵測到 "gov" 關鍵字但非政府網域，極高風險！';
            }
            // 👇 新增：公共事業偽裝警告
            else if (isFakeService) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到偽裝成公共事業 (如電子發票、水電費、遠通)，極高風險！';
            } else if (hasBrandSimilarity) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 網域名稱與「${matchedBrandSimilarity.brandName}」高度相似，但不是官方網域，疑似釣魚仿冒！`;
            } else if (hasFreeHostingSensitiveLinkRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到免費子網域搭配一次性驗證參數或隨機路徑，常見於冒用品牌的短期釣魚連結。';
            } else if (isVeryHighRiskTLD || isFinalVeryHighRiskTLD) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '網域或轉址目標為高風險網址，請注意！';
            } else if (hasDeepSubdomainPhishingPattern) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = hasEmbeddedTrustedTldLabel ?
                    '🚨 偵測到深層可疑子網域，且把 com.tw/gov.tw 等可信後綴嵌在子網域中，常見於假冒台灣網站。' :
                    '🚨 偵測到深層可疑子網域，並伴隨連字號、隨機片段或可疑參數等釣魚特徵。';
            } else if (hasCloudflarePagesDevRandomRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到 Cloudflare Pages 免費部署子網域「${domain}」使用短亂碼/不可讀命名（${suspiciousSubdomain.reasons.slice(0, 3).join('、') || '子網域名稱隨機度偏高'}），常見於臨時釣魚或免洗詐騙頁。`;
            } else if (hasNetlifyAppRandomRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到 Netlify 免費/預設託管子網域「${domain}」使用隨機字詞與代碼組合（${suspiciousSubdomain.reasons.slice(0, 3).join('、') || '子網域名稱具臨時專案特徵'}），正常知名企業、銀行、政府機關或大型電商通常不會用這類臨時網址服務客戶。`;
            } else if (isSuspiciousTLD) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = '網域使用較常被濫用的後綴，需搭配其他風險指標判斷';
            } else if (hasSuspiciousTempDomain || hasFinalSuspiciousTemp) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '網域包含 "-tw", "-com" 等常見詐騙偽裝字樣，風險極高！';
                // 👇 修正：改為警告等級，且數量改為 >= 3
            } else if (hyphenCount >= 3 || finalHyphenCount >= 3) {
                domainAnalysisStatus = 'warning';
                domainAnalysisDetails = '網域(或轉址目標)包含多個連字號 (-)，請稍加留意';
            } else if (isFreeHosting) {
                domainAnalysisStatus = 'warning';
                if (isEuCcHostedSite) {
                    domainAnalysisDetails = '「eu.cc」是共享子網域服務，目前網址是獨立租戶站；不得以 eu.cc 根網域的歷史或排名作為安全背書。';
                } else if (isGithubPagesSite) {
                    domainAnalysisDetails = '「github.io」是 GitHub Pages 共享架站服務，目前網址是獨立使用者租戶；不得以 GitHub 母網域的歷史、排名或憑證作為安全背書。';
                } else if (domain.endsWith('zeabur.app')) {
                    domainAnalysisDetails = '「zeabur.app」是 Zeabur 雲端部署平台提供的免費/預設子網域，任何人都可以在幾分鐘內匿名註冊並部署網頁，無法確認其正當性。';
                } else if (isCloudflarePagesDev) {
                    domainAnalysisDetails = '「pages.dev」是 Cloudflare Pages 的免費/預設部署子網域，代表使用者自建專案頁而非 Cloudflare 官方網站；未取得更多可信佐證前至少列為中度風險。';
                } else if (isNetlifyApp) {
                    domainAnalysisDetails = '「netlify.app」是 Netlify 免費/預設託管子網域，代表使用者自建臨時站而非 Netlify 官方網站；未取得更多可信佐證前至少列為中度風險。';
                } else if (isWeeblyHostedSite) {
                    domainAnalysisDetails = '「weebly.com」是 Weebly 免費/低門檻架站子網域，常被用於快速建立一次性活動頁；未取得品牌與交易佐證前至少列為中度風險。';
                } else {
                    domainAnalysisDetails = `使用免費架站平台 (${domain.split('.').slice(-2).join('.')})，常見於免洗詐騙網站`;
                }
            }

            let redirectStatus = 'safe';
            let redirectCheckDetails = '未偵測到跨網域轉址';
            if (hasEmailTrackingPhishingPattern) {
                redirectStatus = 'danger';
                redirectCheckDetails = `偵測到郵件追蹤跳板與 encoded 目的地${nestedDomains.length ? ` (${nestedDomains.slice(0, 2).join('、')})` : ''}`;
            } else if (hasSuspiciousEmailTrackingHost) {
                redirectStatus = 'danger';
                redirectCheckDetails = '偵測到郵件追蹤服務的深層或亂碼子網域，缺少可驗證的最終目的地';
            } else if (hasEncodedRedirectRisk) {
                redirectStatus = 'warning';
                redirectCheckDetails = `網址內嵌 ${nestedUrls.length} 個 encoded 目的地${nestedDomains.length ? ` (${nestedDomains.slice(0, 2).join('、')})` : ''}`;
            } else if (hasUaCloakingRisk) {
                redirectStatus = 'danger';
                redirectCheckDetails = `偵測到 Mobile/Desktop User-Agent 導向差異。${uaCloakingDetails}`;
            } else if (hasSuspiciousExternalTrustedRedirect) {
                redirectStatus = 'danger';
                redirectCheckDetails = `未知純數字子網域跨網域轉址至可信大站 (${finalDomain})，疑似用來閃避內容檢測`;
            } else if (hasHighRiskRedirectTrace) {
                redirectStatus = 'danger';
                redirectCheckDetails = `轉址追蹤偵測異常：${traceData.riskReason || '目的地或轉址行為具有高風險'}`;
            } else if (isTraceHighRiskSameRoot) {
                redirectStatus = 'warning';
                redirectCheckDetails = `同一主網域內的轉址追蹤異常：${traceData.riskReason || '可能是登入或防護流程，需搭配其他訊號判斷'}`;
            } else if (hasUnresolvedPublicShortener) {
                redirectStatus = 'warning';
                redirectCheckDetails = `公共縮網址 ${inputDomain} 的最終目的地暫時無法解析，不提供安全結論`;
            } else if (traceData && traceData.redirectCount >= 3) {
                redirectStatus = 'warning';
                redirectCheckDetails = `偵測到 ${traceData.redirectCount} 次轉址 - [有多次轉址風險]${finalDomain ? ` (最終導向: ${finalDomain})` : ''}`;
            } else if (isRedirected) {
                redirectStatus = isKnownShortener ? 'warning' : 'safe';
                redirectCheckDetails = isKnownShortener
                    ? `原始縮網址 ${inputDomain} 已解析至 ${finalDomain}；本次結果以最終目的地為主`
                    : redirectDetails;
            }

            const hasConfirmedSiteContentThreat = isConfirmedScam ||
                hasOfficialAlert ||
                isManualHighRisk ||
                isApkSite ||
                isDownloadPhishingSignal ||
                hasGithubPagesBrandImpersonationRisk ||
                hasFreeHostingVotePhishingRisk ||
                hasPageBrandMismatch ||
                hasShoppingScamSignal ||
                hasUnverifiedCommerceRisk ||
                hasShoppingLineContactRisk ||
                hasJobTaskScamSignal ||
                hasRegulatedTobaccoSalesSignal;
            const cofactsPresentation = window.ScanPolicy.cofactsPresentation(cofactsRiskData);
            const cofactsCheckStatus = cofactsPresentation.status;
            const cofactsCheckDetails = cofactsPresentation.details;
            const siteContentStatus = isSocialMedia
                ? 'warning'
                : (hasConfirmedSiteContentThreat
                    ? 'danger'
                    : (isWhitelisted || hasConditionalCompanyTrustApplied || siteStatusData.status === 'ok'
                        ? 'safe'
                        : (hasCrawlerBlockedTrustedContext ? 'info' : 'warning')));

            return {
                domain: targetDomain, inputDomain, inputScanUrl, primaryDomain: domain, primaryUrl: fullUrl, resolvedFromShortener, unresolvedShortener, unresolvedPublicShortener: hasUnresolvedPublicShortener, resolvedFinalUrl: scanOptions.resolvedFinalUrl || null, traceObservedAt: scanOptions.traceObservedAt || null, traceVariants: traceData?.variants || null, destinationRemovedTrackingParams: scanOptions.destinationRemovedTrackingParams || [], destinationRemovedVolatileParams: scanOptions.destinationRemovedVolatileParams || [], scannedUrl: fullUrl, rawUrl: rawScanUrl, sanitizedUrl: sanitizedScanUrl, removedTrackingParams: removedTrackingParamsForScan, removedVolatileParams: removedVolatileParamsForScan, removedParams: removedParamsForScan, traceChain: traceChain, riskScore: Math.min(100, riskScore), risk_flag: isConfirmedScam || isManualHighRisk || hasStrongCofactsRisk || hasGithubPagesBrandImpersonationRisk || hasJobTaskScamSignal || hasUnverifiedCommerceRisk || hasFreeHostingVotePhishingRisk || hasUaCloakingRisk || hasHighRiskRedirectTrace || (!hasConditionalCompanyTrustApplied && (hasNewOneYearRegistrationRisk || hasMissingAllSecurityHeaders || hasMissingMxRecords)), riskFlags: { confirmedScamDomain: isConfirmedScam, confirmedScamCategory: confirmedScamProfile?.category || '', manualHighRiskDomain: isManualHighRisk, githubPagesBrandImpersonation: hasGithubPagesBrandImpersonationRisk, unverifiedCommerce: hasUnverifiedCommerceRisk, freeHostingVotePhishing: hasFreeHostingVotePhishingRisk, cofactsStrongRisk: hasStrongCofactsRisk, cofactsLevel: cofactsRiskData?.level || 'none', jobTaskScam: hasJobTaskScamSignal, newDomainOneYearRegistration: hasNewOneYearRegistrationRisk, missingAllSecurityHeaders: hasMissingAllSecurityHeaders, missingMxRecords: hasMissingMxRecords, uaCloaking: hasUaCloakingRisk, redirectTrace: hasHighRiskRedirectTrace, missingAllSecurityHeadersRaw: hasMissingAllSecurityHeadersRaw, missingMxRecordsRaw: hasMissingMxRecordsRaw, trustedValidation: hasTrustedValidation, conditionalCompanyTrust: hasConditionalCompanyTrust, conditionalCompanyTrustApplied: hasConditionalCompanyTrustApplied, conditionalCompanyTrustBlocked: hasConditionalCompanyTrust && hasConditionalCompanyTrustBlockingThreat }, blocklistListed: blocklistListedForRisk, isSocialMedia: isSocialMedia, isWhitelisted: isWhitelisted, isTrustedAllowlist: hasTrustedAllowlistOverride, isConditionalCompanyTrust: hasConditionalCompanyTrust, conditionalCompanyTrustApplied: hasConditionalCompanyTrustApplied, conditionalCompanyTrustBlocked: hasConditionalCompanyTrust && hasConditionalCompanyTrustBlockingThreat, conditionalCompanyTrust: { eligible: hasConditionalCompanyTrust, applied: hasConditionalCompanyTrustApplied, blockedByStrongThreat: hasConditionalCompanyTrust && hasConditionalCompanyTrustBlockingThreat }, crawlerBlockedTrustedContext: hasCrawlerBlockedTrustedContext, rootDomainTrust: { registrableDomain, hasRankedRootDomainFallback, isTrustedEcommerceRootDomain, isTrustedTaiwanServiceRootDomain, isTrustedFinancialServiceRootDomain, isTrustedGovernmentServiceRootDomain, isTrustedPublicInterestRootDomain },
                sensitiveExternalForm: hasSensitiveExternalForm,
                details: {
                    serverCountry: serverInfo?.isReal ? `${serverInfo.country}${serverIp ? ` (${serverIp})` : ''}` : '隱藏/無法偵測',
                    serverIp,
                    serverOrg: serverInfo?.org || '',
                    siteStatus: siteStatusData
                },
                checks: {
                    // 👇 新增這行：Google 官方的標記卡片
                    googleSafeBrowsing: { 
                        status: isGoogleFlaggedForRisk ? 'danger' : (safeBrowsingData?.status === 'clear' ? 'safe' : 'unknown'),
                        label: 'Google 官方安全庫', 
                        details: isGoogleFlaggedForRisk ? `Google 官方標記為危險網站 (${safeBrowsingData.threatType})` : ({ clear: 'Google Safe Browsing 本次查詢未命中威脅', disabled: 'Google Safe Browsing 未啟用，未進行查詢', timeout: 'Google Safe Browsing 查詢逾時，無法判定' }[safeBrowsingData?.status] || 'Google Safe Browsing 暫時無法查詢，不代表安全'),
                        sourceStatus: safeBrowsingData?.status || 'unavailable',
                        checkedAt: safeBrowsingData?.checkedAt || null
                    },
                    officialAlerts: {
                        status: hasOfficialAlert ? 'danger' : 'safe',
                        label: '官方警示資料',
                        details: hasOfficialAlert ?
                            `${officialAlertMatch.source} 公告：${officialAlertMatch.category}「${officialAlertMatch.productName || officialAlertMatch.title}」。${officialAlertMatch.violationType}；${officialAlertMatch.warning}${officialAlertMatch.claimSummary ? ` ${officialAlertMatch.claimSummary}` : ''}` :
                            '未命中目前內建的官方警示資料',
                        link: hasOfficialAlert ? officialAlertMatch.sourceUrl : null
                    },
                    cofactsReports: {
                        status: cofactsCheckStatus,
                        label: 'Cofacts 群眾回報',
                        details: cofactsCheckDetails,
                        sources: cofactsPresentation.sources,
                        checkedAt: cofactsRiskData?.checkedAt || null,
                        link: hasCofactsRecord ? cofactsMatch?.articleUrl : null,
                        attribution: cofactsRiskData?.attribution?.text || '',
                        license: cofactsRiskData?.attribution?.license || ''
                    },
                    analyticsCluster: {
                        ...analyticsClusterData,
                        status: analyticsClusterData?.status || 'safe',
                        label: '詐騙站群關聯',
                        details: analyticsClusterData?.details || '未取得站群關聯資料'
                    },
                    confirmedScam: {
                        status: isConfirmedScam ? 'danger' : 'safe',
                        label: '人工確認詐騙網域',
                        details: isConfirmedScam ? (confirmedScamProfile?.details || '此網域已由人工確認為詐騙連結，直接列為高度風險') : '未命中人工確認詐騙網域清單'
                    },
                    manualHighRisk: {
                        status: isManualHighRisk ? 'danger' : 'safe',
                        label: '人工確認高風險網域',
                        details: isManualHighRisk
                            ? '人工審查已列為高度交易與網站可信度風險；此分類不等同已有獨立證據確認為詐騙'
                            : '未命中人工確認高風險網域清單'
                    },
                    siteContent: { status: siteContentStatus, label: '網站內容狀態', details: siteContentMsg },
                    govAgency: isOfficialTaiwanGov && hasVerifiedGovernmentAgency ? {
                        status: 'safe',
                        label: '政府機關網域驗證',
                        details: govAgencyVerificationData?.disclosure || '公開機關資料可對應此台灣政府官方網域',
                        official: true,
                        verified: true,
                        directAgencyMatched: !!govAgencyVerificationData?.directAgencyMatched,
                        siteName: govAgencyVerificationData?.siteName || govAgencySignals.siteName || '',
                        agencyName: verifiedGovernmentAgency?.name || govAgencyVerificationData?.agencyName || '',
                        rootAgency: govAgencyVerificationData?.rootAgency || govAgencySignals.rootAgency || '',
                        rootDomain: govAgencyVerificationData?.rootDomain || govAgencySignals.rootDomain || registrableDomain,
                        agencies: govAgencyVerificationData?.agencies || [],
                        evidence: govAgencySignals.evidence || [],
                        sourceEvidence: govAgencyVerificationData?.evidence || [],
                        checkedAt: govAgencyVerificationData?.checkedAt || null,
                        sourceUrl: 'https://data.gov.tw/dataset/7307'
                    } : {
                        hidden: true,
                        status: 'unknown',
                        label: '政府機關網域驗證',
                        details: isOfficialTaiwanGov
                            ? '已辨識為台灣政府官方網域，但未比對到可顯示的公開機關資料；本項依正確性優先暫不顯示。'
                            : ''
                    },

                    domainAnalysis: {
                        status: domainAnalysisStatus,
                        label: '網域特徵分析',
                        details: domainAnalysisDetails
                    },

                    traffic: { status: trafficStatus, label: 'Tranco 流量排名', details: trafficDetails },
                    serverLocation: { status: serverInfo?.isReal ? 'info' : (hasRootDomainTrustBaseline ? 'info' : 'unknown'), label: '伺服器所在國家', details: serverInfo?.isReal ? serverCountryDetails : (hasRootDomainTrustBaseline ? '無法自動判定伺服器所在國家；已由根網域排名/電商信任基線補強，不作為風險加權' : serverCountryDetails) },
                    validation: {
                        status: hasTrustedValidation ? 'safe' : (trustValidationSignals.length > 0 ? 'info' : 'unknown'),
                        label: '次要可信驗證',
                        details: trustValidationSignals.length > 0
                            ? `${trustValidationSignals.slice(0, 4).map(item => item.reason).join('；')}（可信佐證分數 ${trustValidationScore}）`
                            : '未取得足夠 WHOIS、憑證、流量或內容語意佐證；需搭配其他風險指標判斷'
                    },
                    ecommerceValidation: {
                        status: isTrustedPaymentGatewayOrApiEndpoint ? 'safe' : (hasCrawlerBlockedTrustedContext && hasRootDomainTrustBaseline ? 'info' : (hasStrongEcommerceValidation ? 'safe' : (ecommerceTrustSignals.score > 0 ? 'info' : 'unknown'))),
                        label: '正規電商佐證',
                        details: isTrustedPaymentGatewayOrApiEndpoint
                            ? '可信支付閘道/API/checkout 端點，不要求一般購物車、CMS 或電商平台足跡佐證'
                            : (hasCrawlerBlockedTrustedContext && hasRootDomainTrustBaseline
                            ? `頁面可能被 WAF/Anti-bot 阻擋；已改以可信根網域 ${registrableDomain} 與 Tranco/根網域基線作為佐證，不以缺少 CMS 足跡扣分`
                            : (ecommerceTrustSignals.score > 0
                            ? `${ecommerceTrustSignals.reasons.slice(0, 4).join('；')}（電商佐證分數 ${ecommerceTrustSignals.score}）${hasStrongEcommerceValidation ? '，不單獨以購物頁特徵判為高風險' : '，仍需搭配其他風險指標判斷'}`
                            : '未取得足夠購物車、電商平台、聯絡資訊或 CMS 足跡佐證'))
                    },
                    seoMaturity: {
                        status: hasMatureSeoSignals ? 'safe' : (combinedSeoScore > 0 ? 'info' : 'unknown'),
                        label: 'SEO 成熟度',
                        details: [
                            ...(seoSignals.reasons || []),
                            siteSeoData?.robots?.exists ? `robots.txt 可讀${siteSeoData.robots.hasRules ? '且含標準規則' : ''}` : '',
                            siteSeoData?.sitemap?.exists ? `sitemap.xml 可讀${siteSeoData.sitemap.locCount ? `，約 ${siteSeoData.sitemap.locCount} 筆 loc` : ''}` : ''
                        ].filter(Boolean).length
                            ? `${[
                                ...(seoSignals.reasons || []),
                                siteSeoData?.robots?.exists ? `robots.txt 可讀${siteSeoData.robots.hasRules ? '且含標準規則' : ''}` : '',
                                siteSeoData?.sitemap?.exists ? `sitemap.xml 可讀${siteSeoData.sitemap.locCount ? `，約 ${siteSeoData.sitemap.locCount} 筆 loc` : ''}` : ''
                            ].filter(Boolean).slice(0, 5).join('；')}（SEO 佐證分數 ${combinedSeoScore}）`
                            : '未取得足夠 SEO metadata、robots.txt 或 sitemap.xml 佐證'
                    },
                    languageConsistency: {
                        status: languageSignals.status,
                        label: '語言一致性',
                        details: languageSignals.details
                    },
                    companyWebsite: {
                        status: hasOfficialCompanyDomainMatch ? 'safe' : (organizationVerificationData?.domainMatched ? 'warning' : (hasRegisteredBusinessIdentity ? 'info' : 'unknown')),
                        label: '組織／法人登記資料驗證',
                        details: organizationVerificationData?.disclosure || '未取得可將登記組織與此網域直接連結的公開資料',
                        verified: hasOfficialCompanyDomainMatch,
                        domainMatched: !!organizationVerificationData?.domainMatched,
                        activeRegistration: organizationVerificationData?.activeRegistration !== false,
                        registrationMatched: hasRegisteredBusinessIdentity,
                        trustedDomainMappingMatched: !!organizationVerificationData?.trustedDomainMappingMatched,
                        confidenceScore: Number(organizationVerificationData?.confidenceScore || 0),
                        company: verifiedCompany,
                        entities: organizationVerificationData?.entities || organizationVerificationData?.companies || [],
                        companies: organizationVerificationData?.entities || organizationVerificationData?.companies || [],
                        evidence: organizationVerificationData?.evidence || [],
                        checkedAt: organizationVerificationData?.checkedAt || null
                    },
                    conditionalCompanyTrust: hasConditionalCompanyTrust ? {
                        status: hasConditionalCompanyTrustApplied ? 'safe' : 'warning',
                        label: '條件式可信名單',
                        details: hasConditionalCompanyTrustApplied
                            ? '官網映射有效；新網域、低流量、缺少 MX/安全標頭與命名特徵只保留為背景資訊。Google/官方警示、惡意下載、釣魚表單與異常轉址仍可翻轉為高風險。'
                            : '官網映射有效，但偵測到強威脅，因此不套用弱訊號豁免。',
                        conditional: true,
                        applied: hasConditionalCompanyTrustApplied
                    } : {
                        hidden: true,
                        status: 'unknown',
                        label: '條件式可信名單',
                        details: ''
                    },
                    businessIdentity: {
                        status: isTrustedPaymentGatewayOrApiEndpoint ? 'safe' : (hasVerifiedBusinessEntity ? 'safe' : (businessIdentitySignals.matched ? 'info' : 'unknown')),
                        label: '商家實體一致性',
                        details: isTrustedPaymentGatewayOrApiEndpoint
                            ? '可信支付閘道/API/checkout 端點，不要求台灣在地商家實體或統編與 WHOIS/RDAP 註冊者比對'
                            : (hasOfficialCompanyDomainMatch
                            ? '組織公開登記與網域資料相符：' + (verifiedCompany?.name || domain)
                            : (hasVerifiedBusinessEntity
                            ? (matchedBusinessEntityName ? `頁面商家名稱「${matchedBusinessEntityName}」與 WHOIS/RDAP 註冊者相符` : '頁面揭露商家資訊，且 WHOIS/RDAP 註冊資料具一致性')
                            : (hasRegisteredBusinessIdentity
                            ? '頁面統編可對應經濟部登記資料，但尚未直接證明該公司持有此網域'
                            : (businessIdentitySignals.reasons?.length ? `${businessIdentitySignals.reasons.join('；')}；尚未能與 WHOIS/RDAP 註冊者明確比對` : '未取得足夠公司名稱、統一編號或 WHOIS/RDAP 註冊者比對資料'))))
                    },
                    lineOfficial: {
                        status: lineOfficialSignals.matched ? (hasStrongEcommerceValidation || hasVerifiedBusinessEntity ? 'info' : 'warning') : 'safe',
                        label: 'LINE 官方帳號脈絡',
                        details: lineOfficialSignals.matched
                            ? `${lineOfficialSignals.reason}${lineOfficialSignals.urls?.length ? `：${lineOfficialSignals.urls.join('、')}` : ''}${(hasStrongEcommerceValidation || hasVerifiedBusinessEntity) ? '；已搭配商家/電商佐證，不單獨視為高風險' : '；缺少商家佐證時仍需留意'}`
                            : lineOfficialSignals.reason
                    },
                    securityHeaders: {
                        status: hasConditionalCompanyTrustApplied && hasMissingAllSecurityHeadersRaw ? 'info' : (hasMissingAllSecurityHeaders ? 'danger' : (hasMissingAllSecurityHeadersRaw ? 'warning' : (securityHeadersData?.status === 'ok' ? 'safe' : 'unknown'))),
                        label: 'HTTP 安全標頭',
                        details: securityHeadersData?.status === 'ok'
                            ? (hasConditionalCompanyTrustApplied && hasMissingAllSecurityHeadersRaw
                                ? '缺少部分或全部現代安全標頭；組織官網映射已驗證，本項只保留為技術背景資訊'
                                : (hasMissingAllSecurityHeaders
                                ? '缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭'
                                : (hasMissingAllSecurityHeadersRaw
                                    ? '缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭；但尚未搭配其他詐騙佐證，不單獨判為高風險'
                                    : `已檢查安全標頭${securityHeadersData.missing?.length ? `；缺少：${securityHeadersData.missing.join('、')}` : '，未發現三項皆缺失'}`)))
                            : '無法自動檢查 HTTP 安全標頭'
                    },
                    mxRecords: {
                        status: hasConditionalCompanyTrustApplied && hasMissingMxRecordsRaw ? 'info' : (hasMissingMxRecords ? 'danger' : (hasMissingMxRecordsRaw ? 'warning' : (mxInfo.status === 'ok' ? 'safe' : 'unknown'))),
                        label: 'MX 郵件紀錄',
                        details: hasConditionalCompanyTrustApplied && hasMissingMxRecordsRaw
                            ? '未偵測到可接收郵件的 MX 紀錄；組織官網映射已驗證，本項只保留為技術背景資訊'
                            : (hasMissingMxRecords
                            ? (mxInfo.nullMx ? '網域設定 Null MX，明確表示不接收 Email' : '未偵測到 MX 郵件紀錄，可能是免洗或短期用途網域')
                            : (hasMissingMxRecordsRaw ? (mxInfo.nullMx ? '網域設定 Null MX，不接收 Email；但尚未搭配其他詐騙佐證，不單獨判為高風險' : '未偵測到 MX 郵件紀錄；但尚未搭配其他詐騙佐證，不單獨判為高風險')
                            : (mxInfo.status === 'ok' ? `已偵測到 MX 紀錄：${mxInfo.records.slice(0, 3).join('、')}` : '無法自動判定 MX 郵件紀錄')
                            ))
                    },
                    age: {
                        status: blocksSharedProviderTrust ? 'unknown' : ((isWhitelisted || hasConditionalCompanyTrustApplied) ? (isWhitelisted ? 'safe' : 'info') : ((domainAgeDays !== null && domainAgeDays < 90) ? 'warning' :
                            (hasNewOneYearRegistrationRisk ? 'warning' :
                            (domainAgeDays !== null ? (domainAgeDays < 365 ? 'warning' : 'safe') : 'unknown')))),
                        label: '註冊時間',
                        details: isEuCcHostedSite ? 'eu.cc 為共享子網域服務，無法取得此租戶的獨立註冊日；不採用 eu.cc 母網域的註冊年齡' : (isGithubPagesSite ? 'github.io 為共享架站服務，無法以 GitHub 母網域的註冊日代表此租戶；不採用母網域註冊年齡' : (isOfficialTaiwanGov ? '台灣政府官方網域，註冊年齡不作風險加權' : (isWhitelisted ? '受信賴白名單網域，註冊年齡不作風險加權' : (hasConditionalCompanyTrustApplied ? `${domainAgeDays !== null ? `註冊日期: ${new Date(rdapDate).toISOString().split('T')[0]}；` : ''}組織官網映射已驗證，註冊年齡只保留為背景資訊` : (domainAgeDays !== null ? `註冊日期: ${new Date(rdapDate).toISOString().split('T')[0]}${domainAgeDays < 90 ? ' - 3 個月內新註冊網域！' : ''}${hasNewOneYearRegistrationRisk ? ' - 未滿 6 個月且註冊週期約 1 年' : ''}` : 'RDAP/WHOIS 未提供明確註冊日；維持未知，不以 HTTPS 憑證日期代替'))))),
                        link: `https://who.is/whois/${rdapQueriedDomain}`
                    },
                    registrationPeriod: {
                        status: blocksSharedProviderTrust ? 'unknown' : (hasConditionalCompanyTrustApplied ? 'info' : (hasNewOneYearRegistrationRisk ? 'warning' : (registrationPeriodDays !== null ? 'info' : 'unknown'))),
                        label: '註冊週期',
                        details: blocksSharedProviderTrust
                            ? `共享架站租戶沒有可獨立驗證的註冊週期；不採用 ${isEuCcHostedSite ? 'eu.cc' : 'github.io'} 母網域的到期日`
                            : (registrationPeriodDays !== null
                            ? `註冊期間約 ${registrationPeriodDays} 天${rdapExpirationDate ? `；到期日: ${new Date(rdapExpirationDate).toISOString().split('T')[0]}` : ''}${hasNewOneYearRegistrationRisk && !hasConditionalCompanyTrustApplied ? ' - 新網域搭配 1 年短期註冊，需提高警覺' : ''}${hasConditionalCompanyTrustApplied ? '；組織官網映射已驗證，本項不作風險加權' : ''}`
                            : '無法自動判定註冊週期')
                    },
                    certificate: {
                        status: isNewDomainWithNewCertificate ? 'warning' : (certData?.notBefore ? 'info' : 'unknown'),
                        label: 'HTTPS 憑證時間',
                        details: certData?.notBefore ? `憑證最近核發日: ${new Date(certData.notBefore).toISOString().split('T')[0]}${certExpiryText}${certIssuerText}${isNewDomainWithNewCertificate ? ' - RDAP/WHOIS 同時確認為新網域，需提高警覺' : (isVeryNewCertificate ? '；憑證會定期續發，此日期不代表網域新註冊，且不單獨加權' : '')}` : '無法自動取得憑證核發時間'
                    },
                    registrar: { status: isHighRiskRegistrar ? 'warning' : (isTrustedTaiwanRegistrar ? 'safe' : 'safe'), label: '註冊商信譽', details: registrarName ? (isHighRiskRegistrar ? `註冊商 ${registrarName} 常被用於垃圾網站` : (isTrustedTaiwanRegistrar ? `台灣常見註冊商: ${registrarName}` : `註冊商: ${registrarName}`)) : '無法辨識註冊商' },
                    whoisPrivacy: { status: privacyDetected ? (isHighTraffic ? 'safe' : 'warning') : 'safe', label: 'WHOIS 身份隱藏', details: privacyDetected ? (isHighTraffic ? '已開啟隱私保護 (知名網站常見設定)' : '已開啟隱私保護 (所有者身份被隱藏，無法追查)') : '未偵測到隱私保護服務' },
                    subdomain: { status: isDeepSubdomain ? (hasConditionalCompanyTrustApplied ? 'info' : (isHighTraffic ? 'safe' : (hasDeepSubdomainPhishingPattern ? 'danger' : 'warning'))) : 'safe', label: '子網域深度', details: isDeepSubdomain ? (hasConditionalCompanyTrustApplied ? '組織官網映射已驗證，子網域深度只保留為背景資訊' : (isHighTraffic ? '子網域層級較多，但屬於受信賴網域' : (hasDeepSubdomainPhishingPattern ? '檢測到深層可疑子網域，伴隨偽裝後綴、連字號、隨機片段或可疑參數等釣魚特徵' : '檢測到多層子網域，需搭配其他風險特徵判斷'))) : '子網域層級正常' },
                    subdomainPattern: { status: suspiciousSubdomain.matched ? ((isWhitelisted || isHighTraffic || hasConditionalCompanyTrustApplied) ? 'info' : 'warning') : 'safe', label: '可疑子網域模式', details: suspiciousSubdomain.matched ? `偵測到可疑子網域「${suspiciousSubdomain.label}」：${suspiciousSubdomain.reasons.join('、')}${hasConditionalCompanyTrustApplied ? '；組織官網映射已驗證，本項不作風險加權' : ''}` : '未偵測到異常子網域命名模式' },
                    disposableDomain: { status: hasConditionalCompanyTrustApplied && hasDisposableRootLabel ? 'info' : (hasDisposableShoppingLandingRisk || hasDisposableRootPhishingRisk || hasDisposableUnreadablePageRisk ? 'danger' : (hasDisposableRootLabel ? 'warning' : 'safe')), label: '免洗亂碼網域', details: hasDisposableRootLabel ? `主網域「${rootLabel}」具有隨機生成或可快速棄置特徵：${disposableRoot.reasons.slice(0, 4).join('、')}${suspiciousSubdomain.matched ? '；並搭配可疑子網域命名' : ''}${hasSuspiciousLandingParams ? '；並搭配廣告追蹤落地頁參數' : ''}${unreadablePageStatuses.includes(siteStatusData.status) ? '；且頁面內容未完整取得' : ''}${hasConditionalCompanyTrustApplied ? '；組織官網映射已驗證，本項只保留為背景資訊' : ''}` : '未偵測到主網域亂碼免洗特徵' },
                    userAgentCloaking: { status: hasUaCloakingRisk ? 'danger' : (hasUaDifference || traceData?.uaComparisonComplete === false ? 'warning' : 'safe'), label: '裝置導向差異', details: hasUaDifference ? `${uaCloakingDetails}${hasUaCloakingRisk ? '；此行為常見於只對手機使用者展示釣魚頁或規避桌面掃描。' : '；目前未導向不同主網域，列為提醒。'}` : uaCloakingDetails },
                    redirect: { status: redirectStatus, label: '轉址/短網址', details: redirectCheckDetails, finalUrl: isRedirected ? siteStatusData.finalUrl : null },
                    network: { status: serverInfo?.isReal ? 'info' : (hasRootDomainTrustBaseline ? 'info' : 'unknown'), label: '網路服務商 (ISP/ASN)', details: serverInfo?.isReal ? `${serverInfo.org || '未知服務商'}${serverInfo.asn ? ` (${serverInfo.asn})` : ''}` : (hasRootDomainTrustBaseline ? '無法識別網路來源；已由根網域信任基線補強，不作為風險加權' : '無法識別網路來源') },
                    links: { status: siteStatusData.linkStats?.total <= 1 ? 'warning' : 'info', label: '網頁連結分析', details: siteStatusData.linkStats ? `共 ${siteStatusData.linkStats.total} 個連結 (內部: ${siteStatusData.linkStats.internal} / 外部: ${siteStatusData.linkStats.external})` : '無法分析頁面內容' },
                    formFields: { status: highRiskSensitiveFieldCount > 0 ? (isHighTraffic || isWhitelisted ? 'info' : 'warning') : (lowRiskSensitiveFieldCount > 0 ? 'info' : 'safe'), label: '表單敏感欄位', details: highRiskSensitiveFieldCount > 0 ? `偵測到 ${highRiskSensitiveFieldCount} 個可能要求密碼、OTP 或金融資料的高敏感欄位` : (lowRiskSensitiveFieldCount > 0 ? `偵測到 ${lowRiskSensitiveFieldCount} 個一般登入/聯絡欄位，未視為強風險` : '未偵測到敏感表單欄位') },
                    externalResources: { status: externalFormActionCount > 0 ? 'danger' : (suspiciousExternalResourceCount > 0 ? 'warning' : 'safe'), label: '外部資源/表單送出', details: externalFormActionCount > 0 ? `表單資料會送往 ${externalFormActionCount} 個外部網域，請勿輸入個資` : (suspiciousExternalResourceCount > 0 ? `偵測到 ${suspiciousExternalResourceCount} 個可疑外部 script/iframe 資源` : (externalResourceCount > 0 ? `偵測到 ${externalResourceCount} 個一般第三方資源，未視為強風險` : '未偵測到異常外部表單或資源')) },
                    freeHostingSensitiveLink: {
                        status: hasFreeHostingSensitiveLinkRisk ? 'danger' : 'safe',
                        label: '免費子網域驗證連結',
                        details: hasFreeHostingSensitiveLinkRisk
                            ? '免費架站/子網域服務搭配 token、驗證或一次性參數與隨機路徑，符合短期釣魚連結常見型態'
                            : '未偵測到免費子網域搭配敏感驗證參數的高風險組合'
                    },
                    votePhishing: {
                        status: hasFreeHostingVotePhishingRisk ? 'danger' : 'safe',
                        label: '假投票／帳號釣魚',
                        details: hasFreeHostingVotePhishingRisk
                            ? '共享／免費子網域的投票路徑拒絕爬蟲讀取，且沒有可驗證的獨立可信基線；不可因看不到表單就判為安全。'
                            : '未偵測到共享子網域投票頁搭配爬蟲封鎖的高風險組合'
                    },
                    githubPagesBrand: {
                        status: hasGithubPagesBrandImpersonationRisk ? 'danger' : 'safe',
                        label: 'GitHub Pages 品牌冒用',
                        details: hasGithubPagesBrandImpersonationRisk
                            ? `GitHub Pages 租戶名稱包含受保護品牌「${matchedBrandSimilarity.brandName}」，但不是官方網域；頁面即使已下架或回傳 404，仍保留高度品牌釣魚風險。`
                            : '未偵測到 GitHub Pages 租戶名稱冒用受保護品牌'
                    },
                    regulatedProduct: {
                        status: hasRegulatedTobaccoSalesSignal ? 'danger' : 'safe',
                        label: '電子菸/加熱菸販售',
                        details: hasRegulatedTobaccoSalesSignal
                            ? `偵測到電子菸、煙彈、RELX/悅刻等商品搭配交易脈絡：${regulatedTobaccoSalesSignals.reasons.slice(0, 4).join('、')}。在台灣情境下屬高度法規與交易詐騙風險。`
                            : '未偵測到電子菸、加熱菸或煙彈的網路販售脈絡'
                    },
                    jobTaskScam: {
                        status: hasJobTaskScamSignal ? 'danger' : (jobTaskScamSignals.reasons.length > 0 ? 'warning' : 'safe'),
                        label: '假求職/任務金流',
                        details: hasJobTaskScamSignal
                            ? `偵測到求職頁混入存入、提領、交易或機台任務：${jobTaskScamSignals.reasons.slice(0, 3).join('、')}`
                            : (jobTaskScamSignals.reasons.length > 0 ? jobTaskScamSignals.reasons.join('、') : '未偵測到求職網站搭配儲值、提領或任務金流的異常組合')
                    },
                    shoppingScam: { status: hasStrongEcommerceValidation ? 'info' : ((hasShoppingScamSignal || hasShoppingLineContactRisk) ? 'danger' : (shoppingScamSignals.matched || hasShoppingLandingUrlRisk ? 'warning' : 'safe')), label: '一頁式購物詐騙', details: hasStrongEcommerceValidation ? '偵測到購物頁特徵，但同時具備正規電商佐證，未單獨判為一頁式購物詐騙' : (shoppingScamSignals.matched ? `偵測到 ${shoppingScamSignals.reasonCount} 個購物詐騙頁特徵：${shoppingScamSignals.reasons.slice(0, 4).join('、')}` : (hasShoppingLandingUrlRisk ? '頁面內容未完整取得，無法確認購物頁結構；但網址本身已符合可疑購物落地頁特徵' : '未能從可讀 HTML 中確認一頁式購物結構')) },
                    unverifiedCommerce: {
                        status: hasUnverifiedCommerceRisk ? 'danger' : (shoppingScamSignals.hasCommerceOffer && !hasStrongEcommerceValidation ? 'warning' : 'safe'),
                        label: '未驗證模板商城',
                        details: hasUnverifiedCommerceRisk
                            ? `${shoppingScamSignals.unverifiedCommerceReasons.slice(0, 4).join('、')}；新註冊網域且缺少公司公開資料或商家實體佐證`
                            : (shoppingScamSignals.hasCommerceOffer && !hasStrongEcommerceValidation
                                ? `${shoppingScamSignals.unverifiedCommerceReasons.slice(0, 4).join('、') || '偵測到商品與結帳功能，但尚未取得足夠商家佐證'}`
                                : '未偵測到新站模板商城與商家資訊不足的高風險組合')
                    },
                    lineContact: { status: hasShoppingLineContactRisk ? 'danger' : (shoppingScamSignals.hasLineContactSignal ? (hasStrongEcommerceValidation ? 'info' : 'warning') : 'safe'), label: 'LINE 聯絡導流', details: shoppingScamSignals.hasLineContactSignal ? (hasStrongEcommerceValidation ? `偵測到 LINE 聯絡資訊，但同時具備正規電商佐證${shoppingScamSignals.lineContactExamples?.length ? `：${shoppingScamSignals.lineContactExamples.join('、')}` : ''}` : `偵測到要求加入 LINE 聯絡/下單${shoppingScamSignals.lineContactExamples?.length ? `：${shoppingScamSignals.lineContactExamples.join('、')}` : ''}`) : '未偵測到 LINE 聯絡導流' },
                    shoppingLanding: { status: hasConditionalCompanyTrustApplied && (hasShoppingLandingUrlRisk || hasSuspiciousTldAdLandingRisk || hasSuspiciousLandingParams) ? 'info' : ((hasShoppingLandingUrlRisk || hasSuspiciousTldAdLandingRisk) ? 'danger' : (hasSuspiciousLandingParams ? ((hasStrongEcommerceValidation || isWhitelisted || isTrustedTLD || hasSmallBusinessTrustContext) ? 'info' : 'warning') : 'safe')), label: '購物/廣告落地頁網址', details: hasConditionalCompanyTrustApplied && (hasShoppingLandingUrlRisk || hasSuspiciousTldAdLandingRisk || hasSuspiciousLandingParams) ? '偵測到廣告或落地頁網址特徵；組織官網映射已驗證，本項只保留為背景資訊' : (hasSuspiciousTldAdLandingRisk ? `原始網址含社群/廣告追蹤參數：${rawAdLandingParamDetails.slice(0, 4).join('、')}；且網域使用可疑後綴、缺少可信商家或正規電商佐證` : (hasShoppingLandingUrlRisk ? `即使未取得頁面內容，網址本身已符合可疑購物落地頁特徵：${matchedLandingParams.slice(0, 4).join('、')}${(isSuspiciousRootLabel || isSuspiciousLandingRootLabel) ? '；主網域名稱隨機度偏高' : ''}` : (hasSuspiciousLandingParams ? ((hasStrongEcommerceValidation || isWhitelisted || isTrustedTLD || hasSmallBusinessTrustContext) ? `偵測到廣告落地頁追蹤參數：${matchedLandingParams.slice(0, 4).join('、')}；但網域/頁面具備台灣商業或正規電商脈絡，未單獨判為風險` : `偵測到廣告落地頁追蹤參數：${matchedLandingParams.slice(0, 4).join('、')}${(isSuspiciousRootLabel || isSuspiciousLandingRootLabel) ? '；主網域名稱隨機度偏高' : ''}`) : '未偵測到可疑購物落地頁參數'))) },
                    brandSimilarity: { status: hasBrandSimilarity ? 'danger' : 'safe', label: '品牌相似網域', details: hasBrandSimilarity ? `網域疑似模仿「${matchedBrandSimilarity.brandName}」相關名稱 (${matchedBrandSimilarity.keyword})` : '未偵測到常見品牌相似網域' },
                    pageBrand: { status: hasPageBrandMismatch ? 'danger' : 'safe', label: '頁面品牌一致性', details: hasPageBrandMismatch ? `頁面內容疑似出現「${pageBrandSignals.brandName}」品牌，但網域不是官方網站` : '未偵測到頁面品牌與網域不一致' },
                    officialFlowPath: { status: hasOfficialFlowPathSignal ? ((hasBrandSimilarity || hasPageBrandMismatch || isVeryNewDomain || isLowTraffic) ? 'warning' : 'info') : 'safe', label: '官方流程路徑', details: hasOfficialFlowPathSignal ? '網址路徑含登入、驗證、帳戶、領取、配送或付款等流程字樣，需搭配網域可信度判斷' : '未偵測到可疑官方流程路徑' },
                    urgency: { status: hasUrgencyScamSignal ? ((hasBrandSimilarity || hasPageBrandMismatch || hasFinancialPhishingSignal || isVeryNewDomain) ? 'warning' : 'info') : 'safe', label: '限時/恐嚇話術', details: hasUrgencyScamSignal ? `偵測到限時、帳戶異常或立即驗證類話術：${urgencySignals.examples.slice(0, 3).join('、')}` : '未偵測到常見限時或恐嚇話術' },
                    homograph: { status: hasHomographSignal ? 'danger' : 'safe', label: '相似字元網域', details: hasHomographSignal ? '網域含 Punycode 或非 ASCII 字元，可能利用相似字元混淆官方網域' : '未偵測到 Punycode 或 Unicode 混淆網域' },
                    params: { status: ((hasSuspiciousParams || hasNestedSuspiciousParams) && !isWhitelisted) ? (hasConditionalCompanyTrustApplied ? 'info' : 'danger') : ((hasSuspiciousParams || hasNestedSuspiciousParams) ? 'info' : 'safe'), label: '網址參數檢查', details: (hasSuspiciousParams || hasNestedSuspiciousParams) ? (isWhitelisted ? '官方白名單網域含交易/工作階段參數，視為正常站內流程' : (hasConditionalCompanyTrustApplied ? '官網映射已驗證；敏感流程參數只保留為背景資訊，仍持續檢查釣魚表單與異常轉址' : '包含敏感參數 (token/auth/session/verify)，疑似釣魚或帳戶劫持連結')) : '未發現敏感追蹤或認證參數' },
                    entropy: { status: hasConditionalCompanyTrustApplied && (isExtremeGibberish || isHighEntropy || hasDisposableRootLabel) ? 'info' : ((isExtremeGibberish || hasDisposableShoppingLandingRisk || hasDisposableRootPhishingRisk || hasDisposableUnreadablePageRisk) ? 'danger' : (isHighEntropy || hasDisposableRootLabel ? 'warning' : 'safe')), label: '亂碼/隨機網址', details: hasConditionalCompanyTrustApplied && (isExtremeGibberish || isHighEntropy || hasDisposableRootLabel) ? '組織官網映射已驗證，命名與網址亂碼特徵只保留為背景資訊' : (hasDisposableRootLabel ? `主網域「${rootLabel}」疑似隨機生成：${disposableRoot.reasons.slice(0, 3).join('、')}` : (isHighEntropy ? (isExtremeGibberish ? '🚨 網域包含極長亂碼，常為詐騙釣魚專屬追蹤連結' : '網域名稱隨機度過高，疑似機器生成') : '網域名稱結構正常')) },
                    iframe: { status: siteStatusData.hasIframe ? 'warning' : 'safe', label: 'Iframe 偽裝', details: siteStatusData.hasIframe ? '偵測到隱藏框架 (可能隱藏真實內容)' : '未偵測到異常框架' },
                    apkCheck: { status: isApkSite || isDownloadPhishingSignal ? 'danger' : (suspiciousDownloadPath ? 'warning' : 'safe'), label: '可疑檔案下載', details: isApkSite ? `偵測到 ${apkUrlCount} 個不明 APK 檔下載，極高風險！` : (isDownloadPhishingSignal ? `偵測到可疑下載誘導：安裝關鍵字 ${installKeywordCount} 個、動態下載特徵 ${dynamicDownloadCount} 個、可疑路徑 ${suspiciousDownloadPathCount} 個` : (suspiciousDownloadPath ? `網址路徑含可疑下載片段：${downloadSignals.suspiciousPathFragments.join('、')}` : '未偵測到可疑 Android 應用程式')) }
                }
            };
        };

        const createScanCheck = (status, label, details, extra = {}) => ({ status, label, details, ...extra });

        const createScanFailureResult = (targetDomain, fullUrl, scanOptions = {}, err = null) => {
            const rawUrl = scanOptions.rawUrl || fullUrl;
            const sanitizedUrl = scanOptions.sanitizedUrl || fullUrl;
            const removedTrackingParams = [...new Set(scanOptions.removedTrackingParams || [])];
            const removedVolatileParams = [...new Set(scanOptions.removedVolatileParams || [])];
            const removedParams = [...new Set(scanOptions.removedParams || [
                ...removedTrackingParams,
                ...removedVolatileParams
            ])];
            const siteStatus = {
                status: 'unknown',
                code: null,
                msg: '檢測流程發生例外，未完成深度掃描',
                hasIframe: false,
                finalUrl: null,
                linkStats: { total: 0, internal: 0, external: 0 },
                pageSignals: createEmptyPageSignals()
            };
            const suspiciousTlds = getRiskList('suspiciousTlds');
            const isFallbackSuspiciousAdLanding = !isVerifiedSafeRootDomain(targetDomain) &&
                (suspiciousTlds.some(suffix => String(targetDomain || '').toLowerCase().endsWith(suffix)) || String(targetDomain || '').toLowerCase().endsWith('.info')) &&
                removedTrackingParams.length > 0;
            const fallbackDomain = normalizeHostname(targetDomain);
            const isFallbackConfirmedScam = isConfirmedScamDomain(fallbackDomain);
            const isFallbackManualHighRisk = isManualHighRiskDomain(fallbackDomain);
            const isFallbackCloudflarePagesDev = isCloudflarePagesDevHostname(fallbackDomain);
            const isFallbackNetlifyApp = isNetlifyAppHostname(fallbackDomain);
            const isFallbackWeeblyHostedSite = fallbackDomain !== 'weebly.com' && isSameRootDomain(fallbackDomain, 'weebly.com');
            const fallbackSubdomainPart = fallbackDomain.split('.')[0] || '';
            const fallbackSuspiciousSubdomain = analyzeSuspiciousSubdomain(fallbackDomain);
            const fallbackHighEntropySubdomain = fallbackSubdomainPart !== 'www' &&
                (
                    calculateEntropy(fallbackSubdomainPart) > 3.6 ||
                    (/^[a-z0-9]{12,30}$/i.test(fallbackSubdomainPart) && /\d/.test(fallbackSubdomainPart)) ||
                    (fallbackSubdomainPart.length >= 5 && !/[aeiou]/i.test(fallbackSubdomainPart)) ||
                    /[bcdfghjklmnpqrstvwxz]{4,}/i.test(fallbackSubdomainPart)
                );
            const fallbackCloudflarePagesRandomSubdomain = fallbackHighEntropySubdomain ||
                fallbackSuspiciousSubdomain.reasons.some(reason =>
                    reason.includes('短隨機') ||
                    reason.includes('不易讀') ||
                    reason.includes('純數字')
                );
            const isFallbackCloudflarePagesRandomRisk = isFallbackCloudflarePagesDev &&
                fallbackCloudflarePagesRandomSubdomain;
            const isFallbackNetlifyAppRandomRisk = isFallbackNetlifyApp &&
                (hasGeneratedNetlifySubdomain(fallbackDomain) || fallbackCloudflarePagesRandomSubdomain);
            const fallbackDetails = '檢測流程暫時中斷，系統已避免頁面當掉；請稍後重試，或先不要在此網址輸入個資。';
            const fallbackConfirmedScamDetails = '此網域已由人工確認為詐騙連結；即使深度掃描暫時中斷，仍直接列為高度風險。';
            const fallbackManualHighRiskDetails = '此網域已由人工審查列為高度交易與網站可信度風險；即使深度掃描暫時中斷，仍維持高度風險。此分類不等同已有獨立證據確認為詐騙。';
            const fallbackAdLandingDetails = `檢測流程逾時或中斷，但原始網址含 ${removedTrackingParams.slice(0, 4).join('、')} 等社群/廣告追蹤參數，且網域使用可疑後綴；先以高風險處理。`;
            const fallbackCloudflarePagesDetails = isFallbackCloudflarePagesRandomRisk
                ? `🚨 檢測流程逾時或中斷，但 ${fallbackDomain} 是 Cloudflare Pages 免費部署子網域，且子網域呈現短亂碼/不可讀命名（${fallbackSuspiciousSubdomain.reasons.slice(0, 3).join('、') || '子網域名稱隨機度偏高'}）；先以高風險處理。`
                : '「pages.dev」是 Cloudflare Pages 的免費/預設部署子網域，代表使用者自建專案頁而非 Cloudflare 官方網站；未取得更多可信佐證前至少列為中度風險。';
            const fallbackNetlifyDetails = isFallbackNetlifyAppRandomRisk
                ? `🚨 檢測流程逾時或中斷，但 ${fallbackDomain} 是 Netlify 免費/預設託管子網域，且專案名呈現隨機字詞與代碼組合（${fallbackSuspiciousSubdomain.reasons.slice(0, 3).join('、') || '臨時專案命名特徵'}）；先以高風險處理。`
                : '「netlify.app」是 Netlify 免費/預設託管子網域，代表使用者自建臨時站而非 Netlify 官方網站；未取得更多可信佐證前至少列為中度風險。';
            const fallbackWeeblyDetails = '「weebly.com」是 Weebly 免費/低門檻架站子網域，代表使用者自建網站而非 Weebly 官方內容；即使深度掃描暫時中斷，也先維持中度風險並建議查證品牌、付款與客服資訊。';
            const fallbackRiskScore = isFallbackConfirmedScam
                ? 100
                : (isFallbackManualHighRisk
                ? 90
                : (isFallbackSuspiciousAdLanding
                ? 85
                : ((isFallbackCloudflarePagesRandomRisk || isFallbackNetlifyAppRandomRisk) ? 85 : 30)));
            const fallbackDomainStatus = isFallbackConfirmedScam || isFallbackManualHighRisk || isFallbackSuspiciousAdLanding || isFallbackCloudflarePagesRandomRisk || isFallbackNetlifyAppRandomRisk
                ? 'danger'
                : 'warning';
            const fallbackDomainDetails = isFallbackConfirmedScam
                ? fallbackConfirmedScamDetails
                : (isFallbackManualHighRisk
                ? fallbackManualHighRiskDetails
                : (isFallbackSuspiciousAdLanding
                ? fallbackAdLandingDetails
                : (isFallbackCloudflarePagesDev ? fallbackCloudflarePagesDetails : (isFallbackNetlifyApp ? fallbackNetlifyDetails : (isFallbackWeeblyHostedSite ? fallbackWeeblyDetails : fallbackDetails)))));
            return {
                domain: targetDomain,
                inputDomain: normalizeHostname(scanOptions.inputDomain || targetDomain),
                inputScanUrl: scanOptions.inputScanUrl || fullUrl,
                primaryDomain: fallbackDomain,
                primaryUrl: fullUrl,
                resolvedFromShortener: scanOptions.resolvedFromShortener === true,
                unresolvedShortener: scanOptions.unresolvedShortener === true,
                resolvedFinalUrl: scanOptions.resolvedFinalUrl || null,
                traceObservedAt: scanOptions.traceObservedAt || null,
                traceVariants: scanOptions.preResolvedTrace?.variants || null,
                scannedUrl: fullUrl,
                rawUrl,
                sanitizedUrl,
                removedTrackingParams,
                removedVolatileParams,
                removedParams,
                traceChain: scanOptions.preResolvedTrace?.chain || [],
                riskScore: fallbackRiskScore,
                risk_flag: true,
                riskFlags: { scanRuntimeError: true, confirmedScamDomain: isFallbackConfirmedScam, manualHighRiskDomain: isFallbackManualHighRisk, errorMessage: err?.message || '' },
                blocklistListed: false,
                isSocialMedia: false,
                isWhitelisted: false,
                isTrustedAllowlist: false,
                crawlerBlockedTrustedContext: false,
                rootDomainTrust: { registrableDomain: targetDomain, hasRankedRootDomainFallback: false, isTrustedEcommerceRootDomain: false, isTrustedTaiwanServiceRootDomain: false, isTrustedFinancialServiceRootDomain: false, isTrustedGovernmentServiceRootDomain: false, isTrustedPublicInterestRootDomain: false },
                details: {
                    serverCountry: '隱藏/無法偵測',
                    serverIp: null,
                    serverOrg: '',
                    siteStatus
                },
                checks: {
                    googleSafeBrowsing: createScanCheck('unknown', 'Google 官方安全庫', '檢測流程未完整完成，無法取得 Google Safe Browsing 結果'),
                    officialAlerts: createScanCheck('unknown', '官方警示資料', '檢測流程未完整完成，無法查詢官方警示資料'),
                    cofactsReports: createScanCheck('unknown', 'Cofacts 群眾回報', '檢測流程未完整完成，無法查詢 Cofacts 群眾回報與查核資料'),
                    analyticsCluster: createScanCheck('unknown', '詐騙站群關聯', '檢測流程未完整完成，無法比對共享分析識別碼'),
                    siteContent: createScanCheck(isFallbackConfirmedScam || isFallbackManualHighRisk || isFallbackSuspiciousAdLanding ? 'danger' : (isFallbackCloudflarePagesRandomRisk ? 'info' : 'unknown'), '網站內容狀態', isFallbackConfirmedScam ? fallbackConfirmedScamDetails : (isFallbackManualHighRisk ? fallbackManualHighRiskDetails : (isFallbackSuspiciousAdLanding ? fallbackAdLandingDetails : fallbackDetails))),
                    domainAnalysis: createScanCheck(fallbackDomainStatus, '網域特徵分析', fallbackDomainDetails),
                    confirmedScam: createScanCheck(isFallbackConfirmedScam ? 'danger' : 'safe', '人工確認詐騙網域', isFallbackConfirmedScam ? '此網域已由人工確認為詐騙連結，直接列為高度風險' : '未命中人工確認詐騙網域清單'),
                    manualHighRisk: createScanCheck(isFallbackManualHighRisk ? 'danger' : 'safe', '人工確認高風險網域', isFallbackManualHighRisk ? '人工審查已列為高度交易與網站可信度風險；此分類不等同已有獨立證據確認為詐騙' : '未命中人工確認高風險網域清單'),
                    traffic: createScanCheck('unknown', 'Tranco 流量排名', '檢測流程未完整完成，無法取得流量排名'),
                    serverLocation: createScanCheck('unknown', '伺服器所在國家', '無法自動判定伺服器所在國家'),
                    validation: createScanCheck('unknown', '次要可信驗證', '檢測流程未完整完成，尚未取得可信佐證'),
                    ecommerceValidation: createScanCheck('unknown', '正規電商佐證', '檢測流程未完整完成，無法確認正規電商佐證'),
                    seoMaturity: createScanCheck('unknown', 'SEO 成熟度', '檢測流程未完整完成，無法確認 SEO 佐證'),
                    languageConsistency: createScanCheck('unknown', '語言一致性', '檢測流程未完整完成，無法判定頁面語言一致性'),
                    companyWebsite: createScanCheck('unknown', '組織／法人登記資料驗證', '檢測流程未完整完成，無法查詢組織與法人公開資料', {
                        verified: false,
                        registrationMatched: false,
                        confidenceScore: 0,
                        entities: [],
                        companies: [],
                        evidence: []
                    }),
                    businessIdentity: createScanCheck('unknown', '商家實體一致性', '檢測流程未完整完成，無法比對商家實體'),
                    lineOfficial: createScanCheck('safe', 'LINE 官方帳號脈絡', '未偵測到 LINE 聯絡導流'),
                    securityHeaders: createScanCheck('unknown', 'HTTP 安全標頭', '無法自動檢查 HTTP 安全標頭'),
                    mxRecords: createScanCheck('unknown', 'MX 郵件紀錄', '無法自動判定 MX 郵件紀錄'),
                    age: createScanCheck('unknown', '註冊時間', '無法自動獲取 (建議手動查詢 WHOIS)'),
                    registrationPeriod: createScanCheck('unknown', '註冊週期', '無法自動判定註冊週期'),
                    certificate: createScanCheck('unknown', 'HTTPS 憑證時間', '無法自動取得憑證核發時間'),
                    registrar: createScanCheck('unknown', '註冊商信譽', '無法辨識註冊商'),
                    whoisPrivacy: createScanCheck('unknown', 'WHOIS 身份隱藏', '無法自動判定 WHOIS 身份隱藏狀態'),
                    subdomain: createScanCheck('safe', '子網域深度', '子網域層級正常'),
                    subdomainPattern: createScanCheck(fallbackSuspiciousSubdomain.matched ? 'warning' : 'safe', '可疑子網域模式', fallbackSuspiciousSubdomain.matched ? `偵測到可疑子網域「${fallbackSuspiciousSubdomain.label}」：${fallbackSuspiciousSubdomain.reasons.join('、')}` : '未偵測到異常子網域命名模式'),
                    disposableDomain: createScanCheck('safe', '免洗亂碼網域', '未偵測到主網域亂碼免洗特徵'),
                    userAgentCloaking: createScanCheck('unknown', '裝置導向差異', '未完成 Mobile 與 Desktop User-Agent 比對'),
                    redirect: createScanCheck('unknown', '轉址/短網址', '檢測流程未完整完成，無法確認轉址狀態'),
                    network: createScanCheck('unknown', '網路服務商 (ISP/ASN)', '無法識別網路來源'),
                    links: createScanCheck('unknown', '網頁連結分析', '無法分析頁面內容'),
                    formFields: createScanCheck('safe', '表單敏感欄位', '未偵測到敏感表單欄位'),
                    externalResources: createScanCheck('safe', '外部資源/表單送出', '未偵測到異常外部表單或資源'),
                    freeHostingSensitiveLink: createScanCheck('safe', '免費子網域驗證連結', '未偵測到免費子網域搭配敏感驗證參數的高風險組合'),
                    regulatedProduct: createScanCheck('safe', '電子菸/加熱菸販售', '未偵測到電子菸、加熱菸或煙彈的網路販售脈絡'),
                    jobTaskScam: createScanCheck('unknown', '假求職/任務金流', '檢測流程未完整完成，無法確認求職網站是否混入儲值、提領或任務金流'),
                    shoppingScam: createScanCheck('unknown', '一頁式購物詐騙', '未能從可讀 HTML 中確認一頁式購物結構'),
                    unverifiedCommerce: createScanCheck('unknown', '未驗證模板商城', '檢測流程未完整完成，無法確認模板商城與商家佐證'),
                    lineContact: createScanCheck('safe', 'LINE 聯絡導流', '未偵測到 LINE 聯絡導流'),
                    shoppingLanding: createScanCheck(isFallbackSuspiciousAdLanding ? 'danger' : 'unknown', '購物/廣告落地頁網址', isFallbackSuspiciousAdLanding ? fallbackAdLandingDetails : '檢測流程未完整完成，無法確認購物/廣告落地頁特徵'),
                    brandSimilarity: createScanCheck('safe', '品牌相似網域', '未偵測到常見品牌相似網域'),
                    pageBrand: createScanCheck('safe', '頁面品牌一致性', '未偵測到頁面品牌與網域不一致'),
                    officialFlowPath: createScanCheck('safe', '官方流程路徑', '未偵測到可疑官方流程路徑'),
                    urgency: createScanCheck('safe', '限時/恐嚇話術', '未偵測到常見限時或恐嚇話術'),
                    homograph: createScanCheck('safe', '相似字元網域', '未偵測到 Punycode 或 Unicode 混淆網域'),
                    params: createScanCheck('safe', '網址參數檢查', '未發現敏感追蹤或認證參數'),
                    entropy: createScanCheck(isFallbackCloudflarePagesRandomRisk ? 'danger' : (fallbackHighEntropySubdomain ? 'warning' : 'safe'), '亂碼/隨機網址', fallbackHighEntropySubdomain ? '子網域名稱具短亂碼或機器生成特徵' : '網域名稱結構正常'),
                    iframe: createScanCheck('safe', 'Iframe 偽裝', '未偵測到異常框架'),
                    apkCheck: createScanCheck('safe', '可疑檔案下載', '未偵測到可疑 Android 應用程式')
                }
            };
        };

        const createUrlOnlySuspiciousAdLandingResult = (targetDomain, fullUrl, scanOptions = {}) => {
            const result = createScanFailureResult(targetDomain, fullUrl, scanOptions);
            const removedTrackingParams = result.removedTrackingParams || [];
            const adLandingDetails = `原始網址含 ${removedTrackingParams.slice(0, 4).join('、')} 等社群/廣告追蹤參數，且 ${targetDomain} 使用可疑網域後綴；為避免長時間深度掃描造成頁面卡住，已先以 URL-only 強風險規則判定。`;
            result.riskScore = 85;
            result.riskFlags = { urlOnlySuspiciousAdLanding: true };
            result.details.siteStatus.msg = '已由 URL-only 強風險規則快速判定，略過耗時深度掃描';
            result.checks.siteContent.status = 'info';
            result.checks.siteContent.details = '已由網址結構先行判定；深度內容檢測可稍後再試';
            result.checks.domainAnalysis.status = 'danger';
            result.checks.domainAnalysis.details = adLandingDetails;
            result.checks.shoppingLanding.status = 'danger';
            result.checks.shoppingLanding.details = adLandingDetails;
            result.summaryReasons = ['可疑購物/廣告落地頁網址'];
            return result;
        };

        const executeRiskScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            let preparedTarget;
            try {
                preparedTarget = await resolvePrimaryScanTarget(targetDomain, fullUrl, scanOptions);
            } catch (err) {
                preparedTarget = {
                    targetDomain,
                    fullUrl,
                    scanOptions: {
                        ...scanOptions,
                        inputDomain: normalizeHostname(targetDomain),
                        inputScanUrl: fullUrl,
                        unresolvedShortener: isKnownUrlShortenerDomain(targetDomain)
                    },
                    resolvedFromShortener: false,
                    unresolvedShortener: isKnownUrlShortenerDomain(targetDomain)
                };
            }

            const fallbackResult = createScanFailureResult(
                preparedTarget.targetDomain,
                preparedTarget.fullUrl,
                preparedTarget.scanOptions
            );
            fallbackResult.inputDomain = normalizeHostname(targetDomain);
            fallbackResult.inputScanUrl = fullUrl;
            fallbackResult.primaryDomain = normalizeHostname(preparedTarget.targetDomain);
            fallbackResult.primaryUrl = preparedTarget.fullUrl;
            fallbackResult.resolvedFromShortener = preparedTarget.resolvedFromShortener;
            fallbackResult.unresolvedShortener = preparedTarget.unresolvedShortener;
            try {
                return window.ScanPolicy.finalize(await withTimeout(
                    simulateScan(
                        preparedTarget.targetDomain,
                        preparedTarget.fullUrl,
                        currentWhitelist,
                        preparedTarget.scanOptions
                    ),
                    20000,
                    fallbackResult
                ) || fallbackResult);
            } catch (err) {
                console.error('風險掃描流程異常，已改用保守備援結果:', err);
                return createScanFailureResult(
                    preparedTarget.targetDomain,
                    preparedTarget.fullUrl,
                    preparedTarget.scanOptions,
                    err
                );
            }
        };

        const runRiskScanSafely = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            const scan = await executeRiskScan(targetDomain, fullUrl, currentWhitelist, scanOptions);
            return window.ScanPolicy.attachShortLinkContext(scan, fullUrl, isKnownUrlShortenerDomain(targetDomain), getRiskList('reportedShortLinks'));
        };

        const runRiskAndBrandScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            const inputIsShortener = isKnownUrlShortenerDomain(targetDomain);
            const inputIsSocial = getRiskList('socialMediaDomains').some(domain =>
                normalizeHostname(targetDomain) === normalizeHostname(domain) ||
                normalizeHostname(targetDomain).endsWith('.' + normalizeHostname(domain))
            );
            const initialSkipBrandAnalysis = shouldSkipAiBrandAnalysis(targetDomain, currentWhitelist);
            const fetchBrandAnalysis = (url) => withTimeout(
                fetchJsonSafely(`/api/check-fake-brand?url=${encodeURIComponent(url)}`, null),
                7000,
                null
            );

            if (!inputIsShortener) {
                const [scanData, brandDataRes] = await Promise.all([
                    runRiskScanSafely(targetDomain, fullUrl, currentWhitelist, scanOptions),
                    (inputIsSocial || initialSkipBrandAnalysis)
                        ? Promise.resolve(null)
                        : fetchBrandAnalysis(fullUrl)
                ]);
                return {
                    scanData,
                    brandDataRes,
                    skipAiBrandAnalysis: initialSkipBrandAnalysis,
                    isSocialTarget: inputIsSocial
                };
            }

            const scanData = await runRiskScanSafely(targetDomain, fullUrl, currentWhitelist, scanOptions);
            const primaryUrl = scanData.primaryUrl || scanData.scannedUrl || fullUrl;
            let primaryHostname = normalizeHostname(scanData.primaryDomain || scanData.domain || targetDomain);
            try {
                primaryHostname = normalizeHostname(new URL(primaryUrl).hostname);
            } catch (err) { }

            const isSocialTarget = getRiskList('socialMediaDomains').some(domain =>
                primaryHostname === normalizeHostname(domain) ||
                primaryHostname.endsWith('.' + normalizeHostname(domain))
            );
            const skipAiBrandAnalysis = scanData.unresolvedShortener === true ||
                shouldSkipAiBrandAnalysis(primaryHostname, currentWhitelist);
            const brandDataRes = (!scanData.isInvalid && !isSocialTarget && !skipAiBrandAnalysis)
                ? await fetchBrandAnalysis(primaryUrl)
                : null;

            return { scanData, brandDataRes, skipAiBrandAnalysis, isSocialTarget };
        };

        const getHighRiskSummaryReasons = (scanData) => {
            if (!scanData || !scanData.checks) return [];

            const checks = scanData.checks;
            const siteStatus = scanData.details?.siteStatus?.status || '';
            const isUnavailableSiteContentOnly = ['blank', 'error', 'unknown', 'blocked'].includes(siteStatus);
            const reasons = [];
            const addReason = (condition, reason) => {
                if (condition && !reasons.includes(reason)) reasons.push(reason);
            };

            addReason(checks.googleSafeBrowsing?.status === 'danger', 'Google 安全庫已標記危險');
            addReason(checks.reportedShortLink?.status === 'danger', checks.reportedShortLink?.details);
            addReason(checks.voteAccountPhishing?.status === 'danger', checks.voteAccountPhishing?.details);
            addReason(checks.confirmedScam?.status === 'danger', '人工確認詐騙網域');
            addReason(checks.manualHighRisk?.status === 'danger', '人工確認高風險網域');
            addReason(checks.officialAlerts?.status === 'danger', '官方機關已公告警示');
            addReason(checks.cofactsReports?.status === 'danger', 'Cofacts 查核回應明確指出詐騙');
            addReason(checks.apkCheck?.status === 'danger', '誘導下載可疑 App 或 APK');
            addReason(checks.redirect?.status === 'danger', '郵件追蹤跳板或隱藏轉址');
            addReason(checks.regulatedProduct?.status === 'danger', '違法電子菸/加熱菸網路販售風險');
            addReason(checks.jobTaskScam?.status === 'danger', '假求職/任務金流詐騙特徵');
            addReason(checks.freeHostingSensitiveLink?.status === 'danger', '免費子網域搭配一次性驗證參數');
            addReason(checks.votePhishing?.status === 'danger', '共享子網域假投票／帳號釣魚特徵');
            addReason(checks.githubPagesBrand?.status === 'danger', 'GitHub Pages 租戶疑似冒用知名品牌');
            addReason(checks.domainAnalysis?.status === 'danger', checks.domainAnalysis?.details || '網域特徵異常');
            addReason(checks.externalResources?.status === 'danger', '表單或外部資源送往可疑網域');
            addReason(checks.shoppingScam?.status === 'danger', '一頁式購物詐騙特徵');
            addReason(checks.unverifiedCommerce?.status === 'danger', '新註冊模板商城缺少可驗證商家資訊');
            addReason(checks.lineContact?.status === 'danger', '要求加入 LINE 聯絡/下單');
            addReason(checks.shoppingLanding?.status === 'danger', '可疑購物/廣告落地頁網址');
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
        };

        const revokeConditionalCompanyTrust = (scanData, reason = '後續掃描偵測到強威脅') => {
            if (!scanData?.isConditionalCompanyTrust && !scanData?.conditionalCompanyTrust?.eligible) return scanData;

            scanData.conditionalCompanyTrustApplied = false;
            scanData.conditionalCompanyTrustBlocked = true;
            scanData.risk_flag = true;
            scanData.riskFlags = {
                ...(scanData.riskFlags || {}),
                conditionalCompanyTrustApplied: false,
                conditionalCompanyTrustBlocked: true
            };
            scanData.conditionalCompanyTrust = {
                ...(scanData.conditionalCompanyTrust || {}),
                eligible: true,
                applied: false,
                blockedByStrongThreat: true
            };
            if (scanData.checks?.conditionalCompanyTrust) {
                scanData.checks.conditionalCompanyTrust.status = 'warning';
                scanData.checks.conditionalCompanyTrust.applied = false;
                scanData.checks.conditionalCompanyTrust.details = `官網映射仍有效，但${reason}，已撤銷弱訊號豁免。`;
            }
            return scanData;
        };

        const enforceFinalRiskConsistency = (scanData) => {
            window.ScanPolicy.finalize(scanData);
            if (!scanData || scanData.isInvalid || scanData.isSocialMedia || scanData.blocklistListed || scanData.isTrustedAllowlist) return scanData;

            const reasons = getHighRiskSummaryReasons(scanData);
            if ((scanData.isConditionalCompanyTrust || scanData.conditionalCompanyTrust?.eligible) && reasons.length > 0) {
                revokeConditionalCompanyTrust(scanData, '後續掃描偵測到強威脅');
            }
            if (reasons.length > 0 && scanData.riskScore < 70) {
                scanData.riskScore = 70;
            }
            scanData.summaryReasons = reasons;
            return window.ScanPolicy.finalize(scanData);
        };


        return { getPseudoRandom, withTimeout, readJsonSafely, fetchJsonSafely, calculateEntropy, normalizeHostname, sanitizeUrlInput, normalizeInputHostname, isValidHostname, parseUserUrl, isTrackingUrlParamName, isVolatileUrlParam, sanitizeUrlForRiskScoring, toHttpFallbackUrl, buildCrawlerCandidateUrls, isOfficialTaiwanGovDomain, isSameRootDomain, isKnownUrlShortenerDomain, getOfficialShortenerDestinationDomains, isVerifiedOfficialShortenerDestination, isTrustedGlobalDomain, isTrustedEcommerceDomain, isTrustedTaiwanServiceDomain, isTrustedFinancialServiceDomain, isTrustedGovernmentServiceDomain, isTrustedPublicInterestDomain, isGlobalPaymentGatewayDomain, isConfirmedScamDomain, isManualHighRiskDomain, isVerifiedSafeRootDomain, shouldSkipAiBrandAnalysis, isTrustedResourceDomain, hasRiskyHostnamePattern, isCloudflarePagesDevHostname, isNetlifyAppHostname, isGithubPagesHostname, hasGeneratedNetlifySubdomain, isEmailTrackingRedirector, extractNestedUrls, hasFinancialPhishingText, hasPublicUtilityScamText, hasLogisticsScamText, hasOfficialFlowPath, hasPunycodeOrUnicodeHostname, createEmptyPageSignals, decodeSignalText, normalizeBusinessName, extractBusinessNames, analyzeSuspiciousDownloadPath, analyzeDownloadSignals, getComparableDomainText, levenshteinDistance, damerauLevenshteinDistance, checkBrandSimilarity, getDomainParts, TAIWAN_GOV_ROOT_AGENCY_NAMES, cleanDisplayText, chooseGovernmentSiteName, extractGovernmentAgencyName, analyzeGovernmentAgencySignals, hasReadableVowelPattern, analyzeDisposableRootLabel, hasSensitiveUrlParam, analyzeSuspiciousSubdomain, escapeRegExp, getPageBrandKeywordContexts, isBenignCommerceBrandReference, analyzePageBrandSignals, analyzeUrgencySignals, analyzeTrustSignals, analyzeSeoSignals, analyzeLanguageSignals, analyzeBusinessIdentitySignals, analyzeLineOfficialSignals, analyzeEcommerceTrustSignals, analyzeShoppingScamSignals, analyzeJobTaskScamSignals, analyzeRegulatedTobaccoSalesSignals, analyzePageSignals, fetchGeoLocation, fetchNetworkInfo, fetchSecurityHeaders, fetchSiteSeoData, checkSiteAvailability, checkTrancoRank, getDaysBetweenDates, getPastAgeDays, isOneYearRegistrationPeriod, getDomainAgeRiskScore, fetchRDAPData, fetchCertificateData, fetchTraceData, resolvePrimaryScanTarget, checkOfficialAlerts, checkCofactsRiskSignals, checkAnalyticsClusterSignals, checkOrganizationVerification, checkGovernmentAgencyVerification, checkCommunityBlocklists, simulateScan, createScanCheck, createScanFailureResult, createUrlOnlySuspiciousAdLandingResult, runRiskScanSafely, runRiskAndBrandScan, getHighRiskSummaryReasons, revokeConditionalCompanyTrust, enforceFinalRiskConsistency };
});
