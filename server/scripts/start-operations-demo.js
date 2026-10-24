async function main() {
  require('../config/cliEnvironment').loadCliEnvironment();
  const config = await require('./connector-demo').configuration();
  Object.assign(process.env, { PARCEL_COURIER_AUTO_ENABLED: 'false', REVERSE_PICKUP_AUTO_ENABLED: 'false', OPERATIONS_CONNECTOR_MODE: 'local-demo', OPERATIONS_CONNECTOR_URL: 'http://127.0.0.1:' + config.port + '/v1', OPERATIONS_CONNECTOR_TOKEN: config.token });
  if (!process.env.RETURN_RECEIVING_ADDRESS) process.env.RETURN_RECEIVING_ADDRESS = 'NORDA local demonstration receiving desk';
  const response = await fetch(process.env.OPERATIONS_CONNECTOR_URL + '/health', { headers: { Authorization: 'Bearer ' + config.token }, signal: AbortSignal.timeout(3000), redirect: 'error' });
  const health = await response.json();
  if (!response.ok || health.demo !== true || health.mode !== 'local-demo') throw Error('Start the private demo connector first');
  console.log('Local demonstration connector selected for this process. Existing environment files and database credentials are unchanged.');
  await require('../server').startServer();
}
main().catch(() => { console.error('Demo app startup failed. Start npm run connector:demo first, then check the unchanged MongoDB/environment configuration.'); process.exit(1); });
