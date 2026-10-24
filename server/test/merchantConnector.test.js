const test = require('node:test');
const assert = require('node:assert/strict');
const connector = require('../services/merchantConnectorService');

test('Merchant connector uses authenticated bounded HTTPS requests and preserves split UTF-8', async t => {
  const originalFetch = global.fetch;
  const previous = [process.env.OPERATIONS_CONNECTOR_URL, process.env.OPERATIONS_CONNECTOR_TOKEN];
  process.env.OPERATIONS_CONNECTOR_URL = 'https://merchant.example.test/v1';
  process.env.OPERATIONS_CONNECTOR_TOKEN = 'test-only-connector-token-32-characters';
  try {
    await t.test('Only server-configured public HTTPS endpoints are accepted', async () => {
      for (const value of ['http://merchant.example.test', 'https://localhost', 'https://127.0.0.1', 'https://10.1.2.3', 'https://192.168.1.2', 'https://user:secret@merchant.example.test', 'https://merchant.example.test?token=bad']) {
        process.env.OPERATIONS_CONNECTOR_URL = value;
        assert.equal(connector.configuration().ready, false);
      }
      process.env.OPERATIONS_CONNECTOR_URL = 'https://merchant.example.test/v1';
      await assert.rejects(connector.call('/arbitrary'), /Unsupported/);
      assert.throws(() => connector.safeLink('https://evil.example/label.pdf', true), /trusted/);
      assert.throws(() => connector.safeLink('javascript:alert(1)'), /trusted/);
    });
    await t.test('Authentication, cursor encoding and multibyte streamed JSON stay intact', async () => {
      let sent;
      global.fetch = async (url, options) => {
        sent = { url, options };
        const bytes = Buffer.from(JSON.stringify({ name: 'ঢাকা', ok: true }));
        return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), { headers: { 'Content-Type': 'application/json' } });
      };
      assert.deepEqual(await connector.call('/statements', { query: { source: 'gateway', cursor: 'a&b=1' } }), { name: 'ঢাকা', ok: true });
      assert.equal(new URL(sent.url).searchParams.get('cursor'), 'a&b=1');
      assert.equal(sent.options.headers.Authorization, 'Bearer ' + process.env.OPERATIONS_CONNECTOR_TOKEN);
      assert.equal(sent.options.redirect, 'error');
      assert.equal(sent.options.method, 'GET');
      assert.equal(connector.safeLink('https://merchant.example.test/labels/a.pdf', true), 'https://merchant.example.test/labels/a.pdf');
    });
    await t.test('Uncertain requests, explicit rejections, invalid and oversized responses remain distinct', async () => {
      global.fetch = async () => { throw Error('private provider error'); };
      await assert.rejects(connector.call('/courier/book', { body: { reference: 'original' } }), e => e.uncertain === true && !e.message.includes('private'));
      global.fetch = async () => new Response('private rejection', { status: 422 });
      await assert.rejects(connector.call('/courier/book', { body: {} }), e => e.uncertain === false && !e.message.includes('private'));
      global.fetch = async () => new Response('not JSON');
      await assert.rejects(connector.call('/statements'), /valid JSON/);
      global.fetch = async () => new Response('x'.repeat(1000001));
      await assert.rejects(connector.call('/statements'), /too large/);
    });
  } finally {
    global.fetch = originalFetch;
    for (const [index, name] of ['OPERATIONS_CONNECTOR_URL', 'OPERATIONS_CONNECTOR_TOKEN'].entries()) {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    }
  }
});
