window.RISK_CONFIG = {
    socialMediaDomains: [
        'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'ig.me',
        'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'youtu.be', 't.me',
        'threads.net', 'threads.com', 'line.me', 'dcard.tw', 'plurk.com', 'weibo.com', 'xiaohongshu.com'
    ],
    highRiskTlds: [
        '.shop', '.xyz', '.top', '.club', '.live', '.fun', '.store', '.asia',
        '.digital', '.click', '.site', '.cloud', '.sbs', '.icu', '.cyou',
        '.chat', '.cn', '.cv', '.gal', '.pro', '.vip', '.pw', '.ws'
    ],
    suspiciousTlds: [
        '.cc'
    ],
    commonInternationalTlds: [
        '.com', '.net', '.org', '.jp', '.kr', '.tw', '.hk', '.dev',
        '.io', '.ai', '.co', '.app'
    ],
    urlShorteners: [
        'bit.ly', 'goo.gl', 'tinyurl.com', 't.co', 'is.gd', 'buff.ly',
        'adf.ly', 'ow.ly', 'bit.do', 'su.pr', 'reurl.cc', 'pic.see',
        'ppt.cc', 'mz.cm', 'i.gal', 'tiny.cc', 't.cn', 'zingala.cc',
        'aka.ms', 'truthsocial.com', 'l.facebook.com', 'l.instagram.com',
        'l.messenger.com'
    ],
    safeShorteners: [
        'lihi.io', 'reurl.cc', 'picsee.io', 'pse.is', 'bit.ly',
        'bitly.com', 'aka.ms'
    ],
    freeHostingProviders: [
        'dudaone.com', 'wixsite.com', 'blogspot.com', 'wordpress.com',
        'weebly.com', 'github.io', 'vercel.app', 'netlify.app',
        'herokuapp.com', 'onrender.com', 'glitch.me', 'firebaseapp.com',
        'pages.dev', 'myshopify.com', 'surge.sh', 'cloudfront.net',
        'workers.dev', 'web.app', 'azureedge.net', 'ondigitalocean.app',
        'eu.cc'
    ],
    safeCommercePlatforms: [
        'shoplineapp.com', 'cyberbiz.co', 'meepshoper.com', 'waca.tw',
        'waca.ec', 'waca.store', 'easystore.co', '91app.com', 'qdm.tw',
        'boutir.com', 'myshopify.com'
    ],
    highRiskRegistrars: [
        'namesilo', 'namecheap', 'gname', 'alibaba', 'godaddy',
        'gmo', 'reg.ru', 'dynadot', 'porkbun', 'tucows'
    ],
    suspiciousDomainFragments: [
        '-tw', '-com', '-online'
    ],
    safeSubdomainLabels: [
        'www', 'm', 'mobile', 'api', 'app', 'admin', 'auth', 'login',
        'shop', 'store', 'blog', 'news', 'help', 'support', 'static',
        'assets', 'cdn', 'img', 'images', 'media', 'mail', 'email',
        'smtp', 'webmail', 'tw', 'en', 'zh', 'www2'
    ],
    fakeServiceKeywords: [
        'einvoice', 'taipower', 'water', 'fetc'
    ],
    scamKeywords: [
        'ctbc', 'ctbcbank', 'cathay', 'taishin', 'esun', 'fubon', 'post-gov',
        '7-11-com', 'myship-711', '711-tw', 'familytw', 'famiport', 'myship',
        'com-tw', '-online', '-verify', '-login'
    ],
    sensitiveUrlParams: [
        'token=', 'session=', 'auth=', 'verify=', 'verification=', 'login='
    ],
    sensitiveFormKeywords: [
        'password', 'passwd', 'pwd', 'passcode', 'otp', 'pin', 'verify',
        'verification', 'auth', 'token', 'session', 'login', 'account',
        'username', 'userid', 'idnumber', 'identity', 'creditcard', 'cardnumber',
        'cvv', 'cvc', 'expire', 'expiry', 'bank', '身分證', '身份證',
        '統一編號', '信用卡', '卡號', '驗證碼', '簡訊碼', '密碼',
        '帳號', '銀行', '金融卡', '有效期限', '安全碼'
    ],
    apkInstallKeywords: [
        'apk', 'android', 'app下載', '下載app', '立即下載', '下載安裝',
        '下载安装', '立即安装', '安全安装', '安裝包', '安装包',
        '允許安裝未知來源', '允许安装未知来源', '未知來源', '未知来源',
        '客服app', '官方app', '手機版下載'
    ],
    suspiciousDownloadPathFragments: [
        '/publiccms/', '/cms/', '/dxz/', '/download/', '/downloads/',
        '/apk/', '/app/', '/install/', '/static/apk/', '/package/',
        '/update/', '/index.html'
    ],
    trustedResourceDomains: [
        'google.com', 'googleapis.com', 'gstatic.com', 'googletagmanager.com',
        'google-analytics.com', 'cloudflare.com', 'cloudflareinsights.com',
        'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'bootstrapcdn.com',
        'jquery.com', 'facebook.net', 'youtube.com', 'stripe.com', 'sentry.io',
        'intercom.io', 'intercomcdn.com', 'cloudfront.net', 'imgix.net',
        'cdnjs.com', 'hotjar.com', 'clarity.ms', 'yandex.ru'
    ],
    protectedBrands: [
        { name: '中國信託', keywords: ['ctbc', 'ctbcbank'], domains: ['ctbcbank.com', 'ctbc.tw'] },
        { name: '國泰世華', keywords: ['cathay', 'cathaybk'], domains: ['cathaybk.com.tw'] },
        { name: '玉山銀行', keywords: ['esun', 'esunbank'], domains: ['esunbank.com.tw', 'esunbank.com'] },
        { name: '台新銀行', keywords: ['taishin', 'taishinbank'], domains: ['taishinbank.com.tw'] },
        { name: '富邦銀行', keywords: ['fubon', 'taipeifubon'], domains: ['fubon.com', 'taipeifubon.com.tw'] },
        { name: '中華郵政', keywords: ['postgov'], domains: ['post.gov.tw'] },
        { name: '統一超商', keywords: ['711', 'seven', 'myship'], domains: ['7-11.com.tw', 'myship.7-11.com.tw'] },
        { name: '全家便利商店', keywords: ['family', 'familymart', 'famiport'], domains: ['family.com.tw', 'famiport.com.tw', 'famistore.com.tw'] },
        { name: '台灣電力公司', keywords: ['taipower'], domains: ['taipower.com.tw'] },
        { name: '遠通電收', keywords: ['fetc'], domains: ['fetc.net.tw'] }
    ]
};
