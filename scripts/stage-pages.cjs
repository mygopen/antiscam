const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination) || fs.existsSync(destination)) {
    throw new Error('Provide a new absolute staging directory');
}
fs.mkdirSync(destination, { recursive: true });
for (const file of ['index.html', 'app.html', 'app.js', 'risk-config.js', 'scan-policy.js', 'email-risk.js',
    'whitelist.json', 'disclaimer.html', 'manifest.json', 'sw.js', '_routes.json']) {
    fs.copyFileSync(path.join(root, file), path.join(destination, file));
}
fs.cpSync(path.join(root, 'functions'), path.join(destination, 'functions'), { recursive: true });
console.log(`Staged public assets and Pages Functions at ${destination}`);
