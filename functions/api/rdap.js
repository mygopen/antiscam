export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return new Response(JSON.stringify({ error: "Missing domain" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 使用 rdap.org 作為統一入口，它會自動幫我們轉址到正確的註冊局 (例如 Verisign, TWNIC)
  const targetUrl = `https://rdap.org/domain/${domain}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AntiScam-Tool/1.0"
      }
    });

    // 取得資料
    const data = await response.json();

    // 直接回傳給前端 (因為是同源，不需要設定 CORS Header)
    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        // 設定快取 1 小時，避免重複查詢浪費資源
        "Cache-Control": "public, max-age=3600" 
      }
    });

  } catch (err) {
    // 處理查不到或錯誤的情況
    return new Response(JSON.stringify({ error: "Query failed", details: err.message }), {
      status: 500, // 或是 404
      headers: { "Content-Type": "application/json" }
    });
  }
}