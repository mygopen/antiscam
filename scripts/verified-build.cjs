const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`);
for (const args of [['--test', ...tests], ['scripts/build.cjs']]) {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
