const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const syncModulePromise = import(pathToFileURL(path.join(repoRoot, 'scripts/sync-legal-entity-records.mjs')).href);

test('download retries discard partial records and log progress without record contents', async () => {
  const { fetchCsv } = await syncModulePromise;
  let attempts = 0;
  const logs = [];
  const waits = [];
  const records = await fetchCsv('https://example.test/records.csv', row => row, {
    log: event => logs.push(event), sleep: async ms => waits.push(ms),
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        let reads = 0;
        return new Response(new ReadableStream({ pull(controller) {
          if (reads++ === 0) controller.enqueue(new TextEncoder().encode('name\nprivate-first-record\n'));
          else controller.error(new Error('connection reset'));
        } }));
      }
      return new Response('name\ncomplete-record\n');
    }
  });
  assert.deepEqual(records, [{ name: 'complete-record' }]);
  assert.deepEqual(waits, [5000]);
  assert.equal(logs.some(event => event.event === 'download_failed' && event.rows === 1), true);
  assert.equal(JSON.stringify(logs).includes('private-first-record'), false);
});

test('download distinguishes connection and idle timeouts with bounded retries', async () => {
  const { fetchCsv } = await syncModulePromise;
  for (const phase of ['connection', 'download idle']) {
    let attempts = 0;
    await assert.rejects(fetchCsv('https://example.test/slow.csv', row => row, {
      connectTimeoutMs: 10, idleTimeoutMs: 10, totalTimeoutMs: 1000,
      log: () => {}, sleep: async () => {},
      fetchImpl: async (url, { signal }) => {
        attempts += 1;
        if (phase === 'connection') return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        return new Response(new ReadableStream({ start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        } }));
      }
    }), new RegExp(`${phase} timeout`));
    assert.equal(attempts, 3);
  }
});

test('permanent HTTP failure is not retried; transient failure backs off', async () => {
  const { fetchCsv } = await syncModulePromise;
  for (const status of [404, 429, 503]) {
    let attempts = 0;
    const waits = [];
    await assert.rejects(fetchCsv('https://example.test/fail.csv', row => row, {
      fetchImpl: async () => { attempts += 1; return new Response('', { status }); },
      log: () => {}, sleep: async ms => waits.push(ms)
    }), /Download failed for https:\/\/example.test\/fail.csv/);
    assert.equal(attempts, status === 404 ? 1 : 3);
    assert.deepEqual(waits, status === 404 ? [] : [5000, 10000]);
  }
});

test('total timeout still bounds a continuously transferring download', async () => {
  const { fetchCsv } = await syncModulePromise;
  await assert.rejects(fetchCsv('https://example.test/endless.csv', row => row, {
    maxAttempts: 1, totalTimeoutMs: 30, idleTimeoutMs: 1000,
    log: () => {}, fetchImpl: async (url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        const timer = setInterval(() => controller.enqueue(new TextEncoder().encode('a\n')), 2);
        signal.addEventListener('abort', () => { clearInterval(timer); controller.error(signal.reason); }, { once: true });
      }
    }))
  }), /total timeout/);
});

test('failed download or validation leaves previous published file untouched', async () => {
  const { syncLegalEntityRecords } = await syncModulePromise;
  const fs = require('node:fs');
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'legal-sync-'));
  const output = path.join(directory, 'records.js');
  try {
    fs.writeFileSync(output, 'previous valid records');
    for (const download of [async () => { throw new Error('timeout'); }, async () => []]) {
      await assert.rejects(syncLegalEntityRecords({ output, download }));
      assert.equal(fs.readFileSync(output, 'utf8'), 'previous valid records');
      assert.deepEqual(fs.readdirSync(directory), ['records.js']);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

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
