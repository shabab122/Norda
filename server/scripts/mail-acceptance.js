async function main(args = process.argv.slice(2)) {
  require('../config/cliEnvironment').loadCliEnvironment();
  const service = require('../services/mailAcceptanceService');
  if (args.length === 0) {
    const status = service.diagnose();
    console.log(JSON.stringify(status, null, 2));
    if (!status.smtpConfigured) { console.log('This environment uses private file previews. Inbox delivery needs your existing SMTP settings. No message was sent.'); process.exitCode = 2; }
    else console.log('SMTP settings are present. Run npm run mail:check, then npm run mail:send-test -- --to your-own-address to check delivery.');
    return;
  }
  let receipt;
  if (args[0] === '--to' && args.length === 2) receipt = await service.sendProbe(args[1]);
  else if (args[0] === '--confirm' && args[2] === '--location' && args.length === 4) receipt = await service.confirm(args[1], args[3]);
  else throw Error('Use --to <single-email> or --confirm <reference> --location inbox|spam');
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.inboxConfirmed) console.log('SMTP accepted the message; inbox delivery is not yet confirmed. Check Inbox/Spam, then run npm run mail:confirm -- --confirm ' + receipt.reference + ' --location inbox (or spam).');
  else console.log('Receipt recorded from your observation. This does not certify future inbox placement.');
}
if (require.main === module) main().catch(error => { console.error(error.message.startsWith('SMTP') || error.message.startsWith('Supply') || error.message.startsWith('Use') || error.message.startsWith('Email delivery') ? error.message : 'Email acceptance could not finish. Check your local configuration or the exact saved probe reference.'); process.exitCode = 1; });
module.exports = { main };
