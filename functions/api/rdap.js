export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  let domain = url.searchParams.get("domain"); // 使用 let 以便修改

  if (!domain) {
    return new Response(JSON.stringify({ error: "Missing domain" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // --- 關鍵修正開始 ---
  // 1. 強制轉小寫 (避免大小寫混用造成查詢失敗)
  domain = domain.toLowerCase();

  // 2. 移除開頭的 www. (RDAP 通常只查根網域)
  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }
  // --- 關鍵修正結束 ---

  // 指向 RDAP 引導服務
  const targetUrl = `https://rdap.org/domain/${domain}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AntiScam-Tool/1.0"
      }
    });

    if (!response.ok) {
       // 如果查不到，嘗試回傳更清楚的錯誤
       return new Response(JSON.stringify({ error: "Domain not found in RDAP", checkedDomain: domain }), {
         status: 404,
         headers: { "Content-Type": "application/json" }
       });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server Error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}