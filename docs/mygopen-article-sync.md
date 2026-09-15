# MyGoPen 文章同步與審核

更新日期：2026-09-15

## 資料來源與界線

- 使用 MyGoPen 自己的 Blogger 公開 Feed，不使用外部搜尋 API 或雲端 AI。
- 搜尋頁 `/search?q=詐騙` 可供編輯瀏覽，但不當作完整文章清單。
  同步使用 `/feeds/posts/default?alt=json&orderby=updated`，分頁後在本機篩選
  標題、分類與內文中的詐騙、釣魚、假冒等相關詞，避免只靠單一搜尋字漏收。
- 自動發現的候選文章與人工核准的推薦設定分開。候選不會自動改變風險規則。
- 標題前綴初步區分 scam、clarification、reference，仍需編輯閱讀原文確認。
- 不保存完整文章內文，只存標題、來源網址、日期、分類、通用關鍵詞、內容指紋
  與同步狀態。正文僅於同步記憶體內用於篩選和計算指紋。
- 使用者截圖、OCR 文字與個資不會進入 Feed 請求、GitHub 或搜尋服務。

## 檔案

- `data/mygopen-candidates.json`：自動同步的公開來源快照，包含歷史游標。
- `data/mygopen-reviews.json`：人工核准的推薦條件與來源指紋。
- `docs/mygopen-review-queue.md`：候選、變更與疑似撤除清單。
- `article-search.js`：瀏覽器本機比對。建置只帶入核准且來源相符的文章，
  不把完整候選清單或審核者資料發布到網站資產。

## 免費排程

工作流程 `Sync MyGoPen Article Candidates` 每週三台灣時間 03:19 排程，
也可在 GitHub Actions 手動執行。GitHub 排程可能延遲，不保證準點。
只允許公開儲存庫的標準 ubuntu-latest 執行器，私有儲存庫直接略過。
不使用付費大型執行器、Actions artifact 或新增套件快取。

每次最多四頁、每頁 50 篇，另外查核最多十篇已核准文章。
每次先刷新最新 50 篇，再接續歷史游標；最初匯入不是完整全站索引。
單次請求限 15 秒及 4 MiB，總候選上限 6,000 篇；超限、非預期轉址、
Feed 格式錯誤或連線失敗，都中止這次同步，保留上一份快照與游標。

結果推到 `codex/mygopen-article-sync`，建立或更新 PR，**不會自動合併**。
若 GitHub 不允許 Actions 建立 PR，可手動從此分支建立 PR，或到
Settings > Actions > General 開啟允許 Actions 建立 PR 的設定。
候選分支與 main 合併衝突時停止，交由編輯處理，不會強制覆蓋。

## 審核操作

1. 開啟 PR 中的待審核清單，閱讀 MyGoPen 原文與更正資訊。
2. 確認是詐騙手法、澄清查核或參考資料；只有題材相似不能當成詐騙證據。
3. 有相同題材時，可使用已有設定作為起點，明確留下審核者：

```sh
npm run review:mygopen-article -- \
  --url https://www.mygopen.com/2025/12/email-qrcode.html \
  --profile work-group-qr --kind scam --reviewer YOUR_NAME --confirm
```

指令不會閱讀文章或替人判斷；執行前必須確認原文、類型與詞組符合。
`--profile` 是既有推薦設定 ID。新題材不能任意沿用不相干設定：請直接編輯
reviews JSON 的 groups、required 與通用同義詞，再測試並記錄審核。
至少需要兩個不同概念；不可只靠品牌、LINE 或 QR Code 推薦文章。
新增文章不會自動繼承風險規則 ID。

4. 執行 `npm run build:verified`，檢查 Git diff，核准後合併 PR。
   新索引隨網站既有發布流程生效。只合併候選清單不會核准新文章。
5. 不適合推薦時設 `status: withdrawn`，在下次發布移除；風險規則需另外審核。

## 更新與撤除

- 原文、連結、分類或更新時間改變，內容指紋就不同，建置時會排除舊審核，
  直到重新確認並記錄新的指紋。文章類型改變也不能沿用原審核。
- 已核准文章用精確 path 查核；兩次成功同步分別取得 404 才停止推薦。
  一次暫時錯誤不清空資料，文章沒出現在某一頁也不代表已撤除。
- 這些排除措施在候選 PR 合併並發布後生效，不是線上即時撤除服務。
  緊急撤除應直接更新 reviewed 設定並發布，不必等待週排程。
- 審核超過 366 天時，本機搜尋不再推薦，需重新審核。

## 驗證

`tests/mygopen-sync.test.js` 涵蓋來源限制、大小上限、斷線保留、分頁游標、
內容指紋、撤除與人工核准；`tests/article-search.test.js` 驗證比對與風險分離。
瀏覽器回歸指令為 `node scripts/check-screenshot-preview.cjs`，需可用的 Playwright。
