# Cofacts 群眾回報風險同步

本功能將 Cofacts 視為「群眾回報與協作查核來源」，不把單一民眾回報直接等同為已確認詐騙。

## 啟用正式同步

1. 依 [Cofacts 資料使用者條款](https://github.com/cofacts/rumors-api/blob/master/LEGAL.md)向 Cofacts WG 申請 API client application。
2. 在 GitHub Actions secrets 設定 `COFACTS_APP_SECRET`；若 Cofacts 核發的是 app ID，則設定 `COFACTS_APP_ID`。
3. 手動執行 `Sync Cofacts Risk Signals` workflow 驗證第一次同步。

未設定正式憑證時，排程會安全跳過，不會改用網站爬蟲或冒用其他應用程式的憑證。

## 排程

- 每 6 小時：取得新文章，以及近期新增查核回應的舊文章。
- 每週：重新查詢所有已追蹤案件，處理查核改判、刪除、封鎖與回應歧異。
- API 失敗：保留上一次成功產生的索引，不會清空資料。

## 分級

| Cofacts 狀態 | 加權 | 強風險 |
| --- | ---: | :---: |
| 單一回報、尚無查核 | 15 | 否 |
| 三人以上要求查核、尚無結論 | 25 | 否 |
| 一般 `RUMOR` 回應 | 40 | 否 |
| `RUMOR` 回應明確提到詐騙 | 50 | 否 |
| 明確詐騙回應且正面評價較多 | 65 | 是 |
| 兩筆以上明確詐騙回應 | 70 | 是 |
| `RUMOR` 與 `NOT_RUMOR` 並存 | 10 | 否，轉人工確認 |

`RUMOR` 表示查核者認為訊息含錯誤資訊，並不必然表示網站涉及詐騙。

## 網址範圍

一般獨立網域可比對根網域與子網域。Weebly、Netlify、Cloudflare Pages、Blogspot、短網址及社群平台等多人共用網域，只比對完整網址，不會因單一案件封鎖整個平台。

## 授權與顯名

Cofacts 資料採 CC BY-SA 4.0。掃描結果命中時，畫面必須保留原始案件 URI 與以下顯名文字：

> 本編輯資料取自「Cofacts 真的假的」訊息回報機器人與查證協作社群，採 CC BY-SA 4.0 授權提供。
