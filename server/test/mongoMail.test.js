const test = require('node:test'), crypto = require('node:crypto'), mongoose = require('mongoose');
const uri = process.env.NORDA_TEST_MONGO_URI;
test('Real MongoDB HTTP/SMTP: application verification, reset and private guest recovery', { skip: !uri, timeout: 90000 }, async t => {
  process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex'); process.env.MAIL_TRANSPORT = 'file';
  const dbName = 'norda_test_smtp_' + crypto.randomBytes(10).toString('hex');
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000 });
  const server = require('../app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (url, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await require('../test-support/smtpRecoveryJourneys')(t, { request, models: mongoose.models, baseUrl: base });
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
