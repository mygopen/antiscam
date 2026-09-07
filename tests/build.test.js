const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseHTML } = require('linkedom');
const root = path.resolve(__dirname, '..');

test('production build has hashed local assets, no runtime compilers, and no private files', () => {
    const build = spawnSync(process.execPath, ['scripts/build.cjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
    assert.doesNotMatch(html, /text\/babel|babel.min.js|cdn.tailwindcss|unpkg.com/);
    const { document } = parseHTML(html);
    const scripts = [...document.querySelectorAll('script[src^="/assets/"]')];
    assert.equal(scripts.length, 7);
    for (const element of [...scripts, ...document.querySelectorAll('link[href^="/assets/"]')]) {
        const url = element.getAttribute('src') || element.getAttribute('href');
        assert.match(url, /\.[a-f0-9]{12}\.(js|css)$/);
        assert.ok(fs.statSync(path.join(root, 'dist', url)).size > 0);
    }
    assert.doesNotMatch(document.querySelector('meta[name="viewport"]').getAttribute('content'), /maximum-scale|user-scalable/);
    for (const privateFile of ['.git', 'tests', 'package-lock.json', 'node_modules', 'functions', 'app.js']) assert.equal(fs.existsSync(path.join(root, 'dist', privateFile)), false);
});

test('main input has one focus handler and keyboard-accessible upload and report controls', () => {
    const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const input = source.match(/<input type="text" aria-label="待檢測網址"[\s\S]+?\/>/)[0];
    assert.equal((input.match(/onFocus=/g) || []).length, 1);
    assert.match(input, /onBlur=/);
    assert.match(input, /inputMode="url"/);
    assert.match(source, /<button type="button" aria-label="上傳可疑截圖"/);
    assert.match(source, /aria-expanded=\{showDetails\}/);
});
