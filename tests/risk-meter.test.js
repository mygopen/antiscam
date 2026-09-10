const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const { DOMParser } = require('linkedom');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const component = source.slice(source.indexOf('const RiskMeter ='), source.indexOf('const TraceTimeline ='));
const RiskMeter = vm.runInNewContext(transformSync(`${component}\nRiskMeter;`, { loader: 'jsx' }).code, { React });

test('unknown risk meter has only a neutral track, regardless of numerical score', () => {
    for (const score of [0, 50, 100]) {
        const html = renderToStaticMarkup(React.createElement(RiskMeter, { score, assessment: 'unknown' }));
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const track = doc.querySelector('.bg-gray-200');
        assert.ok(track);
        assert.equal(track.children.length, 0);
        assert.match(html, /資訊不足／尚未確認/);
        assert.doesNotMatch(html, />安全<|>危險<|width:/);
    }
});

test('known risk meters preserve their colored levels and endpoint labels', () => {
    for (const [score, assessment, color, width] of [[10, 'low', 'bg-green-500', '10%'], [50, 'medium', 'bg-yellow-500', '50%'], [90, 'high', 'bg-red-600', '90%']]) {
        const html = renderToStaticMarkup(React.createElement(RiskMeter, { score, assessment }));
        assert.ok(html.includes(color));
        assert.ok(html.includes(`width:${width}`));
        assert.match(html, />安全</);
        assert.match(html, />危險</);
    }
});
