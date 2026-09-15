# 樹屋競賽投票頁查核

查核日期：2026-09-15

## 公開依據

- https://portal.ptc.edu.tw/bulletin/view.php?sn=B115002117
  屏東縣政府教育處公告列出協會競賽官方徵件網址。
- https://www.cyc.edu.tw/modules/tadnews/index.php?nsn=92298
  嘉義縣教育資訊網公告活動，列出 9/15 至 9/30 人氣票選時程。
- https://3housetw.org/ 與
  https://3housetw.org/competition_2026/youth-track.html
  本次直接讀取 HTML，兩頁均含指向 https://vote.3housetw.org/ 的投票連結。
- https://vote.3housetw.org/
  公開頁列出 2026 國際樹屋設計競賽線上畫廊、主辦單位、每人十票及防灌票規則。
  可讀 HTML 的投票釣魚分析為 none；未登入、未投票、未提交個資。

## 誤判重現與修正

以公開 HTML 的投票訊號套入正式評分核心，威脅服務用未命中的測試替身：
內容正常時 low / 0；模擬爬取 blocked 時 high / 100。
原因為主網域 3housetw 被英數混合規則視為亂碼，疊加內容未取得後升高風險，
並非投票關鍵詞本身。這是可重現的誤判路徑，不代表已取得使用者當次掃描紀錄。

- 僅將 vote.3housetw.org 加入精確可信主機及人工內容基線，不擴及兄弟或下層子網域。
- 數字只位於可讀字母名稱前後時，不再單憑英數混合視為亂碼。
  稀有字母排列、無母音、交錯亂碼等其他條件不變，也不因此自動認定安全。
- 未列信任的可讀數字名稱遇內容抓取失敗，維持 unknown，不直接變 low。
- Google 威脅、黑名單、官方警示及直接收取 LINE 帳密等強證據仍可翻轉為 high。
- 威脅查詢未完成仍為 unknown；人工基線不聲稱本次完整取得頁面。
- 不新增統編或法人登記資訊，活動來源不能取代登記資料查核。

回歸：tests/scan-core.test.js 與既有合法投票／LINE OAuth 測試。
