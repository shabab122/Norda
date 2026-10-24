// Explicit localhost demonstration of the merchant contract. Never a carrier
// confirmation or evidence of received money; no store database is connected.
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const error = require('../utils/httpError');
const settlement = require('./settlementService');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validReference = value => typeof value === 'string' && /^NLR[A-Za-z0-9_-]{3,97}$/.test(value);
const sourceName = value => { if (!['gateway', 'courier'].includes(value)) throw error(400, 'Choose gateway or courier'); return value; };
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u001f]/.test(value);

async function createLocalConnector({ directory, token }) {
  if (process.env.NODE_ENV === 'production') throw error(503, 'The local connector is disabled in production');
  if (typeof token !== 'string' || token.length < 32) throw error(503, 'Use a private connector token of at least 32 characters');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  // Exclusive lifetime lock prevents two processes from acknowledging writes
  // against different snapshots. A stale lock needs explicit operator review.
  const lockPath = path.join(directory, 'service.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); }
  catch (cause) { if (cause.code === 'EEXIST') throw error(409, 'Connector state is already locked; stop the other process before recovery'); throw cause; }
  await lock.writeFile(String(process.pid));
  const statePath = path.join(directory, 'state.json');
  let state;
  try {
    try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
    catch (cause) { if (cause.code !== 'ENOENT') throw cause; state = { version: 1, bookings: {}, pages: { gateway: [], courier: [] } }; }
    if (state.version !== 1 || !state.bookings || !Array.isArray(state.pages?.gateway) || !Array.isArray(state.pages?.courier)) throw Error('Invalid private connector state');
  } catch (cause) { await lock.close(); await fs.unlink(lockPath); throw cause; }
  let queue = Promise.resolve(), closed = false, persistenceFailed = false;
  const save = async next => {
    const temporary = path.join(directory, 'state-' + crypto.randomBytes(10).toString('hex') + '.tmp');
    const file = await fs.open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(next)); await file.sync(); }
    finally { await file.close(); }
    try { await fs.rename(temporary, statePath); const dir = await fs.open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); } }
    finally { await fs.unlink(temporary).catch(() => {}); }
    state = next;
  };
  const serial = work => {
    const pending = queue.then(async () => { if (closed || persistenceFailed) throw error(503, 'Connector is stopping or needs state recovery'); return work(); });
    queue = pending.catch(() => {}); return pending;
  };
  const booking = body => {
    if (!validReference(body.reference)) throw error(400, 'A stable booking reference is required');
    const row = Object.hasOwn(state.bookings, body.reference) ? state.bookings[body.reference] : null;
    if (!row) throw error(404, 'No booking exists for this reference');
    if (body.trackingNumber && body.trackingNumber !== row.result.trackingNumber) throw error(409, 'Tracking identity does not match');
    return row;
  };
  const app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const supplied = Buffer.from(req.get('Authorization') || ''), expected = Buffer.from('Bearer ' + token);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ message: 'Private connector authentication required' });
    // No CORS or browser-facing credentials; control uses the private CLI.
    if (req.get('Origin')) return res.status(403).json({ message: 'Browser-origin requests are disabled' });
    next();
  });
  app.use(express.json({ limit: '600kb', strict: true }));
  const route = work => (req, res, next) => serial(() => work(req)).then(value => res.json(value)).catch(next);
  app.get('/v1/health', route(() => ({ ok: true, mode: 'local-demo', demo: true })));
  app.post('/v1/courier/book', route(async req => {
    const b = req.body;
    if (!validReference(b.reference) || b.direction !== 'reverse' || !/^[a-f\d]{24}$/i.test(b.orderId || '') || !/^[a-f\d]{24}$/i.test(b.pickupId || '') || !text(b.customer?.name, 1, 120) || !text(b.customer?.line1, 3, 300) || !/^\+?[\d -]{8,20}$/.test(b.customer?.phone || '') || !text(b.destination?.warehouse, 1, 100) || !text(b.destination?.address, 3, 300) || !Array.isArray(b.items) || !b.items.length || b.items.length > 100 || b.items.some(i => !text(i.name, 1, 200) || !Number.isSafeInteger(i.quantity) || i.quantity < 1)) throw error(422, 'Complete reverse booking identity, address, phone and item quantities');
    const normalized = { reference: b.reference, direction: b.direction, orderId: b.orderId.toLowerCase(), pickupId: b.pickupId.toLowerCase(), customer: { name: b.customer.name.trim(), line1: b.customer.line1.trim(), line2: b.customer.line2 || '', city: b.customer.city || '', district: b.customer.district || '', phone: b.customer.phone, country: b.customer.country || '' }, destination: { warehouse: b.destination.warehouse, address: b.destination.address.trim() }, items: b.items.map(i => ({ name: i.name.trim(), quantity: i.quantity })) };
    const fingerprint = digest(normalized), existing = Object.hasOwn(state.bookings, b.reference) ? state.bookings[b.reference] : null;
    if (existing) { if (existing.fingerprint !== fingerprint) throw error(409, 'Reference was already used for a different booking'); return existing.result; }
    if (Object.values(state.bookings).some(row => row.pickupId === normalized.pickupId && row.result.state !== 'cancelled')) throw error(409, 'This pickup already has an active demonstration booking');
    if (Object.keys(state.bookings).length >= 2000) throw error(409, 'Local demonstration storage is full');
    const result = { demo: true, reference: b.reference, status: 'booked', state: 'booked', trackingNumber: 'DEMO_' + crypto.randomBytes(10).toString('hex'), courierName: 'NORDA demo carrier', scheduledFor: new Date(Date.now() + 86400000).toISOString() };
    const next = structuredClone(state); next.bookings[b.reference] = { fingerprint, pickupId: normalized.pickupId, result };
    await save(next).catch(cause => { persistenceFailed = true; throw cause; }); return result;
  }));
  app.post('/v1/courier/query', route(req => booking(req.body).result));
  app.post('/v1/courier/cancel', route(async req => {
    const row = booking(req.body);
    if (!text(req.body.note, 5, 1000)) throw error(422, 'Cancellation needs an operator note');
    if (!['booked', 'cancelled'].includes(row.result.state)) throw error(409, 'A moving return cannot be cancelled');
    if (row.result.state === 'cancelled') return row.result;
    const next = structuredClone(state), result = next.bookings[req.body.reference].result;
    result.status = 'cancelled'; result.state = 'cancelled'; await save(next).catch(cause => { persistenceFailed = true; throw cause; }); return result;
  }));
  app.post('/v1/demo/pickups/:reference/advance', route(async req => {
    const row = booking({ reference: req.params.reference }), stages = ['booked', 'picked_up', 'in_transit', 'arrived'];
    const index = stages.indexOf(row.result.state), target = stages.indexOf(req.body.state);
    if (index < 0 || target < index || target > index + 1) throw error(409, 'Advance one demonstrated stage at a time');
    if (target === index) return row.result;
    const next = structuredClone(state); next.bookings[req.params.reference].result.state = req.body.state;
    await save(next).catch(cause => { persistenceFailed = true; throw cause; }); return next.bookings[req.params.reference].result;
  }));
  app.post('/v1/demo/statements', route(async req => {
    const { source, batchId, csv } = req.body; sourceName(source);
    if (!text(batchId, 1, 100)) throw error(422, 'A stable statement batch ID is required');
    const rows = csv === settlement.template() ? [] : settlement.parse(csv);
    if (rows.some(r => source === 'courier' ? r.kind !== 'cod_remittance' : r.kind === 'cod_remittance')) throw error(422, 'Statement kind does not match its source');
    const pages = state.pages[source], existing = pages.find(p => p.batchId === batchId);
    if (existing) { if (existing.csv !== csv) throw error(409, 'Statement batch content is immutable'); return { demo: true, source, batchId, nextCursor: existing.nextCursor }; }
    if (pages.length >= 100) throw error(409, 'Local statement demonstration storage is full');
    const refs = new Set(pages.flatMap(p => p.csv === settlement.template() ? [] : settlement.parse(p.csv)).map(r => r.provider + ':' + r.reference));
    if (rows.some(r => refs.has(r.provider + ':' + r.reference))) throw error(409, 'A provider reference already belongs to a published statement');
    const nextCursor = 'c_' + digest([source, batchId, csv]).slice(0, 48), next = structuredClone(state);
    next.pages[source].push({ source, batchId, csv, nextCursor, demo: true }); await save(next).catch(cause => { persistenceFailed = true; throw cause; });
    return { source, batchId, nextCursor, demo: true };
  }));
  app.get('/v1/statements', route(req => {
    const source = sourceName(req.query.source), cursor = req.query.cursor || '', pages = state.pages[source];
    if (typeof cursor !== 'string' || cursor.length > 500 || (req.query.limit !== undefined && req.query.limit !== '500')) throw error(422, 'Use a string cursor and a limit of 500');
    const previous = cursor ? pages.findIndex(p => p.nextCursor === cursor) : -1;
    if (cursor && previous < 0) throw error(409, 'Unknown statement cursor');
    return pages[previous + 1] || { source, batchId: 'idle-' + source + '-' + digest(cursor).slice(0, 24), nextCursor: cursor, csv: settlement.template(), demo: true };
  }));
  app.use((err, req, res, next) => {
    const status = err.statusCode || err.status || 500;
    res.status(status >= 400 && status <= 599 ? status : 500).json({ message: status < 500 ? err.message : 'Local connector could not confirm this operation' });
  });
  return { app, close: async () => { await queue; if (closed) return; closed = true; await lock.close(); await fs.unlink(lockPath); } };
}

module.exports = { createLocalConnector };
