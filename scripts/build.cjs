const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { parseHTML } = require('linkedom');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

async function build() {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
    const assets = {};
    const emit = (name, contents) => {
        const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12);
        const extension = path.extname(name);
        const output = `/assets/${path.basename(name, extension)}.${hash}${extension}`;
        fs.writeFileSync(path.join(out, output), contents);
        assets['/assets/' + name] = output;
    };
    for (const name of ['react', 'react-dom']) {
        emit(name + '.js', fs.readFileSync(path.join(root, 'node_modules', name, 'umd', name + '.production.min.js')));
    }
    for (const name of ['app', 'risk-config', 'scan-policy', 'scan-core', 'email-risk']) {
        const result = await esbuild.transform(fs.readFileSync(path.join(root, name + '.js'), 'utf8'), {
            loader: name === 'app' ? 'jsx' : 'js', target: 'es2020', minify: true, legalComments: 'inline'
        });
        if (result.warnings.length) throw new Error(JSON.stringify(result.warnings));
        emit(name + '.js', result.code);
    }
    const css = await postcss([tailwind(require('../tailwind.config.cjs'))]).process(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), { from: path.join(root, 'styles.css') });
    emit('styles.css', (await esbuild.transform(css.css, { loader: 'css', minify: true })).code);
    const { document } = parseHTML(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    for (const element of document.querySelectorAll('[src], [href]')) {
        for (const attribute of ['src', 'href']) {
            const value = element.getAttribute(attribute);
            if (assets[value]) element.setAttribute(attribute, assets[value]);
        }
    }
    fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html>\n' + document.documentElement.outerHTML);
    for (const file of ['app.html', 'whitelist.json', 'disclaimer.html', 'manifest.json', 'sw.js', '_routes.json']) fs.copyFileSync(path.join(root, file), path.join(out, file));
    fs.writeFileSync(path.join(out, '_headers'), '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
    fs.writeFileSync(path.join(out, 'build-manifest.json'), JSON.stringify({ assets }, null, 2));
    console.log('Built pinned, precompiled assets in dist/');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
