// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(root + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
    }
    let data = fs.readFileSync(file);
    if (pathname === '/app.js') data = data.toString().replace(
        'const runRiskAndBrandScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {',
        `const runRiskAndBrandScan = async (targetDomain, fullUrl, currentWhitelist = [], scanOptions = {}) => {
            window.__scans.push(fullUrl);
            return { scanData: { isInvalid: true, domain: targetDomain, riskScore: 0, checks: {}, details: {} }, skipAiBrandAnalysis: true };`
    );
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html');
    res.end(data);
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    try {
        for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
            const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
            const errors = [];
            let aiCalls = 0;
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                window.__scans = [];
                window.jsQR = () => null;
                window.Tesseract = { recognize: async () => {
                    if (window.__ocrFailure) throw new Error('OCR unavailable');
                    return { data: { text: window.__ocrText || '', confidence: 95 } };
                } };
            });
            await page.route('**/api/cf-vision', route => {
                aiCalls++;
                return route.fulfill({ json: { risk: 'none', urls: [], report: '⚠️ 風險：未發現明顯內容風險\n🔍 分析：模型沒有辨識到風險。' } });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/`);
            await page.locator('#image-upload').waitFor({ state: 'attached', timeout: 60000 });
            const png = Buffer.from(await page.evaluate(() => {
                const canvas = document.createElement('canvas');
                canvas.width = 200; canvas.height = 100;
                const context = canvas.getContext('2d');
                context.fillStyle = '#fff'; context.fillRect(0, 0, 200, 100);
                return canvas.toDataURL('image/png').split(',')[1];
            }), 'base64');
            const upload = () => page.locator('#image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            const report = page.getByText('⚠️ 風險：無法判定', { exact: true });
            const high = page.getByText('⚠️ 風險：高風險', { exact: true });

            await upload();
            await report.waitFor();
            assert.equal(aiCalls, 0);
            assert.match(await report.getAttribute('class'), /text-gray-700/);
            await page.evaluate(() => { window.__ocrFailure = true; });
            await upload();
            await report.waitFor();
            assert.equal(aiCalls, 0);
            await page.evaluate(() => { window.__ocrFailure = false; window.__ocrText = '中華電信\n請登入官方 App 查詢帳單'; });
            await upload();
            await report.waitFor();
            assert.equal(aiCalls, 0);

            await page.evaluate(() => { window.__ocrText = '賣貨便賣家認證\n請先匯款新臺幣1000元'; });
            await upload();
            await high.waitFor();
            assert.equal(aiCalls, 0);
            assert.match(await high.getAttribute('class'), /text-red-700/);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation => animation.finished)));
            await page.getByRole('link', { name: '7-ELEVEN 賣貨便官方資料', exact: true }).waitFor();
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-local-high-${viewport.width}.png`), fullPage: true });

            await page.getByRole('button', { name: 'AI 圖片複核', exact: true }).click();
            await page.waitForFunction(() => !document.body.innerText.includes('正在進行圖片內容複核'));
            await high.waitFor();
            assert.equal(aiCalls, 1);

            await page.evaluate(() => { window.__ocrText = '國泰世華帳戶驗證\n請將OTP傳給客服\nhttps://www.cathaybk.com.tw/\nhttps://example.com/Second'; });
            await upload();
            await high.waitFor();
            await page.getByRole('button', { name: 'https://example.com/Second', exact: true }).click();
            await high.waitFor();
            assert.deepEqual(await page.evaluate(() => window.__scans), ['https://www.cathaybk.com.tw/', 'https://example.com/Second']);
            assert.equal(aiCalls, 1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}px: local high/unknown/failure, zero automatic vision calls, manual review preserves high, URL scans preserve content, no overflow or JS errors.`);
            await page.close();
        }
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
