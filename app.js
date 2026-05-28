const { useState, useEffect, useRef } = React;
        const RISK_CONFIG = window.RISK_CONFIG || {};
        const getRiskList = (key) => Array.isArray(RISK_CONFIG[key]) ? RISK_CONFIG[key] : [];

        // --- Icons ---
        const IconBase = ({ children, size = 20, className = "" }) => (
            <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                {children}
            </svg>
        );

        const Shield = (p) => <IconBase {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></IconBase>;
        const ShieldAlert = (p) => <IconBase {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></IconBase>;
        const ShieldCheck = (p) => <IconBase {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></IconBase>;
        const AlertTriangle = (p) => <IconBase {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></IconBase>;
        const Activity = (p) => <IconBase {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></IconBase>;
        const Server = (p) => <IconBase {...p}><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></IconBase>;
        const Search = (p) => <IconBase {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></IconBase>;
        const HelpCircle = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></IconBase>;
        const Github = (p) => <IconBase {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></IconBase>;
        const Layout = (p) => <IconBase {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></IconBase>;
        const Code = (p) => <IconBase {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></IconBase>;
        const Clock = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></IconBase>;
        const CheckCircle = (p) => <IconBase {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></IconBase>;
        const XCircle = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></IconBase>;
        const Globe = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" /></IconBase>;
        const Copy = (p) => <IconBase {...p}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></IconBase>;
        const Check = (p) => <IconBase {...p}><polyline points="20 6 9 17 4 12"></polyline></IconBase>;
        const RefreshCw = (p) => <IconBase {...p}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></IconBase>;
        const ImageIcon = (p) => <IconBase {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></IconBase>;

        // [新增] 相機圖示
        const Camera = (p) => <IconBase {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></IconBase>;
        // 新增這行：用於折疊面板的向下箭頭圖示
        const ChevronDown = (p) => <IconBase {...p}><polyline points="6 9 12 15 18 9"></polyline></IconBase>;
        const Type = (p) => <IconBase {...p}><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></IconBase>;
        const Hash = (p) => <IconBase {...p}><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></IconBase>;
        const Eye = (p) => <IconBase {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></IconBase>;
        const ArrowRight = (p) => <IconBase {...p}><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></IconBase>;
        const ExternalLink = (p) => <IconBase {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></IconBase>;
        const Shuffle = (p) => <IconBase {...p}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></IconBase>;
        const UserX = (p) => <IconBase {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></IconBase>;
        const Flag = (p) => <IconBase {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></IconBase>;
        const Layers = (p) => <IconBase {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></IconBase>;
        const Link = (p) => <IconBase {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></IconBase>;
        const Info = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></IconBase>;
        const BarChart = (p) => <IconBase {...p}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></IconBase>;
        const Edit = (p) => <IconBase {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></IconBase>;
        const ShieldZap = (p) => <IconBase {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polygon points="13 10 13 6 8 13 11 13 11 18 16 11 13 11" /></IconBase>;
        const Wifi = (p) => <IconBase {...p}><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></IconBase>;
// 👇 新增這行：乾淨標準的使用者頭像圖示 👇
        const User = (p) => <IconBase {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></IconBase>;
        // --- Logic Helpers ---
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

            const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(sanitized)
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
            return { ok: true, url: urlObj, hostname, href: urlObj.href };
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

        const isOfficialTaiwanGovDomain = (hostname) => {
            const cleanHostname = normalizeHostname(String(hostname || ''));
            return cleanHostname === 'gov.tw' || cleanHostname.endsWith('.gov.tw');
        };

        const isSameRootDomain = (a, b) => {
            const cleanA = normalizeHostname(a);
            const cleanB = normalizeHostname(b);
            return cleanA === cleanB || cleanA.endsWith('.' + cleanB) || cleanB.endsWith('.' + cleanA);
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

        const isGlobalPaymentGatewayDomain = (hostname) => {
            return getRiskList('globalPaymentGatewayDomains').some(domain => isSameRootDomain(hostname, domain));
        };

        const isVerifiedSafeRootDomain = (hostname, whitelist = []) => {
            return isOfficialTaiwanGovDomain(hostname) ||
                isTrustedGlobalDomain(hostname) ||
                isTrustedEcommerceDomain(hostname) ||
                isTrustedTaiwanServiceDomain(hostname) ||
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
            pageBrandSignals: { matched: false, brandName: null, keyword: null, source: null },
            urgencySignals: { count: 0, examples: [] },
            trustSignals: { score: 0, matched: false, reasons: [] },
            seoSignals: { score: 0, matched: false, reasons: [] },
            languageSignals: { status: 'unknown', matched: false, details: '無法判定頁面語言一致性' },
            businessIdentitySignals: { score: 0, matched: false, names: [], hasTaxId: false, reasons: [] },
            lineOfficialSignals: { matched: false, urls: [], reason: '' },
            ecommerceTrustSignals: { score: 0, matched: false, reasons: [], categories: [] },
            shoppingScamSignals: { score: 0, matched: false, reasonCount: 0, reasons: [], keywordCount: 0, formFieldCount: 0, imageCount: 0, linkCount: 0, hasOrderForm: false, hasMerchantInfo: false },
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
                    for (let i = 0; i <= domainText.length - normalizedKeyword.length; i++) {
                        const segment = domainText.slice(i, i + normalizedKeyword.length);
                        if (damerauLevenshteinDistance(segment, normalizedKeyword) <= 1) {
                            closeTypo = true;
                            break;
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
                'com.cn', 'org.cn', 'gov.cn', 'net.cn', 'ac.cn'
            ];
            const lastTwo = parts.slice(-2).join('.');
            const registeredSize = secondLevelTLDs.includes(lastTwo) ? 3 : 2;
            return {
                subdomainLabels: parts.length > registeredSize ? parts.slice(0, -registeredSize) : [],
                rootLabel: parts.length >= registeredSize ? parts[parts.length - registeredSize] : (parts[0] || ''),
                registrableDomain: parts.length >= registeredSize ? parts.slice(-registeredSize).join('.') : parts.join('.')
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
            const hasAwkwardShortFlow = isShortRoot &&
                (
                    (rareBigrams.length > 0 && (consonantTrigrams.length > 0 || entropyValue > 2.1)) ||
                    /[aeiou]{2}[bcdfghjklmnpqrstvwxyz]{3,}$/i.test(compact) ||
                    /^[bcdfghjklmnpqrstvwxyz]{3,}[aeiou]{2}/i.test(compact)
                );
            const looksMachineGenerated =
                lacksVowels ||
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
            if (lacksVowels) reasons.push('缺少母音');
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

            const textParts = [rawText || '', doc?.title || ''];
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
            const hasTaxId = /(?:統一編號|統編|公司統編|營利事業統一編號)[:：\s　]*\d{8}/.test(source);
            const reasons = [];
            if (names.length > 0) reasons.push(`頁面揭露公司/商家名稱：${names.slice(0, 2).join('、')}`);
            if (hasTaxId) reasons.push('頁面揭露統一編號');
            const score = Math.min(45, (names.length > 0 ? 25 : 0) + (hasTaxId ? 20 : 0));
            return {
                score,
                matched: score >= 25,
                names,
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

            const matchedPlatforms = platformFootprints.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const matchedCart = cartFootprints.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const matchedContact = contactKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const matchedPolicy = policyKeywords.filter(keyword => haystack.includes(keyword.toLowerCase()));
            const hasMailOrTelLink = doc ? !!doc.querySelector('a[href^="mailto:"], a[href^="tel:"]') : /(?:mailto:|tel:)/i.test(haystack);
            const hasTaiwanAddress = /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣|連江縣).{0,24}(路|街|巷|弄|號)/.test(haystack);
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

            const score = Math.min(100,
                (matchedPlatforms.length > 0 ? 30 : 0) +
                ((matchedCart.length > 0 || hasSameDomainCheckout) ? 25 : 0) +
                ((matchedContact.length >= 2 || hasMailOrTelLink || hasTaiwanAddress) ? 25 : 0) +
                (matchedPolicy.length >= 2 ? 20 : 0)
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
                shopping: ['立即購買', '馬上訂購', '立即訂購', '立即搶購', '加入購物車', '結帳', '下單', '訂單', '購買', '特價', '優惠價', '原價', '折扣', '限時', '限量', '最後', '免運', '貨到付款', '宅配', '超商取貨', '七天鑑賞', '全台配送'],
                fields: ['姓名', '收件人', '手機', '電話', '地址', '宅配地址', '配送地址', '規格', '數量', '備註', '付款方式'],
                socialProof: ['顧客好評', '客戶評價', '五星', '已售出', '熱銷', '回購', '見證', '買家', '評價'],
                tracking: ['ldtag_cl', 'lt_r', 'fbclid', 'gclid', 'utm_', 'click_id', 'campaign', 'ad_id'],
                lineContact: ['加入line', '加line', 'line客服', '官方line', 'line id', 'lineid', 'line帳號', 'line好友', '私訊客服', '聯繫客服下單', '截圖傳給客服', '客服確認訂單', 'lin.ee', 'line.me/r/ti/p', 'line://']
            };
            const matchedKeywords = Object.values(keywordGroups)
                .flat()
                .filter(keyword => haystack.includes(keyword.toLowerCase()));

            const formFieldSelectors = [
                'input[name*="name" i]', 'input[name*="phone" i]', 'input[name*="tel" i]', 'input[name*="address" i]',
                'textarea[name*="address" i]', 'input[placeholder*="姓名"]', 'input[placeholder*="手機"]',
                'input[placeholder*="電話"]', 'input[placeholder*="地址"]', 'textarea[placeholder*="地址"]',
                'select[name*="quantity" i]', 'select[name*="qty" i]'
            ];
            const formFieldCount = doc ? formFieldSelectors.reduce((count, selector) => count + doc.querySelectorAll(selector).length, 0) : 0;
            const formCount = doc ? doc.querySelectorAll('form').length : 0;
            const imageCount = doc ? doc.querySelectorAll('img').length : 0;
            const linkCount = doc ? doc.querySelectorAll('a[href]').length : 0;
            const hasOrderForm = formCount > 0 && (formFieldCount >= 2 || keywordGroups.fields.some(keyword => haystack.includes(keyword.toLowerCase())));
            const merchantInfoKeywords = ['統一編號', '公司名稱', '有限公司', '股份有限公司', '客服電話', '退換貨', '退貨政策', '隱私權政策', '服務條款', '聯絡地址'];
            const hasMerchantInfo = merchantInfoKeywords.some(keyword => haystack.includes(keyword.toLowerCase()));
            const hasOnePageStructure = matchedKeywords.length >= 4 && (linkCount <= 3 || imageCount >= 6 || hasOrderForm);
            const hasCodSalesPitch = keywordGroups.shopping.some(keyword => ['貨到付款', '免運', '限時', '限量', '立即搶購', '馬上訂購'].includes(keyword) && haystack.includes(keyword.toLowerCase()));
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
                score: Math.min(100, reasons.length * 18 + Math.min(30, matchedKeywords.length * 3)),
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
            const productMatches = getRiskList('regulatedTobaccoProductKeywords')
                .filter(keyword => haystack.includes(keyword.toLowerCase()));
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
            doc.querySelectorAll('form[action]').forEach(el => collectExternalUrl(el.getAttribute('action'), 'form'));

            const externalFormActions = externalResources.filter(item => item.kind === 'form');
            const externalIframeSources = externalResources.filter(item => item.kind === 'iframe');
            const suspiciousExternalResources = externalResources.filter(item => item.suspicious);
            const suspiciousExternalIframes = externalIframeSources.filter(item => item.suspicious);
            const suspiciousExternalScripts = externalResources.filter(item => item.kind === 'script' && item.suspicious);

            return {
                sensitiveFields: {
                    count: sensitiveFields.length,
                    highRiskCount: sensitiveFields.filter(item => item.risk === 'high').length,
                    lowRiskCount: sensitiveFields.filter(item => item.risk === 'low').length,
                    examples: sensitiveFields.slice(0, 3)
                },
                externalResources: {
                    count: externalResources.length,
                    formActionCount: externalFormActions.length,
                    iframeCount: externalIframeSources.length,
                    suspiciousCount: suspiciousExternalResources.length,
                    suspiciousIframeCount: suspiciousExternalIframes.length,
                    suspiciousScriptCount: suspiciousExternalScripts.length,
                    examples: externalResources.slice(0, 3)
                },
                downloadSignals: analyzeDownloadSignals(doc, rawText, fullUrl),
                pageBrandSignals: analyzePageBrandSignals(doc, fullUrl, rawText),
                urgencySignals: analyzeUrgencySignals(doc, rawText),
                trustSignals: analyzeTrustSignals(doc, rawText, fullUrl),
                seoSignals: analyzeSeoSignals(doc, rawText),
                languageSignals: analyzeLanguageSignals(doc, rawText, fullUrl),
                businessIdentitySignals: analyzeBusinessIdentitySignals(doc, rawText),
                lineOfficialSignals: analyzeLineOfficialSignals(doc, rawText, fullUrl),
                ecommerceTrustSignals: analyzeEcommerceTrustSignals(doc, rawText, fullUrl),
                shoppingScamSignals: analyzeShoppingScamSignals(doc, rawText, fullUrl),
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
                pageSignals: createEmptyPageSignals(),
                ...extra
            });
            const detectCrawlerBlock = (text, httpCode = 0) => {
                const haystack = String(text || '').toLowerCase();
                if ([403, 429].includes(Number(httpCode))) return true;
                return /(access denied|request blocked|forbidden|verify you are human|checking your browser|cf-chl|cloudflare|akamai|incapsula|imperva|datadome|bot detection|anti[- ]?bot)/i.test(haystack);
            };
            const getCrawlerCandidates = () => {
                const candidates = [sanitizedUrl, fullUrl, rawUrl].filter(Boolean);
                return [...new Set(candidates)];
            };
            const isUsableCrawlerResult = (result) => result?.status === 'ok';
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
                        pageSignals
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
                                pageSignals
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
                    } catch (e) { }
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
                        pageSignals
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
                    pageSignals
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

        const isOneYearRegistrationPeriod = (periodDays) => {
            return periodDays !== null && periodDays >= 330 && periodDays <= 400;
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
                    events.find(e => /registration|created|creation/i.test(e.eventAction || '')) ||
                    events.find(e => e.eventAction === 'last changed' || e.eventAction === 'last update');
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

        const MyGoPenSection = ({ domain }) => {
            const [posts, setPosts] = useState([]);
            const [loading, setLoading] = useState(true);
            const [keyword, setKeyword] = useState(domain);
            useEffect(() => { setKeyword(domain); }, [domain]);
            useEffect(() => {
                const fetchPosts = async () => {
                    const feedUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://www.mygopen.com/feeds/posts/default/-/詐騙?alt=json&max-results=3')}`;
                    try {
                        const res = await fetch(feedUrl);
                        if (res.ok) {
                            const data = await res.json();
                            const parsed = JSON.parse(data.contents);
                            const entries = parsed.feed.entry.map(e => ({
                                title: e.title.$t,
                                link: e.link.find(l => l.rel === 'alternate').href,
                                date: e.published.$t.substring(0, 10)
                            }));
                            setPosts(entries);
                        }
                    } catch (e) { } finally { setLoading(false); }
                };
                fetchPosts();
            }, []);
            return (
                <div className="bg-brand-light/50 border border-brand-red/20 rounded-2xl p-6 mt-8">
                    <div className="flex items-center gap-3 mb-4">
                        <Shield className="text-brand-red" size={24} />
                        <h3 className="font-bold text-gray-800 text-lg">防詐騙資料庫查詢：</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">建議可進一步查詢相關案例，檢視可能的詐騙手法。</p>
                    <div className="mb-5">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">自訂搜尋關鍵字</label>
                        <div className="relative group">
                            <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-transparent outline-none bg-white text-gray-700 shadow-sm transition-all" placeholder="輸入關鍵字..." />
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"><Edit size={16} /></div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 ml-1 leading-relaxed">
                            💡 <b>阿麥防詐小秘訣：</b> 遇到可疑 Email 或簡訊中的網址，請不要只看表面文字。請在手機上<b>「長按連結」</b>並選擇<b>「複製連結」</b>，貼到上方讓我幫你掃描真實的網域背景！
                        </p>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                        <a href={`https://www.mygopen.com/search?q=${encodeURIComponent(keyword)}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-brand-red text-brand-red hover:bg-brand-red hover:text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"><Search size={18} /><span>在 MyGoPen 搜尋</span></a>
                        <a href={`https://www.google.com/search?q="${encodeURIComponent(keyword)}"+詐騙`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"><GoogleIcon size={18} /><span>Google 搜尋</span></a>
                        <a href={`https://165dashboard.tw/key-word-search?keyWord=${encodeURIComponent(keyword)}&type=CityCase&typeArr=CityCase`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-blue-500 text-blue-600 hover:bg-blue-500 hover:text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"><BarChart size={18} /><span>在165打詐儀錶板搜尋</span></a>
                    </div>
                </div>
            );
        };

        const GoogleIcon = (props) => (
            <svg viewBox="0 0 24 24" width={props.size || 24} height={props.size || 24} {...props}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
        );

        // --- Modified simulateScan with refined whitelist and risk scoring ---
        const simulateScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            const rawScanUrl = scanOptions.rawUrl || fullUrl;
            const sanitizedScanUrl = scanOptions.sanitizedUrl || fullUrl;
            const removedTrackingParamsForScan = [...new Set(scanOptions.removedTrackingParams || [])];
            const removedVolatileParamsForScan = [...new Set(scanOptions.removedVolatileParams || [])];
            const removedParamsForScan = [...new Set(scanOptions.removedParams || [
                ...removedTrackingParamsForScan,
                ...removedVolatileParamsForScan
            ])];
            let resolvedIp = null;
            try {
                const dnsData = await fetchJsonSafely(`https://dns.google/resolve?name=${targetDomain}&type=A`, null);
                if (dnsData?.Status === 3) return { domain: targetDomain, isInvalid: true, invalidMsg: '此網域尚未註冊或不存在 (NXDOMAIN)' };
                if (dnsData?.Answer && dnsData.Answer.length > 0) {
                    const aRecord = dnsData.Answer.find(r => r.type === 1);
                    if (aRecord) resolvedIp = aRecord.data;
                }
            } catch (e) { }

            const domain = targetDomain.toLowerCase();
            const isOfficialTaiwanGov = isOfficialTaiwanGovDomain(domain);
            const isTrustedGlobalRootDomain = isTrustedGlobalDomain(domain);
            const isConfiguredAllowlistDomain = currentWhitelist.some(allowedDomain => isSameRootDomain(domain, allowedDomain));
            const domainParts = getDomainParts(domain);
            const registrableDomain = domainParts.registrableDomain || domain;
            const isTrustedEcommerceRootDomain = isTrustedEcommerceDomain(domain);
            const isTrustedTaiwanServiceRootDomain = isTrustedTaiwanServiceDomain(domain);

            // 修正 1：嚴謹的白名單判定，並內建全球頂級可信根網域保護。
            const isWhitelisted = isOfficialTaiwanGov || isTrustedGlobalRootDomain || isTrustedEcommerceRootDomain || isTrustedTaiwanServiceRootDomain || isConfiguredAllowlistDomain;

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

            const shorteners = getRiskList('urlShorteners');
            // 修正：改用嚴格的網域比對，避免 t.co 誤殺包含 t.co 的正常網域
            const isInputShortener = shorteners.some(s => domain === s || domain.endsWith('.' + s));
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
                pageSignals: createEmptyPageSignals()
            };
            const trustedEcommerceSiteStatus = {
                status: 'trusted',
                code: 200,
                msg: `受信賴大型電商根網域：${registrableDomain}，略過深度爬取與追蹤參數扣分`,
                hasIframe: false,
                finalUrl: fullUrl,
                linkStats: { total: 0, internal: 0, external: 0 },
                hasApk: false,
                source: 'trusted-ecommerce-root',
                pageSignals: createEmptyPageSignals()
            };

            // 將 Google Safe Browsing 加入平行掃描陣列中
            const [geoLocationData, networkInfoData, securityHeadersData, siteSeoData, siteStatusData, blocklistListed, trancoData, rdapData, certData, traceData, safeBrowsingData, officialAlertData] = await Promise.all([
                withTimeout(resolvedIp ? fetchGeoLocation(resolvedIp) : Promise.resolve(null), 2000, null),
                withTimeout(fetchNetworkInfo(domain), 5000, null),
                withTimeout(fetchSecurityHeaders(fullUrl), 5000, { status: 'unavailable', missingAll: false, missing: [] }),
                withTimeout(fetchSiteSeoData(fullUrl), 5000, { status: 'unavailable', matched: false, score: 0, robots: {}, sitemap: {} }),
                withTimeout(isTrustedEcommerceRootDomain ? Promise.resolve(trustedEcommerceSiteStatus) : checkSiteAvailability(fullUrl, {
                    rawUrl: rawScanUrl,
                    sanitizedUrl: sanitizedScanUrl,
                    removedVolatileParams: removedVolatileParamsForScan
                }), 5000, defaultSiteStatus),
                withTimeout(checkCommunityBlocklists(domain), 4000, false),
                withTimeout(checkTrancoRank(domain), 5000, { status: 'unavailable', rank: null }),
                withTimeout(fetchRDAPData(domain), 6000, { date: null, expirationDate: null, registrationPeriodDays: null, privacyDetected: false, registrarName: null, registrantName: null, registrantOrganization: null }),
                withTimeout(fetchCertificateData(domain), 5000, { notBefore: null, source: null }),
                withTimeout(fetchTraceData(fullUrl), 11000, null),
                // 👇 新增：呼叫自己寫好的 Google Safe Browsing 代理 API
                withTimeout(fetchJsonSafely(`/api/safe-browsing?url=${encodeURIComponent(fullUrl)}`, { isUnsafe: false }), 4000, { isUnsafe: false }),
                withTimeout(checkOfficialAlerts(domain, fullUrl), 4000, { matched: false, count: 0, matches: [] })
            ]);

            const isRegistrationDateFromCertificate = !rdapData.date && !!certData?.notBefore;
            const rdapDate = rdapData.date || certData?.notBefore || null;
            const rdapExpirationDate = rdapData.expirationDate || null;
            const privacyDetected = rdapData.privacyDetected;
            const registrarName = rdapData.registrarName || '';
            const rdapQueriedDomain = rdapData.queriedDomain || registrableDomain || domain;
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
            const hasUaCloakingRisk = !isWhitelisted && hasUaDifference && !!traceData?.isHighRisk;
            const uaCloakingDetails = hasUaDifference
                ? `Mobile 最終網址: ${traceData.mobileFinalUrl || '無法判定'}；Desktop 最終網址: ${traceData.desktopFinalUrl || '無法判定'}`
                : 'Mobile 與 Desktop 檢測路徑未發現明顯差異';
            const freeHostingProviders = getRiskList('freeHostingProviders');
            const isFreeHosting = freeHostingProviders.some(p => domain.endsWith(p));
            const trancoRank = trancoData?.rank || null;
            const trancoStatus = trancoData?.status || 'unavailable';
            const trancoQueriedDomain = trancoData?.queriedDomain || domain;
            const trancoDateText = trancoData?.date ? ` (${trancoData.date})` : '';
            const hasRankedRootDomainFallback = trancoRank !== null &&
                normalizeHostname(trancoQueriedDomain) !== domain &&
                isSameRootDomain(domain, trancoQueriedDomain);
            const hasRootDomainTrustBaseline = hasRankedRootDomainFallback || isTrustedEcommerceRootDomain || isTrustedTaiwanServiceRootDomain;

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
                } else if (isConfiguredAllowlistDomain) {
                    trafficDetails = '受信賴白名單網域，流量排名不足不作為風險加權';
                } else {
                    trafficDetails = '受信賴的台灣在地或政府教育網站';
                }
            } else if (isFreeHosting) {
                trafficStatus = 'warning';
                if (domain.endsWith('zeabur.app')) {
                    trafficDetails = '「zeabur.app」是 Zeabur 雲端部署平台提供的免費/預設子網域，任何人都可以在幾分鐘內匿名註冊並部署網頁，無法確認其正當性。';
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
            
            // 1. 長亂碼檢查 (既有邏輯：高數學亂度 或 12碼以上的英數組合)
            const isLongGibberish = entropy > 3.6 || /^[a-z0-9]{12,30}$/.test(subdomainPart);
            // 👇 新增：極端亂碼檢查 (15碼以上的隨機英數，極高機率為釣魚專屬追蹤碼)
            const isExtremeGibberish = /^[a-z0-9]{15,50}$/.test(subdomainPart);
            // 👇 2. 新增：短亂碼 (DGA 演算法) 暴力檢查法
            // 特徵 A：5個字母以上，卻完全沒有母音 a, e, i, o, u (例如 yqhgw, xsddk)
            const lacksVowels = subdomainPart.length >= 5 && !/[aeiou]/i.test(subdomainPart);
            // 特徵 B：連續出現 4 個以上的子音字母，極度不符合正常英文拼字邏輯
            const hasConsecutiveConsonants = /[bcdfghjklmnpqrstvwxz]{4,}/i.test(subdomainPart);
            const suspiciousSubdomain = analyzeSuspiciousSubdomain(domain);
            
            // 只要符合任一項特徵，且不是常見的 www 等，就判定為高風險亂碼
            const isHighEntropy = (isLongGibberish || lacksVowels || hasConsecutiveConsonants) && subdomainPart !== 'www';
            const isSuspiciousRootLabel = rootLabel.length >= 8 &&
                !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify'].includes(rootLabel) &&
                (!hasReadableVowelPattern(rootLabel) || rootEntropy > 3.2 || /[bcdfghjklmnpqrstvwxz]{4,}/i.test(rootLabel));
            const isSuspiciousLandingRootLabel = rootLabel.length >= 10 &&
                !['example', 'google', 'facebook', 'instagram', 'youtube', 'twitter', 'shopline', 'myshopify'].includes(rootLabel) &&
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
            // 👇 新增：判斷最終網域是否為 .top / .xyz 等高危險後綴
            let isFinalVeryHighRiskTLD = false;

            let isFinalSafePlatform = false; // 1. 新增這行：合法開店平台標記

            if (traceData && traceData.finalUrl) siteStatusData.finalUrl = traceData.finalUrl;
            if (siteStatusData.finalUrl) {
                try {
                    const finalUrlObj = new URL(siteStatusData.finalUrl);
                    finalDomain = finalUrlObj.hostname.toLowerCase();
                    const cleanDomain = domain.replace(/^www\./, '');
                    const cleanFinalDomain = finalDomain.replace(/^www\./, '');
                    if (cleanDomain !== cleanFinalDomain) {
                        isRedirected = true;
                        // 修正：同樣改為嚴格的網域比對
                        isKnownShortener = shorteners.some(s => cleanDomain === s || cleanDomain.endsWith('.' + s));

                        // 👇 新增：判斷是否為同一個主網域的子網域互轉 (如 brand.com -> shop.brand.com)
                        const isSameRoot = cleanFinalDomain.endsWith(cleanDomain) || cleanDomain.endsWith(cleanFinalDomain);

                        redirectDetails = `偵測到轉址至: ${finalDomain}`;
                        if (isKnownShortener) redirectDetails += ' (短網址服務)';
                        else if (isSameRoot) redirectDetails += ' (內部子網域跳轉)'; // 標記為內部跳轉

                        finalHyphenCount = (finalDomain.match(/-/g) || []).length;

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
            const matchedLandingParams = landingParamList.filter(key => fullUrl.toLowerCase().includes(key));
            const hasSuspiciousLandingParams = matchedLandingParams.length > 0;
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
            const isFakeGov = domain.includes('gov') && !domain.endsWith('.gov') && !domain.endsWith('.gov.tw') && !isWhitelisted;
            const hasTrustedAllowlistOverride = isWhitelisted && !isSocialMedia && !isFakeGov && !isFinalFakeGov;
            const isTrustedPaymentGatewayOrApiEndpoint = hasTrustedAllowlistOverride &&
                (isGlobalPaymentGatewayDomain(domain) || (isTrustedGlobalRootDomain && hasPaymentOrApiPath));
            //新增：判斷是否假冒公共事業 (電子發票、台電、自來水、遠通)
            const fakeServiceKeywords = getRiskList('fakeServiceKeywords');
            const isFakeService = fakeServiceKeywords.some(kw => domain.includes(kw) || finalDomain.includes(kw)) && !isWhitelisted;
            const pageSignals = siteStatusData.pageSignals || defaultSiteStatus.pageSignals;
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
            const ecommerceTrustSignals = pageSignals.ecommerceTrustSignals || createEmptyPageSignals().ecommerceTrustSignals;
            const seoSignals = pageSignals.seoSignals || createEmptyPageSignals().seoSignals;
            const languageSignals = pageSignals.languageSignals || createEmptyPageSignals().languageSignals;
            const businessIdentitySignals = pageSignals.businessIdentitySignals || createEmptyPageSignals().businessIdentitySignals;
            const lineOfficialSignals = pageSignals.lineOfficialSignals || createEmptyPageSignals().lineOfficialSignals;
            const regulatedTobaccoSalesSignals = pageSignals.regulatedTobaccoSalesSignals || createEmptyPageSignals().regulatedTobaccoSalesSignals;
            const officialAlertMatches = officialAlertData?.matches || [];
            const officialAlertMatch = officialAlertMatches[0] || null;
            const hasOfficialAlert = !isWhitelisted && !!officialAlertData?.matched;
            const hasOfficialAlertUrlMatch = hasOfficialAlert && officialAlertMatches.some(item => item.matchType === 'url');
            const hasInstallKeywordSignal = installKeywordCount >= 2 || (installKeywordCount > 0 && suspiciousDownloadPath);
            const hasDynamicDownloadSignal = dynamicDownloadCount >= 2 && (installKeywordCount > 0 || suspiciousDownloadPath);
            const hasSuspiciousDownloadLanding = suspiciousDownloadPath &&
                (installKeywordCount > 0 || dynamicDownloadCount > 0 || suspiciousDownloadPathCount >= 2);
            const brandSimilarity = checkBrandSimilarity(domain, currentWhitelist);
            const finalBrandSimilarity = finalDomain ? checkBrandSimilarity(finalDomain, currentWhitelist) : { matched: false };
            const nestedBrandSimilarity = nestedDomains.map(item => checkBrandSimilarity(item, currentWhitelist)).find(item => item.matched) || { matched: false };
            const matchedBrandSimilarity = brandSimilarity.matched ? brandSimilarity : (finalBrandSimilarity.matched ? finalBrandSimilarity : nestedBrandSimilarity);
            const hasBrandSimilarity = !!matchedBrandSimilarity.matched;
            let domainAgeDays = null;
            if (rdapDate) {
                const regDate = new Date(rdapDate);
                domainAgeDays = Math.ceil(Math.abs(new Date() - regDate) / (1000 * 60 * 60 * 24));
            }
            const isVeryNewDomain = domainAgeDays !== null && domainAgeDays < 90;
            const isNewDomainUnderSixMonths = domainAgeDays !== null && domainAgeDays < 183;
            const registrationPeriodDays = rdapData.registrationPeriodDays !== null && rdapData.registrationPeriodDays !== undefined
                ? rdapData.registrationPeriodDays
                : getDaysBetweenDates(rdapData.date, rdapExpirationDate);
            const hasOneYearRegistrationPeriod = isOneYearRegistrationPeriod(registrationPeriodDays);
            const hasNewOneYearRegistrationRisk = !isWhitelisted &&
                !isOfficialTaiwanGov &&
                !isRegistrationDateFromCertificate &&
                isNewDomainUnderSixMonths &&
                hasOneYearRegistrationPeriod;
            let certAgeDays = null;
            if (certData?.notBefore) {
                const certDate = new Date(certData.notBefore);
                if (!Number.isNaN(certDate.getTime())) {
                    certAgeDays = Math.ceil(Math.abs(new Date() - certDate) / (1000 * 60 * 60 * 24));
                }
            }
            const isVeryNewCertificate = certAgeDays !== null && certAgeDays < 90;
            const certIssuerText = certData?.issuerName ? `；簽發者: ${certData.issuerName}` : '';
            const certExpiryText = certData?.notAfter ? `；有效至: ${new Date(certData.notAfter).toISOString().split('T')[0]}` : '';
            const isNewDomainWithNewCertificate = isVeryNewDomain && isVeryNewCertificate && !isWhitelisted;
            const normalizedRegistrantTextForBusiness = normalizeBusinessName([
                rdapData.registrantName,
                rdapData.registrantOrganization
            ].filter(Boolean).join(' '));
            const matchedBusinessEntityName = (businessIdentitySignals.names || []).find(name => {
                const normalizedName = normalizeBusinessName(name);
                return normalizedName &&
                    normalizedRegistrantTextForBusiness &&
                    (normalizedRegistrantTextForBusiness.includes(normalizedName) ||
                        normalizedName.includes(normalizedRegistrantTextForBusiness));
            }) || '';
            const hasVerifiedBusinessEntity = !!matchedBusinessEntityName ||
                (!!normalizedRegistrantTextForBusiness && businessIdentitySignals.hasTaxId && businessIdentitySignals.names?.length > 0);
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

            const isGoogleFlagged = safeBrowsingData && safeBrowsingData.isUnsafe;
            const blocklistListedForRisk = blocklistListed && !hasTrustedAllowlistOverride;
            const isGoogleFlaggedForRisk = isGoogleFlagged && !isWhitelisted;
            const isApkSite = (siteStatusData.hasApk || apkUrlCount > 0) && !isWhitelisted;
            const isDownloadPhishingSignal = !isWhitelisted && !isApkSite &&
                (hasInstallKeywordSignal || hasDynamicDownloadSignal || hasSuspiciousDownloadLanding);

            const pageTrustSignals = pageSignals.trustSignals || createEmptyPageSignals().trustSignals;
            const normalizedRegistrantText = [
                rdapData.registrantName,
                rdapData.registrantOrganization,
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
            const hasStableHttpsCertificate = hasRecognizedCertificateIssuer &&
                certAgeDays !== null &&
                certAgeDays >= 30 &&
                certAgeDays < 730;

            const trustValidationSignals = [];
            const addTrustSignal = (condition, score, reason) => {
                if (condition) trustValidationSignals.push({ score, reason });
            };
            addTrustSignal(isOfficialTaiwanGov, 100, '台灣政府官方網域');
            addTrustSignal(isTrustedGlobalRootDomain, 80, '全球頂級可信根網域');
            addTrustSignal(isTrustedEcommerceRootDomain, 90, `Trusted E-commerce Root Domain：${registrableDomain}`);
            addTrustSignal(isTrustedTaiwanServiceRootDomain, 80, `可信台灣民營服務網域：${registrableDomain}`);
            addTrustSignal(isConfiguredAllowlistDomain && !isOfficialTaiwanGov, 70, 'Trusted Allowlist Domain');
            addTrustSignal(isHighTraffic, 40, 'Tranco 可查得流量排名');
            addTrustSignal(hasRankedRootDomainFallback, 35, `Tranco 根網域 ${trancoQueriedDomain} 可查得排名，子網域繼承基線信任`);
            addTrustSignal(isTrustedEcommerceRootDomain, 35, `可信大型電商根網域：${registrableDomain}`);
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
            addTrustSignal(hasVerifiedBusinessEntity, 40, matchedBusinessEntityName ? `頁面商家名稱與 WHOIS/RDAP 註冊者相符：${matchedBusinessEntityName}` : '頁面商家資訊與 WHOIS/RDAP 註冊資料具一致性');
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
                hasOfficialAlert ||
                isApkSite ||
                isGoogleFlaggedForRisk ||
                hasEmailTrackingPhishingPattern ||
                hasFinancialPhishingSignal ||
                (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                hasLogisticsBrandPhishing ||
                hasPageBrandMismatch ||
                hasHomographSignal ||
                hasUaCloakingRisk ||
                isDownloadPhishingSignal ||
                hasShoppingScamSignal ||
                hasFreeHostingSensitiveLinkRisk ||
                hasRegulatedTobaccoSalesSignal ||
                hasShoppingLineContactRisk;

            const hasSecondaryFraudEvidence = hasConfirmedThreatSignal ||
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
            } else if (hasOfficialAlertUrlMatch) {
                riskScore = 100;
            } else if (isApkSite) {
                riskScore = 100; // 👈 誘騙下載 APK 強制判死刑 (100分)

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
                if (rdapData.date) {
                    const diffDays = domainAgeDays;

                    if (diffDays < 90) {
                        riskScore += 95;
                    } else if (diffDays < 120) {
                        riskScore += 85;
                    } else if (diffDays < 180) {
                        riskScore += 50;
                    } else if (diffDays < 365) {
                        riskScore += 25;
                    }
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
                if (hasNewOneYearRegistrationRisk) riskScore += 45;
                if (hasMissingAllSecurityHeadersRaw) riskScore += hasMissingAllSecurityHeaders ? 45 : 15;
                if (hasMissingMxRecordsRaw) riskScore += hasMissingMxRecords ? 45 : 15;

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

                    // 隱匿型跳板防禦維持不變
                    else if (isInputShortener && fullUrl.length > targetDomain.length + 20) {
                        riskScore = 100;
                    }

                    if (hasUaCloakingRisk) {
                        riskScore += 90;
                    } else if (traceData && traceData.isHighRisk) {
                        const currentFinalDomain = finalDomain || domain;
                        const isSameRoot = currentFinalDomain.replace(/^www\./, '').endsWith(domain.replace(/^www\./, '')) || domain.replace(/^www\./, '').endsWith(currentFinalDomain.replace(/^www\./, ''));

                        if (isFinalSafePlatform) {
                            riskScore += 0;
                        } else if (isSameRoot) {
                            // 👇 修正：同網域內部的追蹤異常(如 JS Loop) 有極大可能是 Cloudflare 人機驗證，給予 15 分的輕微扣分即可，有其他特徵才會變為中風險
                            riskScore += 15; 
                        } else {
                            riskScore += 80;
                        }
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
                    if (hasOfficialFlowPathSignal && (hasBrandSimilarity || hasPageBrandMismatch || isVeryNewDomain || isLowTraffic)) riskScore += 45;
                    else if (hasOfficialFlowPathSignal) riskScore += 15;
                    if (hasUrgencyScamSignal && (hasBrandSimilarity || hasPageBrandMismatch || hasFinancialPhishingSignal || isVeryNewDomain)) riskScore += 45;
                    else if (hasUrgencyScamSignal) riskScore += 10;
                    if (hasHomographSignal) riskScore += 85;
                    if (hasOfficialAlert) riskScore += hasOfficialAlertUrlMatch ? 100 : 90;
                    if (isNewDomainWithNewCertificate) riskScore += 60;
                    if (isFakeGov || isFinalFakeGov) riskScore += 90;
                    if (isFakeService) riskScore += 90;
                    if (hasBrandSimilarity) riskScore += 80;
                    if (isDownloadPhishingSignal) riskScore += 80;
                    if (hasShoppingLandingUrlRisk) riskScore += siteStatusData.status === 'ok' ? 50 : 75;
                    if (hasDisposableShoppingLandingRisk) riskScore += 85;
                    else if (hasDisposableRootPhishingRisk) riskScore += 70;
                    else if (hasDisposableUnreadablePageRisk) riskScore += 70;
                    if (hasFreeHostingSensitiveLinkRisk) riskScore += 85;
                    if (hasRegulatedTobaccoSalesSignal) riskScore += 95;
                    if (hasShoppingScamSignal) riskScore += Math.min(85, 45 + shoppingScamSignals.reasonCount * 10);
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
                        if (rdapData.date) {
                            const regDate = new Date(rdapData.date);
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
                } // 👈 關閉 if (!isWhitelisted)

                if (hasTrustedAllowlistOverride) {
                    riskScore = 0;
                }

                // 👇 新增：社群媒體強制攔截，覆寫白名單的「安全」判定
                if (isSocialMedia) {
                    riskScore = 30; // 強制轉為黃色警告燈號
                }
            } // 👈 關閉最外層的 if (!blocklistListed) else 區塊

            if (hasTrustedValidation && !hasConfirmedThreatSignal && !blocklistListedForRisk && !isGoogleFlaggedForRisk && !isApkSite && !isWhitelisted && !isSocialMedia) {
                if (riskScore >= 70) {
                    riskScore = Math.min(riskScore, 60);
                } else if (riskScore >= 30) {
                    riskScore = Math.max(20, riskScore - 15);
                }
            }

            const traceFinalDomain = (finalDomain || domain).replace(/^www\./, '');
            const traceInputDomain = domain.replace(/^www\./, '');
            const isTraceHighRiskSameRoot = !!traceData?.isHighRisk &&
                (traceFinalDomain.endsWith(traceInputDomain) || traceInputDomain.endsWith(traceFinalDomain));
            const hasTrustedCommercialWeakSignalContext =
                isTrustedTLD ||
                domain.endsWith('.tw') ||
                hasRootDomainTrustBaseline ||
                isTrustedTaiwanRegistrar ||
                hasSmallBusinessTrustContext ||
                trustValidationSignals.length > 0 ||
                ecommerceTrustSignals.score > 0 ||
                pageTrustSignals.matched;

            const hasStrongRiskSignal = blocklistListedForRisk ||
                hasOfficialAlert ||
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
                hasHomographSignal ||
                hasUaCloakingRisk ||
                isNewDomainWithNewCertificate ||
                hasNewOneYearRegistrationRisk ||
                hasMissingAllSecurityHeaders ||
                hasMissingMxRecords ||
                isVeryNewDomain ||
                hasBrandSimilarity ||
                hasSuspiciousTempDomain ||
                hasFinalSuspiciousTemp ||
                hasFreeHostingSensitiveLinkRisk ||
                hasSuspiciousEmailTrackingHost ||
                hasDeepSubdomainPhishingPattern ||
                hasDisposableShoppingLandingRisk ||
                hasDisposableUnreadablePageRisk ||
                hasShoppingLandingUrlRisk ||
                hasShoppingScamSignal ||
                hasRegulatedTobaccoSalesSignal ||
                hasShoppingLineContactRisk ||
                (traceData && traceData.isHighRisk && !isFinalSafePlatform && !isTraceHighRiskSameRoot);

            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && riskScore > 60) {
                riskScore = 60;
            }
            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && riskScore >= 30 && hasTrustedCommercialWeakSignalContext) {
                riskScore = Math.min(riskScore, 25);
            }
            if (!hasStrongRiskSignal && !isWhitelisted && !isSocialMedia && hasCrawlerBlockedTrustedContext && riskScore > 25) {
                riskScore = 25;
            }

            if (!isWhitelisted && !isSocialMedia) {
                const hasDangerDetail = hasBrandSimilarity ||
                    hasOfficialAlert ||
                    hasEmailTrackingPhishingPattern ||
                    hasFinancialPhishingSignal ||
                    (hasPublicUtilityScamSignal && hasBrandSimilarity) ||
                    hasLogisticsBrandPhishing ||
                    hasPageBrandMismatch ||
                    hasHomographSignal ||
                    hasUaCloakingRisk ||
                    isNewDomainWithNewCertificate ||
                    isVeryNewDomain ||
                    isFakeGov ||
                    isFinalFakeGov ||
                    isFakeService ||
                    isVeryHighRiskTLD ||
                    isFinalVeryHighRiskTLD ||
                    hasSuspiciousTempDomain ||
                    hasFinalSuspiciousTemp ||
                    hasFreeHostingSensitiveLinkRisk ||
                    hasSuspiciousEmailTrackingHost ||
                    hasDeepSubdomainPhishingPattern ||
                    hasDisposableShoppingLandingRisk ||
                    hasDisposableUnreadablePageRisk ||
                    hasShoppingLandingUrlRisk ||
                    hasShoppingScamSignal ||
                    hasRegulatedTobaccoSalesSignal ||
                    hasShoppingLineContactRisk ||
                    isDownloadPhishingSignal ||
                    isApkSite;
                if (hasDangerDetail && riskScore < 70) riskScore = 70;
            }

            // 只要是白名單，且不是惡意偽裝政府網站，就強制將風險歸零，忽略網站內容無法抓取的錯誤
            if (hasTrustedAllowlistOverride) riskScore = 0; // 修正白名單歸零邏輯

            // 修正：網站內容狀態標籤邏輯
            let siteContentMsg = siteStatusData.msg;
            if (isWhitelisted) siteContentMsg = isOfficialTaiwanGov ? '受信賴的台灣政府官方網域' : (isTrustedEcommerceRootDomain ? `受信賴大型電商根網域：${registrableDomain}` : (isTrustedTaiwanServiceRootDomain ? `受信賴台灣民營服務官方網域：${registrableDomain}` : '受信賴的白名單網域'));
            else if (hasCrawlerBlockedTrustedContext) siteContentMsg = `頁面可能啟用 WAF/Anti-bot，已改以可信根網域 ${registrableDomain} 的排名/電商基線判斷，不因爬蟲阻擋扣為高風險`;

            // 決定網域特徵卡片的 UI 文字
            let domainAnalysisStatus = 'safe';
            let domainAnalysisDetails = '網域命名結構無明顯異常';

            // 👇 新增 APK 專屬的紅色警告卡片
            if (hasOfficialAlert) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 官方警示資料命中：${officialAlertMatch.source} 已公告「${officialAlertMatch.title}」，${officialAlertMatch.warning}`;
                siteContentMsg = '危險：此網址已出現在官方警示資料';
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
            } else if (hasShoppingScamSignal) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = `🚨 偵測到一頁式購物詐騙特徵：${shoppingScamSignals.reasons.slice(0, 3).join('、')}。`;
            } else if (hasShoppingLineContactRisk) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到一頁式購物/廣告落地頁要求加入 LINE 聯絡或下單，常見於詐騙導流。';
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
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 網域與 HTTPS 憑證都在 3 個月內建立，常見於短期釣魚或免洗網站。';
            } else if (hasNewOneYearRegistrationRisk) {
                domainAnalysisStatus = riskScore >= 70 ? 'danger' : 'warning';
                domainAnalysisDetails = `${riskScore >= 70 ? '🚨' : '⚠️'} 網域註冊未滿 6 個月，且註冊週期約 1 年，符合短期棄置型詐騙網域常見模式；需搭配其他訊號判斷。`;
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
            // 改善點 2：新增寄生跳板的專屬警告文字 (放在最上面優先判斷)
            else if (isRedirected && isKnownShortener && !isFinalWhitelisted) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 偵測到「寄生網域」詐騙：利用合法社群連結，秘密跳轉至危險網站！';
            }

            // 新增這段：隱匿型跳板警告
            else if (!isRedirected && isInputShortener && fullUrl.length > targetDomain.length + 12) {
                domainAnalysisStatus = 'danger';
                domainAnalysisDetails = '🚨 隱匿型跳板：網址為跳板服務，但刻意阻擋系統追蹤真實目的地，極度可疑！';
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
                if (domain.endsWith('zeabur.app')) {
                    domainAnalysisDetails = '「zeabur.app」是 Zeabur 雲端部署平台提供的免費/預設子網域，任何人都可以在幾分鐘內匿名註冊並部署網頁，無法確認其正當性。';
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
            } else if (traceData && traceData.redirectCount >= 3) {
                redirectStatus = 'warning';
                redirectCheckDetails = `偵測到 ${traceData.redirectCount} 次轉址 - [有多次轉址風險]${finalDomain ? ` (最終導向: ${finalDomain})` : ''}`;
            } else if (isRedirected) {
                redirectStatus = isKnownShortener ? 'warning' : 'safe';
                redirectCheckDetails = redirectDetails;
            } else if (traceData && traceData.isHighRisk) {
                redirectStatus = 'warning';
                redirectCheckDetails = `後端偵測異常: ${traceData.riskReason}`;
            }

            return {
                domain: targetDomain, scannedUrl: fullUrl, rawUrl: rawScanUrl, sanitizedUrl: sanitizedScanUrl, removedTrackingParams: removedTrackingParamsForScan, removedVolatileParams: removedVolatileParamsForScan, removedParams: removedParamsForScan, traceChain: traceChain, riskScore: Math.min(100, riskScore), risk_flag: hasNewOneYearRegistrationRisk || hasMissingAllSecurityHeaders || hasMissingMxRecords || hasUaCloakingRisk, riskFlags: { newDomainOneYearRegistration: hasNewOneYearRegistrationRisk, missingAllSecurityHeaders: hasMissingAllSecurityHeaders, missingMxRecords: hasMissingMxRecords, uaCloaking: hasUaCloakingRisk, missingAllSecurityHeadersRaw: hasMissingAllSecurityHeadersRaw, missingMxRecordsRaw: hasMissingMxRecordsRaw, trustedValidation: hasTrustedValidation }, blocklistListed: blocklistListedForRisk, isSocialMedia: isSocialMedia, isWhitelisted: isWhitelisted, isTrustedAllowlist: hasTrustedAllowlistOverride, crawlerBlockedTrustedContext: hasCrawlerBlockedTrustedContext, rootDomainTrust: { registrableDomain, hasRankedRootDomainFallback, isTrustedEcommerceRootDomain, isTrustedTaiwanServiceRootDomain },
                details: {
                    serverCountry: serverInfo?.isReal ? `${serverInfo.country}${serverIp ? ` (${serverIp})` : ''}` : '隱藏/無法偵測',
                    serverIp,
                    serverOrg: serverInfo?.org || '',
                    siteStatus: siteStatusData
                },
                checks: {
                    // 👇 新增這行：Google 官方的標記卡片
                    googleSafeBrowsing: { 
                        status: isGoogleFlaggedForRisk ? 'danger' : 'safe', 
                        label: 'Google 官方安全庫', 
                        details: isGoogleFlaggedForRisk ? `🚨 Google 官方標記為危險網站 (${safeBrowsingData.threatType})` : (isOfficialTaiwanGov && isGoogleFlagged ? '台灣政府官方網域，忽略外部安全庫誤判' : (isGoogleFlagged && hasTrustedAllowlistOverride ? 'Trusted Allowlist Domain，忽略外部安全庫誤判' : 'Google Safe Browsing 未發現威脅'))
                    },
                    officialAlerts: {
                        status: hasOfficialAlert ? 'danger' : 'safe',
                        label: '官方警示資料',
                        details: hasOfficialAlert ?
                            `${officialAlertMatch.source} 公告：${officialAlertMatch.category}「${officialAlertMatch.productName || officialAlertMatch.title}」。${officialAlertMatch.violationType}；${officialAlertMatch.warning}${officialAlertMatch.claimSummary ? ` ${officialAlertMatch.claimSummary}` : ''}` :
                            '未命中目前內建的官方警示資料',
                        link: hasOfficialAlert ? officialAlertMatch.sourceUrl : null
                    },
                    siteContent: { status: isSocialMedia ? 'warning' : ((hasOfficialAlert || isApkSite || isDownloadPhishingSignal) ? 'danger' : (isWhitelisted || siteStatusData.status === 'ok' ? 'safe' : (hasCrawlerBlockedTrustedContext ? 'info' : 'danger'))), label: '網站內容狀態', details: siteContentMsg },

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
                            ? `頁面可能被 WAF/Anti-bot 阻擋；已改以可信電商根網域 ${registrableDomain} 與 Tranco/根網域基線作為佐證，不以缺少 CMS 足跡扣分`
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
                    businessIdentity: {
                        status: isTrustedPaymentGatewayOrApiEndpoint ? 'safe' : (hasVerifiedBusinessEntity ? 'safe' : (businessIdentitySignals.matched ? 'info' : 'unknown')),
                        label: '商家實體一致性',
                        details: isTrustedPaymentGatewayOrApiEndpoint
                            ? '可信支付閘道/API/checkout 端點，不要求台灣在地商家實體或統編與 WHOIS/RDAP 註冊者比對'
                            : (hasVerifiedBusinessEntity
                            ? (matchedBusinessEntityName ? `頁面商家名稱「${matchedBusinessEntityName}」與 WHOIS/RDAP 註冊者相符` : '頁面揭露商家資訊，且 WHOIS/RDAP 註冊資料具一致性')
                            : (businessIdentitySignals.reasons?.length ? `${businessIdentitySignals.reasons.join('；')}；尚未能與 WHOIS/RDAP 註冊者明確比對` : '未取得足夠公司名稱、統一編號或 WHOIS/RDAP 註冊者比對資料'))
                    },
                    lineOfficial: {
                        status: lineOfficialSignals.matched ? (hasStrongEcommerceValidation || hasVerifiedBusinessEntity ? 'info' : 'warning') : 'safe',
                        label: 'LINE 官方帳號脈絡',
                        details: lineOfficialSignals.matched
                            ? `${lineOfficialSignals.reason}${lineOfficialSignals.urls?.length ? `：${lineOfficialSignals.urls.join('、')}` : ''}${(hasStrongEcommerceValidation || hasVerifiedBusinessEntity) ? '；已搭配商家/電商佐證，不單獨視為高風險' : '；缺少商家佐證時仍需留意'}`
                            : lineOfficialSignals.reason
                    },
                    securityHeaders: {
                        status: hasMissingAllSecurityHeaders ? 'danger' : (hasMissingAllSecurityHeadersRaw ? 'warning' : (securityHeadersData?.status === 'ok' ? 'safe' : 'unknown')),
                        label: 'HTTP 安全標頭',
                        details: securityHeadersData?.status === 'ok'
                            ? (hasMissingAllSecurityHeaders
                                ? '缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭'
                                : (hasMissingAllSecurityHeadersRaw
                                    ? '缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭；但尚未搭配其他詐騙佐證，不單獨判為高風險'
                                    : `已檢查安全標頭${securityHeadersData.missing?.length ? `；缺少：${securityHeadersData.missing.join('、')}` : '，未發現三項皆缺失'}`))
                            : '無法自動檢查 HTTP 安全標頭'
                    },
                    mxRecords: {
                        status: hasMissingMxRecords ? 'danger' : (hasMissingMxRecordsRaw ? 'warning' : (mxInfo.status === 'ok' ? 'safe' : 'unknown')),
                        label: 'MX 郵件紀錄',
                        details: hasMissingMxRecords
                            ? (mxInfo.nullMx ? '網域設定 Null MX，明確表示不接收 Email' : '未偵測到 MX 郵件紀錄，可能是免洗或短期用途網域')
                            : (hasMissingMxRecordsRaw ? (mxInfo.nullMx ? '網域設定 Null MX，不接收 Email；但尚未搭配其他詐騙佐證，不單獨判為高風險' : '未偵測到 MX 郵件紀錄；但尚未搭配其他詐騙佐證，不單獨判為高風險')
                            : (mxInfo.status === 'ok' ? `已偵測到 MX 紀錄：${mxInfo.records.slice(0, 3).join('、')}` : '無法自動判定 MX 郵件紀錄')
                            )
                    },
                    age: {
                        status: isWhitelisted ? 'safe' : ((rdapDate && domainAgeDays !== null && domainAgeDays < 90) ? 'danger' :
                            (hasNewOneYearRegistrationRisk ? (riskScore >= 70 ? 'danger' : 'warning') :
                            (rdapDate ? (Math.abs(new Date() - new Date(rdapDate)) < 180 * 86400000 ? 'warning' :
                                (Math.abs(new Date() - new Date(rdapDate)) < 365 * 86400000 ? 'warning' : 'safe')) : 'unknown'))),
                        label: '註冊時間',
                        details: isOfficialTaiwanGov ? '台灣政府官方網域，不以 HTTPS 憑證核發日判定為新註冊風險' : (isWhitelisted ? '受信賴白名單網域，不以憑證日期判定新註冊風險' : (rdapDate ? `註冊日期: ${new Date(rdapDate).toISOString().split('T')[0]}${isRegistrationDateFromCertificate ? '（以 HTTPS 憑證最近核發日代入）' : ''}${domainAgeDays !== null && domainAgeDays < 90 ? ' - 3 個月內新註冊網域！' : ''}${hasNewOneYearRegistrationRisk ? ' - 未滿 6 個月且註冊週期約 1 年' : ''}` : '無法自動獲取 (建議手動查詢 WHOIS)')),
                        link: `https://who.is/whois/${rdapQueriedDomain}`
                    },
                    registrationPeriod: {
                        status: hasNewOneYearRegistrationRisk ? (riskScore >= 70 ? 'danger' : 'warning') : (registrationPeriodDays !== null ? 'info' : 'unknown'),
                        label: '註冊週期',
                        details: registrationPeriodDays !== null
                            ? `註冊期間約 ${registrationPeriodDays} 天${rdapExpirationDate ? `；到期日: ${new Date(rdapExpirationDate).toISOString().split('T')[0]}` : ''}${hasNewOneYearRegistrationRisk ? ' - 新網域搭配 1 年短期註冊，需提高警覺' : ''}`
                            : '無法自動判定註冊週期'
                    },
                    certificate: {
                        status: isNewDomainWithNewCertificate ? 'danger' : (isVeryNewCertificate ? 'warning' : (certData?.notBefore ? 'safe' : 'unknown')),
                        label: 'HTTPS 憑證時間',
                        details: certData?.notBefore ? `憑證最近核發日: ${new Date(certData.notBefore).toISOString().split('T')[0]}${certExpiryText}${certIssuerText}${isNewDomainWithNewCertificate ? ' - 新網域搭配新憑證，需提高警覺' : (isVeryNewCertificate ? ' - 3 個月內新核發憑證' : '')}` : '無法自動取得憑證核發時間'
                    },
                    registrar: { status: isHighRiskRegistrar ? 'warning' : (isTrustedTaiwanRegistrar ? 'safe' : 'safe'), label: '註冊商信譽', details: registrarName ? (isHighRiskRegistrar ? `註冊商 ${registrarName} 常被用於垃圾網站` : (isTrustedTaiwanRegistrar ? `台灣常見註冊商: ${registrarName}` : `註冊商: ${registrarName}`)) : '無法辨識註冊商' },
                    whoisPrivacy: { status: privacyDetected ? (isHighTraffic ? 'safe' : 'warning') : 'safe', label: 'WHOIS 身份隱藏', details: privacyDetected ? (isHighTraffic ? '已開啟隱私保護 (知名網站常見設定)' : '已開啟隱私保護 (所有者身份被隱藏，無法追查)') : '未偵測到隱私保護服務' },
                    subdomain: { status: isDeepSubdomain ? (isHighTraffic ? 'safe' : (hasDeepSubdomainPhishingPattern ? 'danger' : 'warning')) : 'safe', label: '子網域深度', details: isDeepSubdomain ? (isHighTraffic ? '子網域層級較多，但屬於受信賴網域' : (hasDeepSubdomainPhishingPattern ? '檢測到深層可疑子網域，伴隨偽裝後綴、連字號、隨機片段或可疑參數等釣魚特徵' : '檢測到多層子網域，需搭配其他風險特徵判斷')) : '子網域層級正常' },
                    subdomainPattern: { status: suspiciousSubdomain.matched ? (isHighTraffic ? 'info' : 'warning') : 'safe', label: '可疑子網域模式', details: suspiciousSubdomain.matched ? `偵測到可疑子網域「${suspiciousSubdomain.label}」：${suspiciousSubdomain.reasons.join('、')}` : '未偵測到異常子網域命名模式' },
                    disposableDomain: { status: hasDisposableShoppingLandingRisk || hasDisposableRootPhishingRisk || hasDisposableUnreadablePageRisk ? 'danger' : (hasDisposableRootLabel ? 'warning' : 'safe'), label: '免洗亂碼網域', details: hasDisposableRootLabel ? `主網域「${rootLabel}」具有隨機生成或可快速棄置特徵：${disposableRoot.reasons.slice(0, 4).join('、')}${suspiciousSubdomain.matched ? '；並搭配可疑子網域命名' : ''}${hasSuspiciousLandingParams ? '；並搭配廣告追蹤落地頁參數' : ''}${unreadablePageStatuses.includes(siteStatusData.status) ? '；且頁面內容未完整取得' : ''}` : '未偵測到主網域亂碼免洗特徵' },
                    userAgentCloaking: { status: hasUaCloakingRisk ? 'danger' : (hasUaDifference ? 'warning' : 'safe'), label: '裝置導向差異', details: hasUaDifference ? `${uaCloakingDetails}${hasUaCloakingRisk ? '；此行為常見於只對手機使用者展示釣魚頁或規避桌面掃描。' : '；目前未導向不同主網域，列為提醒。'}` : 'Mobile 與 Desktop User-Agent 未發現不同最終導向' },
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
                    regulatedProduct: {
                        status: hasRegulatedTobaccoSalesSignal ? 'danger' : 'safe',
                        label: '電子菸/加熱菸販售',
                        details: hasRegulatedTobaccoSalesSignal
                            ? `偵測到電子菸、煙彈、RELX/悅刻等商品搭配交易脈絡：${regulatedTobaccoSalesSignals.reasons.slice(0, 4).join('、')}。在台灣情境下屬高度法規與交易詐騙風險。`
                            : '未偵測到電子菸、加熱菸或煙彈的網路販售脈絡'
                    },
                    shoppingScam: { status: hasStrongEcommerceValidation ? 'info' : ((hasShoppingScamSignal || hasShoppingLineContactRisk) ? 'danger' : (shoppingScamSignals.matched || hasShoppingLandingUrlRisk ? 'warning' : 'safe')), label: '一頁式購物詐騙', details: hasStrongEcommerceValidation ? '偵測到購物頁特徵，但同時具備正規電商佐證，未單獨判為一頁式購物詐騙' : (shoppingScamSignals.matched ? `偵測到 ${shoppingScamSignals.reasonCount} 個購物詐騙頁特徵：${shoppingScamSignals.reasons.slice(0, 4).join('、')}` : (hasShoppingLandingUrlRisk ? '頁面內容未完整取得，無法確認購物頁結構；但網址本身已符合可疑購物落地頁特徵' : '未能從可讀 HTML 中確認一頁式購物結構')) },
                    lineContact: { status: hasShoppingLineContactRisk ? 'danger' : (shoppingScamSignals.hasLineContactSignal ? (hasStrongEcommerceValidation ? 'info' : 'warning') : 'safe'), label: 'LINE 聯絡導流', details: shoppingScamSignals.hasLineContactSignal ? (hasStrongEcommerceValidation ? `偵測到 LINE 聯絡資訊，但同時具備正規電商佐證${shoppingScamSignals.lineContactExamples?.length ? `：${shoppingScamSignals.lineContactExamples.join('、')}` : ''}` : `偵測到要求加入 LINE 聯絡/下單${shoppingScamSignals.lineContactExamples?.length ? `：${shoppingScamSignals.lineContactExamples.join('、')}` : ''}`) : '未偵測到 LINE 聯絡導流' },
                    shoppingLanding: { status: hasShoppingLandingUrlRisk ? 'danger' : (hasSuspiciousLandingParams ? ((hasStrongEcommerceValidation || isWhitelisted || isTrustedTLD || hasSmallBusinessTrustContext) ? 'info' : 'warning') : 'safe'), label: '購物/廣告落地頁網址', details: hasShoppingLandingUrlRisk ? `即使未取得頁面內容，網址本身已符合可疑購物落地頁特徵：${matchedLandingParams.slice(0, 4).join('、')}${(isSuspiciousRootLabel || isSuspiciousLandingRootLabel) ? '；主網域名稱隨機度偏高' : ''}` : (hasSuspiciousLandingParams ? ((hasStrongEcommerceValidation || isWhitelisted || isTrustedTLD || hasSmallBusinessTrustContext) ? `偵測到廣告落地頁追蹤參數：${matchedLandingParams.slice(0, 4).join('、')}；但網域/頁面具備台灣商業或正規電商脈絡，未單獨判為風險` : `偵測到廣告落地頁追蹤參數：${matchedLandingParams.slice(0, 4).join('、')}${(isSuspiciousRootLabel || isSuspiciousLandingRootLabel) ? '；主網域名稱隨機度偏高' : ''}`) : '未偵測到可疑購物落地頁參數') },
                    brandSimilarity: { status: hasBrandSimilarity ? 'danger' : 'safe', label: '品牌相似網域', details: hasBrandSimilarity ? `網域疑似模仿「${matchedBrandSimilarity.brandName}」相關名稱 (${matchedBrandSimilarity.keyword})` : '未偵測到常見品牌相似網域' },
                    pageBrand: { status: hasPageBrandMismatch ? 'danger' : 'safe', label: '頁面品牌一致性', details: hasPageBrandMismatch ? `頁面內容疑似出現「${pageBrandSignals.brandName}」品牌，但網域不是官方網站` : '未偵測到頁面品牌與網域不一致' },
                    officialFlowPath: { status: hasOfficialFlowPathSignal ? ((hasBrandSimilarity || hasPageBrandMismatch || isVeryNewDomain || isLowTraffic) ? 'warning' : 'info') : 'safe', label: '官方流程路徑', details: hasOfficialFlowPathSignal ? '網址路徑含登入、驗證、帳戶、領取、配送或付款等流程字樣，需搭配網域可信度判斷' : '未偵測到可疑官方流程路徑' },
                    urgency: { status: hasUrgencyScamSignal ? ((hasBrandSimilarity || hasPageBrandMismatch || hasFinancialPhishingSignal || isVeryNewDomain) ? 'warning' : 'info') : 'safe', label: '限時/恐嚇話術', details: hasUrgencyScamSignal ? `偵測到限時、帳戶異常或立即驗證類話術：${urgencySignals.examples.slice(0, 3).join('、')}` : '未偵測到常見限時或恐嚇話術' },
                    homograph: { status: hasHomographSignal ? 'danger' : 'safe', label: '相似字元網域', details: hasHomographSignal ? '網域含 Punycode 或非 ASCII 字元，可能利用相似字元混淆官方網域' : '未偵測到 Punycode 或 Unicode 混淆網域' },
                    params: { status: ((hasSuspiciousParams || hasNestedSuspiciousParams) && !isWhitelisted) ? 'danger' : ((hasSuspiciousParams || hasNestedSuspiciousParams) ? 'info' : 'safe'), label: '網址參數檢查', details: (hasSuspiciousParams || hasNestedSuspiciousParams) ? (isWhitelisted ? '官方白名單網域含交易/工作階段參數，視為正常站內流程' : '包含敏感參數 (token/auth/session/verify)，疑似釣魚或帳戶劫持連結') : '未發現敏感追蹤或認證參數' },
                    entropy: { status: (isExtremeGibberish || hasDisposableShoppingLandingRisk || hasDisposableRootPhishingRisk || hasDisposableUnreadablePageRisk) ? 'danger' : (isHighEntropy || hasDisposableRootLabel ? 'warning' : 'safe'), label: '亂碼/隨機網址', details: hasDisposableRootLabel ? `主網域「${rootLabel}」疑似隨機生成：${disposableRoot.reasons.slice(0, 3).join('、')}` : (isHighEntropy ? (isExtremeGibberish ? '🚨 網域包含極長亂碼，常為詐騙釣魚專屬追蹤連結' : '網域名稱隨機度過高，疑似機器生成') : '網域名稱結構正常') },
                    iframe: { status: siteStatusData.hasIframe ? 'warning' : 'safe', label: 'Iframe 偽裝', details: siteStatusData.hasIframe ? '偵測到隱藏框架 (可能隱藏真實內容)' : '未偵測到異常框架' },
                    apkCheck: { status: isApkSite || isDownloadPhishingSignal ? 'danger' : (suspiciousDownloadPath ? 'warning' : 'safe'), label: '可疑檔案下載', details: isApkSite ? `偵測到 ${apkUrlCount} 個不明 APK 檔下載，極高風險！` : (isDownloadPhishingSignal ? `偵測到可疑下載誘導：安裝關鍵字 ${installKeywordCount} 個、動態下載特徵 ${dynamicDownloadCount} 個、可疑路徑 ${suspiciousDownloadPathCount} 個` : (suspiciousDownloadPath ? `網址路徑含可疑下載片段：${downloadSignals.suspiciousPathFragments.join('、')}` : '未偵測到可疑 Android 應用程式')) }
                }
            };
        };

        const getHighRiskSummaryReasons = (scanData) => {
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
            addReason(checks.regulatedProduct?.status === 'danger', '違法電子菸/加熱菸網路販售風險');
            addReason(checks.freeHostingSensitiveLink?.status === 'danger', '免費子網域搭配一次性驗證參數');
            addReason(checks.domainAnalysis?.status === 'danger', checks.domainAnalysis?.details || '網域特徵異常');
            addReason(checks.externalResources?.status === 'danger', '表單或外部資源送往可疑網域');
            addReason(checks.shoppingScam?.status === 'danger', '一頁式購物詐騙特徵');
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
            addReason(checks.siteContent?.status === 'danger' && reasons.length === 0, checks.siteContent?.details || '網站內容具高風險特徵');

            return reasons.slice(0, 3);
        };

        const enforceFinalRiskConsistency = (scanData) => {
            if (!scanData || scanData.isInvalid || scanData.isSocialMedia || scanData.blocklistListed || scanData.isTrustedAllowlist) return scanData;

            const reasons = getHighRiskSummaryReasons(scanData);
            if (reasons.length > 0 && scanData.riskScore < 70) {
                scanData.riskScore = 70;
            }
            scanData.summaryReasons = reasons;
            return scanData;
        };

        const RiskMeter = ({ score }) => {
            let color = 'bg-green-500', text = '低度風險', width = '10%';
            if (score >= 70) { color = 'bg-red-600'; text = '高度風險'; width = '90%'; }
            else if (score >= 30) { color = 'bg-yellow-500'; text = '中度風險'; width = '50%'; }
            return (
                <div className="mt-4 mb-6">
                    <div className="flex justify-between mb-1 text-sm font-bold"><span>安全</span><span className={score >= 70 ? 'text-red-600' : (score >= 30 ? 'text-yellow-600' : 'text-green-600')}>{text}</span><span>危險</span></div>
                    <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden"><div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: width }}></div></div>
                </div>
            );
        };

        const TraceTimeline = ({ chain }) => {
            if (!chain || chain.length <= 1) return null;
            return (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6 shadow-sm">
                    <div className="bg-gray-50/80 backdrop-blur-sm px-6 py-4 border-b border-gray-100 flex items-center justify-between"><div className="flex items-center gap-2"><Activity size={20} className="text-brand-red" /><h3 className="font-bold text-gray-800">網頁跳轉紀錄</h3></div><span className="text-xs font-mono text-gray-400 bg-white px-2 py-1 rounded border border-gray-200">Total: {chain.length} hops</span></div>
                    <div className="p-6 bg-white"><div className="relative"><div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-100"></div><div className="space-y-6">{chain.map((hop, index) => {
                        const code = hop.status, isRedirect = code >= 300 && code < 400, isError = code >= 400;
                        let colorClass = isRedirect ? "bg-orange-100 text-orange-700 border-orange-200" : (isError ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200");
                        return (
                            <div key={index} className="relative flex items-start gap-4 group"><div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-4 shadow-sm flex-shrink-0 bg-white ${isRedirect ? 'border-orange-100' : (isError ? 'border-red-100' : 'border-green-100')}`}><div className={`w-2.5 h-2.5 rounded-full ${isRedirect ? 'bg-orange-500' : (isError ? 'bg-red-500' : 'bg-green-500')}`}></div></div><div className="flex-grow min-w-0 pt-1"><div className="flex flex-wrap items-center gap-2 mb-2"><span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${colorClass}`}>HTTP {hop.status}</span>{isRedirect && <span className="flex items-center text-xs text-orange-600 font-medium"><ArrowRight size={12} className="mr-1" />Redirect</span>}{index === 0 && <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Initial</span>}{index === chain.length - 1 && !isRedirect && <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Final</span>}</div><div className="group-hover:bg-blue-50/50 transition-colors p-2.5 rounded-lg border border-gray-100 bg-gray-50 font-mono text-sm text-gray-600 break-all select-all hover:border-blue-200 hover:text-blue-800">{hop.url}</div></div></div>
                        );
                    })}</div></div></div>
                </div>
            );
        };


// 👇 新增這段：App 安裝推薦卡片元件 👇
        const InstallPrompt = () => {
            const [deferredPrompt, setDeferredPrompt] = useState(null);
            const [showPrompt, setShowPrompt] = useState(false);
            const [isIOS, setIsIOS] = useState(false);
            const [isChromeIOS, setIsChromeIOS] = useState(false); // 👈 新增：判斷是否為 iOS Chrome

            useEffect(() => {
                // 1. 檢查是否已經按過「下次再說」或已經安裝
                const hasSeen = localStorage.getItem('hasSeenInstallPrompt');
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
                
                if (isStandalone) return; // 已經是 App 模式就不干擾

                // 2. 判斷是否為 iOS 設備
                const userAgent = window.navigator.userAgent;
                const isDeviceIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
                
                if (isDeviceIOS) {
                    setIsIOS(true);
                    // 偵測 iOS 版的 Chrome (User Agent 會包含 CriOS)
                    if (/CriOS/i.test(userAgent)) {
                        setIsChromeIOS(true);
                    }

                    if (!hasSeen) {
                        setTimeout(() => setShowPrompt(true), 3000);
                    }
                }

                // 3. 監聽 Android 的原生安裝事件
                const handleBeforeInstallPrompt = (e) => {
                    e.preventDefault(); // 攔截系統預設的醜醜橫幅
                    setDeferredPrompt(e);
                    if (!hasSeen) {
                        setTimeout(() => setShowPrompt(true), 3000);
                    }
                };

                window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
                return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            }, []);

            const handleInstall = async () => {
                if (isIOS) {
                    // 👇 根據不同瀏覽器，給予精準的安裝教學
                    if (isChromeIOS) {
                        alert('🍎 在 Chrome 安裝：\n請點擊網址列右上角的「分享」圖示 ⬆️\n(或點擊「...」選單)，\n然後滑動找到「加到主畫面」就可以囉！🦁');
                    } else {
                        alert('🍎 在 Safari 安裝：\n請點擊瀏覽器正下方的「分享」圖示 ⬆️\n，然後滑動選單找到「加到主畫面」就可以囉！🦁');
                    }
                    
                    setShowPrompt(false);
                    localStorage.setItem('hasSeenInstallPrompt', 'true');
                    return;
                }

                if (deferredPrompt) {
                    deferredPrompt.prompt(); // 呼叫 Android 原生安裝視窗
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        console.log('User accepted the install prompt');
                    }
                    setDeferredPrompt(null);
                }
                setShowPrompt(false);
                localStorage.setItem('hasSeenInstallPrompt', 'true');
            };

            const handleDismiss = () => {
                setShowPrompt(false);
                localStorage.setItem('hasSeenInstallPrompt', 'true'); // 記住使用者拒絕過，不再煩他
            };

            if (!showPrompt) return null;

            return (
                // 👇 將 bottom-6 改為 bottom-36 md:bottom-6，讓手機版往上浮起，避開右下角的獅子
                <div className="fixed bottom-36 md:bottom-6 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[60] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 flex flex-col gap-3 animate-slide-up">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 flex-shrink-0 bg-gray-50 rounded-full p-1 border border-gray-100 shadow-sm">
                            <img src="https://ik.imagekit.io/mygopen/openmy.png" alt="阿麥" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-grow">
                            <h4 className="font-bold text-gray-800 text-sm">把阿麥放到手機桌面！</h4>
                            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">下次遇到可疑網址，一秒打開直接查 🛡️</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDismiss} className="flex-1 px-4 py-2 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">下次再說</button>
                        <button onClick={handleInstall} className="flex-[2] px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-red hover:bg-brand-darkRed shadow-md transition-colors">
                            {isIOS ? '查看安裝教學' : '立即免費安裝'}
                        </button>
                    </div>
                </div>
            );
        };


        // =========================================================================
        // 📡 自動通報 Helper：將每次查詢的正常/異常指標全部組合並送往後台
        // =========================================================================
        const sendAutoReport = async (url, scanData, brandDataRes, source, reportedUrls, setReportedUrls) => {
            try {
                const indicators = [];
                const rawUrl = scanData.rawUrl || scanData.inputUrl || url;
                const sanitizedUrl = scanData.sanitizedUrl || scanData.scannedUrl || url;
                const removedParams = scanData.removedParams || [
                    ...(scanData.removedTrackingParams || []),
                    ...(scanData.removedVolatileParams || [])
                ];
                
                // 黑名單與假冒品牌屬於絕對危險特徵
                if (scanData.blocklistListed) indicators.push('🚨 已列入165詐騙黑名單');
                if (brandDataRes && brandDataRes.isFakeBrand) indicators.push(`🚨 假冒品牌：偽裝成「${brandDataRes.detectedBrand}」`);
                
                // 依序條列各項檢查的指標與理由 (包含安全、警告、危險)
                Object.values(scanData.checks).forEach(check => {
                    if (check.status === 'danger') indicators.push(`❌ ${check.label}: ${check.details.split('\n')[0]}`);
                    else if (check.status === 'warning') indicators.push(`⚠️ ${check.label}: ${check.details.split('\n')[0]}`);
                    else if (check.status === 'safe') indicators.push(`✅ ${check.label}: ${check.details.split('\n')[0]}`);
                });
                
                const aiAnalysisContent = `[系統自動檢測 - ${source}]\n判斷為正常或詐騙之指標：\n${indicators.join('\n')}\n\n[URL 稽核]\n原始URL：${rawUrl}\n掃描URL：${sanitizedUrl}${removedParams.length ? `\n移除參數：${removedParams.join(', ')}` : ''}`;

                const res = await fetch('/api/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: rawUrl,
                        rawUrl,
                        sanitizedUrl,
                        removedParams,
                        riskScore: scanData.riskScore,
                        aiAnalysis: aiAnalysisContent // 送出我們整理好的全指標清單
                    })
                });

                const data = await res.json();
                
                // 背景自動通報只作為後台分析資料，不應標記成使用者已手動檢舉。
            } catch (e) {
                console.log('背景自動通報失敗，不影響主流程', e);
            }
        };

// =========================================================================
        // 🦁 完整的 BotAssistant 元件 (獨立運作，包含貼圖與檢舉功能)
        // =========================================================================
        const BotAssistant = ({ reportedUrls, setReportedUrls, externalWhitelist }) => {
            const [view, setView] = useState('closed');
            const [messages, setMessages] = useState([
                { role: 'assistant', content: '哈囉！我是防詐大獅：阿麥 🦁\n\n有遇到可疑的網址嗎？直接貼上來，我幫你看！' }
            ]);
            const [input, setInput] = useState('');
            const [isTyping, setIsTyping] = useState(false);
            const messagesEndRef = useRef(null);

            // 自動捲動到最新訊息
            useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

            // 聊天室專屬的檢舉狀態與功能
            const [isReportingBot, setIsReportingBot] = useState(false);

            const handleBotReportAction = async (targetUrl) => {
                if (isReportingBot) return;
                setIsReportingBot(true);
                
                setMessages(prev => [...prev, { role: 'user', content: `[請阿麥幫忙檢舉：${targetUrl}]` }]);
                setIsTyping(true);
                
                try {
                    const res = await fetch('/api/report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: targetUrl,
                            rawUrl: targetUrl,
                            sanitizedUrl: targetUrl,
                            removedParams: [],
                            riskScore: 100,
                            aiAnalysis: "此為使用者透過「聊天室」辨識出之高風險網址"
                        })
                    });
                    const data = await res.json();
                    
                    if (data.success) {
                        const newReported = [...reportedUrls, targetUrl];
                        setReportedUrls(newReported);
                        localStorage.setItem('userReportedUrls', JSON.stringify(newReported));
                        
                        let replyMsg = '✅ 檢舉成功！感謝你的熱心，阿麥已經把這個壞壞網址交給防詐團隊囉！🦁';
                        if (data.isDuplicate) {
                            replyMsg = '🛡️ 感謝熱心！這個網址已經有其他人搶先通報囉，我們已為您標記為通報狀態。';
                        }
                        setMessages(prev => [...prev, { role: 'assistant', content: replyMsg }]);
                    } else {
                        let errMsg = '系統異常';
                        if (typeof data.error === 'string') errMsg = data.error;
                        else if (data.error && typeof data.error === 'object') errMsg = data.error.message || JSON.stringify(data.error);
                        setMessages(prev => [...prev, { role: 'assistant', content: `❌ 通報失敗了：${errMsg}` }]);
                    }
                } catch (err) {
                    setMessages(prev => [...prev, { role: 'assistant', content: '❌ 網路好像有點問題，通報送不出去。' }]);
                } finally {
                    setIsReportingBot(false);
                    setIsTyping(false);
                }
            };

            const buildBotScanReply = (scanData, brandDataRes, urlObj, contextText = '') => {
                let riskLevel = scanData.riskScore >= 70 ? '🔴 高度危險' : (scanData.riskScore >= 30 ? '⚠️ 中度風險' : '✅ 安全');
                let replyText = `【麥擱騙檢測報告】\n風險評估：${riskLevel}\n\n`;
                if (contextText) replyText += `${contextText}\n\n`;

                const warningLines = [];
                if (brandDataRes?.isFakeBrand) warningLines.push('企圖假冒知名品牌');
                if (scanData.blocklistListed) warningLines.push('已被列入警示黑名單');
                if (scanData.checks?.officialAlerts?.status === 'danger') warningLines.push(`官方警示資料命中：${scanData.checks.officialAlerts.details}`);
                if (scanData.checks?.shoppingLanding?.status === 'danger') warningLines.push('網址符合可疑購物/廣告落地頁特徵');
                if (scanData.checks?.disposableDomain?.status === 'danger') warningLines.push('主網域具有免洗亂碼特徵');
                if (scanData.checks?.apkCheck?.status === 'danger') warningLines.push(scanData.checks.apkCheck.details);

                if (scanData.riskScore >= 70) {
                    replyText += `🚨 警告：這極高機率是詐騙！\n`;
                    warningLines.slice(0, 4).forEach(line => { replyText += `- ${line}\n`; });
                    replyText += `\n絕對不要點擊或輸入任何資料喔！`;
                    return {
                        content: replyText,
                        action: { type: 'report', url: urlObj.href },
                        sticker: 'https://ik.imagekit.io/mygopen/sticks/17.png'
                    };
                }

                if (scanData.riskScore >= 30) {
                    replyText += `⚠️ 注意：這個網站有點可疑，請保持警覺，不要隨意給出個資。`;
                } else {
                    replyText += `就網址來說，目前看起來沒有明顯的詐騙特徵，但還是要小心喔！`;
                }

                return { content: replyText };
            };

            const scanUrlForBot = async (targetUrl, contextText = '') => {
                const parsedInput = parseUserUrl(targetUrl);
                if (!parsedInput.ok) {
                    const error = new Error('Invalid URL');
                    error.code = 'URL_VALIDATION_ERROR';
                    throw error;
                }

                const urlObj = parsedInput.url;
                const sanitizedForRisk = sanitizeUrlForRiskScoring(urlObj.href);
                const riskScoringUrl = sanitizedForRisk.href;
                const skipAiBrandAnalysis = shouldSkipAiBrandAnalysis(urlObj.hostname, externalWhitelist);

                const [scanData, brandDataRes] = await Promise.all([
                    simulateScan(urlObj.hostname, riskScoringUrl, externalWhitelist, sanitizedForRisk),
                    skipAiBrandAnalysis
                        ? Promise.resolve(null)
                        : withTimeout(fetchJsonSafely(`/api/check-fake-brand?url=${encodeURIComponent(riskScoringUrl)}`, null), 7000, null)
                ]);
                scanData.inputUrl = urlObj.href;
                scanData.sanitizedUrl = riskScoringUrl;
                scanData.removedTrackingParams = sanitizedForRisk.removedTrackingParams;
                scanData.removedVolatileParams = sanitizedForRisk.removedVolatileParams;
                scanData.removedParams = sanitizedForRisk.removedParams;

                if (scanData.isInvalid) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `【麥擱騙檢測報告】\n\n❌ 無法連結此網站\n\n阿麥查不到這個網址 (NXDOMAIN)，它可能已經失效或被封鎖了。但請注意，許多詐騙網址壽命都很短，請勿隨意點擊！`
                    }]);
                    return;
                }

                if (scanData.isSocialMedia) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `【麥擱騙檢測報告】\n風險評估：⚠️ 無法判斷內容\n\n這是社群平台，我們無法看到裡面的貼文，要多加小心留意！🦁`
                    }]);
                    return;
                }

                if (!skipAiBrandAnalysis && brandDataRes && (brandDataRes.isGenericScam || brandDataRes.isFakeBrand)) {
                    scanData.riskScore = 100;
                }

                if (!targetUrl.includes('@')) {
                    sendAutoReport(urlObj.href, scanData, brandDataRes, '阿麥聊天室', reportedUrls, setReportedUrls);
                }

                const reply = buildBotScanReply(scanData, brandDataRes, urlObj, contextText);
                setMessages(prev => [...prev, { role: 'assistant', ...reply }]);
            };

            const handleSend = async (e) => {
                e.preventDefault();
                const text = input.trim();
                if (!text) return;

                const newMessages = [...messages, { role: 'user', content: text }];
                setMessages(newMessages);
                setInput('');
                setIsTyping(true);

                const urlMatch = text.match(/https?:\/\/[^\s]+/i) || text.match(/[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/i);

                if (urlMatch) {
                    const targetUrl = urlMatch[0];
                    setMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: `收到網址！阿麥正在幫你連線檢查：\n${targetUrl} ...`,
                        sticker: 'https://ik.imagekit.io/mygopen/sticks/33.png' // 👈 輸入網址時的放大鏡貼圖
                    }]);

                    try {
                        await scanUrlForBot(targetUrl);
                    } catch (err) {
                        console.error('聊天室網址檢測異常:', err);
                        const errorMessage = err?.code === 'URL_VALIDATION_ERROR'
                            ? '❌ 抱歉，這個網址的格式怪怪的，阿麥看不懂，請重新貼一次。'
                            : '❌ 這個網址格式看起來可以讀取，但檢測過程暫時失敗，請稍後再試一次。';
                        setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
                    } finally {
                        setIsTyping(false);
                    }

                } else {
                    try {
                        const res = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages: newMessages.slice(-3) })
                        });
                        const data = await res.json();
                        
                        if (!res.ok || data.error) {
                            throw new Error(data.details || data.error || 'API 錯誤');
                        }
                        
                        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
                    } catch (err) {
                        setMessages(prev => [...prev, { role: 'assistant', content: `[系統除錯訊息] ${err.message}` }]);
                    } finally {
                        setIsTyping(false);
                    }
                }
            };

            const handleBotImageUpload = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                e.target.value = '';

                const MAX_FILE_SIZE = 3 * 1024 * 1024;
                if (file.size > MAX_FILE_SIZE) {
                    setMessages(prev => [...prev, { role: 'assistant', content: '❌ 圖片檔案過大 (超過3MB)，請裁切或壓縮後再傳給我喔！' }]);
                    return;
                }

                const imagePreviewUrl = URL.createObjectURL(file);
                setMessages(prev => [...prev, { role: 'user', content: '[傳送了一張圖片 📷]', imageUrl: imagePreviewUrl }]);
                
                // 👇 新增：截圖上傳時，也會顯示連線檢查中的貼圖
                setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: '收到圖片！阿麥會先用本機 OCR 找截圖裡的網址，找不到才交給 AI 分析 🔍...',
                    sticker: 'https://ik.imagekit.io/mygopen/sticks/33.png'
                }]);
                setIsTyping(true);

                try {
                    try {
                        const Tesseract = await loadTesseract();
                        const ocrResult = await Tesseract.recognize(file, 'eng');
                        const ocrTargets = extractOcrTargets(ocrResult?.data?.text || '');
                        const primaryTarget = pickPrimaryOcrTarget(ocrTargets);

                        if (primaryTarget && !primaryTarget.includes('@')) {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `我從你剛剛傳的截圖中辨識到這個網址：\n${primaryTarget}\n\n提醒：畫面中看到的網址文字不一定等於實際點擊後的目的地。即使看起來正確，點下去仍可能被導向釣魚網站。\n\n阿麥正在針對這個網址做完整風險檢測...`
                            }]);
                            await scanUrlForBot(primaryTarget, '這個網址是從你剛剛傳的截圖中辨識出來的。請注意，截圖或訊息中顯示的網址文字不一定等於實際點擊後的目的地。');
                            return;
                        }

                        if (primaryTarget && primaryTarget.includes('@')) {
                            setMessages(prev => [...prev, {
                                role: 'assistant',
                                content: `我在截圖中只辨識到疑似 Email：${primaryTarget}\n\nEmail 不是網址，阿麥會改用 AI 檢查畫面內容。`
                            }]);
                        }
                    } catch (ocrErr) {
                        console.log('聊天室本機 OCR 未能完成，改用 AI 截圖分析', ocrErr);
                    }

                    const formData = new FormData();
                    formData.append('image', file);
                    const response = await fetch('/api/cf-vision', {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok || data.error) {
                        throw new Error(data.details || data.error || '伺服器發生錯誤');
                    }

                    const aiUrlMatch = data.report.match(/🔗 網址：(.*?)(?=\n|$)/);
                    const aiDetectedUrl = aiUrlMatch ? aiUrlMatch[1].trim() : null;
                    if (aiDetectedUrl && aiDetectedUrl !== '無' && !aiDetectedUrl.includes('None') && !aiDetectedUrl.includes('@')) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `AI 從截圖中辨識到這個網址：\n${aiDetectedUrl}\n\n提醒：畫面中顯示的網址文字仍可能只是超連結文字，實際點擊後可能導向不同網站。阿麥會再針對網址做完整檢測。`
                        }]);
                        await scanUrlForBot(aiDetectedUrl, '這個網址是 AI 從你剛剛傳的截圖中辨識出來的。請注意，畫面中顯示的網址文字可能不是實際點擊後的目的地。');
                        return;
                    }

                    let stickerObj = null; // 👇 新增截圖專用貼圖變數

                    if (data.report.includes('高風險')) {
                        stickerObj = 'https://ik.imagekit.io/mygopen/sticks/17.png'; // 👈 高風險時顯示驚嚇貼圖
                    }

                    setMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: `【阿麥的截圖分析報告】\n\n${data.report}`,
                        ...(stickerObj && { sticker: stickerObj })
                    }]);

                } catch (err) {
                    setMessages(prev => [...prev, { role: 'assistant', content: `❌ 阿麥看不太清楚這張圖，分析失敗了：${err.message}` }]);
                } finally {
                    setIsTyping(false);
                }
            };
                
            return (
                <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end font-sans">
                    {view === 'welcome' && (
                        <div className="bg-white w-80 rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up mb-4">
                            <div className="bg-brand-red text-white p-4 flex justify-between items-center">
                                <div className="font-bold flex items-center gap-2"><Shield size={18} /> 防詐大獅：阿麥</div>
                                <button onClick={() => setView('closed')} className="hover:bg-white/20 p-1 rounded-full"><XCircle size={18} /></button>
                            </div>
                            <div className="p-6 bg-brand-red text-white text-sm text-center">
                                把可疑的網址貼給我，<br />阿麥馬上幫你查出風險！
                            </div>
                            <div className="p-6 flex flex-col items-center">
                                <img src="https://ik.imagekit.io/mygopen/Mycheck.png" alt="Lion" className="w-24 h-24 mb-4 object-contain" />
                                <button onClick={() => setView('chat')} className="w-full bg-brand-red text-white font-bold py-3 rounded-xl hover:bg-brand-darkRed transition shadow-md">開始對話</button>
                            </div>
                        </div>
                    )}

                    {view === 'chat' && (
                        <div className="bg-white w-[90vw] sm:w-96 h-[500px] max-h-[75vh] rounded-2xl shadow-2xl border border-gray-100 flex flex-col animate-slide-up mb-4">
                            <div className="bg-brand-red text-white p-3 flex justify-between items-center shadow-sm rounded-t-2xl">
                                <div className="font-bold flex items-center gap-2"><Shield size={18} /> 防詐大獅：阿麥</div>
                                <button onClick={() => setView('closed')} className="hover:bg-white/20 p-1 rounded-full"><XCircle size={20} /></button>
                            </div>
                            <div className="flex-grow p-4 overflow-y-auto bg-gray-50 space-y-4">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full flex-shrink-0 border border-gray-200 shadow-sm overflow-hidden bg-white">
                                                <img src="https://ik.imagekit.io/mygopen/myhead.png" alt="阿麥" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                        {msg.role === 'user' ? (
                                            <div className="relative group max-w-[85%] mb-4 flex-shrink-0">
                                                <div className={`rounded-2xl px-4 py-2 pr-10 pb-5 whitespace-pre-wrap break-words text-sm shadow-lg bg-brand-red text-white rounded-br-none`}>
                                                    {msg.content}
                                                    {msg.imageUrl && (
                                                        <img
                                                            src={msg.imageUrl}
                                                            alt="上傳的截圖"
                                                            className="mt-2 max-h-36 rounded-xl border border-white/40 bg-white object-contain"
                                                        />
                                                    )}
                                                </div>
                                                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex-shrink-0 bg-white p-1 shadow-2xl border border-gray-100 opacity-90 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="w-full h-full bg-gray-200 rounded-full flex items-center justify-center text-gray-500">
                                                        <User size={20} />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`max-w-[75%] flex flex-col gap-2`}>
                                                <div className={`rounded-2xl px-4 py-2 whitespace-pre-wrap break-words text-sm shadow-sm bg-white text-gray-700 border border-gray-200 rounded-bl-none`}>
                                                    {msg.content}
                                                </div>
                                                
                                                {/* 👇 新增：如果這則訊息有夾帶貼圖，就會渲染在這裡 👇 */}
                                                {msg.sticker && (
                                                    <div className="mt-1 animate-fade-in">
                                                        <img 
                                                            src={msg.sticker} 
                                                            alt="阿麥貼圖" 
                                                            className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-md" 
                                                        />
                                                    </div>
                                                )}

                                                {msg.action && msg.action.type === 'report' && (
                                                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 shadow-sm w-full animate-fade-in">
                                                        <div className="flex items-center gap-1.5 mb-2">
                                                            <ShieldZap size={16} className="text-red-600" />
                                                            <span className="text-red-800 font-bold text-xs">要阿麥幫你檢舉這個網址嗎？</span>
                                                        </div>
                                                        {reportedUrls.includes(msg.action.url) ? (
                                                            <div className="text-gray-500 text-xs font-bold flex items-center justify-center gap-1 bg-gray-200 py-1.5 rounded-lg"><CheckCircle size={14}/> 這個網址已檢舉通報中</div>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleBotReportAction(msg.action.url)}
                                                                disabled={isReportingBot}
                                                                className={`w-full py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm flex items-center justify-center gap-1 ${isReportingBot ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95'}`}
                                                            >
                                                                {isReportingBot ? <><RefreshCw size={14} className="animate-spin" /> 通報中...</> : <><Flag size={14} /> 立即協助檢舉</>}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="flex gap-2 justify-start items-center">
                                        <div className="w-8 h-8 rounded-full flex-shrink-0 border border-gray-200 shadow-sm overflow-hidden bg-white">
                                            <img src="https://ik.imagekit.io/mygopen/myhead.png" alt="阿麥" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="text-gray-400 text-xs px-2 animate-pulse bg-white border border-gray-200 rounded-2xl rounded-tl-none py-2 shadow-sm">
                                            阿麥思考中...
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                            <div className="bg-white border-t border-gray-100 rounded-b-2xl flex flex-col">
                                <form onSubmit={handleSend} className="p-3 flex gap-2 items-center">
                                    <div className="relative flex-shrink-0">
                                        <input type="file" accept="image/*" className="hidden" id="bot-image-upload" onChange={handleBotImageUpload} disabled={isTyping} />
                                        <label htmlFor="bot-image-upload" className={`p-2 bg-gray-100 text-gray-500 hover:text-brand-red rounded-full cursor-pointer transition-all flex items-center justify-center border border-transparent hover:border-brand-red/30 ${isTyping ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-light'}`} title="上傳可疑截圖"><Camera size={20} /></label>
                                    </div>
                                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="貼網址、傳截圖或問問題..." className="flex-grow bg-gray-100 px-4 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-red/30 text-sm" disabled={isTyping} />
                                    <button type="submit" disabled={!input.trim() || isTyping} className="bg-brand-red text-white p-2 rounded-full hover:bg-brand-darkRed disabled:opacity-50 transition flex-shrink-0 shadow-sm"><ArrowRight size={18} /></button>
                                </form>
                                <div className="pb-3 px-4 text-center text-[10px] text-gray-400 select-none">
                                    免責聲明：阿麥的回答由 AI 生成，僅供防詐參考，務必自行查證且勿隨意提供個資。
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'closed' && (
                        <div className="relative group flex flex-col items-center">
                            <div className="relative bg-white text-gray-800 px-5 py-2.5 rounded-full shadow-lg text-sm whitespace-nowrap font-bold mb-4 opacity-95 group-hover:opacity-100 transition-opacity animate-bubble-bounce">
                                問我問我
                                <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                            </div>
                            <button onClick={() => setView('welcome')} className="w-16 h-16 md:w-24 md:h-24 rounded-full shadow-2xl hover:scale-110 transition-all border-4 border-white p-1 bg-white focus:outline-none z-50">
                                <img src="https://ik.imagekit.io/mygopen/callme.png" alt="MyGoPen Cute Lion" className="w-full h-full rounded-full object-contain" />
                            </button>
                        </div>
                    )}
                </div>
            );
        };

        // =========================================================================
        // 🛡️ 主程式 App 元件
        // =========================================================================
        const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        let tesseractLoadPromise = null;

        const loadTesseract = () => {
            if (window.Tesseract) return Promise.resolve(window.Tesseract);
            if (tesseractLoadPromise) return tesseractLoadPromise;

            tesseractLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = TESSERACT_CDN_URL;
                script.async = true;
                script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract.js 載入失敗'));
                script.onerror = () => reject(new Error('Tesseract.js 載入失敗'));
                document.head.appendChild(script);
            });

            return tesseractLoadPromise;
        };

        const normalizeOcrUrlText = (text) => String(text || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[：]/g, ':')
            .replace(/[／]/g, '/')
            .replace(/[．。]/g, '.')
            .replace(/[–—−]/g, '-')
            .replace(/https?:\s*\/\s*\//gi, match => match.toLowerCase().startsWith('https') ? 'https://' : 'http://')
            .replace(/([A-Za-z0-9])-\s*\n\s*([A-Za-z0-9])/g, '$1-$2')
            .replace(/([A-Za-z0-9./?&_=:%#-])\s*\n\s*([A-Za-z0-9])/g, '$1$2');

        const stripOcrTargetPunctuation = (value) => String(value || '')
            .trim()
            .replace(/^[<([{「『【]+/, '')
            .replace(/[>),.，。；;:」』】\]]+$/g, '');

        const dedupeOcrTargets = (items) => {
            const seen = new Set();
            return items
                .map(stripOcrTargetPunctuation)
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        };

        const extractOcrTargets = (text) => {
            const normalized = normalizeOcrUrlText(text);
            const targets = [];
            const add = (value) => {
                const cleaned = stripOcrTargetPunctuation(value);
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

            return dedupeOcrTargets(targets);
        };

        const pickPrimaryOcrTarget = (targets) => {
            if (!targets.length) return '';
            return targets.find(item => /^https?:\/\//i.test(item)) || targets.find(item => !item.includes('@')) || '';
        };

        const App = () => {
            const [isImageAnalyzing, setIsImageAnalyzing] = useState(false);
            const [aiReport, setAiReport] = useState(null);
            const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
            const [screenshotSource, setScreenshotSource] = useState(null);
            const [brandAnalysis, setBrandAnalysis] = useState(null);
            const [isBrandAnalyzing, setIsBrandAnalyzing] = useState(false);
            const [loadingMessage, setLoadingMessage] = useState('分析中...');
            const [aiCopyStatus, setAiCopyStatus] = useState('idle');
            const [showDetails, setShowDetails] = useState(false);

            const handleCopyAiReport = () => {
                if (!aiReport) return;
                const report = `【截圖防詐 AI 分析報告】\n----------------------\n${aiReport}\n----------------------\n※ 分析結果由 AI 提供，請保持警覺，切勿隨意提供個資或匯款。`;
                const textArea = document.createElement("textarea");
                textArea.value = report; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                try { if (document.execCommand('copy')) { setAiCopyStatus('copied'); setTimeout(() => setAiCopyStatus('idle'), 3000); } else alert('複製失敗'); }
                catch (err) { alert('複製失敗'); } document.body.removeChild(textArea);
            };

            const handleImageUpload = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const MAX_FILE_SIZE = 3 * 1024 * 1024;
                if (file.size > MAX_FILE_SIZE) { setError('圖片檔案過大 (超過3MB)，請裁切或壓縮後再上傳。'); if(e.target.value !== undefined) e.target.value = ''; return; }
                setResult(null); setAiReport(null); setScreenshotSource(null); setError(''); setIsImageAnalyzing(true); setLoadingMessage('正在先用本機 OCR 尋找截圖中的網址...');
                if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
                const imagePreviewUrl = URL.createObjectURL(file);
                setUploadedImageUrl(imagePreviewUrl);
                try {
                    try {
                        const Tesseract = await loadTesseract();
                        const ocrResult = await Tesseract.recognize(file, 'eng', {
                            logger: (m) => {
                                if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                                    setLoadingMessage(`正在辨識截圖網址... ${Math.round(m.progress * 100)}%`);
                                }
                            }
                        });
                        const ocrTargets = extractOcrTargets(ocrResult?.data?.text || '');
                        const primaryTarget = pickPrimaryOcrTarget(ocrTargets);

                        if (primaryTarget) {
                            setLoadingMessage('已從截圖找到網址，正在進行網址風險檢測...');
                            setUrl(primaryTarget);
                            const ocrScreenshotSource = {
                                imageUrl: imagePreviewUrl,
                                detectedUrl: primaryTarget,
                                source: 'ocr'
                            };
                            setScreenshotSource(ocrScreenshotSource);
                            if (typeof gtag === 'function') gtag('event', 'image_ocr_url_detected', { 'status': 'success', 'target_type': primaryTarget.includes('@') ? 'email' : 'url' });
                            setIsImageAnalyzing(false);
                            await handleScan(null, primaryTarget, ocrScreenshotSource);
                            return;
                        }

                        if (typeof gtag === 'function') gtag('event', 'image_ocr_url_detected', { 'status': 'not_found' });
                    } catch (ocrErr) {
                        console.log('本機 OCR 未能完成，改用 AI 截圖分析', ocrErr);
                        if (typeof gtag === 'function') gtag('event', 'image_ocr_url_detected', { 'status': 'fallback' });
                    }

                    setLoadingMessage('OCR 未找到明確網址，改用 AI 辨識截圖內容...');
                    const formData = new FormData(); formData.append('image', file);
                    const response = await fetch('/api/cf-vision', { method: 'POST', body: formData });
                    const data = await response.json();
                    if (!response.ok || data.error) throw new Error(data.details || data.error || '伺服器發生錯誤');
                    setAiReport(data.report);
                    if (typeof gtag === 'function') gtag('event', 'image_analyze', { 'status': 'success', 'file_size': file.size });
                } catch (err) { setError('圖片分析失敗：' + err.message); } finally { setIsImageAnalyzing(false); setLoadingMessage('分析中...'); }
            };

            const [url, setUrl] = useState('');
            const [loading, setLoading] = useState(false);
            const [result, setResult] = useState(null);
            const [error, setError] = useState('');
            const [copyStatus, setCopyStatus] = useState('idle');
            const [externalWhitelist, setExternalWhitelist] = useState([]);
            const resultRef = useRef(null);

            const [isReporting, setIsReporting] = useState(false);
            const [reportedUrls, setReportedUrls] = useState(() => {
                try { return JSON.parse(localStorage.getItem('userReportedUrls')) || []; } catch { return []; }
            });

            const handleReport = async () => {
                if (!result || isReporting) return;
                if (isOfficialTaiwanGovDomain(result.domain)) {
                    alert('這是台灣政府官方網域，不提供檢舉通報。');
                    return;
                }
                setIsReporting(true);
                try {
                    // 👇 彙整所有風險指標，產生更詳細的報告原因
                    const warnings = [];
                    if (result.blocklistListed) warnings.push('此網址已列入詐騙黑名單');
                    
                    // 遍歷所有檢查項目，將非 safe 且非 info 的警告加入
                    Object.values(result.checks).forEach(check => {
                        if (check.status === 'danger' || check.status === 'warning') {
                            // 只取第一行，避免過長的 AI 分析文字破壞排版
                            warnings.push(check.details.split('\n')[0]);
                        }
                    });

                    // 去除重複項目並組合
                    const uniqueWarnings = [...new Set(warnings)];
                    const reportUrl = result.rawUrl || result.inputUrl || result.scannedUrl;
                    const reportSanitizedUrl = result.sanitizedUrl || result.scannedUrl;
                    const reportRemovedParams = result.removedParams || [
                        ...(result.removedTrackingParams || []),
                        ...(result.removedVolatileParams || [])
                    ];
                    const detailedAnalysis = `\n原因：\n${uniqueWarnings.map(w => '- ' + w).join('\n')}\n\n[URL 稽核]\n原始URL：${reportUrl}\n掃描URL：${reportSanitizedUrl}${reportRemovedParams.length ? `\n移除參數：${reportRemovedParams.join(', ')}` : ''}`;

                    const res = await fetch('/api/report', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ 
                            url: reportUrl,
                            rawUrl: reportUrl,
                            sanitizedUrl: reportSanitizedUrl,
                            removedParams: reportRemovedParams,
                            riskScore: result.riskScore, 
                            aiAnalysis: detailedAnalysis 
                        }) 
                    });
                    
                    const data = await res.json();
                    if (data.success) {
                        const newReported = [...reportedUrls, reportUrl]; setReportedUrls(newReported); localStorage.setItem('userReportedUrls', JSON.stringify(newReported));
                        if (data.isDuplicate) alert('感謝您的熱心！這個網址已經有其他人搶先通報囉，我們已為您標記為通報狀態 🛡️');
                    } else {
                        let errMsg = '系統異常'; if (typeof data.error === 'string') errMsg = data.error; else if (data.error && typeof data.error === 'object') errMsg = data.error.message || JSON.stringify(data.error);
                        alert(`通報失敗 (狀態碼: ${data.status || '未知'})：\n${errMsg}`);
                    }
                } catch (err) { alert('通報發生網路錯誤，請稍後再試。\n' + err.message); } finally { setIsReporting(false); }
            };

            const handleImageReport = async (targetUrl) => {
                if (!targetUrl || isReporting) return;
                setIsReporting(true);
                try {
                    const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: targetUrl, rawUrl: targetUrl, sanitizedUrl: targetUrl, removedParams: [], riskScore: 100, aiAnalysis: "此為使用者透過「截圖 AI 分析」辨識出之高風險網址" }) });
                    const data = await res.json();
                    if (data.success) {
                        const newReported = [...reportedUrls, targetUrl]; setReportedUrls(newReported); localStorage.setItem('userReportedUrls', JSON.stringify(newReported));
                        if (data.isDuplicate) alert('感謝您的熱心！這個網址已經有其他人搶先通報囉，我們已為您標記為通報狀態 🛡️');
                    } else {
                        let errMsg = '系統異常'; if (typeof data.error === 'string') errMsg = data.error; else if (data.error && typeof data.error === 'object') errMsg = data.error.message || JSON.stringify(data.error);
                        alert(`通報失敗 (狀態碼: ${data.status || '未知'})：\n${errMsg}`);
                    }
                } catch (err) { alert('通報發生網路錯誤，請稍後再試。\n' + err.message); } finally { setIsReporting(false); }
            };

            useEffect(() => {
                const params = new URLSearchParams(window.location.search);
                const sharedUrl = params.get('url'); const sharedText = params.get('text');
                const incomingData = (sharedUrl || '') + ' ' + (sharedText || '');
                const urlMatch = incomingData.match(/https?:\/\/[^\s]+/i) || incomingData.match(/[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/i);
                if (urlMatch) {
                    const extracted = urlMatch[0]; setUrl(extracted); window.history.replaceState({}, document.title, "/"); handleScan(null, extracted);
                }
            }, []);

            useEffect(() => {
                const handlePaste = (e) => {
                    if (isImageAnalyzing || loading) return;
                    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                    let imageFile = null;
                    for (let index in items) {
                        const item = items[index];
                        if (item.kind === 'file' && item.type.startsWith('image/')) { imageFile = item.getAsFile(); break; }
                    }
                    if (imageFile) {
                        const fakeEvent = { target: { files: [imageFile], value: '' } };
                        handleImageUpload(fakeEvent);
                    }
                };
                document.addEventListener('paste', handlePaste);
                return () => { document.removeEventListener('paste', handlePaste); };
            }, [isImageAnalyzing, loading]);

            useEffect(() => {
                fetch('./whitelist.json')
                    .then(res => readJsonSafely(res, { domains: [] }))
                    .then(data => setExternalWhitelist(data.domains || []))
                    .catch(() => setExternalWhitelist([]));
            }, []);



                const handleScan = async (e, directUrl = null, sourceContext = null) => {
                if (e) e.preventDefault(); // 讓 e 變成選填
                const inputUrl = directUrl || url.trim(); // 優先使用傳入的網址
                if (!inputUrl) { setError('請輸入網址'); return; }
                const parsedInput = parseUserUrl(inputUrl);
                if (!parsedInput.ok) {
                    setError('請輸入有效網址，需包含正確網域（例如 example.com 或 hnjz.sqkszxt.online）');
                    return;
                }
                const urlObj = parsedInput.url;
                const sanitizedForRisk = sanitizeUrlForRiskScoring(parsedInput.href);
                const riskScoringUrl = sanitizedForRisk.href;
                const urlToParse = riskScoringUrl;

                let loadingTimer = null;

                try {
                    setError('');
                    setLoading(true);
                    setResult(null);
                    setCopyStatus('idle');
                    setAiReport(null);
                    const matchedScreenshotSource = sourceContext ||
                        (screenshotSource && screenshotSource.detectedUrl === inputUrl ? screenshotSource : null);
                    setScreenshotSource(matchedScreenshotSource);
                    setIsImageAnalyzing(false);
                    setBrandAnalysis(null);
                    setIsBrandAnalyzing(true);
                    setShowDetails(false);

                    // UX 動態文案
                    const progressMessages = [
                        "🔍 正在連線至目標網站...",
                        "啟動 AI 深度檢測與畫面渲染...",
                        "正在交叉比對官方資料庫...",
                        "網站防護較嚴，請再稍等..."
                    ];
                    let msgIndex = 0;
                    setLoadingMessage(progressMessages[0]);

                    loadingTimer = setInterval(() => {
                        msgIndex++;
                        if (msgIndex < progressMessages.length) setLoadingMessage(progressMessages[msgIndex]);
                    }, 1500);

                    if (document.activeElement) document.activeElement.blur();

                    // 👇 判斷輸入網址是否為社群平台
                    const isSocialInput = getRiskList('socialMediaDomains').some(s => urlObj.hostname === s || urlObj.hostname.endsWith('.' + s));
                    const skipAiBrandAnalysis = shouldSkipAiBrandAnalysis(urlObj.hostname, externalWhitelist);

                    // 平行處理
                    const [scanData, brandDataRes] = await Promise.all([
                        simulateScan(urlObj.hostname, riskScoringUrl, externalWhitelist, sanitizedForRisk),
                        // 👇 如果是社群或台灣政府網址，直接跳過後端 AI 品牌分析，避免誤覆寫官方網域
                        (isSocialInput || skipAiBrandAnalysis)
                            ? Promise.resolve(null) 
                            : withTimeout(fetchJsonSafely(`/api/check-fake-brand?url=${encodeURIComponent(urlToParse)}`, null), 7000, null)
                    ]);
                    scanData.inputUrl = parsedInput.href;
                    scanData.sanitizedUrl = riskScoringUrl;
                    scanData.removedTrackingParams = sanitizedForRisk.removedTrackingParams;
                    scanData.removedVolatileParams = sanitizedForRisk.removedVolatileParams;
                    scanData.removedParams = sanitizedForRisk.removedParams;

                    // 👇 新增防呆：如果網域已經掛掉或不存在 (isInvalid)，就不需要把 AI 結果塞進去，避免程式崩潰
                    if (!scanData.isInvalid) {
                        // 根據 AI 分析結果，動態更新 UI 卡片結論
                        if (!skipAiBrandAnalysis && brandDataRes) {
                            if (brandDataRes.isGenericScam) {
                                scanData.riskScore = 100;
                                scanData.checks.domainAnalysis.status = 'danger';
                                scanData.checks.domainAnalysis.details = brandDataRes.warningMessage;
                                scanData.checks.siteContent.status = 'danger';
                                scanData.checks.siteContent.details = 'AI 判定網頁內容具備強烈的「通用型詐騙」話術與特徵';
                            }
                            else if (brandDataRes.isFakeBrand) {
                                // 1. 發現是假冒網站
                                scanData.riskScore = 100;
                                scanData.checks.domainAnalysis.status = 'danger';
                                scanData.checks.domainAnalysis.details = brandDataRes.warningMessage;
    
                                scanData.checks.siteContent.status = 'danger';
                                // ⚠️ 假冒網站時保留具體名稱，明確警告使用者它想騙你以為它是誰
                                scanData.checks.siteContent.details = `AI 判定網頁內容具備高度釣魚特徵 (企圖冒用 ${brandDataRes.detectedBrand})`;
                            }
                            // 👇 改善點 3：如果系統已抓到寄生跳板，強制覆蓋 AI 的安全判定
                            else if (scanData.riskScore === 100 && scanData.checks.domainAnalysis.details.includes('跳板')) {
                                scanData.checks.siteContent.status = 'danger';
                                scanData.checks.siteContent.details = '系統已鎖定其惡意轉址或隱匿行為 (詐騙集團試圖規避掃描)';
                            }
                            else if (brandDataRes.detectedBrand && brandDataRes.officialDomain && scanData.riskScore < 70) {
                                // 2. 發現是真正的官方網站
                                scanData.checks.siteContent.status = 'safe';
                                scanData.checks.siteContent.details = 'AI 確認此為正規之官方網站內容';
                            } else if (brandDataRes.detectedBrand && !brandDataRes.officialDomain) {
                                // 3. 系統漏洞修補：AI 抓到品牌，但後端無法在資料庫驗證該品牌網域
                                scanData.checks.siteContent.status = 'info';
                                scanData.checks.siteContent.details = 'AI 偵測到此為特定品牌特徵';
                            } else {
                                // 4. 沒有發現明顯偽裝的普通網站 (Unknown)
                                scanData.checks.siteContent.status = 'safe';
                                scanData.checks.siteContent.details = 'AI 分析完畢，未發現冒用知名品牌之釣魚特徵';
                            }
                        } else if (!isSocialInput && !skipAiBrandAnalysis) {
                            // AI API 連線失敗時的備用文字 (排除社群網站)
                            scanData.checks.siteContent.status = 'info';
                            scanData.checks.siteContent.details = '網頁內容已讀取 (AI 引擎暫時無回應)';
                        }
                    }

                    enforceFinalRiskConsistency(scanData);
                    setBrandAnalysis(brandDataRes);
                    setResult(scanData);

                    // 👇 新增：每次查詢完畢，自動背景通報正常與詐騙的判斷指標 (排除 Email)
                    if (!scanData.isInvalid && !scanData.isSocialMedia && !inputUrl.includes('@')) {
                        sendAutoReport(urlObj.href, scanData, brandDataRes, '首頁檢測', reportedUrls, setReportedUrls);
                    }

                    // 👇 新增：GA4 網址檢測行為追蹤
                    if (typeof gtag === 'function') {
                        gtag('event', 'url_check', {
                            'target_domain': urlObj.hostname,      // 民眾查的網域
                            'risk_score': scanData.riskScore,       // 系統判定的風險分數
                            'is_blocked': scanData.blocklistListed ? 'yes' : 'no', // 是否在黑名單內
                            'detected_brand': brandDataRes?.detectedBrand || 'none' // AI 偵測到的品牌
                        });
                    }

                } catch (err) {
                    // 👇 修正：把真實的錯誤印在開發者 Console，並給予更精準的 UI 提示
                    console.error("系統檢測異常:", err);
                    setError('網址格式已通過檢查，但系統檢測暫時失敗，請稍後再試一次。');
                } finally {
                    if (loadingTimer) clearInterval(loadingTimer);
                    setLoading(false);
                    setIsBrandAnalyzing(false);
                    setLoadingMessage('分析中...');
                }
            };

            const handleCopyReport = () => {
                if (!result) return;
                
                // 👇 複製報告時，也要考慮社群網站的特殊狀態
                let riskLevel = result.riskScore >= 70 ? '🔴 高度風險' : (result.riskScore >= 30 ? '⚠️ 中度風險' : '✅ 低度風險');
                if (result.isSocialMedia) {
                    riskLevel = '⚠️ 無法自動掃描 (社群平台)';
                }

                const warnings = [];
                if (result.blocklistListed) warnings.push('⚠️ 此網址已列入詐騙黑名單！');
                
                // 👇 社群專屬警告
                if (result.isSocialMedia) {
                    warnings.push('⚠️ 這是社群平台，我們無法看到裡面的貼文，要多加小心留意！');
                }

                if (result.checks.domainAnalysis.status === 'danger') {
                    if (result.domain.includes('-tw') || result.domain.includes('-com') || result.domain.includes('-online')) warnings.push('⚠️ 網域包含 "-tw", "-com" 或 "-online" 偽裝字樣，風險極高');
                    else if (result.domain.includes('gov') && !result.domain.endsWith('.gov') && !result.domain.endsWith('.gov.tw')) warnings.push('⚠️ 網域偽造政府機關 (gov)，極高風險');
                    else if ((result.domain.match(/-/g) || []).length >= 2) warnings.push('⚠️ 網域包含多個連字號 (-)，極高機率為詐騙');
                } else if (result.checks.domainAnalysis.status === 'warning' && !result.isSocialMedia) warnings.push('⚠️ 使用免費架站平台，風險較高');
                
                if (result.details.siteStatus.status === 'blank' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站內容異常空白或極少 (高風險)');
                if (result.details.siteStatus.status === 'error' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push(`⚠️ 網站無法正常存取 (${result.details.siteStatus.code || 'Connection Error'})`);
                if (result.details.siteStatus.status === 'unknown' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站無法被正常讀取 (疑似阻擋)');
                if (result.details.siteStatus.status === 'blocked' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站啟用防爬蟲或 WAF，無法被正常讀取');
                if (result.details.siteStatus.hasIframe) warnings.push('⚠️ 偵測到 Iframe 隱藏框架');
                if (result.checks.apkCheck.status === 'danger') warnings.push(`⚠️ ${result.checks.apkCheck.details}`);
                if (result.checks.securityHeaders?.status === 'danger') warnings.push('⚠️ 缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭');
                if (result.checks.mxRecords?.status === 'danger') warnings.push('⚠️ 網域未設定 MX 郵件紀錄');
                if (result.checks.registrationPeriod?.status === 'danger') warnings.push('⚠️ 新網域且註冊週期約 1 年，具備短期棄置風險');
                else if (result.checks.age.status === 'danger') warnings.push('⚠️ 網域註冊時間極新，具備高風險');
                if (result.checks.disposableDomain?.status === 'danger') warnings.push(`⚠️ ${result.checks.disposableDomain.details}`);
                if (result.checks.entropy.status === 'warning') warnings.push('⚠️ 網域名稱亂碼 (高風險特徵)');
                if (result.checks.redirect.status !== 'safe') warnings.push(`⚠️ 網站存在轉址行為 (${result.checks.redirect.details})`);
                if (result.checks.whoisPrivacy.status !== 'safe' && !result.isSocialMedia) warnings.push('⚠️ WHOIS 身份已隱藏');
                if (result.checks.registrar.status === 'warning') warnings.push(`⚠️ 註冊商信譽不佳 (${result.checks.registrar.details.split(' ')[1]})`);
                if (result.checks.subdomain.status === 'danger') warnings.push('⚠️ 子網域層級過深 (≥ 5層)，極高風險');
                else if (result.checks.subdomain.status === 'warning') warnings.push('⚠️ 子網域層級過深 (常見詐騙特徵)');
                if (result.checks.params.status === 'danger') warnings.push('⚠️ 包含敏感參數 (token/auth/session)');
                
                const report = `【幫你查好囉！網址檢測結果】\n----------------------\n🔍 幫你查了這個網址：${result.domain}\n🛡️ 目前的風險評估是：${riskLevel}\n----------------------\n${warnings.length > 0 ? `🛑 覺得怪怪的地方：\n${warnings.map(w => w).join('\n')}\n----------------------\n` : ''}請務必保持警覺，切勿隨意輸入個資🙏`;
                const textArea = document.createElement("textarea");
                textArea.value = report; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                try { if (document.execCommand('copy')) { setCopyStatus('copied'); setTimeout(() => setCopyStatus('idle'), 3000); } else alert('複製失敗，請手動複製'); }
                catch (err) { alert('複製失敗，請手動複製'); } document.body.removeChild(textArea);
            };

            useEffect(() => { if (result && resultRef.current) setTimeout(() => resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }, [result]);

            return (
                <div className="flex flex-col min-h-screen">
                    <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm bg-opacity-95 backdrop-blur-sm"><div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between"><a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity"><img src="https://ik.imagekit.io/mygopen/menu-logo.png?updatedAt=1767058877480" alt="麥擱騙 Logo" className="h-8" /><h1 className="font-bold text-lg md:text-xl text-gray-800 tracking-tight">麥擱騙｜詐騙網址幫你查</h1></a><div className="text-xs text-gray-400 font-medium hidden md:block">v2.2.8 AI 偵測引擎</div></div></header>
                    <main className="flex-grow flex flex-col items-center justify-start pt-8 pb-12 px-4 md:pt-16 md:px-6"><div className="w-full max-w-3xl">
                        <div className="text-center mb-10 md:mb-12 animate-fade-in"><h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">遠離網路詐騙<br className="md:hidden" /><span className="text-brand-red">從檢查網址開始</span></h2><p className="text-gray-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">輸入網址，即時分析網站特徵、流量與黑名單資料庫，保護個資安全。</p></div>
                        <div className="bg-white rounded-2xl shadow-soft p-2 md:p-3 mb-8 transform transition-all hover:shadow-lg border border-gray-100">




                            <form onSubmit={handleScan} className="flex flex-col md:flex-row gap-2">
                                <div className="relative flex-grow group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Search className="text-gray-400 group-focus-within:text-brand-red transition-colors" size={20} />
                                    </div>

                                    {/* [修改] pr-14 改為 pr-16，預留更多空間給按鈕 */}
                                    <input type="text" className="w-full pl-12 pr-16 py-4 md:py-4 bg-gray-50 border-transparent focus:bg-white rounded-xl focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-base md:text-lg placeholder-gray-400" placeholder="貼上網址或上傳可疑截圖" value={url} onChange={(e) => setUrl(e.target.value)}

                                        // 👇 新增：點擊時自動向上捲動，並標記鍵盤已開啟
                                        onFocus={(e) => {
                                            document.body.classList.add('keyboard-open');
                                            // 延遲一點執行捲動，等鍵盤彈出
                                            setTimeout(() => {
                                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }, 300);
                                        }}

                                        // 👇 新增：離開輸入框時移除補償空間
                                        onBlur={() => {
                                            document.body.classList.remove('keyboard-open');
                                        }}

                                        onFocus={(e) => e.target.select()} />

                                    {/* [修改] pr-3 改為 pr-2.5，並為 label 加上明顯但不突兀的背景色、邊框與圓角 */}
                                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            id="image-upload"
                                            onChange={handleImageUpload}
                                        />
                                        <label htmlFor="image-upload" className="p-2.5 bg-gray-100 hover:bg-brand-light text-gray-500 hover:text-brand-red rounded-lg cursor-pointer transition-all border border-gray-200 shadow-sm active:scale-95" title="上傳截圖讓 AI 幫你判斷">
                                            <Camera size={22} />
                                        </label>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || isImageAnalyzing}
                                    className={`px-8 py-4 rounded-xl font-bold text-white shadow-md flex justify-center items-center transition-all active:scale-95 md:w-auto w-full text-lg ${loading || isImageAnalyzing ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-red hover:bg-brand-darkRed shadow-glow'}`}
                                >
                                    {loading || isImageAnalyzing ? (
                                        <span className="flex items-center gap-2">
                                            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            {isImageAnalyzing ? '分析中...' : loadingMessage}
                                        </span>
                                    ) : '立即檢測'}
                                </button>

                            </form>


                        </div>
                        {error && <div className="text-center animate-fade-in mb-6"><span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-medium border border-red-100"><AlertTriangle size={14} /> {error}</span></div>}
                        {!result && !loading && !isImageAnalyzing && !aiReport && <div className="grid grid-cols-4 gap-1 md:gap-4 mt-6 opacity-60"><div className="flex flex-col items-center text-center p-1 md:p-4"><div className="bg-blue-50 p-2 md:p-3 rounded-full text-blue-500 mb-2"><Github size={22} /></div><span className="text-[10px] md:text-xs font-medium text-gray-500">開源黑名單</span></div><div className="flex flex-col items-center text-center p-1 md:p-4"><div className="bg-purple-50 p-2 md:p-3 rounded-full text-purple-500 mb-2"><Server size={22} /></div><span className="text-[10px] md:text-xs font-medium text-gray-500">主機位置</span></div><div className="flex flex-col items-center text-center p-1 md:p-4"><div className="bg-orange-50 p-2 md:p-3 rounded-full text-orange-500 mb-2"><Activity size={22} /></div><span className="text-[10px] md:text-xs font-medium text-gray-500">流量異常</span></div><div className="flex flex-col items-center text-center p-1 md:p-4"><div className="bg-green-50 p-2 md:p-3 rounded-full text-green-500 mb-2"><Layout size={22} /></div><span className="text-[10px] md:text-xs font-medium text-gray-500">偽裝偵測</span></div></div>}


                        {/* AI 圖片分析載入中狀態 */}
                        {isImageAnalyzing && (
                            <div className="mt-12 text-center text-gray-500 animate-pulse">
                                {/* [修改] 將 ImageIcon 改為 Camera */}
                                <Camera size={48} className="mx-auto mb-3 opacity-50 text-brand-red" />
                                <p className="font-bold text-lg md:text-xl text-gray-800">AI 正在仔細辨識截圖內容...</p>
                                <p className="text-sm mt-2">這可能需要幾秒鐘的時間，請稍候</p>
                            </div>
                        )}

                        {/* AI 圖片分析完成結果 */}
                        {aiReport && !isImageAnalyzing && (
                            <div className="mt-8 animate-slide-up bg-white rounded-3xl shadow-soft p-6 md:p-8 border border-red-200 w-full">
                                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                    <ShieldAlert size={28} className="text-red-600" />
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-800">截圖防詐 AI 分析報告</h3>
                                </div>


                                {/* 👇 新增的排版：分為左右兩塊 (手機版會變成上下) */}
                                <div className="flex flex-col md:flex-row gap-6 mb-6">
                                    
                                    {/* 左側/上側：顯示縮圖 */}
                                    {uploadedImageUrl && (
                                        <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col items-center justify-start">
                                            <div className="w-full rounded-2xl overflow-hidden border-4 border-gray-100 shadow-sm relative group">
                                                {/* 讓圖片維持比例，最大高度限制避免把版面撐破 */}
                                                <img src={uploadedImageUrl} alt="上傳的截圖" className="w-full max-h-64 md:max-h-80 object-contain bg-gray-50" />
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                    <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">原始截圖</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

{/* 右側/下側：顯示 AI 的分析文字 */}
                                    <div className="w-full md:w-2/3 flex flex-col justify-start">
                                        {/* 👇 動態背景：如果有「高」風險就變紅底，有「中」就變黃底，不然就是綠底 */}
                                        <div className={`p-5 md:p-6 rounded-2xl text-gray-800 text-base md:text-lg leading-relaxed break-words break-all border shadow-sm font-medium h-full flex flex-col justify-center gap-3 ${aiReport.includes('高') ? 'bg-red-50 border-red-200' : (aiReport.includes('中') ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200')}`}>
                                            
                                            {aiReport.split('\n').map((line, i) => {
                                                // 1. 如果是「風險」那一行：字體加大加粗，並根據高低風險換顏色
                                                if (line.startsWith('⚠️ 風險：')) {
                                                    const isHigh = line.includes('高');
                                                    const isMedium = line.includes('中');
                                                    const textColor = isHigh ? 'text-red-700' : (isMedium ? 'text-yellow-700' : 'text-green-700');
                                                    return (
                                                        <div key={i} className={`${textColor} text-xl md:text-2xl font-black mb-1 pb-3 border-b border-gray-200/50 tracking-wide`}>
                                                            {line}
                                                        </div>
                                                    );
                                                }


// 2. 如果是我們的系統強制竄改插入的「系統警告」：用紅底標籤凸顯
                                                if (line.includes('🚨 系統警告：')) {
                                                    return (
                                                        <div key={i} className="text-red-700 font-bold bg-red-100/50 p-3 rounded-xl mt-1 text-sm md:text-base border border-red-200/50 shadow-inner">
                                                            {line}
                                                        </div>
                                                    );
                                                }
                                               // 👇 新增這段：如果是系統強制標記的中風險：用黃底標籤凸顯 👇
                                                if (line.includes('⚠️ 系統注意：')) {
                                                    return (
                                                        <div key={i} className="text-yellow-700 font-bold bg-yellow-100/50 p-3 rounded-xl mt-1 text-sm md:text-base border border-yellow-200/50 shadow-inner">
                                                            {line}
                                                        </div>
                                                    );
                                                }
                                                // 3. 針對洗白的系統驗證給予綠色標籤
                                                if (line.includes('✅ 系統驗證：')) {
                                                    return (
                                                        <div key={i} className="text-green-700 font-bold bg-green-100/50 p-3 rounded-xl mt-1 text-sm md:text-base border border-green-200/50 shadow-inner">
                                                            {line}
                                                        </div>
                                                    );
                                                }
                                                // 4. 針對 Email 寄件者的溫馨提醒，給予「藍色」的顯眼標籤
                                                if (line.includes('💡 溫馨提醒：')) {
                                                    return (
                                                        <div key={i} className="text-blue-700 font-bold bg-blue-100/50 p-3 rounded-xl mt-1 text-sm md:text-base border border-blue-200/50 shadow-inner">
                                                            {line}
                                                        </div>
                                                    );
                                                }
                                                
                                                return (
                                                    <div key={i} className="text-gray-700 leading-normal">
                                                        {line}
                                                    </div>
                                                );
                                            })}

                                        </div>
                                    </div>
                                </div>

                            {/* ================= 新增：截圖高風險專屬的檢舉通報區塊 ================= */}
                                {aiReport.includes('高風險') && (() => {
                                    // 利用正則表達式，把 AI 報告裡的網址精準抓出來
                                    const urlMatch = aiReport.match(/🔗 網址：(.*?)(?=\n|$)/);
                                    const extractedUrl = urlMatch ? urlMatch[1].trim() : null;
                                    
                                    // 👇 新增：如果包含 @ 符號，代表它是 Email，就將 hasValidUrl 設為 false 隱藏按鈕
                                    const hasValidUrl = extractedUrl && extractedUrl !== '無' && !extractedUrl.includes('None') && !extractedUrl.includes('@');
                                    
                                    // 如果沒有抓到實體網址，就不顯示檢舉按鈕
                                    if (!hasValidUrl) return null;

                                    return (
                                        <div className="mb-6 p-4 md:p-5 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <ShieldZap size={28} className="text-red-600 flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <h4 className="font-bold text-red-800 text-[15px] sm:text-base">協助打擊詐騙</h4>
                                                    <p className="text-xs sm:text-sm text-red-700 mt-0.5 truncate">要請 MyGoPen 幫你檢舉這個網址嗎？</p>
                                                    <p className="text-xs text-red-600 font-mono mt-1 font-bold truncate">{extractedUrl}</p>
                                                </div>
                                            </div>
                                            
                                            {reportedUrls.includes(extractedUrl) ? (
                                                <div className="px-4 py-2.5 bg-gray-200 text-gray-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-auto flex-shrink-0">
                                                    <CheckCircle size={18} /> 這個網址已檢舉通報中
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleImageReport(extractedUrl)}
                                                    disabled={isReporting}
                                                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-white shadow-sm flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0 transition-all ${isReporting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95'}`}
                                                >
                                                    {isReporting ? (
                                                        <><RefreshCw size={18} className="animate-spin" /> 通報中...</>
                                                    ) : (
                                                        <><Flag size={18} /> 立即協助檢舉</>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                                {/* ================= 截圖檢舉區塊結束 ================= */}

                                {/* 👇 新增的綠色複製按鈕 */}
                                <button
                                    onClick={handleCopyAiReport}
                                    className={`w-full py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all transform active:scale-95 text-lg shadow-sm ${aiCopyStatus === 'copied'
                                        ? 'bg-[#049b42] text-white'
                                        : 'bg-[#06C755] hover:bg-[#05b34c] text-white'
                                        }`}
                                >
                                    {aiCopyStatus === 'copied' ? (
                                        <><Check size={20} />已複製文字報告！</>
                                    ) : (
                                        <><Copy size={20} className="text-white" />一鍵複製檢測報告 (可貼至 LINE)</>
                                    )}
                                </button>

                                <p className="text-xs text-center text-gray-400 mt-6">
                                    本分析由 Meta Llama 4 Scout 提供技術支援，AI 判斷可能偶有誤差，結果僅供參考。
                                </p>
                            </div>
                        )}


                        {result && !loading && (
                            <div ref={resultRef} className="animate-slide-up space-y-6 pb-12"><div className="bg-white rounded-3xl shadow-soft overflow-hidden border border-gray-100"><div className="p-6 md:p-8">{result.isInvalid ? (<div className="text-center py-8"><div className="inline-block p-4 bg-gray-100 rounded-full mb-4 text-gray-400"><Search size={48} /></div><h3 className="text-2xl font-bold text-gray-800 mb-2">無法連結此網站</h3><p className="text-gray-500">{result.invalidMsg}</p></div>) : (<>
                                {screenshotSource && (
                                    <div className="mb-6 p-4 md:p-5 rounded-2xl border border-red-100 bg-red-50/70 flex flex-col md:flex-row gap-4 animate-fade-in">
                                        <div className="w-full md:w-36 flex-shrink-0">
                                            <div className="rounded-xl overflow-hidden border-2 border-white bg-white shadow-sm">
                                                <img src={screenshotSource.imageUrl} alt="剛剛上傳的截圖" className="w-full max-h-44 md:max-h-36 object-contain bg-gray-50" />
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
                                                <Camera size={18} className="flex-shrink-0" />
                                                <span>這個網址是從你剛剛上傳的截圖中辨識到的</span>
                                            </div>
                                            <div className="text-sm md:text-base text-gray-800 break-all font-semibold mb-2">
                                                {screenshotSource.detectedUrl}
                                            </div>
                                            <p className="text-xs md:text-sm text-red-700 leading-relaxed">
                                                提醒：截圖或訊息中看到的網址文字不一定等於實際點擊後的目的地。即使畫面顯示看起來正確的網址，也可能只是超連結顯示文字，點下去後仍被導向釣魚網站。
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6"><div><div className="text-sm text-gray-400 font-mono mb-1 tracking-wide uppercase">目標網域</div><h3 className="text-2xl md:text-3xl font-bold text-gray-800 break-all">{result.domain}</h3></div><div className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600"><Globe size={16} className="text-brand-red" /><span>伺服器: {result.details.serverCountry}</span></div></div>
                                <RiskMeter score={result.riskScore} />

                                {/* ================= 核心結論區塊 (精簡版) ================= */}
                                <div className={`mb-6 p-4 sm:p-5 md:p-8 rounded-2xl border-2 flex items-center gap-3 sm:gap-4 ${result.riskScore >= 70 ? 'bg-red-50 border-red-200' : (result.riskScore >= 30 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200')} shadow-sm`}>
                                    
                                    {/* 👇 根據風險等級，動態切換圖示與角色圖片 (手機版縮小為 w-10 h-10 節省空間) 👇 */}
                                    {result.isSocialMedia ? (
                                        <AlertTriangle size={40} className="text-yellow-600 flex-shrink-0 w-10 h-10 sm:w-10 sm:h-10 md:w-12 md:h-12" />
                                    ) : result.riskScore >= 70 ? (
                                        <img src="https://ik.imagekit.io/mygopen/danger.png" alt="危險警告" className="w-10 h-10 sm:w-12 sm:h-12 md:w-20 md:h-20 flex-shrink-0 object-contain" />
                                    ) : result.riskScore >= 30 ? (
                                        <AlertTriangle size={40} className="text-yellow-600 flex-shrink-0 w-10 h-10 sm:w-10 sm:h-10 md:w-12 md:h-12" />
                                    ) : (
                                        <img src="https://ik.imagekit.io/mygopen/safe02.png" alt="安全無虞" className="w-10 h-10 sm:w-12 sm:h-12 md:w-20 md:h-20 flex-shrink-0 object-contain" />
                                    )}
                                    <div className="min-w-0">
                                        {/* 👇 移除 whitespace-nowrap，加入 leading-snug 讓長句子可以自然換行且行距美觀 👇 */}
                                        <h3 className={`text-[1.15rem] sm:text-2xl md:text-3xl font-extrabold tracking-tight sm:tracking-wide leading-snug ${result.riskScore >= 70 ? 'text-red-800' : (result.riskScore >= 30 ? 'text-yellow-800' : 'text-green-800')}`}>
                                            {result.isSocialMedia ? '這是社群平台，我們無法看到裡面的貼文，要多加小心留意！' : (result.riskScore >= 70 ? '危險！請勿點擊或提供個資' : (result.riskScore >= 30 ? '警告！此網站存在風險' : '安全！未發現明顯風險'))}
                                        </h3>
                                    </div>
                                </div>

                                {result.checks.officialAlerts?.status === 'danger' && (
                                    <div className="mb-6 p-4 md:p-5 bg-red-50 border-2 border-red-300 rounded-2xl shadow-sm animate-fade-in">
                                        <div className="flex items-start gap-3">
                                            <ShieldAlert size={28} className="text-red-600 flex-shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <h4 className="font-extrabold text-red-800 text-lg md:text-xl mb-2">官方警示資料命中</h4>
                                                <p className="text-sm md:text-base text-red-800 leading-relaxed font-semibold">
                                                    {result.checks.officialAlerts.details}
                                                </p>
                                                {result.checks.officialAlerts.link && (
                                                    <a
                                                        href={result.checks.officialAlerts.link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 mt-3 text-sm font-bold text-red-700 hover:text-red-900 hover:underline break-all"
                                                    >
                                                        查看官方公告來源
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ================= 新增：高風險專屬的檢舉通報區塊 ================= */}
                                {result.riskScore >= 70 && !result.isSocialMedia && !isOfficialTaiwanGovDomain(result.domain) && !url.includes('@') && (
                                    <div className="mb-6 p-4 md:p-5 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
                                        <div className="flex items-center gap-3">
                                            <ShieldZap size={28} className="text-red-600 flex-shrink-0" />
                                            <div>
                                                <h4 className="font-bold text-red-800 text-[15px] sm:text-base">協助打擊詐騙</h4>
                                                <p className="text-xs sm:text-sm text-red-700 mt-0.5">要請 MyGoPen 幫你檢舉這個網址嗎？</p>
                                            </div>
                                        </div>
                                        
                                        {reportedUrls.includes(result.rawUrl || result.inputUrl || result.scannedUrl) ? (
                                            <div className="px-4 py-2.5 bg-gray-200 text-gray-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-auto">
                                                <CheckCircle size={18} /> 這個網址已檢舉通報中
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={handleReport}
                                                disabled={isReporting}
                                                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-white shadow-sm flex items-center justify-center gap-2 whitespace-nowrap transition-all ${isReporting ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95'}`}
                                            >
                                                {isReporting ? (
                                                    <><RefreshCw size={18} className="animate-spin" /> 通報中...</>
                                                ) : (
                                                    <><Flag size={18} /> 立即協助檢舉</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {/* ================= 新增結束 ================= */}

                                <a href={`https://www.google.com/search?q=${encodeURIComponent(result.domain + ' 是詐騙嗎？')}&num=10&udm=50`} target="_blank" rel="noopener noreferrer" className="w-full mt-3 py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all transform active:scale-95 text-lg shadow-md bg-[#4285F4] hover:bg-[#3367D6] text-white">
                                    <div className="bg-white p-1 rounded-full flex items-center justify-center"><GoogleIcon size={18} /></div>用 Google AI 再檢查看看
                                </a>

    

                                {/* ================= 新增：折疊面板 (Accordion) 按鈕 ================= */}
                                <div className="mt-8 mb-4">
                                    {/* 👇 手機版減少 padding (px-3 py-3)，字體設定為 text-[13px] 搭配緊密字距 👇 */}
                                    <button
                                        onClick={() => setShowDetails(!showDetails)}
                                        className="w-full flex items-center justify-between px-3 py-3 sm:px-6 sm:py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-xl transition-all border border-gray-200 shadow-sm active:scale-95 text-[13px] sm:text-base md:text-lg tracking-tighter sm:tracking-normal"
                                    >
                                        <span className="flex items-center gap-1.5 sm:gap-3 whitespace-nowrap">
                                            {/* 圖示在手機版也微調變小 */}
                                            <Search className="text-gray-500 flex-shrink-0 w-4 h-4 sm:w-[22px] sm:h-[22px]" />
                                            展開詳細技術分析報告 (資安專家模式)
                                        </span>
                                        <div className={`transform transition-transform duration-300 flex-shrink-0 ml-1 ${showDetails ? 'rotate-180' : ''}`}>
                                            <ChevronDown className="text-gray-500 w-5 h-5 sm:w-[24px] sm:h-[24px]" />
                                        </div>
                                    </button>
                                </div>

                                {/* ================= 隱藏的技術卡片區塊 ================= */}
                                {showDetails && (

                                    <div className="animate-fade-in mb-8">

                                        {/* 把跳轉紀錄貼到這裡，讓它在專家模式一展開時就顯示在最上方*/}
                                        {result.traceChain && result.traceChain.length > 1 && <TraceTimeline chain={result.traceChain} />}

                                        {/* 👇👇👇 貼到這裡！(我順便幫你微調了圓角與陰影，讓它在面板內更好看) 👇👇👇 */}
                                        {result.blocklistListed && (
                                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl mb-6 shadow-sm">
                                                <div className="flex gap-3">
                                                    <ShieldAlert className="text-red-600 flex-shrink-0" size={24} />
                                                    <div>
                                                        <p className="font-bold text-red-800">警告：已列入詐騙黑名單</p>
                                                        <p className="text-sm text-red-700 mt-1">此網址存在於反詐騙資料庫或自訂黑名單中，極高機率為惡意網站。</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* 👆👆👆 貼到這裡！👆👆👆 */}


                                        {/* 👇👇👇 將剛剛剪下的 AI 警告區塊，貼到這裡！ 👇👇👇 */}
                                        {brandAnalysis && brandAnalysis.isFakeBrand && (
                                            <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-xl mb-6 shadow-sm">
                                                <div className="flex gap-3">
                                                    <ShieldAlert className="text-red-600 flex-shrink-0" size={24} />
                                                    <div>
                                                        <h3 className="font-bold text-red-800 mb-1">🚨 AI 深度檢測：假冒網站</h3>
                                                        <p className="text-sm text-red-700 mb-2">此網頁企圖偽裝成「<strong className="text-red-900 bg-red-200 px-1 rounded">{brandAnalysis.detectedBrand}</strong>」。</p>
                                                        <div className="bg-white/60 p-2 rounded border border-red-200 text-xs">
                                                            <div>官方網址：<span className="text-green-700 font-bold">{brandAnalysis.officialDomain}</span></div>
                                                            <div>輸入網址：<span className="text-red-600 font-bold line-through">{brandAnalysis.inputDomain}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* 👆👆👆 貼到這裡！ (稍微幫你調整了樣式讓它塞在專家面板裡更順眼) 👆👆👆 */}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-fade-in bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                            {Object.values(result.checks).map((check, idx) => {
                                                if (check.label === '轉址/短網址' && check.status === 'safe') return null;
                                                // 已經在上方大面板提煉過的結論，就不在專家模式中重複顯示，保持精簡
                                                if (check.label === '網站內容狀態' || check.label === '網域特徵分析') return null;

                                                const renderIcon = () => {
                                                    if (check.label === '註冊商信譽') return <Flag size={20} className={check.status === 'warning' ? 'text-yellow-500' : 'text-green-500'} />;
	                                                    if (check.label === 'WHOIS 身份隱藏') return <UserX size={20} className={check.status === 'warning' ? 'text-yellow-500' : 'text-green-500'} />;
	                                                    if (check.label === '子網域深度') return <Layers size={20} className={check.status === 'warning' ? 'text-yellow-500' : 'text-green-500'} />;
	                                                    if (check.label === '網址參數檢查') return <Link size={20} className={check.status === 'danger' ? 'text-red-500' : 'text-green-500'} />;
	                                                    if (check.label === '伺服器所在國家') return <Globe size={20} className="text-blue-500" />;
	                                                    if (check.label === '網路服務商 (ISP/ASN)') return <Wifi size={20} className="text-blue-500" />;
                                                    if (check.label === '網頁連結分析') return <Link size={20} className={check.status === 'warning' ? 'text-yellow-500' : 'text-blue-500'} />;
                                                    return check.status === 'safe' ? <CheckCircle className="text-green-500" size={20} /> : (check.status === 'info' ? <HelpCircle className="text-blue-500" size={20} /> : <AlertTriangle className={check.status === 'danger' ? 'text-red-500' : 'text-yellow-500'} size={20} />);
                                                };
                                                return (
                                                    <div key={idx} className={`p-4 rounded-xl border ${check.status === 'safe' ? 'border-gray-100 bg-white' : (check.status === 'info' ? 'border-blue-100 bg-blue-50' : (check.status === 'warning' ? 'border-yellow-200 bg-yellow-50/50' : 'border-red-200 bg-red-50/50'))} transition-colors`}>
                                                        <div className="flex items-center gap-3 mb-2">{renderIcon()}<span className="font-bold text-gray-700">{check.label}</span></div>
                                                        <p className="text-sm text-gray-600 pl-8 leading-relaxed">{check.details}{check.link && <a href={check.link} target="_blank" className="text-blue-500 hover:underline ml-1 text-xs break-all">查詢</a>}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}


                                <button
                                    onClick={handleCopyReport}
                                    className={`w-full py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all transform active:scale-95 text-lg shadow-sm ${copyStatus === 'copied'
                                        ? 'bg-[#049b42] text-white'
                                        : 'bg-[#06C755] hover:bg-[#05b34c] text-white'
                                        }`}
                                >
                                    {copyStatus === 'copied' ? (
                                        <><Check size={20} />已複製文字報告！</>
                                    ) : (
                                        <><Copy size={20} className="text-white" />一鍵複製檢測報告 (可貼至 LINE)</>
                                    )}
                                </button>




                                <MyGoPenSection domain={result.domain} />
                            </>)}</div></div><p className="text-center text-xs text-gray-400 max-w-lg mx-auto leading-relaxed px-4">免責聲明：本工具分析結果僅供參考，無法保證 100% 準確。詐騙手法日新月異，請務必保持警覺，切勿隨意提供銀行帳號或密碼。</p></div>
                        )}
                    </div></main>
                    <footer className="py-6 text-center text-gray-400 text-sm border-t border-gray-100 bg-white">
                        <p>&copy; {new Date().getFullYear()} MyGoPen 麥擱騙. All rights reserved.</p>
                        <p className="mt-2">
                            <a href="/disclaimer.html" className="hover:text-brand-red hover:underline">免責聲明與回報申訴</a>
                        </p>
                    </footer>


                    {/* 呼叫我們剛剛寫好的安裝推播卡片 */}
                    <InstallPrompt />
                    
                    {/* 呼叫帶有完整對話邏輯的防詐小幫手元件 */}
                    <BotAssistant 
                        reportedUrls={reportedUrls} 
                        setReportedUrls={setReportedUrls} 
                        externalWhitelist={externalWhitelist} 
                    />

                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    
