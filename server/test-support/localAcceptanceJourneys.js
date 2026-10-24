// Shared by the real Express/fault adapter and both native MongoDB topologies.
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
module.exports = async (t, { M, send, get, ok, key, buyer, delivered, requestReturn, approve }) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'norda-operations-http-')), token = crypto.randomBytes(32).toString('hex');
  const names = ['OPERATIONS_CONNECTOR_MODE', 'OPERATIONS_CONNECTOR_URL', 'OPERATIONS_CONNECTOR_TOKEN', 'RETURN_RECEIVING_ADDRESS'], previous = names.map(n => process.env[n]);
  const runtime = await require('../services/localOperationsConnector').createLocalConnector({ directory, token });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/v1';
  Object.assign(process.env, { OPERATIONS_CONNECTOR_MODE: 'local-demo', OPERATIONS_CONNECTOR_URL: base, OPERATIONS_CONNECTOR_TOKEN: token, RETURN_RECEIVING_ADDRESS: 'Fixture local receiving desk' });
  const control = async (endpoint, body) => { const r = await fetch(base + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(r.status, 200); return r.json(); };
  let fixture, pickup, job, run;
  try {
    await t.test('Local reverse pickup books through the actual private HTTP service and replays one identity', async () => {
      fixture = await delivered(); const returned = await requestReturn(fixture.o); await approve(returned);
      pickup = ok(await send('/api/orders/' + fixture.o._id + '/pickups', { orderRequest: returned._id, requestKey: key(), note: 'Demonstrate the local return collection' }, buyer.cookie), 201);
      const body = { confirmed: true, destinationWarehouse: 'online', requestKey: key() };
      job = ok(await send('/api/admin/logistics/pickup/' + pickup._id, body), 201); assert.equal(job.connectorMode, 'local-demo');
      assert.equal(ok(await send('/api/admin/logistics/pickup/' + pickup._id, body), 201)._id, job._id);
      const first = ok(await send('/api/admin/logistics-jobs/' + job._id + '/process', {}));
      const replay = ok(await send('/api/admin/logistics-jobs/' + job._id + '/process', {}));
      assert.equal(first.status, 'booked'); assert.equal(first.trackingNumber, replay.trackingNumber);
      const saved = await M.ReturnPickup.findById(pickup._id); assert.equal(saved.status, 'booked'); assert.equal(saved.courierName, 'NORDA demo carrier');
      assert.equal(Object.keys(JSON.parse(await fs.readFile(path.join(directory, 'state.json'), 'utf8')).bookings).length, 1);
    });
    await t.test('Demo tracking advances without inventing physical receipt, stock or a refund', async () => {
      const stock = (await M.Product.findById(fixture.p._id)).stock, refunds = await M.Refund.countDocuments({ order: fixture.o._id });
      for (const state of ['picked_up', 'in_transit', 'arrived']) {
        await control('/demo/pickups/' + job.reference + '/advance', { state });
        ok(await send('/api/admin/logistics-jobs/' + job._id + '/sync', {}));
        assert.equal((await M.ReturnPickup.findById(pickup._id)).status, state);
      }
      assert.equal((await M.Product.findById(fixture.p._id)).stock, stock); assert.equal(await M.Refund.countDocuments({ order: fixture.o._id }), refunds);
      assert.equal((await M.OrderRequest.findById(pickup.orderRequest)).status, 'approved');
      assert.equal((await send('/api/admin/logistics-jobs/' + job._id + '/label', {})).status, 409);
    });
    await t.test('Connector mode changes cannot reconcile demo jobs or alter merchant feed cursors', async () => {
      process.env.OPERATIONS_CONNECTOR_MODE = 'merchant';
      assert.equal((await send('/api/admin/logistics-jobs/' + job._id + '/sync', {})).status, 409);
      assert.equal((await M.LogisticsJob.findById(job._id)).status, 'booked');
      process.env.OPERATIONS_CONNECTOR_MODE = 'local-demo';
      const untouched = await M.LogisticsJob.create({ order: fixture.o._id, targetType: 'pickup', targetId: crypto.randomBytes(12).toString('hex'), reference: 'NLR' + crypto.randomBytes(10).toString('hex'), requestKey: key(), provider: 'connector', connectorMode: 'merchant', status: 'queued' });
      await require('../services/logisticsAutomationService').sweep();
      assert.equal((await M.LogisticsJob.findById(untouched._id)).status, 'queued');
      const original = await M.StatementFeed.findById('courier');
      assert.equal((await send('/api/admin/statement-feeds/courier/pull', {})).status, 409);
      assert.equal((await M.StatementFeed.findById('courier')).cursor, original.cursor);
    });
    await t.test('Demo statement fetching stages actual HTTP evidence and blocks financial import', async () => {
      const csv = require('../services/settlementService').template() + ['gateway_sale', 'local_demo', 'DEMO-' + key(), String(fixture.o._id), 'UNVERIFIED-DEMO', '', 100, 10, 90, 'BDT', new Date().toISOString()].join(',') + '\r\n';
      await control('/demo/statements', { source: 'gateway', batchId: 'local-demo-' + key(), csv });
      assert.equal((await send('/api/admin/statement-feeds/gateway', { revision: 0, enabled: true, automatic: true }, undefined, 'PUT')).status, 409);
      ok(await send('/api/admin/statement-feeds/gateway', { revision: 0, enabled: true, automatic: false }, undefined, 'PUT'));
      run = ok(await send('/api/admin/statement-feeds/gateway/pull', {})); assert.equal(run.demo, true); assert.equal(run.status, 'review');
      assert.equal(ok(await get('/api/admin/statement-runs/' + run._id + '/preview')).entries.length, 1);
      const entries = await M.SettlementEntry.countDocuments({}), before = await M.Order.findById(fixture.o._id);
      assert.equal((await send('/api/admin/statement-runs/' + run._id + '/import', {})).status, 409);
      assert.equal(await M.SettlementEntry.countDocuments({}), entries);
      assert.equal((await M.Order.findById(fixture.o._id)).paymentStatus, before.paymentStatus);
      assert.equal((await M.StatementFeed.findById('gateway')).cursor, '');
    });
    await t.test('Only payment staff can acknowledge demo previews; cursor advances without journal writes', async () => {
      const entries = await M.SettlementEntry.countDocuments({});
      assert.equal((await send('/api/admin/statement-runs/' + run._id + '/acknowledge-demo', {}, buyer.cookie)).status, 403);
      const originalUpdate = M.StatementFeed.updateOne;
      M.StatementFeed.updateOne = () => { throw Error('Injected cursor write failure'); };
      try { assert.equal((await send('/api/admin/statement-runs/' + run._id + '/acknowledge-demo', {})).status, 500); }
      finally { M.StatementFeed.updateOne = originalUpdate; }
      assert.equal((await M.StatementFeed.findById('gateway')).cursor, '');
      assert.equal(ok(await send('/api/admin/statement-runs/' + run._id + '/acknowledge-demo', {})).demo, true);
      assert.equal(ok(await send('/api/admin/statement-runs/' + run._id + '/acknowledge-demo', {})).acknowledged, true);
      assert.equal((await M.StatementFeed.findById('gateway')).cursor, run.nextCursor);
      assert.equal(await M.SettlementEntry.countDocuments({}), entries);
      assert.equal(ok(await send('/api/admin/statement-feeds/gateway/pull', {})).idle, true);
      process.env.OPERATIONS_CONNECTOR_MODE = 'merchant';
      assert.equal((await send('/api/admin/statement-feeds/gateway/pull', {})).status, 409);
      assert.equal((await M.StatementFeed.findById('gateway')).cursor, run.nextCursor);
    });
  } finally {
    server.closeAllConnections(); await new Promise(r => server.close(r)); await runtime.close(); await fs.rm(directory, { recursive: true, force: true });
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
};
