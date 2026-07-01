export const manualOfficialAlerts = [
    {
        source: '中華民國公平交易委員會',
        category: '廣告不實處分',
        title: '秦龍國際有限公司小老闆網路商城一頁式廣告銷售商品處分案',
        productName: '小老闆網路商城一頁式廣告',
        rootDomain: 'smallbossstore.com',
        urls: [
            'https://www.smallbossstore.com'
        ],
        publishedDate: '2018-12-03',
        violationType: '違反公平交易法第21條第1項規定',
        warning: '公平交易委員會處分書記載，該公司使用 www.smallbossstore.com 及一頁式廣告銷售商品時，涉有虛偽不實及引人錯誤之表示，曾處新臺幣 5 萬元罰鍰。',
        claimSummary: '此為官方裁罰紀錄造成的消費風險訊號；同網域商品頁建議提高警覺並查證交易條件、退貨與客服資訊。',
        sourceUrl: 'https://www.ftc.gov.tw/uploadDecision/6d358c1d-2b8c-49fc-b44a-39c7f1f96f9a.pdf'
    },
    {
        source: '衛生福利部食品藥物管理署',
        category: '年度十大違規食藥廣告產品',
        title: '113 年十大違規食藥廣告產品：活化勝',
        productName: '活化勝',
        rootDomain: 'healthezgo.com',
        matchScope: 'url-prefix-only',
        urls: [],
        urlPrefixes: [
            'https://tw.healthezgo.com/sale/57/1572'
        ],
        publishedDate: '2025-03-19',
        violationType: '違反食品安全衛生管理法第28條第2項規定（涉醫療效能）',
        warning: '衛福部新聞稿附件列「活化勝」為 113 年度十大違規食藥廣告產品之一，裁罰總額新臺幣 308 萬元；此筆警示限定命中特定商品頁，不代表整個 healthezgo.com 網域均經公告。',
        claimSummary: '官方名單為產品層級紀錄；命中特定商品頁時提高消費警示，並建議查證廣告宣稱與交易條件。',
        sourceUrl: 'https://www.mohw.gov.tw/dl-93967-6e2f6f68-83bf-4ac3-bcdc-2ffdb743d1fa.html'
    },
    {
        source: '衛生福利部食品藥物管理署',
        category: '涉嫌違規廣告產品',
        title: '國外網站涉嫌違規廣告產品：潤姬桃子',
        productName: '潤姬桃子',
        rootDomain: 'special-newseeds.com',
        urls: [
            'https://special-newseeds.com/uhmk/item/uhmktwit240704v104hcn.php?waxc=UHdg52anNXbGSzHy.7whg4cn'
        ],
        publishedDate: '2024-07-18',
        monitoredDate: '2024-07-05',
        violationType: '違反食品安全衛生管理法第28條規定',
        warning: '食藥署公告此網址涉嫌違規廣告產品，提醒消費者勿信勿購買。',
        claimSummary: '宣稱消除痘疤、斑點、法令紋、臨床實驗確認等誇大療效或易生誤解詞句。',
        sourceUrl: 'https://www.fda.gov.tw/tc/newsContent.aspx?cid=5085&id=113P1066&type=pmds'
    }
];
