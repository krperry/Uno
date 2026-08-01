const io = require('socket.io-client');
const port = 3102;

function connect(email, displayName) {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('connect timeout'));
    }, 15000);

    socket.on('connect', () => {
      socket.emit('registerAccount', { email, password: 'secret123', displayName, rememberMe: false });
    });

    socket.on('loginResult', (payload) => {
      if (!payload.success) {
        clearTimeout(timer);
        socket.disconnect();
        reject(new Error(payload.message));
        return;
      }
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(err);
    });
  });
}

(async () => {
  const host = await connect(`host-${Date.now()}@example.com`, `Host${Date.now()}`);
  const guest = await connect(`guest-${Date.now()}@example.com`, `Guest${Date.now()}`);

  const tableId = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      host.disconnect();
      guest.disconnect();
      reject(new Error('table timeout'));
    }, 10000);

    host.on('tableState', (payload) => {
      if (payload && payload.table && payload.table.id) {
        clearTimeout(timer);
        resolve(payload.table.id);
      }
    });

    host.emit('createTable', { name: 'Trace Table', gameType: 'uno' });
  });

  console.log('tableId', tableId);
  guest.emit('joinTable', { tableId });

  await new Promise((resolve) => setTimeout(resolve, 500));

  host.on('tableState', (payload) => console.log('HOST TABLESTATE', JSON.stringify(payload)));
  guest.on('tableState', (payload) => console.log('GUEST TABLESTATE', JSON.stringify(payload)));
  host.on('starterDrawSummary', (payload) => console.log('STARTER', JSON.stringify(payload)));
  host.on('turnPlayer', (payload) => console.log('TURN', JSON.stringify(payload)));
  host.on('haveCard', (cards) => console.log('HOST CARDS', JSON.stringify(cards)));
  guest.on('haveCard', (cards) => console.log('GUEST CARDS', JSON.stringify(cards)));
  host.on('sendCard', (payload) => console.log('SENDCARD', JSON.stringify(payload)));

  host.emit('startGame');

  setTimeout(() => {
    host.disconnect();
    guest.disconnect();
    process.exit(0);
  }, 7000);
})();
