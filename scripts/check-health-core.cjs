// Compatibility entry point. Tests now import the real core, without rewriting source.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', 'tests/scan-core.test.js'], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
