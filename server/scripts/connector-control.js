const fs = require('node:fs/promises');
async function main(args = process.argv.slice(2)) {
  const config = await require('./connector-demo').configuration();
  let endpoint, body;
  if (args[0] === 'pickup' && /^[A-Za-z0-9_-]{6,100}$/.test(args[1] || '') && ['picked_up', 'in_transit', 'arrived'].includes(args[2]) && args.length === 3) { endpoint = '/demo/pickups/' + args[1] + '/advance'; body = { state: args[2] }; }
  else if (args[0] === 'statement' && ['gateway', 'courier'].includes(args[1]) && args[2] && args[3] && args.length === 4) { const stat = await fs.stat(args[3]); if (stat.size > 500000) throw Error('Statement CSV must be under 500 KB'); endpoint = '/demo/statements'; body = { source: args[1], batchId: args[2], csv: await fs.readFile(args[3], 'utf8') }; }
  else throw Error('Usage: npm run connector:control -- pickup <reference> picked_up|in_transit|arrived\n   or: npm run connector:control -- statement gateway|courier <batch-id> <csv-file>');
  const response = await fetch('http://127.0.0.1:' + config.port + '/v1' + endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'Local demo operation failed');
  if (data.demo !== true) throw Error('Expected a local demonstration response');
  console.log(JSON.stringify(data, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
