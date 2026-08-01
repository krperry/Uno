const { spawn } = require('child_process');
const path = require('path');
const io = require('socket.io-client');

const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname),
  env: { ...process.env, PORT: '3104' },
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

function createSocket(name, email, displayName) {
  return new Promise((resolve, reject) => {
    const socket = io('http://127.0.0.1:3104', { transports: ['websocket'], forceNew: true, reconnection: false });
    socket.on('connect', () => {
      socket.emit('registerAccount', { email, password: 'secret123', displayName, rememberMe: false });
    });
    socket.on('loginResult', (payload) => {
      console.log(name, 'login', payload);
      resolve(socket);
    });
    socket.on('connect_error', reject);
  });
}

(async () => {
  const host = await createSocket('host', 'host3104@example.com', 'Host3104');
  const guest = await createSocket('guest', 'guest3104@example.com', 'Guest3104');

  host.on('tableState', (payload) => console.log('HOST tableState', JSON.stringify(payload)));
  host.on('starterDrawSummary', (payload) => console.log('HOST starterDrawSummary', payload));
  host.on('turnPlayer', (payload) => console.log('HOST turnPlayer', payload));
  host.on('haveCard', (cards) => console.log('HOST haveCard', cards));
  host.on('sendCard', (payload) => console.log('HOST sendCard', payload));
  host.on('actionNotice', (msg) => console.log('HOST notice', msg));
  guest.on('tableState', (payload) => console.log('GUEST tableState', JSON.stringify(payload)));
  guest.on('starterDrawSummary', (payload) => console.log('GUEST starterDrawSummary', payload));
  guest.on('turnPlayer', (payload) => console.log('GUEST turnPlayer', payload));
  guest.on('haveCard', (cards) => console.log('GUEST haveCard', cards));
  guest.on('sendCard', (payload) => console.log('GUEST sendCard', payload));
  guest.on('actionNotice', (msg) => console.log('GUEST notice', msg));

  host.emit('createTable', { name: 'Trace Table', gameType: 'uno' });
  setTimeout(() => {
    host.once('tableState', (payload) => {
      console.log('host captured tableid', payload.table.id);
      guest.emit('joinTable', { tableId: payload.table.id });
      setTimeout(() => {
        console.log('starting game');
        host.emit('startGame');
      }, 1000);
    });
  }, 500);

  setTimeout(() => {
    child.kill('SIGTERM');
    process.exit(0);
  }, 10000);
})();
