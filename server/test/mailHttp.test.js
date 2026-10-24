const test = require('node:test'), crypto = require('node:crypto');
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex'); process.env.MAIL_TRANSPORT = 'file';
const store = require('../test-support/memoryStore').installMemoryStore();
test('Application email acceptance through actual HTTP, SMTP and one-use received links', { timeout: 30000 }, async t => {
  const server = require('../app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (url, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  try { await require('../test-support/smtpRecoveryJourneys')(t, { request, models: store.models, baseUrl: base }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.restore(); }
});
