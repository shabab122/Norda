const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createLocalConnector } = require('../services/localOperationsConnector');
const connector = require('../services/merchantConnectorService');
const template = require('../services/settlementService').template();

test('Runnable local connector: authenticated HTTP, durable replay and immutable demo evidence', { timeout: 20000 }, async t => {
  const previous = { ...process.env }, directory = await fs.mkdtemp(path.join(os.tmpdir(), 'norda-connector-')), token = crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  let service, server, base;
  const start = async () => { service = await createLocalConnector({ directory, token }); server = service.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port + '/v1'; Object.assign(process.env, { OPERATIONS_CONNECTOR_MODE: 'local-demo', OPERATIONS_CONNECTOR_URL: base, OPERATIONS_CONNECTOR_TOKEN: token }); };
  const stop = async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await service.close(); };
  const request = async (url, body, headers = {}) => { const r = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, data: await r.json() }; };
  const payload = { reference: 'NLR-unique-first', direction: 'reverse', orderId: 'a'.repeat(24), pickupId: 'b'.repeat(24), customer: { name: 'A local buyer', line1: 'Private fixture address', phone: '01712345678' }, destination: { warehouse: 'online', address: 'Receiving test desk' }, items: [{ name: 'Fixture item', quantity: 2 }] };
  try {
    await start();
    await t.test('Private authentication, browser-origin rejection and production gate', async () => {
      assert.equal((await request('/health', undefined, { Authorization: '' })).status, 401);
      assert.equal((await request('/health', undefined, { Origin: 'https://other.example' })).status, 403);
      assert.equal((await request('/health')).data.demo, true);
      await assert.rejects(createLocalConnector({ directory, token }), /locked/);
      process.env.NODE_ENV = 'production'; assert.equal(connector.configuration().ready, false);
      await assert.rejects(createLocalConnector({ directory: directory + '-prod', token }), /disabled/); process.env.NODE_ENV = 'test';
      assert.equal(connector.configuration().ready, true);
      const url = process.env.OPERATIONS_CONNECTOR_URL;
      for (const candidate of ['http://localhost:5018/v1', 'http://127.0.0.1:3000/v1', 'http://127.0.0.1:3002/v1', 'http://127.0.0.1:5000/v1', 'http://10.0.0.1:5018/v1', url + '?private=1']) { process.env.OPERATIONS_CONNECTOR_URL = candidate; assert.equal(connector.configuration().ready, false); }
      process.env.OPERATIONS_CONNECTOR_URL = url;
      assert.throws(() => connector.assertMode({ provider: 'connector', connectorMode: 'merchant' }), /original connector/);
      assert.throws(() => connector.assertMode({ provider: 'ecourier' }), /disabled/);
    });
    let booked;
    await t.test('Parallel identical bookings acknowledge one durable tracking identity', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => connector.call('/courier/book', { body: payload })));
      booked = results[0]; assert.equal(new Set(results.map(v => v.trackingNumber)).size, 1); assert.equal(booked.demo, true); assert.equal(booked.state, 'booked');
      const state = await fs.readFile(path.join(directory, 'state.json'), 'utf8'); assert.equal(Object.keys(JSON.parse(state).bookings).length, 1);
      assert.doesNotMatch(state, /Private fixture address|01712345678|A local buyer/);
      assert.equal((await request('/courier/book', { ...payload, items: [{ name: 'Other', quantity: 1 }] })).status, 409);
      assert.equal((await request('/courier/book', { ...payload, reference: 'NLR-another-ref' })).status, 409);
      assert.equal((await request('/courier/book', { ...payload, reference: 'NLR-incomplete', customer: {} })).status, 422);
    });
    await t.test('Queries never invent or advance a booking and reject mismatched identity', async () => {
      assert.equal((await request('/courier/query', { reference: 'NLR-nonexistent' })).status, 404);
      assert.equal((await request('/courier/query', { reference: 'constructor' })).status, 400);
      assert.equal((await request('/courier/query', { reference: payload.reference, trackingNumber: 'wrong' })).status, 409);
      assert.equal((await connector.call('/courier/query', { body: { reference: payload.reference, trackingNumber: booked.trackingNumber } })).state, 'booked');
    });
    await t.test('Restart retains the booking and its idempotency key', async () => {
      await stop(); await start();
      assert.equal((await connector.call('/courier/book', { body: payload })).trackingNumber, booked.trackingNumber);
      assert.equal((await connector.call('/courier/query', { body: { reference: payload.reference } })).state, 'booked');
    });
    await t.test('Explicit demo control advances one stage and prevents backwards movement/cancellation in transit', async () => {
      assert.equal((await request('/demo/pickups/' + payload.reference + '/advance', { state: 'arrived' })).status, 409);
      for (const stage of ['picked_up', 'in_transit', 'arrived']) assert.equal((await request('/demo/pickups/' + payload.reference + '/advance', { state: stage })).data.state, stage);
      assert.equal((await request('/demo/pickups/' + payload.reference + '/advance', { state: 'booked' })).status, 409);
      assert.equal((await request('/courier/cancel', { reference: payload.reference, note: 'Cancel the demo pickup' })).status, 409);
      const second = { ...payload, reference: 'NLR-cancelled-one', pickupId: 'c'.repeat(24) }; await connector.call('/courier/book', { body: second });
      const body = { reference: second.reference, note: 'Explicit demo cancellation' };
      assert.equal((await connector.call('/courier/cancel', { body })).state, 'cancelled'); assert.equal((await connector.call('/courier/cancel', { body })).state, 'cancelled');
      assert.equal((await connector.call('/courier/query', { body: { reference: second.reference } })).state, 'cancelled');
    });
    await t.test('Statement pages have stable cursors, demo markers, immutable contents and reconciled amounts', async () => {
      const csv = template + ['cod_remittance', 'demo_carrier', 'REMIT-1', payload.orderId, '', '', 300, 20, 280, 'BDT', new Date().toISOString()].join(',') + '\r\n';
      assert.equal((await request('/demo/statements', { source: 'courier', batchId: 'fixture-1', csv: csv.replace(',280,BDT', ',281,BDT') })).status, 400);
      const publish = await request('/demo/statements', { source: 'courier', batchId: 'fixture-1', csv }); assert.equal(publish.status, 200);
      const page = await connector.call('/statements', { query: { source: 'courier', cursor: '', limit: 500 } });
      assert.equal(page.csv, csv); assert.equal(page.demo, true); assert.equal(page.nextCursor, publish.data.nextCursor);
      assert.deepEqual(await connector.call('/statements', { query: { source: 'courier', cursor: '', limit: 500 } }), page);
      assert.equal((await request('/demo/statements', { source: 'courier', batchId: 'fixture-1', csv })).status, 200);
      assert.equal((await request('/demo/statements', { source: 'courier', batchId: 'fixture-1', csv: template })).status, 409);
      assert.equal((await request('/demo/statements', { source: 'courier', batchId: 'fixture-2', csv })).status, 409);
      const idle = await connector.call('/statements', { query: { source: 'courier', cursor: page.nextCursor, limit: 500 } }); assert.equal(idle.nextCursor, page.nextCursor); assert.equal(idle.csv, template);
      assert.equal((await request('/statements?source=courier&cursor=unknown')).status, 409);
      assert.equal((await request('/statements?source=courier&limit=1')).status, 422);
    });
    await t.test('A local demonstration reply cannot be consumed in merchant mode', async () => {
      process.env.OPERATIONS_CONNECTOR_MODE = 'merchant'; assert.equal(connector.configuration().ready, false);
      await assert.rejects(connector.call('/statements'), /Configure/); process.env.OPERATIONS_CONNECTOR_MODE = 'local-demo';
    });
    await t.test('An uncertain disk write stops acknowledgement until durable state is reread', async () => {
      const rename = fs.rename;
      fs.rename = async () => { throw Error('Injected disk error'); };
      try { assert.equal((await request('/courier/book', { ...payload, reference: 'NLR-disk-failure', pickupId: 'd'.repeat(24) })).status, 500); }
      finally { fs.rename = rename; }
      assert.equal((await request('/health')).status, 503);
      await stop(); await start();
      assert.equal((await request('/courier/query', { reference: 'NLR-disk-failure' })).status, 404);
      assert.equal((await connector.call('/courier/book', { body: payload })).trackingNumber, booked.trackingNumber);
    });
  } finally {
    await stop(); await fs.rm(directory, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous);
  }
});
