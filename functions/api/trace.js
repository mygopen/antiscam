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

  if (!targetUrl.startsWith("http")) {
    targetUrl = "https://" + targetUrl;
  }

  // --- 設定 ---
  const MAX_REDIRECTS = 8;
  const GLOBAL_TIMEOUT = 12000; // 延長至 12 秒以容納雙重檢測
  
  // User-Agents
  const UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
  const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  let currentUrl = targetUrl;
  let redirectChain = [];
  let redirectCount = 0;
  let isHighRisk = false;
  let riskReason = "";
  let cloakingDetected = false;
  
  let seenUrls = new Set();
  seenUrls.add(currentUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GLOBAL_TIMEOUT);

  // --- Helper: 執行單次請求 ---
  const fetchPage = async (url, ua, manualRedirect = true) => {
    try {
      const res = await fetch(url, {
        redirect: manualRedirect ? "manual" : "follow",
        signal: controller.signal,
        headers: { "User-Agent": ua }
      });
      return res;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Timeout');
      throw e;
    }
  };

  try {
    // --- 階段一：深度轉址追蹤 (Mobile View) ---
    // 釣魚簡訊通常針對手機優化，因此主檢測使用 Mobile UA
    while (redirectCount < MAX_REDIRECTS) {
      
      const response = await fetchPage(currentUrl, UA_MOBILE, true);
      const status = response.status;
      let nextUrl = null;
      let redirectType = "http"; // http | meta | js

      // 讀取內容以檢查 DOM 轉址 (僅在非 HTTP 轉址且狀態為 200 時檢查)
      let htmlContent = "";
      if (status === 200) {
        try {
            htmlContent = await response.text();
        } catch(e) {}
      }

      redirectChain.push({
        url: currentUrl,
        status: status
      });

      // 1. HTTP Redirect (3xx)
      if (status >= 300 && status < 400) {
        const location = response.headers.get("Location");
        if (location) {
            nextUrl = new URL(location, currentUrl).href;
        }
      } 
      // 2. DOM Redirect (Meta Refresh / JS) - 針對 200 OK 的頁面檢查
      else if (status === 200 && htmlContent) {
        // Check <meta http-equiv="refresh" content="0;url=...">
        const metaMatch = htmlContent.match(/<meta\s+http-equiv=["']?refresh["']?\s+content=["']?(\d+)?;\s*url=(.*?)["']?/i);
        if (metaMatch) {
            const delay = parseInt(metaMatch[1] || "0");
            // 只有短時間內的跳轉才視為轉址行為
            if (delay <= 10) {
                nextUrl = new URL(metaMatch[2], currentUrl).href;
                redirectType = "meta-refresh";
            }
        }

        // Check window.location = "..."
        if (!nextUrl) {
            const jsMatch = htmlContent.match(/(?:window|self|top)\.location(?:\.href)?\s*=\s*["'](.*?)["']/);
            if (jsMatch) {
                nextUrl = new URL(jsMatch[1], currentUrl).href;
                redirectType = "javascript";
            }
        }
      }

      // 判斷是否繼續追蹤
      if (nextUrl) {
        if (seenUrls.has(nextUrl)) {
          isHighRisk = true;
          riskReason = "偵測到惡意迴圈 (Loop)，網站試圖導向重複路徑。";
          break;
        }
        
        // 記錄轉址類型 (如果是前端轉址，更新上一筆紀錄)
        if (redirectType !== 'http') {
             redirectChain[redirectChain.length - 1].note = `Client-side Redirect (${redirectType})`;
        }

        seenUrls.add(nextUrl);
        currentUrl = nextUrl;
        redirectCount++;
      } else {
        // 到達終點
        break; 
      }
    }

    // --- 階段二：Cloaking 檢測 (偽裝防禦) ---
    // 如果主要檢測看起來正常 (或是轉址數不多)，我們嘗試用 Desktop UA 再跑一次
    // 比較兩者的「最終狀態碼」或「最終網址」是否差異過大
    if (!isHighRisk && redirectCount < MAX_REDIRECTS) {
        try {
            // 為了節省時間，Desktop 檢測通常只看第一層或讓它自動跳轉
            // 這裡我們只請求原始 TargetUrl 看反應
            const resDesktop = await fetch(targetUrl, {
                redirect: "manual",
                signal: controller.signal,
                headers: { "User-Agent": UA_DESKTOP }
            });

            // 取得第一層的 Mobile 結果 (redirectChain[0])
            const firstHopMobile = redirectChain[0];

            // 判定邏輯：
            // 1. 如果 Mobile 是轉址 (3xx) 但 Desktop 是 200 OK (或 404) -> 針對手機的詐騙
            // 2. 如果 Mobile 是 200 OK 但 Desktop 是 403/404 -> 針對特定流量封鎖
            
            const mobileStatus = firstHopMobile.status;
            const desktopStatus = resDesktop.status;

            const isMobileRedirect = mobileStatus >= 300 && mobileStatus < 400;
            const isDesktopRedirect = desktopStatus >= 300 && desktopStatus < 400;

            if (isMobileRedirect !== isDesktopRedirect) {
                // 狀態性質不同 (一個轉址、一個不轉)
                cloakingDetected = true;
                riskReason = `偵測到偽裝行為 (Cloaking)：手機版與電腦版行為不一致 (Mobile: ${mobileStatus}, Desktop: ${desktopStatus})。`;
                isHighRisk = true;
            } else if (isMobileRedirect && isDesktopRedirect) {
                // 都是轉址，檢查目的地是否相同
                const locDesktop = resDesktop.headers.get("Location");
                // 簡易比對，若差異過大視為風險
                // 這裡暫不實作深度比對以免誤判 CDN 分流
            }

        } catch (e) {
            // Desktop fetch 失敗不一定要報錯，可能是連線問題，忽略
        }
    }

    clearTimeout(timeoutId);

    // --- 最終風險判定 ---
    if (!isHighRisk) {
        if (redirectCount >= MAX_REDIRECTS) {
            isHighRisk = true;
            riskReason = `轉址路徑過深 (超過 ${MAX_REDIRECTS} 層)。`;
        } else if (redirectCount >= 3) {
            isHighRisk = true;
            riskReason = `偵測到多重轉址 (${redirectCount} 次)，常見於規避掃描。`;
        } else {
            // 檢查危險短網址
            const riskyShorteners = ['i.gal', 'bit.do', 'is.gd', 'tiny.cc', 't.cn', 'mz.cm'];
            const hasRiskyShortener = redirectChain.some(hop => riskyShorteners.some(risk => hop.url.includes(risk)));
            if (hasRiskyShortener && redirectCount >= 1) {
                isHighRisk = true;
                riskReason = "使用了高風險短網址服務。";
            }
        }
    }

    return new Response(JSON.stringify({
      finalUrl: currentUrl,
      redirectCount: redirectCount,
      chain: redirectChain,
      isHighRisk: isHighRisk,
      riskReason: riskReason,
      cloakingDetected: cloakingDetected
    }), {
      headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
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
