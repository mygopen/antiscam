export async function onRequest(context) {
  const { request } = context;
  const urlParams = new URL(request.url).searchParams;
  let targetUrl = urlParams.get("url");

  // 1. 基礎參數檢查
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 自動補上 https (如果使用者沒輸入)
  if (!targetUrl.startsWith("http")) {
    targetUrl = "https://" + targetUrl;
  }

  // --- 安全保險絲設定 (Circuit Breaker) ---
  const MAX_REDIRECTS = 6;       // 保險 1: 最大跳轉層數 (超過此數強制斬斷，視為高風險)
  const GLOBAL_TIMEOUT = 8000;   // 保險 2: 最大執行時間 8秒 (超過強制斬斷，防止卡死)
  
  let currentUrl = targetUrl;
  let redirectChain = [];        // 存放完整的轉址路徑
  let redirectCount = 0;
  let isHighRisk = false;
  let riskReason = "";
  
  // 用來偵測 A -> B -> A 這種鬼打牆迴圈
  let seenUrls = new Set();
  seenUrls.add(currentUrl);

  // 設定全域計時器
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);

  try {
    // 開始剝洋蔥 (逐層追蹤)
    while (redirectCount < MAX_REDIRECTS) {
      
      try {
// 發送請求 (使用 manual 模式，不讓系統自動跳轉，我們要自己控制)
        const response = await fetch(currentUrl, {
          redirect: "manual", 
          signal: controller.signal, // 綁定計時器
          headers: {
            // 👇 增強偽裝 1：假裝是台灣的 iPhone 用戶
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            // 👇 增強偽裝 2：假裝瀏覽器語系是台灣繁體中文
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            // 👇 增強偽裝 3：假裝接受一般的網頁格式，降低機器人特徵
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
          }
        });

        // 紀錄這一層的結果
        redirectChain.push({
          url: currentUrl,
          status: response.status
        });

        // 檢查狀態碼是否為 HTTP 標準轉址
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("Location");
          if (!location) break;
          let nextUrl = new URL(location, currentUrl).href;

          if (seenUrls.has(nextUrl)) {
            isHighRisk = true;
            riskReason = "偵測到惡意迴圈 (Loop)，網站試圖導向重複路徑，企圖癱瘓檢測。";
            break; 
          }
          seenUrls.add(nextUrl);
          currentUrl = nextUrl;
          redirectCount++;
          
        } else if (response.status === 200) {
          // 👇 新增：破解前端轉址 (Meta Refresh & JS Redirect)
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("text/html")) {
              const text = await response.text();
              // 抓取 <meta http-equiv="refresh" content="0;url=...">
              const metaMatch = text.match(/content=["']?\d+;\s*url=([^"'>\s]+)["']?/i);
              // 抓取 window.location = "..."
              const jsMatch = text.match(/location(?:\.href|\.replace|\.assign)?\s*=\s*["']([^"'>]+)["']/i);
              
              let nextUrlStr = null;
              if (metaMatch) nextUrlStr = metaMatch[1];
              else if (jsMatch) nextUrlStr = jsMatch[1];

              if (nextUrlStr) {
                  nextUrlStr = nextUrlStr.replace(/&amp;/g, '&'); // 解碼 HTML 實體
                  let nextUrl = new URL(nextUrlStr, currentUrl).href;
                  
                  if (seenUrls.has(nextUrl)) {
                      isHighRisk = true;
                      riskReason = "偵測到前端惡意迴圈 (JS Loop)。";
                      break;
                  }
                  seenUrls.add(nextUrl);
                  currentUrl = nextUrl;
                  redirectCount++;
                  continue; // 繼續剝下一層洋蔥
              }
          }
          // 如果 200 OK 裡面沒有發現前端轉址，才真正結束
          break; 
        } else {
          break; 
        }

      } catch (fetchError) {
        // 特別處理超時錯誤
        if (fetchError.name === 'AbortError') {
           isHighRisk = true;
           riskReason = "檢測超時 (Timeout)，轉址過程過長或伺服器惡意延遲回應。";
           break;
        }
        // 其他網路錯誤 (DNS解析失敗等)，視為檢查結束
        throw fetchError; 
      }
    }

    // 清除計時器 (重要！釋放資源)
    clearTimeout(timeoutId);

    // --- 最終風險智慧判定 ---
if (!isHighRisk) { 
        // 如果上面沒抓到迴圈或超時，這裡進行次數判斷
        if (redirectCount >= MAX_REDIRECTS) {
            isHighRisk = true;
            riskReason = `轉址路徑過深 (超過 ${MAX_REDIRECTS} 層)，強制中止。正常網站極少轉址這麼多次。`;
        } else if (redirectCount >= 5) { // 👈 修正：將 3 改為 5，容忍正常電商的多次跳轉
            isHighRisk = true;
            riskReason = `偵測到多重轉址 (${redirectCount} 次)，常見於詐騙連結規避掃描。`;
        } else {
            // 檢查是否包含知名的高風險短網址服務
            const riskyShorteners = ['i.gal', 'bit.do', 'is.gd', 'tiny.cc', 't.cn'];
            const hasRiskyShortener = redirectChain.some(hop => riskyShorteners.some(risk => hop.url.includes(risk)));
            
            if (hasRiskyShortener && redirectCount >= 1) {
                isHighRisk = true;
                riskReason = "使用了常被詐騙集團濫用的短網址服務。";
            }
        }
    }

    // 回傳 JSON 結果
    return new Response(JSON.stringify({
      finalUrl: currentUrl,
      redirectCount: redirectCount,
      chain: redirectChain,
      isHighRisk: isHighRisk,
      riskReason: riskReason
    }), {
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store" // 轉址追蹤不建議快取，因為詐騙連結變化很快
      }
    });

  } catch (err) {
    clearTimeout(timeoutId);
    return new Response(JSON.stringify({ 
      error: "Trace failed", 
      details: err.message,
      chain: redirectChain 
    }), {
      status: 500,
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
