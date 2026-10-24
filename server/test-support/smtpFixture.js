// Test-only loopback mail receiver. Messages are never relayed externally.
const net = require('node:net');
async function createSmtpFixture() {
  const messages = [], sockets = new Set(); let rejecting = false;
  const server = net.createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let buffer = '', data = false, lines = [];
    socket.setEncoding('utf8'); socket.write('220 norda-acceptance ESMTP\r\n');
    socket.on('data', chunk => {
      buffer += chunk; if (buffer.length > 1000000) return socket.destroy();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') { messages.push(lines.join('\r\n')); lines = []; data = false; socket.write('250 2.0.0 captured\r\n'); }
          else lines.push(line.startsWith('..') ? line.slice(1) : line);
        } else if (/^(EHLO|HELO)\b/i.test(line)) socket.write('250-norda-acceptance\r\n250 SIZE 1000000\r\n');
        else if (/^RCPT TO:/i.test(line)) socket.write(rejecting ? '550 5.1.1 rejected\r\n' : '250 2.1.5 accepted\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 finish with dot\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 2.0.0 ok\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, messages, reject(value = true) { rejecting = value; }, async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
function actionLink(raw, filename) {
  const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/=\r\n/g, '').replace(/=([a-f\d]{2})/gi, (match, value) => String.fromCharCode(parseInt(value, 16)));
  const matches = body.match(/https?:\/\/[^\s<>]+/g) || [];
  const url = matches.map(value => new URL(value)).find(value => value.pathname.endsWith('/' + filename));
  if (!url) throw Error('Expected application action link in SMTP message');
  return url;
}
module.exports = { createSmtpFixture, actionLink };
