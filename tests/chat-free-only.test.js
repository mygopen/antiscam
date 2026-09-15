const test = require('node:test');
const assert = require('node:assert/strict');
const createD1 = require('./helpers/ai-d1.cjs');

async function chat(text, env = {}, messages) {
  const { onRequestPost } = await import('../functions/api/chat.js');
  const response = await onRequestPost({ env, request: new Request('https://example.test/api/chat', {
    method: 'POST', body: JSON.stringify({ messages: messages || [{ role: 'user', content: text }] })
  }) });
  return { code: response.status, data: await response.json() };
}
test('FAQ and greetings never need AI or budget storage', async () => {
  for (const text of ['你好', '你可以查什麼？', '如何上傳截圖', '怎麼查網址', '謝謝']) {
    const result = await chat(text, { AI: { run() { assert.fail('No AI for FAQ'); } } });
    assert.equal(result.data.status, 'local');
    assert.equal(result.data.source, 'fixed');
  }
});
test('unverified free plan stops chat before any budget write or model call', async () => {
  for (const confirmed of [undefined, 'false', true]) {
    const result = await chat('有人叫我提供驗證碼', {
      CHAT_AI_FREE_ONLY_CONFIRMED: confirmed,
      AI_BUDGET: { prepare() { assert.fail(); } }, AI: { run() { assert.fail(); } }
    });
    assert.equal(result.data.status, 'free_plan_unconfirmed');
  }
});
test('confirmed free chat uses pinned model, three messages and computed reservation', async () => {
  const db = createD1();
  const { CHAT_MODEL, reserveChatNeurons } = await import('../functions/lib/chat-policy.js');
  let calls = 0;
  const messages = Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `防詐問題${i}` }));
  const result = await chat('', { CHAT_AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db,
    AI: { async run(model, payload) {
      calls++;
      assert.equal(model, CHAT_MODEL);
      assert.equal(payload.max_tokens, 80);
      assert.equal(payload.messages.length, 4);
      const row = db.sqlite.prepare('SELECT reserved FROM ai_requests').get();
      assert.equal(row.reserved, reserveChatNeurons(payload.messages));
      return { response: '請勿提供驗證碼。' };
    } }
  }, messages);
  assert.equal(calls, 1);
  assert.equal(result.data.source, 'cloudflare');
  db.sqlite.close();
});
test('budget exhaustion and missing storage return fixed replies without inference', async () => {
  const db = createD1();
  for (const env of [{}, { AI_BUDGET: db, AI_DAILY_NEURONS: '0' }]) {
    const result = await chat('這個轉帳要求有風險嗎', { ...env, CHAT_AI_FREE_ONLY_CONFIRMED: 'true', AI: { run() { assert.fail(); } } });
    assert.equal(result.code, 200);
    assert.equal(result.data.source, 'fixed');
  }
  db.sqlite.close();
});
test('quota stops for the rest of the UTC day without retry or provider fallback', async () => {
  const db = createD1();
  let calls = 0;
  const env = { CHAT_AI_FREE_ONLY_CONFIRMED: 'true', AI_BUDGET: db, GEMINI_API_KEY: 'not-used',
    AI: { run() { calls++; throw Object.assign(new Error('neurons quota'), { status: 429 }); } } };
  assert.equal((await chat('這是詐騙嗎', env)).data.status, 'quota');
  assert.equal((await chat('這是詐騙嗎', env)).data.status, 'budget_or_rate_limit');
  assert.equal(calls, 1);
  const expected = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') + 86400000;
  assert.equal(db.sqlite.prepare('SELECT retry_at FROM ai_circuits').get().retry_at, expected);
  db.sqlite.close();
});
test('reservation increases with UTF-8 input and rejects unknown models', async () => {
  const { reserveChatNeurons } = await import('../functions/lib/chat-policy.js');
  const small = reserveChatNeurons([{ content: 'hi' }]);
  const large = reserveChatNeurons([{ content: '中'.repeat(6000) }]);
  assert.ok(small > 0 && large > small);
  assert.equal(reserveChatNeurons([{ content: 'hi' }], 'other-model'), null);
});
test('empty or invalid roles cannot bypass chat validation', async () => {
  assert.equal((await chat('', {}, [])).code, 400);
  assert.equal((await chat('', {}, [{ role: 'system', content: '你好' }])).code, 400);
});
test('invalid reservations cannot corrupt the shared quota', async () => {
  const { runBudgetedAi } = await import('../functions/lib/ai-budget.js');
  for (const reserve of [0, -1, NaN, Infinity, 0.5, null]) {
    const result = await runBudgetedAi({}, { provider: 'cloudflare', model: 'test', reserve, run() { assert.fail(); } });
    assert.equal(result.reason, 'invalid_budget');
  }
});
