const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const io = require('socket.io-client');

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for server on port ${port}`));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`listening on port ${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => {
      const output = chunk.toString();
      if (output.includes('Unable to start server') || output.includes('EADDRINUSE')) {
        clearTimeout(timeout);
        reject(new Error(output));
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited early with code ${code}`));
    });
  });
}

test('creating a table works through the socket API', async () => {
  const email = `table-test+${Date.now()}@example.com`;
  const displayName = `TableTest${Date.now()}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3101' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(child, 3101);

    const socket = io('http://127.0.0.1:3101', {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timed out waiting for table creation response'));
      }, 5000);

      socket.on('connect', () => {
        socket.emit('registerAccount', {
          email: email,
          password: 'secret123',
          displayName: displayName,
          rememberMe: false
        });
      });

      socket.on('loginResult', (payload) => {
        if (!payload.success) {
          clearTimeout(timeout);
          socket.disconnect();
          reject(new Error(payload.message || 'Login failed'));
          return;
        }

        socket.emit('createTable', { name: 'Regression Table', gameType: 'uno' });
      });

      socket.on('serverMessage', (payload) => {
        clearTimeout(timeout);
        socket.disconnect();
        resolve(payload);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        socket.disconnect();
        reject(err);
      });
    });

    assert.equal(result.type, 'info');
    assert.match(result.message, /Created table/i);
  } finally {
    child.kill('SIGTERM');
  }
});
