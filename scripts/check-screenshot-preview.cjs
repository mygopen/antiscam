// Run after build, with PLAYWRIGHT_MODULE pointing to an installed Playwright.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'text/html');
    res.end(fs.readFileSync(file));
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
                window.jsQR = () => null;
                window.Tesseract = { recognize: async () => ({ data: { text: '', confidence: 95 } }) };
                // Reproduce environments where a temporary preview URL is unavailable.
                URL.createObjectURL = () => { throw new Error('Temporary URLs unavailable'); };
            });
            await page.route('**/api/cf-vision', route => {
                aiCalls++;
                return route.fulfill({ json: { status: 'quota', risk: 'unknown', urls: [],
                    notice: '今日 AI 免費使用額度不足，已停止 AI。', report: '⚠️ 風險：無法判定' } });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/`);
            const input = page.locator('#image-upload');
            await input.waitFor({ state: 'attached' });
            const png = Buffer.from(await page.evaluate(() => {
                const canvas = document.createElement('canvas');
                canvas.width = 240; canvas.height = 160;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#147d64'; ctx.fillRect(0, 0, 240, 160);
                ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText('PREVIEW TEST', 20, 85);
                return canvas.toDataURL('image/png').split(',')[1];
            }), 'base64');
            const upload = () => input.setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            const assertPreview = async () => {
                const preview = page.getByAltText('上傳的截圖', { exact: true });
                await preview.waitFor();
                await page.waitForFunction(() => {
                    const img = document.querySelector('img[alt="上傳的截圖"]');
                    return img?.complete && img.naturalWidth === 240;
                });
                assert.match(await preview.getAttribute('src'), /^data:image\/png;base64,/);
                const color = await preview.evaluate(img => {
                    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
                });
                assert.deepEqual(color, [20, 125, 100, 255]);
            };
            await upload(); await assertPreview();
            assert.equal(aiCalls, 0);
            await page.getByRole('button', { name: 'AI 圖片複核', exact: true }).click();
            await page.getByText('今日 AI 免費使用額度不足，已停止 AI。', { exact: true }).waitFor();
            await assertPreview(); assert.equal(aiCalls, 1);
            // A missing createImageBitmap must not break the independent preview decoder.
            await page.evaluate(() => { window.createImageBitmap = undefined; });
            await upload(); await assertPreview();
            await input.setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
            await page.getByText(/圖片無法顯示，可能是格式不支援/).waitFor();
            await assertPreview(); // Keep the last valid preview on a failed replacement.
            assert.equal(aiCalls, 1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-preview-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            await page.getByRole('button', { name: '開啟聊天小幫手' }).focus();
            await page.getByRole('button', { name: '開啟聊天小幫手' }).press('Enter');
            await page.getByRole('button', { name: '開始對話' }).click();
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            const chatImage = page.locator('img[src^="data:image/png"]');
            await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/png"]').length === 2);
            assert.ok((await chatImage.evaluateAll(images => images.every(img => img.complete && img.naturalWidth === 240))));
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}px: thumbnail pixels, reupload, manual AI failure, missing bitmap API, corrupt format and chat preview; no extra AI.`);
            await page.close();
        }
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
