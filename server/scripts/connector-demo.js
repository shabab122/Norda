const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = path.resolve(__dirname, '../.local-connector');
const configFile = path.join(directory, 'config.json');

async function configuration({ create = false } = {}) {
  if (process.env.NODE_ENV === 'production') throw Error('Local connector mode is disabled in production');
  let config;
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT' || !create) throw Error('Start npm run connector:demo first');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    config = { port: Number(process.env.LOCAL_CONNECTOR_PORT || 5018), token: crypto.randomBytes(32).toString('hex') };
    await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
  }
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || [3000, 3002, 5000].includes(config.port) || typeof config.token !== 'string' || config.token.length < 32) throw Error('Invalid private local connector configuration');
  return config;
}
async function main() {
  const config = await configuration({ create: true });
  const connector = await require('../services/localOperationsConnector').createLocalConnector({ directory, token: config.token });
  const server = connector.app.listen(config.port, '127.0.0.1');
  try { await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); }
  catch (error) { await connector.close(); throw error; }
  console.log('NORDA local demo connector listening on 127.0.0.1:' + config.port + '. No real courier or funds are involved.');
  console.log('In a second terminal run npm run dev:operations-demo. Stop both processes before switching to ordinary npm run dev.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await new Promise(resolve => server.close(resolve)); await connector.close(); };
  process.once('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
  process.once('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
}
if (require.main === module) main().catch(() => { console.error('Local connector could not start. Check the private state lock and port; stop the previous instance before recovery.'); process.exitCode = 1; });
module.exports = { configuration };
