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
                document.execCommand = command => {
                    if (command !== 'copy') return false;
                    window.__copied = document.activeElement?.value;
                    return true;
                };
                window.__scans = [];
                let library;
                Object.defineProperty(window, 'ScanCore', {
                    get: () => library,
                    set(value) {
                        const create = value.create;
                        value.create = options => {
                            const core = create(options);
                            return { ...core, runRiskAndBrandScan: async (domain, url, whitelist, scanOptions) => {
                                window.__scans.push({ url, allowCloudAi: scanOptions.allowCloudAi });
                                return { scanData: { isInvalid: true, domain, riskScore: 0, checks: {}, details: {} }, skipAiBrandAnalysis: true };
                            } };
                        };
                        library = value;
                    }
                });
                window.__workers = 0;
                window.Tesseract = { createWorker: async () => {
                    window.__workers++;
                    return {
                        reinitialize: async () => {},
                        terminate: async () => {},
                        recognize: async () => {
                            if (window.__hang) return new Promise(() => {});
                            if (window.__fail) throw new Error('OCR unavailable');
                            if (window.__ocrSequence?.length) return { data: window.__ocrSequence.shift() };
                            return { data: { text: window.__ocrText || '', confidence: 95 } };
                        }
                    };
                } };
                // Reproduce environments where a temporary preview URL is unavailable.
                URL.createObjectURL = () => { throw new Error('Temporary URLs unavailable'); };
            });
            await page.route(/\/api\/(cf-vision|check-fake-brand|chat)(\?|$)/, route => {
                aiCalls++;
                return route.abort();
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
            assert.equal(await page.getByRole('button', { name: 'AI 圖片複核', exact: true }).count(), 0);
            const high = page.getByText('⚠️ 風險：高風險', { exact: true });
            const edit = async text => {
                await page.getByRole('button', { name: '檢視辨識文字', exact: true }).click();
                await page.getByLabel('辨識文字（可修正）', { exact: true }).fill(text);
                await page.getByRole('button', { name: '依修正文字重新判讀', exact: true }).click();
            };
            await edit('賣貨便賣家認證\n請先匯款新臺幣1000元');
            await high.waitFor();
            const methods = page.getByRole('region', { name: '165 防詐手法提醒' });
            await methods.getByRole('link', { name: '假買家騙賣家手法' }).waitFor();
            await methods.getByText(/不代表 165 已查證/).waitFor();
            await page.getByRole('button', { name: '一鍵複製檢測報告 (可貼至 LINE)', exact: true }).click();
            assert.match(await page.evaluate(() => window.__copied), /165dashboard.tw\/fraud-method\/334882749754118144/);
            await edit('');
            await high.waitFor();
            assert.equal(await methods.count(), 0, 'edited empty text clears method reminders');
            await page.getByText('依使用者修正文字判讀', { exact: true }).waitFor();
            await page.getByRole('button', { name: '裁切重新辨識', exact: true }).click();
            await page.getByLabel('寬度 %', { exact: true }).fill('50');
            assert.equal(await page.evaluate(() => document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-crop-${viewport.width}.png`), animations: 'disabled' });
            await page.getByRole('button', { name: '裁切並重新辨識', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('img[alt="上傳的截圖"]')?.naturalWidth === 120);
            await high.waitFor();
            assert.equal(await page.evaluate(() => window.__workers), 1, 'reuse OCR worker');
            await edit('https://example.com/Visible\nhttps://example.com/Second');
            await page.getByRole('button', { name: 'https://example.com/Visible', exact: true }).click();
            await page.waitForFunction(() => window.__scans.length === 1);
            await high.waitFor();
            await page.getByRole('button', { name: 'https://example.com/Second', exact: true }).click();
            await page.waitForFunction(() => window.__scans.length === 2);
            await page.getByRole('button', { name: '立即檢測', exact: true }).click();
            await page.waitForFunction(() => window.__scans.length === 3);
            await high.waitFor();
            assert.ok((await page.evaluate(() => window.__scans)).every(scan => scan.allowCloudAi === false));
            await page.evaluate(() => { window.__hang = true; });
            await upload();
            await page.getByRole('button', { name: '取消辨識', exact: true }).click();
            await page.getByText('已取消文字辨識，未完成的內容不能判定為安全。', { exact: true }).waitFor();
            await page.evaluate(() => { window.__hang = false; });
            await upload(); await assertPreview();
            await page.evaluate(() => { window.__fail = true; });
            await upload(); await assertPreview();
            await page.getByText('⚠️ 風險：無法判定', { exact: true }).waitFor();
            await page.evaluate(() => { window.__fail = false; });
            await page.evaluate(() => { window.__ocrText = '工作安排，請先建立一個LINE群組，請將QR Code回傳至此Email，先不要邀請其他人加入。'; });
            await upload(); await assertPreview();
            await high.waitFor();
            const related = page.getByRole('region', { name: 'MyGoPen 相關查核' });
            await related.getByRole('link', { name: /收到公司高層/ }).waitFor();
            assert.equal(await related.getByRole('link').first().getAttribute('href'), 'https://www.mygopen.com/2025/12/email-qrcode.html');
            await related.getByText(/相似手法參考/).waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-articles-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            await edit('國稅局所得稅退稅，請確認帳戶資料，最終通知');
            await related.getByRole('link', { name: /北區國稅局/ }).waitFor();
            assert.equal(await related.getByRole('link', { name: /收到公司高層/ }).count(), 0);
            await edit('無關旅遊照片');
            assert.equal(await related.count(), 0);
            await page.evaluate(() => { window.__ocrText = '麻煩你了\n一天可以投票\n請支持這個作\n品'; });
            await upload(); await assertPreview();
            const voteArticle = 'https://www.mygopen.com/2026/08/vote-scam.html';
            await related.locator(`a[href="${voteArticle}"]`).waitFor();
            await related.getByText(/相似手法參考/).waitFor();
            await page.getByText('⚠️ 風險：無法判定', { exact: true }).waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-vote-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            const invoiceSequence = () => page.evaluate(() => {
                const word = { text: 'invoice-fake.example', confidence: 95 };
                window.__ocrSequence = [
                    { confidence: 50, lines: [
                        { text: 'invoice-fake.example', confidence: 50, bbox: { x0: 10, y0: 2, x1: 200, y1: 15 } },
                        { text: 'E-Invoice Platform', confidence: 50 },
                        ...['手機號碼', '驗證碼（密碼）', '手機條碼'].map(text => ({ text, confidence: 95 }))
                    ] }, { words: [word] }, { words: [word] },
                    { lines: [{ text: '電子發票整合服務平台', confidence: 95 }] }
                ];
            });
            await invoiceSequence();
            await upload(); await assertPreview();
            await high.waitFor();
            await page.getByText(/畫面類型：網站登入頁截圖/).waitFor();
            assert.equal(await page.getByText(/寄件線索/).count(), 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-invoice-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            await page.evaluate(() => { window.__ocrText = '賣貨便實名認證，無法收款，請操作網銀並先匯款認證金。'; });
            await upload(); await assertPreview();
            await methods.getByRole('link', { name: '假買家騙賣家手法' }).waitFor();
            await related.getByRole('link', { name: /賣貨便/ }).waitFor();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-methods-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            await edit('家庭代工請勿寄送金融卡');
            assert.equal(await methods.count(), 0, 'negative instruction abstains');
            await edit('家庭代工請寄送金融卡');
            await methods.getByRole('link', { name: '假求職與騙取金融帳戶手法' }).waitFor();
            await page.evaluate(() => { window.__fail = true; });
            await upload();
            await methods.waitFor({ state: 'hidden' });
            await page.getByText('⚠️ 風險：無法判定', { exact: true }).waitFor();
            assert.equal(await methods.count(), 0, 'failed replacement OCR clears method reminders');
            await page.evaluate(() => { window.__fail = false; });
            await page.evaluate(() => { window.__ocrText = ''; });
            // A missing createImageBitmap must not break the independent preview decoder.
            await page.evaluate(() => { window.createImageBitmap = undefined; });
            await upload(); await assertPreview();
            await input.setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
            await page.getByText(/圖片無法顯示，可能是格式不支援/).waitFor();
            await assertPreview(); // Keep the last valid preview on a failed replacement.
            assert.equal(aiCalls, 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-preview-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            await page.getByRole('button', { name: '開啟聊天小幫手' }).focus();
            await page.getByRole('button', { name: '開啟聊天小幫手' }).press('Enter');
            await page.getByRole('button', { name: '開始對話' }).click();
            await page.evaluate(() => { window.__ocrText = 'eTag 帳戶代扣失敗\n寄件者: sender@upcmail.nl\n請登入服務平台\nhttps://example.com/Chat'; });
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            const chatImage = page.locator('img[src^="data:image/png"]');
            await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/png"]').length === 2);
            assert.ok((await chatImage.evaluateAll(images => images.every(img => img.complete && img.naturalWidth === 240))));
            await page.waitForFunction(() => window.__scans.some(scan => scan.url === 'https://example.com/Chat'));
            await page.evaluate(() => { window.__ocrText = '工作安排，請先建立一個LINE群組，請將QR Code回傳至此Email，先不要邀請其他人加入。'; });
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await page.getByRole('region', { name: 'MyGoPen 相關查核' }).getByRole('link', { name: /收到公司高層/ }).waitFor();
            await page.evaluate(() => { window.__ocrText = '麻煩你幫我的作品投票'; });
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await page.getByRole('region', { name: 'MyGoPen 相關查核' }).locator(`a[href="${voteArticle}"]`).waitFor();
            await invoiceSequence();
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await page.getByText(/畫面類型：網站登入頁截圖/).waitFor();
            await page.evaluate(() => { window.__ocrText = '投資平台無法出金，請先繳納稅金。'; });
            await page.locator('#bot-image-upload').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
            await methods.getByRole('link', { name: '假投資出金受阻手法' }).waitFor();
            await methods.getByRole('link', { name: '假投資出金受阻手法' }).scrollIntoViewIfNeeded();
            assert.equal(await methods.evaluate(element => element.scrollWidth <= element.clientWidth), true);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `antiscam-methods-chat-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
            assert.ok((await page.evaluate(() => window.__scans)).every(scan => scan.allowCloudAi === false));
            assert.equal(aiCalls, 0);
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}px: preview/crop/edit/cancel, main/chat article and 165 links, copy, replacement/abstention, URL scans; zero cloud AI.`);
            await page.close();
        }
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
