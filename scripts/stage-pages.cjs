const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination) || fs.existsSync(destination)) {
    throw new Error('Provide a new absolute staging directory');
}
if (!fs.existsSync(path.join(root, 'dist', 'build-manifest.json'))) throw new Error('Run npm run build first');
fs.cpSync(path.join(root, 'dist'), destination, { recursive: true });
fs.cpSync(path.join(root, 'functions'), path.join(destination, 'functions'), { recursive: true });
console.log(`Staged public assets and Pages Functions at ${destination}`);
