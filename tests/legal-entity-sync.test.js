const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const syncModulePromise = import(pathToFileURL(path.join(repoRoot, 'scripts/sync-legal-entity-records.mjs')).href);

test('CSV parser handles escaped quotes, embedded commas and chunk boundaries', async () => {
  const { createCsvRowParser, parseCsvText } = await syncModulePromise;
  assert.deepEqual(parseCsvText('name,note\r\n"法人,甲","含""引號"""\r\n'), [
    ['name', 'note'],
    ['法人,甲', '含"引號"']
  ]);

  const rows = [];
  const parser = createCsvRowParser(row => rows.push(row));
  parser.push('a,b\n"跨');
  parser.push('\n行",2\n');
  parser.finish();
  assert.deepEqual(rows, [['a', 'b'], ['跨\n行', '2']]);
});

test('legal entity sync requires tax and judicial records and detects cancellation', async () => {
  const { buildLegalEntityRecords } = await syncModulePromise;
  const mappings = [{
    taxIds: ['17597502'],
    names: ['財團法人台灣網路資訊中心'],
    entityType: 'foundation',
    organizationType: '財團法人',
    registrationAuthority: '數位發展部',
    courtCode: 'TPD'
  }];
  const taxRecords = [{
    taxId: '17597502',
    name: '財團法人台灣網路資訊中心',
    capital: 19000000,
    setupDate: '1999-12-27',
    organizationType: '其他'
  }];
  const judicialRecords = new Map([['TPD', [{
    name: '財團法人台灣網路資訊中心',
    registrationNumber: '2298',
    registrationDate: '2026-08-01',
    setupDate: '1999-12-22',
    canceledAt: '',
    revokedAt: ''
  }]]]);

  const active = buildLegalEntityRecords(mappings, taxRecords, judicialRecords);
  assert.equal(active[0].activeRegistration, true);
  assert.equal(active[0].registrationNumber, '2298');
  assert.equal(active[0].setupDate, '1999-12-22');

  judicialRecords.get('TPD').push({
    name: '財團法人台灣網路資訊中心',
    registrationNumber: '2298',
    registrationDate: '2026-09-01',
    setupDate: '1999-12-22',
    canceledAt: '2026-09-01',
    revokedAt: ''
  });
  const inactive = buildLegalEntityRecords(mappings, taxRecords, judicialRecords);
  assert.equal(inactive[0].activeRegistration, false);
  assert.equal(inactive[0].status, '登記已撤銷或註銷');

  assert.throws(() => buildLegalEntityRecords(mappings, [], judicialRecords), /Missing tax registration match/);
});
