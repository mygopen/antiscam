// 檔案路徑：sw.js
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // 保持空白即可，這只是為了滿足 PWA 安裝的技術要求
});
