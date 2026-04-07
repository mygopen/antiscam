// 檔案路徑：functions/api/check-blacklist.js

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain");

    if (!domain) {
        return new Response(JSON.stringify({ isBlacklisted: false }), { 
            status: 400, headers: { "Content-Type": "application/json" } 
        });
    }

    const lowerDomain = domain.toLowerCase();

    // 🔒 這是隱藏在後端的私有黑名單，前端與一般使用者絕對看不到
    const customBlacklist = [
        "farted.net",
        "mypersonalitylab.com",
        "eamyo.com",
        "jj678.tw",
        "renrenl.com",
        "tkouik.com",
        "ts1788.com",
        "tw-confirmation.com",
        "pini.tw",
        "soapants.com",
        "qcgexchange.com"
    ];

    // 檢查邏輯：完全符合，或是其子網域
    const isBlacklisted = customBlacklist.some(badDomain => 
        lowerDomain === badDomain || lowerDomain.endsWith('.' + badDomain)
    );

    return new Response(JSON.stringify({ isBlacklisted: isBlacklisted }), {
        headers: { "Content-Type": "application/json" }
    });
}
