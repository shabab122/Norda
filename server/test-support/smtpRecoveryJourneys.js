const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createSmtpFixture, actionLink } = require('./smtpFixture');
module.exports = async (t, { request, models: M, baseUrl }) => {
  const smtp = await createSmtpFixture(), keys = ['MAIL_TRANSPORT','SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','MAIL_FROM','CLIENT_APP_URL'];
  const old = keys.map(name => process.env[name]), origin = baseUrl || 'http://127.0.0.1:5000';
  Object.assign(process.env, { MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '', MAIL_FROM: 'Norda <accounts@example.test>', CLIENT_APP_URL: origin });
  const key = () => crypto.randomUUID(), email = 'smtp-' + key() + '@example.test', password = 'OriginalMailbox123', nextPassword = 'RecoveredMailbox123';
  const post = (url, body, cookie) => request(url, { method: 'POST', body, cookie });
  const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
  const latest = filename => [...smtp.messages].reverse().find(raw => { try { return !!actionLink(raw, filename); } catch { return false; } });
  let member, cookie, guest, order, guestEmail;
  try {
    await t.test('Registration email traverses actual SMTP and its received verification link works once', async () => {
      const result = await post('/api/auth/register', { name: 'SMTP acceptance customer', email, password }); member = ok(result, 201); cookie = result.cookie;
      assert.equal(member.verificationEmail.delivery, 'smtp'); assert.equal(smtp.messages.length, 1);
      const link = actionLink(latest('verify-email.html'), 'verify-email.html'); assert.equal(link.origin, origin); assert.equal(link.search, '');
      ok(await request(link.pathname));
      const token = new URLSearchParams(link.hash.slice(1)).get('token');
      assert.doesNotMatch(JSON.stringify(member), new RegExp(token));
      ok(await post('/api/auth/verify-email', { token })); assert.equal((await post('/api/auth/verify-email', { token })).status, 400);
      assert.equal(ok(await request('/api/auth/profile', { cookie })).emailVerified, true);
    });
    await t.test('Password reset from the received SMTP message changes only its owner and revokes old sessions', async () => {
      ok(await post('/api/auth/forgot-password', { email }));
      const link = actionLink(latest('reset-password.html'), 'reset-password.html'), token = new URLSearchParams(link.hash.slice(1)).get('token');
      assert.equal(link.origin, origin); ok(await request(link.pathname));
      ok(await post('/api/auth/reset-password', { token, password: nextPassword, confirmPassword: nextPassword }));
      assert.equal((await request('/api/auth/profile', { cookie })).status, 401);
      assert.equal((await post('/api/auth/login', { email, password })).status, 401);
      const login = await post('/api/auth/login', { email, password: nextPassword }); ok(login); cookie = login.cookie;
      assert.equal((await post('/api/auth/reset-password', { token, password: nextPassword, confirmPassword: nextPassword })).status, 400);
      assert.ok(smtp.messages.some(raw => raw.includes('Your Norda password was changed')));
      assert.equal(ok(await request('/api/auth/profile', { cookie }))._id, member._id);
    });
    await t.test('A received guest recovery email restores only its private order and invoice', async () => {
      const session = await post('/api/guest/session', {}); guest = ok(session, 201); guestEmail = 'guest-' + key() + '@example.test';
      ok(await post('/api/guest/contact', { name: 'Guest mailbox owner', email: guestEmail }, session.cookie));
      const category = await M.Category.create({ name: 'SMTP fixtures', slug: 'smtp-' + key() });
      const product = await M.Product.create({ name: 'Mailbox fixture item', slug: 'mailbox-' + key(), category: category._id, price: 100, stock: 3 });
      order = await M.Order.create({ user: guest.id, customerSnapshot: { name: 'Guest mailbox owner', email: guestEmail, isGuest: true }, items: [{ product: product._id, name: product.name, price: 100, quantity: 1 }], shippingAddress: { line1: 'Fixture House 4', city: 'Dhaka', district: 'Dhaka', country: 'Bangladesh', phone: '01712345678' }, subtotal: 100, shippingFee: 120, totalAmount: 220, currency: 'BDT', paymentMethod: 'cod', status: 'pending', paymentStatus: 'pending' });
      await require('../services/invoiceService').createInvoiceForOrder(order);
      const response = ok(await post('/api/guest/recovery', { orderId: String(order._id), email: guestEmail }));
      const link = actionLink(latest('guest-orders.html'), 'guest-orders.html'); assert.equal(link.origin, origin); assert.equal(link.search, ''); assert.match(link.hash, /^#[a-f\d]{64}$/);
      assert.doesNotMatch(JSON.stringify(response), new RegExp(link.hash.slice(1))); ok(await request(link.pathname));
      const recovered = await post('/api/guest/recover', { token: link.hash.slice(1) }); ok(recovered);
      const orders = ok(await request('/api/guest/orders', { cookie: recovered.cookie })); assert.equal(orders.length, 1); assert.equal(String(orders[0]._id), String(order._id));
      assert.equal(ok(await request('/api/guest/invoices/order/' + order._id, { cookie: recovered.cookie })).totalAmount, 220);
      assert.equal((await request('/api/invoices/order/' + order._id, { cookie })).status, 403);
      assert.equal((await post('/api/guest/recover', { token: link.hash.slice(1) })).status, 400);
    });
    await t.test('Guest mail validates the configured origin before creating a recovery intent', async () => {
      for (const row of await M.GuestRecovery.find({ user: guest.id })) await M.GuestRecovery.deleteOne({ _id: row._id }); const before = smtp.messages.length;
      for (const invalid of ['javascript:alert(1)', 'https://user:private@store.example', 'https://store.example?token=private', 'https://store.example#private']) {
        process.env.CLIENT_APP_URL = invalid;
        assert.equal((await post('/api/guest/recovery', { orderId: String(order._id), email: guestEmail })).status, 503);
        assert.equal(await M.GuestRecovery.countDocuments({ user: guest.id }), 0);
      }
      assert.equal(smtp.messages.length, before); process.env.CLIENT_APP_URL = origin;
    });
    await t.test('Rejected guest email releases its retry intent and never creates false delivery evidence', async () => {
      smtp.reject(); const before = smtp.messages.length;
      ok(await post('/api/guest/recovery', { orderId: String(order._id), email: guestEmail }));
      assert.equal(smtp.messages.length, before); assert.equal(await M.GuestRecovery.countDocuments({ user: guest.id }), 0);
      smtp.reject(false); ok(await post('/api/guest/recovery', { orderId: String(order._id), email: guestEmail }));
      assert.equal(smtp.messages.length, before + 1); assert.equal(await M.GuestRecovery.countDocuments({ user: guest.id }), 1);
      const count = smtp.messages.length; ok(await post('/api/guest/recovery', { orderId: String(order._id), email: 'wrong@example.test' }));
      assert.equal(smtp.messages.length, count);
    });
  } finally {
    await smtp.close(); keys.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; });
  }
};
