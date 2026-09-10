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
        const Wifi = (p) => <IconBase {...p}><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></IconBase>;
// 👇 新增這行：乾淨標準的使用者頭像圖示 👇
        const User = (p) => <IconBase {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></IconBase>;
        const Building = (p) => <IconBase {...p}><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 21v-4h6v4"></path><path d="M7 7h2"></path><path d="M15 7h2"></path><path d="M7 11h2"></path><path d="M15 11h2"></path></IconBase>;
        // --- Logic Helpers ---
        const { getPseudoRandom, withTimeout, readJsonSafely, fetchJsonSafely, calculateEntropy, normalizeHostname, sanitizeUrlInput, normalizeInputHostname, isValidHostname, parseUserUrl, isTrackingUrlParamName, isVolatileUrlParam, sanitizeUrlForRiskScoring, toHttpFallbackUrl, buildCrawlerCandidateUrls, isOfficialTaiwanGovDomain, isSameRootDomain, isKnownUrlShortenerDomain, getOfficialShortenerDestinationDomains, isVerifiedOfficialShortenerDestination, isTrustedGlobalDomain, isTrustedEcommerceDomain, isTrustedTaiwanServiceDomain, isTrustedFinancialServiceDomain, isTrustedGovernmentServiceDomain, isTrustedPublicInterestDomain, isGlobalPaymentGatewayDomain, isConfirmedScamDomain, isManualHighRiskDomain, isVerifiedSafeRootDomain, shouldSkipAiBrandAnalysis, isTrustedResourceDomain, hasRiskyHostnamePattern, isCloudflarePagesDevHostname, isNetlifyAppHostname, isGithubPagesHostname, hasGeneratedNetlifySubdomain, isEmailTrackingRedirector, extractNestedUrls, hasFinancialPhishingText, hasPublicUtilityScamText, hasLogisticsScamText, hasOfficialFlowPath, hasPunycodeOrUnicodeHostname, createEmptyPageSignals, decodeSignalText, normalizeBusinessName, extractBusinessNames, analyzeSuspiciousDownloadPath, analyzeDownloadSignals, getComparableDomainText, levenshteinDistance, damerauLevenshteinDistance, checkBrandSimilarity, getDomainParts, TAIWAN_GOV_ROOT_AGENCY_NAMES, cleanDisplayText, chooseGovernmentSiteName, extractGovernmentAgencyName, analyzeGovernmentAgencySignals, hasReadableVowelPattern, analyzeDisposableRootLabel, hasSensitiveUrlParam, analyzeSuspiciousSubdomain, escapeRegExp, getPageBrandKeywordContexts, isBenignCommerceBrandReference, analyzePageBrandSignals, analyzeUrgencySignals, analyzeTrustSignals, analyzeSeoSignals, analyzeLanguageSignals, analyzeBusinessIdentitySignals, analyzeLineOfficialSignals, analyzeEcommerceTrustSignals, analyzeShoppingScamSignals, analyzeJobTaskScamSignals, analyzeRegulatedTobaccoSalesSignals, analyzePageSignals, fetchGeoLocation, fetchNetworkInfo, fetchSecurityHeaders, fetchSiteSeoData, checkSiteAvailability, checkTrancoRank, getDaysBetweenDates, getPastAgeDays, isOneYearRegistrationPeriod, getDomainAgeRiskScore, fetchRDAPData, fetchCertificateData, fetchTraceData, resolvePrimaryScanTarget, checkOfficialAlerts, checkAnalyticsClusterSignals, checkOrganizationVerification, checkGovernmentAgencyVerification, checkCommunityBlocklists, simulateScan, createScanCheck, createScanFailureResult, createUrlOnlySuspiciousAdLandingResult, runRiskScanSafely, runRiskAndBrandScan, getHighRiskSummaryReasons, revokeConditionalCompanyTrust, enforceFinalRiskConsistency } = window.ScanCore.create({ riskConfig: RISK_CONFIG, policy: window.ScanPolicy });

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

        const RiskMeter = ({ score, assessment }) => {
            const isUnknown = assessment === 'unknown';
            let color = 'bg-green-500', text = '低度風險', width = '10%';
            if (score >= 70) { color = 'bg-red-600'; text = '高度風險'; width = '90%'; }
            else if (score >= 30) { color = 'bg-yellow-500'; text = '中度風險'; width = '50%'; }
            if (isUnknown) text = '資訊不足／尚未確認';
            return (
                <div className="mt-4 mb-6">
                    <div className={`flex ${isUnknown ? 'justify-center' : 'justify-between'} gap-2 mb-1 text-sm font-bold`}>{!isUnknown && <span>安全</span>}<span className={isUnknown ? 'text-gray-600 text-center' : score >= 70 ? 'text-red-600' : (score >= 30 ? 'text-yellow-600' : 'text-green-600')}>{text}</span>{!isUnknown && <span>危險</span>}</div>
                    <div aria-hidden="true" className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">{!isUnknown && <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: width }}></div>}</div>
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
        // 🦁 完整的 BotAssistant 元件
// =========================================================================
        const BotAssistant = ({ externalWhitelist }) => {
            const [view, setView] = useState('closed');
            const [messages, setMessages] = useState([
                { role: 'assistant', content: '哈囉！我是防詐大獅：阿麥 🦁\n\n有遇到可疑的網址嗎？直接貼上來，我幫你看！' }
            ]);
            const [input, setInput] = useState('');
            const [isTyping, setIsTyping] = useState(false);
            const messagesEndRef = useRef(null);
            const floatingBubbleRef = useRef(null);
            const bubbleDragRef = useRef(null);
            const bubbleWasDraggedRef = useRef(false);
            const [bubbleOffset, setBubbleOffset] = useState({ x: 0, y: 0 });
            const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia('(max-width: 767px)').matches);

            // 自動捲動到最新訊息
            useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

            useEffect(() => {
                const mediaQuery = window.matchMedia('(max-width: 767px)');
                const keepBubbleInsideViewport = () => {
                    const isMobile = mediaQuery.matches;
                    setIsMobileViewport(isMobile);
                    if (!isMobile) {
                        setBubbleOffset({ x: 0, y: 0 });
                        return;
                    }

                    requestAnimationFrame(() => {
                        const bubble = floatingBubbleRef.current;
                        if (!bubble) return;
                        const rect = bubble.getBoundingClientRect();
                        const margin = 8;
                        const clampedLeft = Math.min(Math.max(rect.left, margin), Math.max(margin, window.innerWidth - rect.width - margin));
                        const clampedTop = Math.min(Math.max(rect.top, margin), Math.max(margin, window.innerHeight - rect.height - margin));
                        if (clampedLeft !== rect.left || clampedTop !== rect.top) {
                            setBubbleOffset(current => ({
                                x: current.x + clampedLeft - rect.left,
                                y: current.y + clampedTop - rect.top
                            }));
                        }
                    });
                };

                keepBubbleInsideViewport();
                mediaQuery.addEventListener?.('change', keepBubbleInsideViewport);
                window.addEventListener('resize', keepBubbleInsideViewport);
                return () => {
                    mediaQuery.removeEventListener?.('change', keepBubbleInsideViewport);
                    window.removeEventListener('resize', keepBubbleInsideViewport);
                };
            }, []);

            const handleBubblePointerDown = (event) => {
                if (!isMobileViewport) return;
                const rect = event.currentTarget.getBoundingClientRect();
                bubbleWasDraggedRef.current = false;
                bubbleDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                    startOffsetX: bubbleOffset.x,
                    startOffsetY: bubbleOffset.y,
                    width: rect.width,
                    height: rect.height
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
            };

            const handleBubblePointerMove = (event) => {
                const drag = bubbleDragRef.current;
                if (!isMobileViewport || !drag || drag.pointerId !== event.pointerId) return;
                const deltaX = event.clientX - drag.startX;
                const deltaY = event.clientY - drag.startY;
                if (Math.hypot(deltaX, deltaY) >= 4) bubbleWasDraggedRef.current = true;

                const margin = 8;
                const maxLeft = Math.max(margin, window.innerWidth - drag.width - margin);
                const maxTop = Math.max(margin, window.innerHeight - drag.height - margin);
                const nextLeft = Math.min(Math.max(drag.startLeft + deltaX, margin), maxLeft);
                const nextTop = Math.min(Math.max(drag.startTop + deltaY, margin), maxTop);
                setBubbleOffset({
                    x: drag.startOffsetX + nextLeft - drag.startLeft,
                    y: drag.startOffsetY + nextTop - drag.startTop
                });
                event.preventDefault();
            };

            const handleBubblePointerEnd = (event) => {
                const drag = bubbleDragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
                bubbleDragRef.current = null;
                if (bubbleWasDraggedRef.current) {
                    window.setTimeout(() => { bubbleWasDraggedRef.current = false; }, 0);
                }
            };

            const handleBubbleClick = (event) => {
                if (bubbleWasDraggedRef.current) {
                    event.preventDefault();
                    bubbleWasDraggedRef.current = false;
                    return;
                }
                setView('welcome');
            };

            const buildBotScanReply = (scanData, brandDataRes, contextText = '') => {
                const presentation = window.ScanPolicy.presentation(scanData);
                let riskLevel = presentation.label;
                let replyText = `【麥擱騙檢測報告】\n風險評估：${riskLevel}\n\n`;
                if (contextText) replyText += `${contextText}\n\n`;
                if (scanData.shortLinkNotice) replyText += `${scanData.shortLinkNotice}\n\n`;
                if (scanData.checks?.reportedShortLink) replyText += `${scanData.checks.reportedShortLink.details}\n\n`;
                if (presentation.level === 'unknown') return { content: `${replyText}${presentation.title}。${presentation.reasons.join('；')}。請勿因此認定連結安全。` };

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
                const scanOptions = {
                    ...sanitizedForRisk,
                    inputHadExplicitScheme: parsedInput.hasExplicitScheme
                };
                const riskScoringUrl = sanitizedForRisk.href;
                const { scanData, brandDataRes, skipAiBrandAnalysis } = await runRiskAndBrandScan(
                    urlObj.hostname,
                    riskScoringUrl,
                    externalWhitelist,
                    scanOptions
                );
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
                    revokeConditionalCompanyTrust(scanData, 'AI 內容分析偵測到詐騙或品牌冒用');
                }

                const reply = buildBotScanReply(scanData, brandDataRes, contextText);
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
                    content: '收到圖片，正在檢查可讀取的內容與網址。',
                    sticker: 'https://ik.imagekit.io/mygopen/sticks/33.png'
                }]);
                setIsTyping(true);

                try {
                    const local = await analyzeLocalScreenshot(file);
                    setMessages(prev => [...prev, { role: 'assistant', content: localScreenshotReport(local.mail) }]);
                    for (const target of getScreenshotUrls(local.targets)) {
                        await scanUrlForBot(target, '此為可見網址檢測，不能取代前面的內容警示，也不代表真正點擊目的地已確認。');
                    }
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
                                            <div className={`min-w-0 max-w-[75%] flex flex-col gap-2`}>
                                                <div className={`rounded-2xl px-4 py-2 whitespace-pre-wrap break-words break-all text-sm shadow-sm bg-white text-gray-700 border border-gray-200 rounded-bl-none`}>
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
                                    免責聲明：分析僅供防詐參考，務必自行查證且勿隨意提供個資。
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'closed' && (
                        <div
                            ref={floatingBubbleRef}
                            className="relative group flex flex-col items-center touch-none select-none md:touch-auto"
                            style={isMobileViewport ? { transform: `translate3d(${bubbleOffset.x}px, ${bubbleOffset.y}px, 0)` } : undefined}
                            onPointerDown={handleBubblePointerDown}
                            onPointerMove={handleBubblePointerMove}
                            onPointerUp={handleBubblePointerEnd}
                            onPointerCancel={handleBubblePointerEnd}
                        >
                            <div className="relative bg-white text-gray-800 px-5 py-2.5 rounded-full shadow-lg text-sm whitespace-nowrap font-bold mb-4 opacity-95 group-hover:opacity-100 transition-opacity animate-bubble-bounce">
                                問我問我
                                <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                            </div>
                            <button onClick={handleBubbleClick} aria-label="開啟聊天小幫手" className="w-[4.8rem] h-[4.8rem] md:w-24 md:h-24 rounded-full shadow-2xl hover:scale-110 transition-all border-4 border-white p-1 bg-white focus:outline-none z-50">
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
            .replace(/([A-Za-z0-9./?&_=:%#-])\s*\n\s*(?!(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[\/\s]|$)))([A-Za-z0-9])/gi, '$1$2');

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
                    const key = getScreenshotUrls([item])[0] || item;
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
                const tokenStart = normalized.slice(0, start).search(/\S*$/);
                const tokenEnd = normalized.slice(end).search(/\s/);
                if (normalized.slice(tokenStart, tokenEnd < 0 ? normalized.length : end + tokenEnd).includes('@')) continue;
                add(value);
            }

            return dedupeOcrTargets(targets);
        };

        const pickPrimaryOcrTarget = (targets) => {
            if (!targets.length) return '';
            return targets.find(item => /^https?:\/\//i.test(item)) || targets.find(item => !item.includes('@')) || '';
        };

        const getScreenshotUrls = (targets) => [...new Set(targets.flatMap(value => {
            if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value)) return [];
            if (!/^https?:\/\//i.test(value) && value.includes('@')) return [];
            try {
                const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
                return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.hostname.includes('.') ? [parsed.href] : [];
            } catch { return []; }
        }))];

        let qrLoadPromise = null;
        const readScreenshotQr = async (file) => {
            let bitmap;
            try {
                bitmap = await createImageBitmap(file);
                if (bitmap.width * bitmap.height > 20000000) return [];
                if (window.BarcodeDetector) {
                    try {
                        const codes = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
                        if (codes.length) return getScreenshotUrls(codes.map(code => code.rawValue));
                    } catch { /* Use the portable decoder when native QR support is unavailable. */ }
                }
                if (!window.jsQR) {
                    qrLoadPromise ||= new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    }).catch(error => { qrLoadPromise = null; throw error; });
                    await qrLoadPromise;
                }
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                const targets = [];
                // Mask decoded codes to discover additional QR destinations in the same image.
                for (let i = 0; i < 12; i++) {
                    const code = window.jsQR(pixels.data, pixels.width, pixels.height);
                    if (!code) break;
                    targets.push(code.data);
                    const points = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomLeftCorner, code.location.bottomRightCorner];
                    const left = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))) - 2);
                    const right = Math.min(pixels.width, Math.ceil(Math.max(...points.map(p => p.x))) + 2);
                    const top = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))) - 2);
                    const bottom = Math.min(pixels.height, Math.ceil(Math.max(...points.map(p => p.y))) + 2);
                    for (let y = top; y < bottom; y++) pixels.data.fill(255, (y * pixels.width + left) * 4, (y * pixels.width + right) * 4);
                }
                return getScreenshotUrls(targets);
            } catch { return []; } finally { bitmap?.close(); }
        };

        const analyzeLocalScreenshot = async (file, logger) => {
            const bitmap = await createImageBitmap(file);
            const oversized = bitmap.width * bitmap.height > 20000000;
            bitmap.close();
            if (oversized) throw new Error('圖片尺寸過大，請先裁切。');
            const targets = await readScreenshotQr(file);
            let mail = null;
            try {
                const engine = await loadTesseract();
                const result = await engine.recognize(file, 'eng+chi_tra', logger ? { logger } : {});
                const lines = (result?.data?.lines || String(result?.data?.text || '').split('\n').map(text => ({ text, confidence: result?.data?.confidence }))).map(line => ({ ...line }));
                let retries = 0;
                for (const line of lines) {
                    if (retries >= 2 || !line.text.includes('@') || line.confidence < 80 || !line.bbox || !window.EmailRisk) continue;
                    if (window.EmailRisk.assess([line]).addresses.length) continue;
                    retries++;
                    let region;
                    try {
                        region = await createImageBitmap(file);
                        const left = Math.max(0, line.bbox.x0 - 4), top = Math.max(0, line.bbox.y0 - 4);
                        const width = Math.min(region.width - left, line.bbox.x1 - left + 4), height = Math.min(region.height - top, line.bbox.y1 - top + 4);
                        if (width <= 0 || height <= 0 || width * height > 1000000) continue;
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(width * 2); canvas.height = Math.round(height * 2);
                        const context = canvas.getContext('2d');
                        context.drawImage(region, left, top, width, height, 0, 0, canvas.width, canvas.height);
                        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
                        const darkBackground = (pixels.data[0] + pixels.data[1] + pixels.data[2]) / 3 < 128;
                        for (let i = 0; i < pixels.data.length; i += 4) {
                            const brightness = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
                            const value = darkBackground ? (brightness > 75 ? 0 : 255) : (brightness < 180 ? 0 : 255);
                            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
                        }
                        context.putImageData(pixels, 0, 0);
                        const retry = await engine.recognize(canvas, 'eng');
                        const retryLines = retry?.data?.words?.length ? retry.data.words : retry?.data?.lines || [];
                        const candidates = window.EmailRisk.domainEvidence(retryLines);
                        const domains = [...new Set(candidates.map(item => item.domain))];
                        if (domains.length === 1) {
                            line.text = line.text.replace(/@[^\s<>]+/, '@' + domains[0]);
                            line.confidence = Math.min(line.confidence, ...candidates.map(item => item.confidence));
                        }
                    } catch { /* An unreadable address remains unverified, never guessed. */ }
                    finally { region?.close(); }
                }
                const ocrText = lines.map(line => window.EmailRisk?.normalizeOcrText(line.text) || line.text).join('\n');
                if (result?.data?.confidence >= 80) targets.push(...getScreenshotUrls(extractOcrTargets(ocrText)));
                mail = window.EmailRisk?.assess(lines) || null;
            } catch { /* QR results remain usable when OCR cannot load or recognize text. */ }
            return { targets: dedupeOcrTargets(targets), mail };
        };
        const findLocalScreenshotTargets = async (file, logger) => (await analyzeLocalScreenshot(file, logger)).targets;

        const localScreenshotReport = (mail) => mail && window.EmailRisk ? window.EmailRisk.report(mail) :
            '⚠️ 風險：無法判定\n🔍 分析：目前未能取得足夠清楚的內容，不能判定為安全。\n🛡️ 建議：請裁切清楚的寄件資訊與正文，或貼上實際連結；請勿提供密碼或驗證碼。';

        const preserveLocalScreenshotReport = (localReport, aiReport) => {
            if (String(localReport || '').split('\n').some(line => line.trim() === '⚠️ 風險：高風險')) return localReport;
            if (String(localReport || '').includes('不能判定為安全') && !String(aiReport || '').split('\n').some(line => /^⚠️ 風險：(高風險|中風險)$/.test(line.trim()))) return localReport;
            return aiReport;
        };

        const screenshotRequests = new Map();
        const requestScreenshotAnalysis = async (file) => {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) throw new Error('請使用 3MB 以下的 PNG、JPEG 或 WebP 圖片。');
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
            const cached = screenshotRequests.get(hash);
            if (cached && Date.now() - cached.created < 300000) return cached.promise;
            const promise = (async () => {
                const bitmap = await createImageBitmap(file);
                let blob;
                try {
                    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20000000) throw new Error('圖片尺寸過大，請先裁切。');
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
                    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                    const context = canvas.getContext('2d');
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    if (blob?.size > 3 * 1024 * 1024) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('圖片壓縮後仍過大，請裁切後重試。');
                } finally { bitmap.close(); }
                const form = new FormData();
                form.append('image', blob, blob.type === 'image/png' ? 'screenshot.png' : 'screenshot.jpg');
                const response = await fetch('/api/cf-vision', { method: 'POST', body: form, signal: AbortSignal.timeout(50000) });
                const data = await response.json();
                if (!response.ok || typeof data.report !== 'string') throw new Error(data.error || '圖片分析暫時無法使用。');
                if (data.risk === 'unknown') screenshotRequests.delete(hash);
                return data;
            })().catch(error => { screenshotRequests.delete(hash); throw error; });
            if (screenshotRequests.size >= 16) screenshotRequests.delete(screenshotRequests.keys().next().value);
            screenshotRequests.set(hash, { created: Date.now(), promise });
            return promise;
        };

        const screenshotRiskStyle = (report) => {
            const label = String(report || '').split('\n').find(line => line.startsWith('⚠️ 風險：'))?.slice('⚠️ 風險：'.length).trim();
            if (label === '高風險') return { panel: 'bg-red-50 border-red-200', text: 'text-red-700' };
            if (label === '中風險') return { panel: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700' };
            if (label === '未發現明顯內容風險') return { panel: 'bg-green-50 border-green-200', text: 'text-green-700' };
            return { panel: 'bg-gray-50 border-gray-200', text: 'text-gray-700' };
        };

        const App = () => {
            const [isImageAnalyzing, setIsImageAnalyzing] = useState(false);
            const [aiReport, setAiReport] = useState(null);
            const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
            const [screenshotSource, setScreenshotSource] = useState(null);
            const [screenshotUrls, setScreenshotUrls] = useState([]);
            const [screenshotFile, setScreenshotFile] = useState(null);
            const [brandAnalysis, setBrandAnalysis] = useState(null);
            const [isBrandAnalyzing, setIsBrandAnalyzing] = useState(false);
            const [loadingMessage, setLoadingMessage] = useState('分析中...');
            const [aiCopyStatus, setAiCopyStatus] = useState('idle');
            const [showDetails, setShowDetails] = useState(false);

            const handleCopyAiReport = () => {
                if (!aiReport) return;
                const report = `【截圖防詐分析報告】\n----------------------\n${aiReport}\n----------------------\n※ 截圖無法驗證真正寄件來源，請保持警覺，切勿隨意提供個資或匯款。`;
                const textArea = document.createElement("textarea");
                textArea.value = report; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
                document.body.appendChild(textArea); textArea.focus(); textArea.select();
                try { if (document.execCommand('copy')) { setAiCopyStatus('copied'); setTimeout(() => setAiCopyStatus('idle'), 3000); } else alert('複製失敗'); }
                catch (err) { alert('複製失敗'); } document.body.removeChild(textArea);
            };

            const handleImageUpload = async (e, forceAi = false) => {
                const file = e.target.files?.[0];
                const pendingScreenshotUrls = forceAi ? [...screenshotUrls] : [];
                const pendingContentReport = forceAi ? aiReport : null;
                if (!file) return;
                if (e.target.value !== undefined) e.target.value = '';
                const MAX_FILE_SIZE = 3 * 1024 * 1024;
                if (file.size > MAX_FILE_SIZE) { setError('圖片檔案過大 (超過3MB)，請裁切或壓縮後再上傳。'); if(e.target.value !== undefined) e.target.value = ''; return; }
                setResult(null); setAiReport(null); setScreenshotSource(null); setScreenshotUrls([]); setScreenshotFile(file); setError(''); setIsImageAnalyzing(true); setLoadingMessage('正在檢查截圖內容與網址...');
                if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
                const imagePreviewUrl = URL.createObjectURL(file);
                setUploadedImageUrl(imagePreviewUrl);
                try {
                    if (!forceAi) try {
                        const local = await analyzeLocalScreenshot(file, (m) => {
                                if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                                    setLoadingMessage(`正在辨識截圖網址... ${Math.round(m.progress * 100)}%`);
                                }
                        });
                        const ocrTargets = local.targets;
                        const primaryTarget = pickPrimaryOcrTarget(ocrTargets);
                        const mailReport = localScreenshotReport(local.mail);
                        setScreenshotSource({ imageUrl: imagePreviewUrl, detectedUrl: primaryTarget, source: 'ocr' });
                        if (!primaryTarget) {
                            setAiReport(mailReport);
                            if (typeof gtag === 'function') gtag('event', 'image_ocr_url_detected', { 'status': 'not_found' });
                            return;
                        }

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
                            setScreenshotUrls(getScreenshotUrls(ocrTargets));
                            const report = mailReport;
                            await handleScan(null, primaryTarget, { ...ocrScreenshotSource, contentReport: report });
                            return;
                        }
                    } catch (ocrErr) {
                        setAiReport(localScreenshotReport(null));
                        setScreenshotSource({ imageUrl: imagePreviewUrl, detectedUrl: '', source: 'ocr' });
                        if (typeof gtag === 'function') gtag('event', 'image_ocr_url_detected', { 'status': 'fallback' });
                        return;
                    }

                    setLoadingMessage('正在進行圖片內容複核...');
                    const data = await requestScreenshotAnalysis(file);
                    const contentReport = preserveLocalScreenshotReport(pendingContentReport, data.report);
                    setAiReport(contentReport);
                    setScreenshotSource({ imageUrl: imagePreviewUrl, detectedUrl: data.urls?.[0] || '', source: 'ai' });
                    const detectedUrls = getScreenshotUrls([...(data.urls || []), ...pendingScreenshotUrls]);
                    setScreenshotUrls(detectedUrls);
                    if (detectedUrls.length) {
                        setUrl(detectedUrls[0]);
                        await handleScan(null, detectedUrls[0], { imageUrl: imagePreviewUrl, detectedUrl: detectedUrls[0], source: 'ai', contentReport });
                    }
                    if (typeof gtag === 'function') gtag('event', 'image_analyze', { 'status': 'success', 'file_size': file.size });
                } catch (err) {
                    if (pendingContentReport) {
                        setAiReport(pendingContentReport);
                        setScreenshotUrls(pendingScreenshotUrls);
                        setScreenshotSource({ imageUrl: imagePreviewUrl, detectedUrl: pendingScreenshotUrls[0] || '', source: 'ocr' });
                    }
                    setError('圖片分析失敗：' + err.message);
                } finally { setIsImageAnalyzing(false); setLoadingMessage('分析中...'); }
            };

            const [url, setUrl] = useState('');
            const [loading, setLoading] = useState(false);
            const [result, setResult] = useState(null);
            const [error, setError] = useState('');
            const [copyStatus, setCopyStatus] = useState('idle');
            const [externalWhitelist, setExternalWhitelist] = useState([]);
            const resultRef = useRef(null);

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
                const scanOptions = {
                    ...sanitizedForRisk,
                    inputHadExplicitScheme: parsedInput.hasExplicitScheme
                };
                const riskScoringUrl = sanitizedForRisk.href;

                let loadingTimer = null;

                try {
                    setError('');
                    setLoading(true);
                    setResult(null);
                    setCopyStatus('idle');
                    setAiReport(sourceContext?.contentReport || null);
                    if (!sourceContext) setScreenshotUrls([]);
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
                        "正在檢查網址與網頁內容...",
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

                    const {
                        scanData,
                        brandDataRes,
                        skipAiBrandAnalysis,
                        isSocialTarget: isSocialInput
                    } = await runRiskAndBrandScan(
                        urlObj.hostname,
                        riskScoringUrl,
                        externalWhitelist,
                        scanOptions
                    );
                    scanData.inputUrl = parsedInput.href;
                    scanData.sanitizedUrl = riskScoringUrl;
                    scanData.removedTrackingParams = sanitizedForRisk.removedTrackingParams;
                    scanData.removedVolatileParams = sanitizedForRisk.removedVolatileParams;
                    scanData.removedParams = sanitizedForRisk.removedParams;

                    // 👇 新增防呆：如果網域已經掛掉或不存在 (isInvalid)，就不需要把 AI 結果塞進去，避免程式崩潰
                    if (!scanData.isInvalid) {
                        // 根據 AI 分析結果，動態更新 UI 卡片結論
                        if (!skipAiBrandAnalysis && brandDataRes) {
                            if (brandDataRes.isFakeBrand === null) {
                                scanData.checks.siteContent.status = 'unknown';
                                scanData.checks.siteContent.details = brandDataRes.message || '品牌分析未完成，不代表沒有風險';
                            } else if (brandDataRes.isGenericScam) {
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
                                scanData.checks.siteContent.details = '品牌與已知官方網域相符，仍以其他威脅證據綜合判定';
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
                            scanData.checks.siteContent.details = 'AI 品牌分析暫時無回應，不代表沒有風險';
                        }
                    }

                    enforceFinalRiskConsistency(scanData);
                    setBrandAnalysis(brandDataRes);
                    setResult(scanData);

                    // 👇 新增：GA4 網址檢測行為追蹤
                    if (typeof gtag === 'function') {
                        gtag('event', 'url_check', {
                            'target_domain': urlObj.hostname,      // 民眾原始查詢網域
                            'destination_domain': scanData.domain || urlObj.hostname,
                            'short_url_resolved': scanData.resolvedFromShortener ? 'yes' : 'no',
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
                const checks = result.checks || {};
                const siteStatus = result.details?.siteStatus || {};
                
                // 👇 複製報告時，也要考慮社群網站的特殊狀態
                let riskLevel = window.ScanPolicy.presentation(result).label;
                if (result.isSocialMedia) {
                    riskLevel = '⚠️ 無法自動掃描 (社群平台)';
                }

                const warnings = [...(result.incompleteReasons || [])];
                if (result.shortLinkNotice) warnings.push(result.shortLinkNotice);
                if (result.checks?.reportedShortLink) warnings.push(result.checks.reportedShortLink.details);
                if (result.blocklistListed) warnings.push('⚠️ 此網址已列入詐騙黑名單！');
                
                // 👇 社群專屬警告
                if (result.isSocialMedia) {
                    warnings.push('⚠️ 這是社群平台，我們無法看到裡面的貼文，要多加小心留意！');
                }

                if (checks.domainAnalysis?.status === 'danger') {
                    if (result.domain.includes('-tw') || result.domain.includes('-com') || result.domain.includes('-online')) warnings.push('⚠️ 網域包含 "-tw", "-com" 或 "-online" 偽裝字樣，風險極高');
                    else if (result.domain.includes('gov') && !result.domain.endsWith('.gov') && !result.domain.endsWith('.gov.tw')) warnings.push('⚠️ 網域偽造政府機關 (gov)，極高風險');
                    else if ((result.domain.match(/-/g) || []).length >= 2) warnings.push('⚠️ 網域包含多個連字號 (-)，極高機率為詐騙');
                } else if (checks.domainAnalysis?.status === 'warning' && !result.isSocialMedia) warnings.push(`⚠️ ${checks.domainAnalysis.details || '網域特徵需要留意'}`);
                
                if (siteStatus.status === 'blank' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站內容異常空白或極少 (高風險)');
                if (siteStatus.status === 'error' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push(`⚠️ 網站無法正常存取 (${siteStatus.code || 'Connection Error'})`);
                if (siteStatus.status === 'unknown' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站無法被正常讀取 (疑似阻擋)');
                if (siteStatus.status === 'blocked' && !result.isSocialMedia && !result.crawlerBlockedTrustedContext) warnings.push('⚠️ 網站啟用防爬蟲或 WAF，無法被正常讀取');
                if (siteStatus.hasIframe) warnings.push('⚠️ 偵測到 Iframe 隱藏框架');
                if (checks.apkCheck?.status === 'danger') warnings.push(`⚠️ ${checks.apkCheck.details}`);
                if (checks.securityHeaders?.status === 'danger') warnings.push('⚠️ 缺少 CSP、X-Frame-Options、X-Content-Type-Options 三項安全標頭');
                if (checks.mxRecords?.status === 'danger') warnings.push('⚠️ 網域未設定 MX 郵件紀錄');
                if (['warning', 'danger'].includes(checks.registrationPeriod?.status)) warnings.push('⚠️ 新網域且註冊週期約 1 年，需搭配其他訊號判斷');
                else if (['warning', 'danger'].includes(checks.age?.status)) warnings.push(`⚠️ ${checks.age.details || '網域註冊時間較新，需搭配其他訊號判斷'}`);
                if (checks.disposableDomain?.status === 'danger') warnings.push(`⚠️ ${checks.disposableDomain.details}`);
                if (checks.entropy?.status === 'warning') warnings.push('⚠️ 網域名稱亂碼 (高風險特徵)');
                if (checks.redirect?.status && checks.redirect.status !== 'safe') warnings.push(`⚠️ 網站存在轉址行為 (${checks.redirect.details})`);
                if (checks.whoisPrivacy?.status && checks.whoisPrivacy.status !== 'safe' && !result.isSocialMedia) warnings.push('⚠️ WHOIS 身份已隱藏');
                if (checks.registrar?.status === 'warning') warnings.push(`⚠️ 註冊商信譽不佳 (${(checks.registrar.details || '').split(' ')[1] || checks.registrar.details})`);
                if (checks.subdomain?.status === 'danger') warnings.push('⚠️ 子網域層級過深 (≥ 5層)，極高風險');
                else if (checks.subdomain?.status === 'warning') warnings.push('⚠️ 子網域層級過深 (常見詐騙特徵)');
                if (checks.params?.status === 'danger') warnings.push('⚠️ 包含敏感參數 (token/auth/session)');
                
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
                    <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm bg-opacity-95 backdrop-blur-sm"><div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between"><a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity"><img src="https://ik.imagekit.io/mygopen/menu-logo.png?updatedAt=1767058877480" alt="麥擱騙 Logo" className="h-8" /><h1 className="font-bold text-lg md:text-xl text-gray-800 tracking-tight">麥擱騙｜詐騙網址幫你查</h1></a><div className="text-xs text-gray-400 font-medium hidden md:block">v2.3.13</div></div></header>
                    <main className="flex-grow flex flex-col items-center justify-start pt-8 pb-12 px-4 md:pt-16 md:px-6"><div className="w-full max-w-3xl">
                        <div className="text-center mb-10 md:mb-12 animate-fade-in"><h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">遠離網路詐騙<br className="md:hidden" /><span className="text-brand-red">從檢查網址開始</span></h2><p className="text-gray-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">輸入網址，即時分析網站特徵、流量與黑名單資料庫，保護個資安全。</p></div>
                        <div className="bg-white rounded-2xl shadow-soft p-2 md:p-3 mb-8 transform transition-all hover:shadow-lg border border-gray-100">




                            <form onSubmit={handleScan} className="flex flex-col md:flex-row gap-2">
                                <div className="relative flex-grow group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Search className="text-gray-400 group-focus-within:text-brand-red transition-colors" size={20} />
                                    </div>

                                    {/* [修改] pr-14 改為 pr-16，預留更多空間給按鈕 */}
                                    <input type="text" aria-label="待檢測網址" inputMode="url" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full min-w-0 pl-12 pr-16 py-4 md:py-4 bg-gray-50 border-transparent focus:bg-white rounded-xl focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-base md:text-lg placeholder-gray-400" placeholder="貼上網址或上傳可疑截圖" value={url} onChange={(e) => setUrl(e.target.value)}

                                        onFocus={(e) => {
                                            if (window.matchMedia('(max-width: 767px)').matches) document.body.classList.add('keyboard-open');
                                            e.target.select();
                                            e.target.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                                        }}

                                        onBlur={() => {
                                            document.body.classList.remove('keyboard-open');
                                        }} />

                                    {/* [修改] pr-3 改為 pr-2.5，並為 label 加上明顯但不突兀的背景色、邊框與圓角 */}
                                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            id="image-upload"
                                            onChange={handleImageUpload}
                                        />
                                        <button type="button" aria-label="上傳可疑截圖" disabled={loading || isImageAnalyzing} onClick={() => document.getElementById('image-upload').click()} className="p-2.5 bg-gray-100 hover:bg-brand-light text-gray-500 hover:text-brand-red rounded-lg cursor-pointer transition-all border border-gray-200 shadow-sm active:scale-95" title="上傳截圖讓 AI 幫你判斷">
                                            <Camera size={22} />
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || isImageAnalyzing}
                                    className={`px-8 py-4 rounded-xl font-bold text-white shadow-md flex justify-center items-center transition-all active:scale-95 md:w-auto w-full text-lg ${loading || isImageAnalyzing ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-red hover:bg-brand-darkRed shadow-glow'}`}
                                >
                                    {loading || isImageAnalyzing ? (
                                        <span role="status" className="flex items-center gap-2">
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
                        {error && <div role="alert" className="text-center animate-fade-in mb-6"><span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-medium border border-red-100"><AlertTriangle size={14} /> {error}</span></div>}
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
                                    <h3 className="text-xl md:text-2xl font-bold text-gray-800">截圖防詐分析報告</h3>
                                </div>
                                {screenshotFile && screenshotSource?.source === 'ocr' && (
                                    <button type="button" disabled={loading} onClick={() => handleImageUpload({ target: { files: [screenshotFile] } }, true)} className="mb-4 inline-flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50">
                                        <Camera size={18} /> AI 圖片複核
                                    </button>
                                )}
                                {screenshotUrls.length > 1 && (
                                    <div className="mb-4 space-y-2">
                                        <h4 className="text-sm font-bold text-gray-700">截圖中的網址</h4>
                                        {screenshotUrls.map(target => (
                                            <button type="button" key={target} disabled={loading} onClick={() => { setUrl(target); handleScan(null, target, { imageUrl: uploadedImageUrl, detectedUrl: target, source: screenshotSource?.source || 'ai', contentReport: aiReport }); }} className="w-full flex items-start gap-2 text-left text-sm text-blue-700 break-all border-b border-gray-100 py-2 disabled:opacity-50">
                                                <Search size={16} className="flex-shrink-0 mt-1" /><span>{target}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}


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
                                        {/* Only the explicit risk label controls the result color. */}
                                        <div className={`p-5 md:p-6 rounded-2xl text-gray-800 text-base md:text-lg leading-relaxed break-words break-all border shadow-sm font-medium h-full flex flex-col justify-center gap-3 ${screenshotRiskStyle(aiReport).panel}`}>
                                            
                                            {aiReport.split('\n').map((line, i) => {
                                                const reference = window.EmailRisk?.references?.find(item => item.url === line);
                                                if (reference) return <a key={i} href={reference.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-words">{reference.title}</a>;
                                                // 1. 如果是「風險」那一行：字體加大加粗，並根據高低風險換顏色
                                                if (line.startsWith('⚠️ 風險：')) {
                                                    const textColor = screenshotRiskStyle(aiReport).text;
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
                                    圖片辨識可能有誤，請勿僅憑本報告提供個資或匯款。
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
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                                    <div className="min-w-0">
                                        <div className="text-sm text-gray-400 font-mono mb-1 tracking-wide uppercase">
                                            {result.resolvedFromShortener ? '最終目的地網域' : '目標網域'}
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-bold text-gray-800 break-all">{result.domain}</h3>
                                    </div>
                                <div className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600">
                                        <Globe size={16} className="text-brand-red" />
                                        <span>伺服器: {result.details.serverCountry}</span>
                                    </div>
                                </div>
                                <RiskMeter score={result.riskScore} assessment={result.assessment} />
                                {result.shortLinkNotice && <div className="mb-5 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-gray-800 leading-relaxed"><strong>縮網址使用提醒</strong><p className="mt-1">{result.shortLinkNotice}</p></div>}
                                {result.checks?.reportedShortLink && <p className="mb-5 text-sm font-medium text-red-800 leading-relaxed">{result.checks.reportedShortLink.details}</p>}

                                {/* ================= 核心結論區塊 (精簡版) ================= */}
                                <div className={`mb-6 p-4 sm:p-5 md:p-8 rounded-2xl border-2 flex items-center gap-3 sm:gap-4 ${result.assessment === 'unknown' ? 'bg-gray-50 border-gray-300' : result.riskScore >= 70 ? 'bg-red-50 border-red-200' : (result.riskScore >= 30 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200')} shadow-sm`}>
                                    
                                    {/* 👇 根據風險等級，動態切換圖示與角色圖片 (手機版縮小為 w-10 h-10 節省空間) 👇 */}
                                    {result.isSocialMedia || result.assessment === 'unknown' ? (
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
                                        <h3 className={`text-[1.15rem] sm:text-2xl md:text-3xl font-extrabold tracking-tight sm:tracking-wide leading-snug ${result.assessment === 'unknown' ? 'text-gray-800' : result.riskScore >= 70 ? 'text-red-800' : (result.riskScore >= 30 ? 'text-yellow-800' : 'text-green-800')}`}>
                                            {result.isSocialMedia ? '這是社群平台，我們無法看到裡面的貼文，要多加小心留意！' : window.ScanPolicy.presentation(result).title}
                                        </h3>
                                        {result.assessment === 'unknown' && <p className="text-sm text-gray-600 mt-2">{result.incompleteReasons.join('；')}</p>}
                                    </div>
                                </div>

                                {result.checks.govAgency && !result.checks.govAgency.hidden && (
                                    <div className="mb-6 p-4 md:p-5 border-2 rounded-2xl shadow-sm animate-fade-in bg-green-50 border-green-300">
                                        <div className="flex items-start gap-3">
                                            <ShieldCheck size={28} className="flex-shrink-0 mt-0.5 text-green-700" />
                                            <div className="min-w-0 w-full">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <h4 className="font-extrabold text-lg md:text-xl text-green-900">政府機關網域驗證</h4>
                                                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-green-200 text-green-900">
                                                        {result.checks.govAgency.directAgencyMatched ? '機關資料相符' : '根機關資料相符'}
                                                    </span>
                                                </div>
                                                <p className="text-sm md:text-base text-gray-800 leading-relaxed font-semibold">
                                                    {result.checks.govAgency.details}
                                                </p>

                                                {(result.checks.govAgency.agencies || []).length > 0 && (
                                                    <div className="mt-4 space-y-3">
                                                        {(result.checks.govAgency.agencies || []).slice(0, 2).map((agency, agencyIndex) => (
                                                            <div key={(agency.code || agency.name || 'agency') + agencyIndex} className="border-t border-green-200 pt-3">
                                                                <div className="font-extrabold text-green-950 mb-2 break-all">{agency.name}</div>
                                                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-sm">
                                                                    {agency.code && (
                                                                        <div>
                                                                            <dt className="inline font-bold text-gray-500">機關代碼：</dt>
                                                                            <dd className="inline font-semibold text-gray-800 break-all">{agency.code}</dd>
                                                                        </div>
                                                                    )}
                                                                    {agency.parentName && (
                                                                        <div>
                                                                            <dt className="inline font-bold text-gray-500">主管機關：</dt>
                                                                            <dd className="inline font-semibold text-gray-800 break-all">{agency.parentName}</dd>
                                                                        </div>
                                                                    )}
                                                                    {agency.address && (
                                                                        <div className="sm:col-span-2">
                                                                            <dt className="inline font-bold text-gray-500">機關地址：</dt>
                                                                            <dd className="inline font-semibold text-gray-800 break-all">{agency.address}</dd>
                                                                        </div>
                                                                    )}
                                                                </dl>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {(result.checks.govAgency.evidence || []).length > 0 && (
                                                    <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 border-t border-green-200 pt-3 text-sm">
                                                        {(result.checks.govAgency.evidence || []).map((item, index) => (
                                                            <div key={(item.label || 'gov') + index} className={item.label === '頁面名稱' ? 'sm:col-span-2' : ''}>
                                                                <dt className="inline font-bold text-gray-500">{item.label}：</dt>
                                                                <dd className="inline font-semibold text-gray-800 break-all">{item.value}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                )}

                                                {result.checks.govAgency.sourceUrl && (
                                                    <a href={result.checks.govAgency.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-green-800 hover:text-green-950 underline underline-offset-2">
                                                        <ExternalLink size={14} />
                                                        驗證來源：行政院所屬中央及地方機關代碼
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {result.checks.companyWebsite && (result.checks.companyWebsite.companies || []).length > 0 && (
                                    <div className={'mb-6 p-4 md:p-5 border-2 rounded-2xl shadow-sm animate-fade-in ' + (result.checks.companyWebsite.verified ? 'bg-green-50 border-green-300' : (result.checks.companyWebsite.domainMatched ? 'bg-yellow-50 border-yellow-300' : 'bg-blue-50 border-blue-200'))}>
                                        <div className="flex items-start gap-3">
                                            <Building size={28} className={'flex-shrink-0 mt-0.5 ' + (result.checks.companyWebsite.verified ? 'text-green-700' : (result.checks.companyWebsite.domainMatched ? 'text-yellow-700' : 'text-blue-700'))} />
                                            <div className="min-w-0 w-full">
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <h4 className={'font-extrabold text-lg md:text-xl ' + (result.checks.companyWebsite.verified ? 'text-green-900' : (result.checks.companyWebsite.domainMatched ? 'text-yellow-900' : 'text-blue-900'))}>組織／法人登記資料驗證</h4>
                                                    <span className={'text-xs font-extrabold px-2.5 py-1 rounded-full ' + (result.checks.companyWebsite.verified ? 'bg-green-200 text-green-900' : (result.checks.companyWebsite.domainMatched ? 'bg-yellow-200 text-yellow-900' : 'bg-blue-200 text-blue-900'))}>
                                                        {result.checks.companyWebsite.verified ? '官網與登記資料相符' : (result.checks.companyWebsite.domainMatched ? '網址紀錄需複核' : '登記資料相符')}
                                                    </span>
                                                </div>
                                                <p className="text-sm md:text-base text-gray-800 leading-relaxed font-semibold">
                                                    {result.checks.companyWebsite.details}
                                                </p>

                                                <div className="mt-4 space-y-3">
                                                    {(result.checks.companyWebsite.companies || []).slice(0, 2).map((company, companyIndex) => (
                                                        <div key={(company.taxId || company.name || 'company') + companyIndex} className="bg-white/90 border border-gray-200 rounded-xl p-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                                                <div className="font-extrabold text-gray-900">{company.name || '組織名稱未提供'}</div>
                                                                <div className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                                                                    {[company.market, company.organizationType].filter(Boolean).join('・') || '組織登記'}
                                                                </div>
                                                            </div>
                                                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-sm">
                                                                {company.taxId && <div><dt className="inline font-bold text-gray-500">統一編號：</dt><dd className="inline font-semibold text-gray-800">{company.taxId}</dd></div>}
                                                                {company.status && <div><dt className="inline font-bold text-gray-500">登記狀態：</dt><dd className="inline font-semibold text-gray-800">{company.status}</dd></div>}
                                                                {company.responsibleName && <div><dt className="inline font-bold text-gray-500">{company.entityType === 'foundation' ? '法人代表' : '負責人'}：</dt><dd className="inline font-semibold text-gray-800">{company.responsibleName}</dd></div>}
                                                                {company.setupDate && <div><dt className="inline font-bold text-gray-500">設立日期：</dt><dd className="inline font-semibold text-gray-800">{company.setupDate}</dd></div>}
                                                                {company.capital && <div><dt className="inline font-bold text-gray-500">{company.entityType === 'foundation' ? '登記財產額' : '資本總額'}：</dt><dd className="inline font-semibold text-gray-800">NT$ {Number(company.capital).toLocaleString('zh-TW')}</dd></div>}
                                                                {company.stockCode && <div><dt className="inline font-bold text-gray-500">公司代號：</dt><dd className="inline font-semibold text-gray-800">{company.stockCode}</dd></div>}
                                                                {company.registrationCourt && <div><dt className="inline font-bold text-gray-500">登記法院：</dt><dd className="inline font-semibold text-gray-800">{company.registrationCourt}</dd></div>}
                                                                {company.registrationNumber && <div><dt className="inline font-bold text-gray-500">登記號數：</dt><dd className="inline font-semibold text-gray-800">{company.registrationNumber}</dd></div>}
                                                                {company.registrationAuthority && <div className="sm:col-span-2"><dt className="inline font-bold text-gray-500">主管機關：</dt><dd className="inline font-semibold text-gray-800">{company.registrationAuthority}</dd></div>}
                                                                {company.address && <div className="sm:col-span-2"><dt className="inline font-bold text-gray-500">登記地址：</dt><dd className="inline font-semibold text-gray-800">{company.address}</dd></div>}
                                                                {company.website && <div className="sm:col-span-2"><dt className="inline font-bold text-gray-500">公開資料網址：</dt><dd className="inline font-semibold text-gray-800 break-all">{company.website}</dd></div>}
                                                            </dl>
                                                        </div>
                                                    ))}
                                                </div>

                                                {(result.checks.companyWebsite.evidence || []).length > 0 && (
                                                    <div className="mt-3 text-xs text-gray-700 leading-relaxed">
                                                        <span className="font-bold">驗證來源：</span>
                                                        {(result.checks.companyWebsite.evidence || []).map((evidence, index) => (
                                                            <React.Fragment key={(evidence.type || 'source') + index}>
                                                                {index > 0 ? '、' : ''}
                                                                <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline">
                                                                    {evidence.source}
                                                                </a>
                                                                {evidence.directDomainMatch ? '（網址相符）' : '（登記資料相符）'}
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="mt-3 text-xs text-gray-700 leading-relaxed">
                                                    <span className="font-bold">可再人工查核：</span>
                                                    <a href="https://www.etax.nat.gov.tw/etwmain/online-service/publicity-inquiry/taxation-registration" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline">財政部稅籍登記</a>
                                                    <span>、</span>
                                                    <a href="https://aomp109.judicial.gov.tw/judbp/whd6k/WHD6K01.htm" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline">司法院法人登記</a>
                                                    <span>、</span>
                                                    <a href="https://whois.twnic.tw/" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline">TWNIC 網域資料</a>
                                                </div>
                                                <p className="mt-3 text-[11px] md:text-xs text-gray-600 leading-relaxed">
                                                    組織依法登記不等於網站交易絕對安全；若只有名稱或統編相符，仍可能存在冒用資料的情形。官方警示、釣魚黑名單與明確詐騙證據仍具有較高優先級。
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

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

                                {result.checks.analyticsCluster && result.checks.analyticsCluster.detectedCount > 0 && ['warning', 'info'].includes(result.checks.analyticsCluster.status) && (
                                    <div className={`mb-6 p-4 md:p-5 border-2 rounded-2xl shadow-sm animate-fade-in ${result.checks.analyticsCluster.status === 'warning' ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                                        <div className="flex items-start gap-3">
                                            <Activity size={28} className={`flex-shrink-0 mt-0.5 ${result.checks.analyticsCluster.status === 'warning' ? 'text-amber-700' : 'text-blue-600'}`} />
                                            <div className="min-w-0 w-full">
                                                <h4 className={`font-extrabold text-lg md:text-xl mb-2 ${result.checks.analyticsCluster.status === 'warning' ? 'text-amber-900' : 'text-blue-900'}`}>詐騙站群關聯</h4>
                                                <p className="text-sm md:text-base text-gray-800 leading-relaxed font-semibold">
                                                    {result.checks.analyticsCluster.details}
                                                </p>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                                                    <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
                                                        <div className="text-[11px] font-bold text-gray-500 mb-1">共享識別碼類型</div>
                                                        <div className="text-sm font-extrabold text-gray-800 leading-snug">
                                                            {[...new Set((result.checks.analyticsCluster.items || []).map(item => item.typeLabel))].join('、') || '無'}
                                                        </div>
                                                    </div>
                                                    <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
                                                        <div className="text-[11px] font-bold text-gray-500 mb-1">已知高風險關聯數</div>
                                                        <div className={`text-2xl font-black ${result.checks.analyticsCluster.knownHighRiskCount > 0 ? 'text-amber-800' : 'text-gray-700'}`}>
                                                            {Number(result.checks.analyticsCluster.knownHighRiskCount || 0)}
                                                        </div>
                                                    </div>
                                                    <div className="bg-white/80 border border-gray-200 rounded-xl p-3">
                                                        <div className="text-[11px] font-bold text-gray-500 mb-1">證據來源</div>
                                                        <div className="text-sm font-extrabold text-gray-800">
                                                            {(result.checks.analyticsCluster.evidenceSources || []).length > 0
                                                                ? `${result.checks.analyticsCluster.evidenceSources.length} 類`
                                                                : '原始碼＋本地索引'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 space-y-2">
                                                    {(result.checks.analyticsCluster.items || []).map(item => (
                                                        <div key={item.id} className="bg-white/80 border border-gray-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-bold text-gray-500">{item.typeLabel}</div>
                                                                <code className="text-xs md:text-sm font-bold text-gray-800 break-all">{item.id}</code>
                                                            </div>
                                                            <div className={`text-xs font-extrabold px-2.5 py-1 rounded-full self-start md:self-auto whitespace-nowrap ${item.knownHighRiskCount > 0 ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-600'}`}>
                                                                {item.knownHighRiskCount > 0 ? `關聯 ${item.knownHighRiskCount} 個高風險網域` : '未命中已知站群'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {(result.checks.analyticsCluster.evidenceSources || []).length > 0 && (
                                                    <div className="mt-3 text-xs text-gray-700 leading-relaxed">
                                                        <span className="font-bold">證據來源：</span>
                                                        {(result.checks.analyticsCluster.evidenceSources || []).map((source, index) => (
                                                            <React.Fragment key={`${source.name}-${index}`}>
                                                                {index > 0 ? '、' : ''}
                                                                {source.url ? (
                                                                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline">{source.name}</a>
                                                                ) : <span className="font-bold">{source.name}</span>}
                                                            </React.Fragment>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className="mt-3 text-[11px] md:text-xs text-gray-600 leading-relaxed">
                                                    共享分析識別碼可能來自同一業者、廣告代理商或共用模板，必須搭配網域年齡、內容、官方警示與群眾查核綜合判斷。
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <a href={`https://www.google.com/search?q=${encodeURIComponent(result.domain + ' 是詐騙嗎？')}&num=10&udm=50`} target="_blank" rel="noopener noreferrer" className="w-full mt-3 py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all transform active:scale-95 text-lg shadow-md bg-[#4285F4] hover:bg-[#3367D6] text-white">
                                    <div className="bg-white p-1 rounded-full flex items-center justify-center"><GoogleIcon size={18} /></div>用 Google AI 再檢查看看
                                </a>

    

                                {/* ================= 新增：折疊面板 (Accordion) 按鈕 ================= */}
                                <div className="mt-8 mb-4">
                                    {/* 👇 手機版減少 padding (px-3 py-3)，字體設定為 text-[13px] 搭配緊密字距 👇 */}
                                    <button
                                        onClick={() => setShowDetails(!showDetails)}
                                        aria-expanded={showDetails}
                                        aria-controls="technical-report"
                                        className="w-full flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-xl transition-all border border-gray-200 shadow-sm active:scale-95 text-sm sm:text-base md:text-lg"
                                    >
                                        <span className="flex min-w-0 items-center gap-1.5 sm:gap-3 text-left">
                                            {/* 圖示在手機版也微調變小 */}
                                            <Search className="text-gray-500 flex-shrink-0 w-4 h-4 sm:w-[22px] sm:h-[22px]" />
                                            <span>{showDetails ? '收合' : '展開'}詳細技術分析報告 (資安專家模式)</span>
                                        </span>
                                        <div className={`transform transition-transform duration-300 flex-shrink-0 ml-1 ${showDetails ? 'rotate-180' : ''}`}>
                                            <ChevronDown className="text-gray-500 w-5 h-5 sm:w-[24px] sm:h-[24px]" />
                                        </div>
                                    </button>
                                </div>

                                {/* ================= 隱藏的技術卡片區塊 ================= */}
                                {showDetails && (

                                    <div id="technical-report" className="animate-fade-in mb-8">

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
                                                if (!check || check.hidden) return null;
                                                if (check.label === '轉址/短網址' && check.status === 'safe') return null;
                                                // 已經在上方大面板提煉過的結論，就不在專家模式中重複顯示，保持精簡
                                                if (check.label === '網站內容狀態' || check.label === '網域特徵分析') return null;

                                                const renderIcon = () => {
                                                    if (check.label === '政府機關網域驗證') return <ShieldCheck size={20} className={check.status === 'safe' ? 'text-green-500' : 'text-blue-500'} />;
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
                                                    <div key={idx} className={`p-4 rounded-xl border ${check.status === 'unknown' ? 'border-gray-200 bg-gray-50' : check.status === 'safe' ? 'border-gray-100 bg-white' : (check.status === 'info' ? 'border-blue-100 bg-blue-50' : (check.status === 'warning' ? 'border-yellow-200 bg-yellow-50/50' : 'border-red-200 bg-red-50/50'))} transition-colors`}>
                                                        <div className="flex items-center gap-3 mb-2">{renderIcon()}<span className="font-bold text-gray-700">{check.label}</span></div>
                                                        <p className="text-sm text-gray-600 pl-8 leading-relaxed break-words">{check.status === 'unknown' && <span className="font-bold">未完成驗證： </span>}{check.details}{check.link && <a href={check.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1 text-xs break-all">查詢</a>}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}


                                <button
                                    onClick={handleCopyReport}
                                    className={`w-full px-3 py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all transform active:scale-95 text-base sm:text-lg shadow-sm ${copyStatus === 'copied'
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
                    <BotAssistant externalWhitelist={externalWhitelist} />

                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    
