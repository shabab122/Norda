const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '../../client', f), 'utf8');
function setup(file) {
  const elements = new Map(), events = {}; let user = { _id: 'first', role: 'admin' };
  const get = id => { if (!elements.has(id)) elements.set(id, { innerHTML: '', value: '', textContent: '', disabled: false, hidden: false, checked: false, dataset: {}, addEventListener(e, fn) { this[e] = fn; }, querySelectorAll: () => [] }); return elements.get(id); };
  const scope = vm.createContext({ console, URLSearchParams, setTimeout() {}, document: { addEventListener(e, fn) { events[e] = fn; }, getElementById: get, querySelectorAll: () => [] }, window: { location: { search: '', pathname: '/admin/statement-sync.html' }, print() {} }, Api: { ready: Promise.resolve(), getUser: () => user }, requireAdmin: () => true, renderAdminShell() {}, managementAlert() {}, escapeHtml: v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), managementStatus: s => String(s), formatDate: String, money: String, managementTable: (heads, rows) => JSON.stringify(rows), confirm: () => true });
  vm.runInContext(read('admin/advanced-common.js'), scope);
  vm.runInContext('advancedOwner="first";', scope);
  if (file) vm.runInContext(read(file), scope);
  return { scope, get, events, setUser(u) { user = u; } };
}
test('Advanced admin actions serialize, recover after errors and stop after account changes', async () => {
  const { scope, setUser } = setup(); const button = { disabled: false }; let done, writes = 0;
  const first = scope.advancedAction(() => { writes++; return new Promise(r => done = r); }, button);
  assert.equal(button.disabled, true); assert.equal(await scope.advancedAction(async () => writes++), false);
  done(); await first; assert.equal(button.disabled, false); assert.equal(writes, 1);
  assert.equal(await scope.advancedAction(async () => { throw Error('failed'); }, button), false);
  assert.equal(button.disabled, false); await scope.advancedAction(async () => writes++, button); assert.equal(writes, 2);
  setUser({ _id: 'other', role: 'admin' }); assert.equal(await scope.advancedAction(async () => writes++), false); assert.equal(writes, 2);
});
test('Statement and routing responses cannot render into a different staff account', async () => {
  for (const [file, fn, target] of [['admin/statement-sync.js', 'loadStatementFeeds', 'statement-feeds'], ['admin/routing-bulk.js', 'loadRouting', 'routing-locations'], ['admin/logistics-automation.js', 'loadAutomation', 'automation-jobs']]) {
    const { scope, get, setUser } = setup(file); let resolve;
    scope.Api.get = () => new Promise(r => resolve = r); const pending = scope[fn]();
    setUser({ _id: 'other' }); resolve({}); await pending; assert.equal(get(target).innerHTML, '');
  }
});
test('Provider names, references and errors are escaped in carrier job rendering', async () => {
  const { scope, get } = setup('admin/logistics-automation.js'); scope.Api.get = async () => ({ configured: { parcel: true, reverse: true }, jobs: [{ _id: 'a'.repeat(24), targetId: 'b'.repeat(24), order: 'c'.repeat(24), targetType: '<img onerror=x>', reference: '<script>bad</script>', status: 'unknown', lastError: '<private "error">' }] });
  await scope.loadAutomation(); const html = get('automation-jobs').innerHTML;
  assert.match(html, /&lt;script>/); assert.match(html, /&lt;private &quot;error&quot;>/); assert.doesNotMatch(html, /<script>|<img onerror/);
});
test('Editing a bulk CSV invalidates its preview before stock can be applied', async () => {
  const { scope, get, events } = setup('admin/routing-bulk.js'); scope.Api.get = async () => ({ settings: { mode: 'priority', locations: [], destinations: [] }, warehouses: [] });
  await events.DOMContentLoaded(); vm.runInContext('bulkPreview={rows:[1]};', scope); get('bulk-apply').disabled = false;
  get('bulk-csv').input(); assert.equal(get('bulk-apply').disabled, true); assert.equal(vm.runInContext('bulkPreview', scope), null);
});
