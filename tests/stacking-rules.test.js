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
      if (output.includes('Unable to start server') || output.includes('EADDRINUSE') || output.includes('ReferenceError')) {
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

function connectAndRegister(port, email, displayName) {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for loginResult'));
    }, 10000);

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

      clearTimeout(timeout);
      resolve({ socket: socket, payload: payload });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(err);
    });
  });
}

function waitForEvent(socket, eventName, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs || 10000);

    function handler(payload) {
      if (predicate && !predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(eventName, handler);
      resolve(payload);
    }

    socket.on(eventName, handler);
  });
}

async function createTableAndJoinGuests(port, options) {
  const host = await connectAndRegister(port, `host-${Date.now()}@example.com`, `Host${Date.now()}`);
  const guestOne = await connectAndRegister(port, `guest1-${Date.now()}@example.com`, `GuestOne${Date.now()}`);
  const guestTwo = await connectAndRegister(port, `guest2-${Date.now()}@example.com`, `GuestTwo${Date.now()}`);

  const tableId = await waitForEvent(host.socket, 'tableState', function (payload) {
    return payload && payload.table && payload.table.id;
  }, 5000).then(function (payload) {
    return payload.table.id;
  });

  host.socket.emit('createTable', Object.assign({
    name: `Stack Table ${Date.now()}`,
    gameType: 'uno'
  }, options || {}));

  const createdTableId = await waitForEvent(host.socket, 'tableState', function (payload) {
    return payload && payload.table && payload.table.id;
  }, 5000).then(function (payload) {
    return payload.table.id;
  });

  guestOne.socket.emit('joinTable', { tableId: createdTableId });
  guestTwo.socket.emit('joinTable', { tableId: createdTableId });

  await new Promise((resolve) => setTimeout(resolve, 300));

  return { host: host.socket, guestOne: guestOne.socket, guestTwo: guestTwo.socket, tableId: createdTableId };
}

test('table settings default stacking rules are off unless enabled', async () => {
  const port = 3110;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(child, port);

    const host = await connectAndRegister(port, `stack-default-${Date.now()}@example.com`, `StackDefault${Date.now()}`);

    const defaultTablePromise = waitForEvent(host.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.id;
    }, 5000).then(function (payload) {
      return payload.table;
    });

    host.socket.emit('createTable', {
      name: `Stack Default ${Date.now()}`,
      gameType: 'uno'
    });

    const defaultTable = await defaultTablePromise;

    assert.equal(defaultTable.matchSettings.allowDrawTwoStacking, false);
    assert.equal(defaultTable.matchSettings.allowWildDrawFourStacking, false);

    const hostTwo = await connectAndRegister(port, `stack-enabled-${Date.now()}@example.com`, `StackEnabled${Date.now()}`);

    const enabledTablePromise = waitForEvent(hostTwo.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.id && payload.table.name.indexOf('Stack Enabled') === 0;
    }, 5000).then(function (payload) {
      return payload.table;
    });

    hostTwo.socket.emit('createTable', {
      name: `Stack Enabled ${Date.now()}`,
      gameType: 'uno',
      allowDrawTwoStacking: true,
      allowWildDrawFourStacking: true
    });

    const enabledTable = await enabledTablePromise;

    assert.equal(enabledTable.matchSettings.allowDrawTwoStacking, true);
    assert.equal(enabledTable.matchSettings.allowWildDrawFourStacking, true);
  } finally {
    child.kill('SIGTERM');
  }
});

test('draw two stacking accumulates and only resolves once the affected player explicitly declines', async () => {
  const port = 3111;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let host;
  let guestOne;
  let guestTwo;

  try {
    await waitForServer(child, port);

    host = await connectAndRegister(port, `stack-draw2-host-${Date.now()}@example.com`, `StackDraw2Host${Date.now()}`);
    guestOne = await connectAndRegister(port, `stack-draw2-g1-${Date.now()}@example.com`, `StackDraw2Guest1${Date.now()}`);
    guestTwo = await connectAndRegister(port, `stack-draw2-g2-${Date.now()}@example.com`, `StackDraw2Guest2${Date.now()}`);

    const createdTable = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out creating stacking table'));
      }, 5000);

      host.socket.once('tableState', (payload) => {
        if (!payload || !payload.table || !payload.table.id) {
          return;
        }
        clearTimeout(timeout);
        resolve(payload.table);
      });

      host.socket.emit('createTable', {
        name: `Draw Two Stack ${Date.now()}`,
        gameType: 'uno',
        allowDrawTwoStacking: true
      });
    });

    guestOne.socket.emit('joinTable', { tableId: createdTable.id });
    guestTwo.socket.emit('joinTable', { tableId: createdTable.id });

    await waitForEvent(host.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.status === 'waiting';
    }, 2000).catch(function () {
      return null;
    });

    const inGameStatePromise = waitForEvent(host.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.status === 'in_game';
    }, 5000);
    host.socket.emit('startGame');
    await inGameStatePromise;

    await new Promise((resolve) => {
      host.socket.emit('__testSetTableState', {
        tableId: createdTable.id,
        status: 'in_game',
        game: {
          turn: 0,
          reverse: 0,
          cardOnBoard: 0,
          chosenColor: null,
          deck: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15],
          stack: {
            active: false,
            type: null,
            penalty: 0,
            activeColor: null,
            lastPlayerId: null,
            lastPlayerName: '',
            respondingPlayerId: null,
            respondingPlayerName: ''
          },
          locked: false,
          hasDrawn: false
        },
        players: [
          { id: host.socket.id, hand: [12, 1] },
          { id: guestOne.socket.id, hand: [26, 2] },
          { id: guestTwo.socket.id, hand: [1, 2] }
        ],
        emitDiscardCard: true,
        emitTurnPlayer: true
      });
      setTimeout(resolve, 250);
    });

    const guestOneTurnPromise = waitForEvent(guestOne.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestOne.socket.id && payload.stackState && payload.stackState.active && payload.stackState.canContinue;
    }, 5000);

    host.socket.emit('playCard', { card: 12 });

    const guestOneTurn = await guestOneTurnPromise;
    assert.equal(guestOneTurn.stackState.penalty, 2);

    // guestTwo's hand ([1, 2]) has no Draw Two, so once the stack reaches them the
    // server must present the normal turn interface rather than silently resolving
    // the penalty itself - doing that automatically would reveal (via the resulting
    // transition) that guestTwo lacked a Draw Two.
    const guestTwoTurnPromise = waitForEvent(guestTwo.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestTwo.socket.id && payload.stackState && payload.stackState.active;
    }, 5000);
    // Neither spectator should be told whether guestTwo can continue the stack.
    const hostSpectatorTurnPromise = waitForEvent(host.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestTwo.socket.id && payload.stackState && payload.stackState.active;
    }, 5000);

    guestOne.socket.emit('playCard', { card: 26 });

    const guestTwoTurn = await guestTwoTurnPromise;
    assert.equal(guestTwoTurn.stackState.penalty, 4);
    assert.equal(guestTwoTurn.stackState.canContinue, false);

    const hostSpectatorTurn = await hostSpectatorTurnPromise;
    assert.equal(hostSpectatorTurn.stackState.canContinue, false);

    // Give the server a moment to prove it does NOT auto-resolve on its own.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stillPendingState = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out checking pending stack state')), 5000);
      host.socket.once('tableState', (payload) => {
        clearTimeout(timeout);
        resolve(payload.table);
      });
      // No-op refresh - forces a tableState emit so the test can inspect card
      // counts without changing any server state.
      host.socket.emit('__testSetTableState', { tableId: createdTable.id });
    });
    const guestTwoStillTwo = stillPendingState.players.find((player) => player.id === guestTwo.socket.id);
    assert.equal(guestTwoStillTwo.cardCount, 2, 'guestTwo should not have been auto-drawn yet');

    const hostTurnPromise = waitForEvent(host.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === host.socket.id && (!payload.stackState || !payload.stackState.active);
    }, 5000);
    const guestTwoResolvedStatePromise = waitForEvent(guestTwo.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.players && payload.table.players.some(function (player) {
        return player.id === guestTwo.socket.id && player.cardCount === 6;
      });
    }, 5000);

    guestTwo.socket.emit('acceptStackPenalty');

    const guestTwoResolvedTurn = await hostTurnPromise;
    assert.equal(guestTwoResolvedTurn.id, host.socket.id);

    const guestTwoState = await guestTwoResolvedStatePromise;

    const guestTwoEntry = guestTwoState.table.players.find(function (player) {
      return player.id === guestTwo.socket.id;
    });
    assert.equal(guestTwoEntry.cardCount, 6);
  } finally {
    if (host && host.socket.connected) {
      host.socket.disconnect();
    }
    if (guestOne && guestOne.socket.connected) {
      guestOne.socket.disconnect();
    }
    if (guestTwo && guestTwo.socket.connected) {
      guestTwo.socket.disconnect();
    }
    child.kill('SIGTERM');
  }
});

test('a last-card draw two only wins after the stack stops away from the starter', async () => {
  const port = 3113;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let host;
  let guestOne;
  let guestTwo;

  try {
    await waitForServer(child, port);

    host = await connectAndRegister(port, `stack-last-host-${Date.now()}@example.com`, `StackLastHost${Date.now()}`);
    guestOne = await connectAndRegister(port, `stack-last-g1-${Date.now()}@example.com`, `StackLastGuest1${Date.now()}`);
    guestTwo = await connectAndRegister(port, `stack-last-g2-${Date.now()}@example.com`, `StackLastGuest2${Date.now()}`);

    const createdTable = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out creating last-card stack table'));
      }, 5000);

      host.socket.once('tableState', (payload) => {
        if (!payload || !payload.table || !payload.table.id) {
          return;
        }
        clearTimeout(timeout);
        resolve(payload.table);
      });

      host.socket.emit('createTable', {
        name: `Last Card Stack ${Date.now()}`,
        gameType: 'uno',
        allowDrawTwoStacking: true
      });
    });

    guestOne.socket.emit('joinTable', { tableId: createdTable.id });
    guestTwo.socket.emit('joinTable', { tableId: createdTable.id });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const inGameStatePromise = waitForEvent(host.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.status === 'in_game';
    }, 5000);
    host.socket.emit('startGame');
    await inGameStatePromise;

    await new Promise((resolve) => {
      host.socket.emit('__testSetTableState', {
        tableId: createdTable.id,
        status: 'in_game',
        game: {
          turn: 0,
          reverse: 0,
          cardOnBoard: 0,
          chosenColor: null,
          deck: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15],
          stack: {
            active: false,
            type: null,
            penalty: 0,
            activeColor: null,
            starterId: null,
            starterName: '',
            roundEndPending: false,
            lastPlayerId: null,
            lastPlayerName: '',
            respondingPlayerId: null,
            respondingPlayerName: ''
          },
          locked: false,
          hasDrawn: false
        },
        players: [
          { id: host.socket.id, hand: [12] },
          { id: guestOne.socket.id, hand: [12] },
          { id: guestTwo.socket.id, hand: [1, 2] }
        ],
        emitDiscardCard: true,
        emitTurnPlayer: true
      });
      setTimeout(resolve, 250);
    });

    const guestTwoTurnPromise = waitForEvent(guestTwo.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestTwo.socket.id && payload.stackState && payload.stackState.active;
    }, 5000);

    host.socket.emit('playCard', { card: 12 });

    guestOne.socket.emit('playCard', { card: 12 });

    // guestTwo has no Draw Two, so with the auto-resolve bug fixed the round only
    // ends once guestTwo explicitly declines to stack.
    await guestTwoTurnPromise;

    const roundSummaryPromise = waitForEvent(host.socket, 'roundSummary', function (payload) {
      return payload && payload.winner === host.payload.name;
    }, 5000);

    guestTwo.socket.emit('acceptStackPenalty');

    const roundSummary = await roundSummaryPromise;
    assert.equal(roundSummary.winner, host.payload.name);
    assert.equal(roundSummary.reason, 'stack_resolved');
  } finally {
    if (host && host.socket.connected) {
      host.socket.disconnect();
    }
    if (guestOne && guestOne.socket.connected) {
      guestOne.socket.disconnect();
    }
    if (guestTwo && guestTwo.socket.connected) {
      guestTwo.socket.disconnect();
    }
    child.kill('SIGTERM');
  }
});

test('wild draw four stacking preserves the last chosen color after the stack resolves', async () => {
  const port = 3112;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let host;
  let guestOne;
  let guestTwo;

  try {
    await waitForServer(child, port);

    host = await connectAndRegister(port, `stack-wdf-host-${Date.now()}@example.com`, `StackWdfHost${Date.now()}`);
    guestOne = await connectAndRegister(port, `stack-wdf-g1-${Date.now()}@example.com`, `StackWdfGuest1${Date.now()}`);
    guestTwo = await connectAndRegister(port, `stack-wdf-g2-${Date.now()}@example.com`, `StackWdfGuest2${Date.now()}`);

    const createdTable = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out creating WDF stacking table'));
      }, 5000);

      host.socket.once('tableState', (payload) => {
        if (!payload || !payload.table || !payload.table.id) {
          return;
        }
        clearTimeout(timeout);
        resolve(payload.table);
      });

      host.socket.emit('createTable', {
        name: `Wild Draw Four Stack ${Date.now()}`,
        gameType: 'uno',
        allowWildDrawFourStacking: true
      });
    });

    guestOne.socket.emit('joinTable', { tableId: createdTable.id });
    guestTwo.socket.emit('joinTable', { tableId: createdTable.id });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const inGameStatePromise = waitForEvent(host.socket, 'tableState', function (payload) {
      return payload && payload.table && payload.table.status === 'in_game';
    }, 5000);
    host.socket.emit('startGame');
    await inGameStatePromise;

    await new Promise((resolve) => {
      host.socket.emit('__testSetTableState', {
        tableId: createdTable.id,
        status: 'in_game',
        game: {
          turn: 0,
          reverse: 0,
          cardOnBoard: 0,
          chosenColor: null,
          deck: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15],
          stack: {
            active: false,
            type: null,
            penalty: 0,
            activeColor: null,
            lastPlayerId: null,
            lastPlayerName: '',
            respondingPlayerId: null,
            respondingPlayerName: ''
          },
          locked: false,
          hasDrawn: false
        },
        players: [
          { id: host.socket.id, hand: [69, 16] },
          { id: guestOne.socket.id, hand: [83, 2] },
          { id: guestTwo.socket.id, hand: [1, 2] }
        ],
        emitDiscardCard: true,
        emitTurnPlayer: true
      });
      setTimeout(resolve, 250);
    });

    const guestOneTurnPromise = waitForEvent(guestOne.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestOne.socket.id && payload.stackState && payload.stackState.active && payload.stackState.canContinue;
    }, 5000);

    const discardInfoPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for discard card info')), 5000);
      host.socket.once('discardCardInfo', (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    host.socket.emit('playCard', { card: 69, chosenColor: 'red' });

    const guestOneTurn = await guestOneTurnPromise;
    assert.equal(guestOneTurn.stackState.penalty, 4);

    // guestTwo has no Wild Draw Four, so the affected player (guestTwo) must be
    // presented with the normal turn interface and explicitly decline - the server
    // must not resolve this on its own by inspecting guestTwo's hand.
    const guestTwoTurnPromise = waitForEvent(guestTwo.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === guestTwo.socket.id && payload.stackState && payload.stackState.active && payload.stackState.penalty === 8;
    }, 5000);

    guestOne.socket.emit('playCard', { card: 83, chosenColor: 'blue' });

    const guestTwoTurn = await guestTwoTurnPromise;
    assert.equal(guestTwoTurn.stackState.canContinue, false);

    const hostTurnPromise = waitForEvent(host.socket, 'turnPlayer', function (payload) {
      return payload && payload.id === host.socket.id && (!payload.stackState || !payload.stackState.active);
    }, 5000);

    guestTwo.socket.emit('acceptStackPenalty');

    const hostTurn = await hostTurnPromise;
    assert.equal(hostTurn.id, host.socket.id);

    host.socket.emit('requestDiscardCard');
    const discardInfo = await discardInfoPromise;

    assert.equal(discardInfo.success, true);
    assert.match(discardInfo.message, /Draw Four blue/i);
  } finally {
    if (host && host.socket.connected) {
      host.socket.disconnect();
    }
    if (guestOne && guestOne.socket.connected) {
      guestOne.socket.disconnect();
    }
    if (guestTwo && guestTwo.socket.connected) {
      guestTwo.socket.disconnect();
    }
    child.kill('SIGTERM');
  }
});
