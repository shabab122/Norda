const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { mailConfiguration } = require('./mailService');
const email = value => typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(value);
const defaultDirectory = path.resolve(__dirname, '../.mail-checks');

function diagnose() {
  const config = mailConfiguration();
  return { transport: config.transport, smtpConfigured: config.transport === 'smtp', encryptedConnection: config.options?.secure || false, startTlsRequired: config.options?.requireTLS || false, authenticationConfigured: Boolean(config.options?.auth), inboxConfirmed: false };
}
async function store(directory, receipt) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 }); await fs.chmod(directory, 0o700);
  const destination = path.join(directory, receipt.reference + '.json');
  const temporary = destination + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, destination); return receipt;
}
async function sendProbe(to, { directory = defaultDirectory } = {}) {
  if (!email(to)) throw Error('Supply exactly one complete recipient with --to; mailing lists and multiple addresses are rejected');
  const config = mailConfiguration();
  if (config.transport !== 'smtp') throw Error('SMTP is not configured. Local file previews do not deliver to an inbox. Keep your working SMTP settings in server/.env or server/.env.integrations');
  const reference = crypto.randomUUID(), createdAt = new Date().toISOString();
  const mailbox = config.from.match(/<([^<>]+)>$/)?.[1] || config.from, senderDomain = mailbox.slice(mailbox.lastIndexOf('@') + 1);
  // Persist the intent first: a crash after SMTP acceptance must not look like
  // proof of failure or trigger a blind resend. Every execution is a new probe.
  let receipt = { reference, to, createdAt, status: 'sending', inboxConfirmed: false };
  await store(directory, receipt);
  const transport = nodemailer.createTransport(config.options);
  try {
    await transport.verify();
    const result = await transport.sendMail({ from: config.from, to, subject: 'NORDA email delivery check — ' + reference, text: 'This is the email delivery check you requested for NORDA.\n\nReference: ' + reference + '\nRequested at: ' + createdAt + '\n\nIf you can read this message, confirm whether it arrived in Inbox or Spam using the mail:confirm command. This message contains no account token, order link or password.\n', messageId: '<norda-check-' + reference + '@' + senderDomain + '>' });
    if (!result.accepted?.length || result.rejected?.length) throw Error('SMTP recipient was not accepted');
    receipt = { ...receipt, status: 'smtp_accepted', messageId: result.messageId, acceptedAt: new Date().toISOString() };
  } catch (cause) {
    // Do not persist provider errors: they may contain account/credential data.
    await store(directory, { ...receipt, status: 'unconfirmed', checkedAt: new Date().toISOString() });
    throw Error('Email delivery is unconfirmed. Run npm run mail:check, review your SMTP configuration and look for this probe before sending another');
  } finally { transport.close(); }
  return store(directory, receipt);
}
async function confirm(reference, location, { directory = defaultDirectory } = {}) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(reference || '') || !['inbox', 'spam'].includes(location)) throw Error('Use the exact test reference and --location inbox|spam');
  const receipt = JSON.parse(await fs.readFile(path.join(directory, reference + '.json'), 'utf8'));
  if (receipt.reference !== reference || !['smtp_accepted', 'received', 'unconfirmed', 'sending'].includes(receipt.status)) throw Error('This reference is not a delivery probe');
  return store(directory, { ...receipt, status: 'received', inboxConfirmed: true, receivedIn: location, confirmedAt: new Date().toISOString(), confirmation: 'operator-observed' });
}
module.exports = { diagnose, sendProbe, confirm };
