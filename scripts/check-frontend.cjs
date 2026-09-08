// Use PLAYWRIGHT_MODULE for an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkDeployment } = require('./check-deployment.cjs');
const directory = path.resolve(__dirname, '../dist');

async function main() {
    let server;
    let browser;
    const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'antiscam-startup-'));
    try {
        let url = process.argv[2];
        if (!url) {
            server = http.createServer((req, res) => {
                const pathname = new URL(req.url, 'http://localhost').pathname;
                const file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
                if (!file.startsWith(directory + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                    res.writeHead(404); res.end(); return;
                }
                res.setHeader('Content-Type', { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'text/html');
                res.end(fs.readFileSync(file));
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            url = `http://127.0.0.1:${server.address().port}/`;
        }
        console.log(await checkDeployment(url));
        browser = await chromium.launch({ headless: true });
        for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
            const page = await browser.newPage({ viewport });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            const input = page.getByLabel('待檢測網址', { exact: true });
            await input.waitFor({ state: 'visible', timeout: 20000 });
            await input.fill('https://myppt.cc/h9TSaS');
            assert.equal(await page.getByRole('button', { name: '立即檢測', exact: true }).isEnabled(), true);
            assert.equal(await page.getByRole('status').filter({ hasText: '網站正在載入' }).count(), 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(errors, []);
            const screenshot = path.join(screenshots, `${viewport.width}.png`);
            await page.screenshot({ path: screenshot });
            console.log(JSON.stringify({ viewport, rendered: true, errors, screenshot }));
            await page.close();
        }
        if (server) {
            const page = await browser.newPage();
            await page.route('**/assets/app.*.js', route => route.abort());
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            assert.equal(await page.getByRole('link', { name: '重新載入', exact: true }).isVisible(), true);
            console.log('Missing application script shows recovery message instead of a blank page');
            await page.close();
        }
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
