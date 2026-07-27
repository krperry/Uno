const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const port = process.env.PORT || 3000;
const MAX_TABLE_PLAYERS = 6;
const MIN_TABLE_PLAYERS = 2;

app.use(express.static(__dirname + '/public'));
io.on('connection', onConnection);
http.listen(port, () => console.log('listening on port ' + port));

let tableSequence = 1;
const tables = {};

function createDeck() {
  const baseDeck = Array.apply(null, Array(112)).map(function (_, i) { return i; });
  baseDeck.splice(56, 1);
  baseDeck.splice(69, 1);
  baseDeck.splice(82, 1);
  baseDeck.splice(95, 1);
  return baseDeck;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
}

function cardColor(num) {
  if (num % 14 === 13) {
    return 'black';
  }

  switch (Math.floor(num / 14)) {
    case 0:
    case 4:
      return 'red';
    case 1:
    case 5:
      return 'yellow';
    case 2:
    case 6:
      return 'green';
    case 3:
    case 7:
      return 'blue';
    default:
      return 'unknown';
  }
}

function cardType(num) {
  switch (num % 14) {
    case 10:
      return 'Skip';
    case 11:
      return 'Reverse';
    case 12:
      return 'Draw2';
    case 13:
      return Math.floor(num / 14) >= 4 ? 'Draw4' : 'Wild';
    default:
      return 'Number ' + (num % 14);
  }
}

function cardScore(num) {
  switch (num % 14) {
    case 10:
    case 11:
    case 12:
      return 20;
    case 13:
      return 50;
    default:
      return num % 14;
  }
}

function normalizeIndex(index, total) {
  return ((index % total) + total) % total;
}

function getNextPlayerIndex(table, startIndex, steps) {
  const direction = table.game.reverse === 0 ? 1 : -1;
  return normalizeIndex(startIndex + direction * steps, table.players.length);
}

function getCurrentBoardColor(table) {
  const boardColor = cardColor(table.game.cardOnBoard);
  if (boardColor === 'black' && table.game.chosenColor) {
    return table.game.chosenColor;
  }
  return boardColor;
}

function describeCard(card, chosenColor) {
  const color = cardColor(card) === 'black' && chosenColor ? chosenColor : cardColor(card);
  return cardType(card) + ' ' + color;
}

function canPlayCardOnBoard(table, card) {
  const playedColor = cardColor(card);
  const playedNumber = card % 14;
  const boardNumber = table.game.cardOnBoard % 14;
  const boardColor = getCurrentBoardColor(table);

  if (playedColor === 'black') {
    return true;
  }

  return playedColor === boardColor || playedNumber === boardNumber;
}

function hasPlayableCard(table, hand) {
  return hand.some(function (card) {
    return canPlayCardOnBoard(table, card);
  });
}

function createTableId() {
  const id = 'table_' + tableSequence;
  tableSequence += 1;
  return id;
}

function findTableBySocket(socket) {
  if (!socket.tableId || !tables[socket.tableId]) {
    return null;
  }
  return tables[socket.tableId];
}

function getPlayerIndex(table, socketId) {
  return table.players.findIndex(function (player) {
    return player.id === socketId;
  });
}

function buildLobbySnapshot() {
  const list = Object.keys(tables).map(function (tableId) {
    const table = tables[tableId];
    return {
      id: table.id,
      name: table.name,
      hostName: table.hostName,
      status: table.status,
      playerCount: table.players.length,
      maxPlayers: MAX_TABLE_PLAYERS
    };
  });

  list.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  return { tables: list };
}

function emitLobbySnapshotAll() {
  const snapshot = buildLobbySnapshot();
  io.emit('lobbySnapshot', snapshot);
}

function sendLobbySnapshot(socket) {
  socket.emit('lobbySnapshot', buildLobbySnapshot());
}

function buildTableState(table, socketId) {
  return {
    table: {
      id: table.id,
      name: table.name,
      hostId: table.hostId,
      hostName: table.hostName,
      status: table.status,
      players: table.players.map(function (player) {
        return {
          id: player.id,
          name: player.name,
          cardCount: table.status === 'in_game' ? player.hand.length : 0
        };
      })
    },
    youAreHost: table.hostId === socketId
  };
}

function emitTableState(table) {
  table.players.forEach(function (player) {
    io.to(player.id).emit('tableState', buildTableState(table, player.id));
  });
}

function ensureDeckNotEmpty(table) {
  if (table.game.deck.length === 0) {
    const freshDeck = createDeck();
    shuffle(freshDeck);
    table.game.deck = freshDeck;
  }
}

function drawCardsFromDeck(table, playerIndex, count) {
  for (let i = 0; i < count; i++) {
    ensureDeckNotEmpty(table);
    const card = parseInt(table.game.deck.shift(), 10);
    table.players[playerIndex].hand.push(card);
  }
}

function sendHands(table) {
  table.players.forEach(function (player) {
    io.to(player.id).emit('haveCard', player.hand);
  });
}

function emitDiscardCard(table) {
  io.to(table.id).emit('sendCard', {
    card: table.game.cardOnBoard,
    chosenColor: table.game.chosenColor
  });
}

function emitTurnPlayer(table) {
  const currentPlayer = table.players[table.game.turn];
  if (!currentPlayer) {
    return;
  }

  const canPlay = hasPlayableCard(table, currentPlayer.hand);
  io.to(table.id).emit('turnPlayer', {
    id: currentPlayer.id,
    name: currentPlayer.name,
    canPlay: canPlay,
    mustDraw: !canPlay,
    topDiscard: describeCard(table.game.cardOnBoard, table.game.chosenColor)
  });
}

function advanceTurn(table, steps) {
  table.game.turn = getNextPlayerIndex(table, table.game.turn, steps);
  table.game.hasDrawn = false;
}

function calculateRoundPoints(table, winnerIndex) {
  let points = 0;
  for (let i = 0; i < table.players.length; i++) {
    if (i === winnerIndex) {
      continue;
    }

    table.players[i].hand.forEach(function (card) {
      points += cardScore(card);
    });
  }
  return points;
}

function getScoreboard(table) {
  return table.players.map(function (player) {
    return {
      name: player.name,
      score: table.scores[player.name] || 0
    };
  }).sort(function (a, b) {
    return b.score - a.score;
  });
}

function endRound(table, winnerIndex, reason) {
  if (!table.players[winnerIndex]) {
    return;
  }

  const winnerName = table.players[winnerIndex].name;
  const roundPoints = calculateRoundPoints(table, winnerIndex);
  table.scores[winnerName] = (table.scores[winnerName] || 0) + roundPoints;

  io.to(table.id).emit('roundSummary', {
    winner: winnerName,
    roundPoints: roundPoints,
    scores: getScoreboard(table),
    reason: reason || 'round_end'
  });

  io.to(table.id).emit('actionNotice', winnerName + ' won the game. Host can start a new game when ready.');

  table.players.forEach(function (player) {
    player.hand = [];
  });

  table.status = 'waiting';
  table.game = null;
  emitTableState(table);
  emitLobbySnapshotAll();
}

function initializeGameState(table) {
  table.game = {
    deck: createDeck(),
    reverse: 0,
    turn: 0,
    cardOnBoard: 0,
    chosenColor: null,
    hasDrawn: false
  };

  shuffle(table.game.deck);

  if (table.players.length === 0) {
    return;
  }

  if (typeof table.dealerIndex !== 'number' || table.dealerIndex < 0 || table.dealerIndex >= table.players.length) {
    table.dealerIndex = Math.floor(Math.random() * table.players.length);
  } else {
    table.dealerIndex = normalizeIndex(table.dealerIndex + 1, table.players.length);
  }

  table.players.forEach(function (player) {
    player.hand = [];
    if (typeof table.scores[player.name] !== 'number') {
      table.scores[player.name] = 0;
    }
  });

  for (let i = 0; i < table.players.length * 7; i++) {
    const playerIndex = normalizeIndex(i + table.dealerIndex + 1, table.players.length);
    ensureDeckNotEmpty(table);
    const card = parseInt(table.game.deck.shift(), 10);
    table.players[playerIndex].hand.push(card);
  }

  let starterCard;
  do {
    ensureDeckNotEmpty(table);
    starterCard = parseInt(table.game.deck.shift(), 10);
    if (cardColor(starterCard) === 'black') {
      table.game.deck.push(starterCard);
      shuffle(table.game.deck);
    } else {
      break;
    }
  } while (true);

  table.game.cardOnBoard = starterCard;
  table.game.chosenColor = null;
  table.game.hasDrawn = false;
  table.game.turn = normalizeIndex(table.dealerIndex + 1, table.players.length);

  if (cardType(starterCard) === 'Draw2') {
    drawCardsFromDeck(table, table.game.turn, 2);
    advanceTurn(table, 1);
  } else if (cardType(starterCard) === 'Reverse') {
    table.game.reverse = 1;
    if (table.players.length === 2) {
      advanceTurn(table, 1);
    }
  } else if (cardType(starterCard) === 'Skip') {
    advanceTurn(table, 1);
  }
}

function startGameForTable(table) {
  if (table.players.length < MIN_TABLE_PLAYERS) {
    return { success: false, message: 'At least 2 players are required to start a game' };
  }

  initializeGameState(table);
  table.status = 'in_game';

  sendHands(table);
  emitDiscardCard(table);
  emitTurnPlayer(table);
  emitTableState(table);
  emitLobbySnapshotAll();
  return { success: true };
}

function assignNewHostIfNeeded(table) {
  if (table.players.length === 0) {
    return;
  }

  const hostStillPresent = table.players.some(function (player) {
    return player.id === table.hostId;
  });

  if (!hostStillPresent) {
    table.hostId = table.players[0].id;
    table.hostName = table.players[0].name;
    io.to(table.id).emit('actionNotice', table.hostName + ' is now table host');
  }
}

function handlePlayerRemovalFromGame(table, removedIndex, playerName) {
  if (table.status !== 'in_game' || !table.game) {
    return;
  }

  const removedPlayer = table.players[removedIndex];
  if (removedPlayer && removedPlayer.hand.length) {
    removedPlayer.hand.forEach(function (card) {
      table.game.deck.push(card);
    });
    shuffle(table.game.deck);
  }

  if (removedIndex < table.game.turn) {
    table.game.turn -= 1;
  }

  if (removedIndex === table.game.turn && table.game.turn >= table.players.length - 1) {
    table.game.turn = 0;
  }

  io.to(table.id).emit('actionNotice', playerName + ' left the game');
}

function leaveCurrentTable(socket, reason) {
  const table = findTableBySocket(socket);
  if (!table) {
    return;
  }

  const playerIndex = getPlayerIndex(table, socket.id);
  if (playerIndex < 0) {
    socket.tableId = null;
    socket.leave(table.id);
    return;
  }

  const playerName = table.players[playerIndex].name;
  handlePlayerRemovalFromGame(table, playerIndex, playerName);

  table.players.splice(playerIndex, 1);
  socket.leave(table.id);
  socket.tableId = null;

  if (table.players.length === 0) {
    delete tables[table.id];
    emitLobbySnapshotAll();
    return;
  }

  assignNewHostIfNeeded(table);

  if (table.status === 'in_game' && table.players.length === 1) {
    endRound(table, 0, 'last_player_remaining');
  } else {
    if (table.status === 'in_game') {
      table.game.turn = normalizeIndex(table.game.turn, table.players.length);
      sendHands(table);
      emitDiscardCard(table);
      emitTurnPlayer(table);
    }

    emitTableState(table);
    emitLobbySnapshotAll();
  }

  if (reason !== 'disconnect') {
    socket.emit('tableState', null);
  }
}

function validatePlayerReady(socket) {
  if (!socket.playerName) {
    socket.emit('serverMessage', { type: 'error', message: 'Log in first' });
    return false;
  }
  return true;
}

function onConnection(socket) {
  socket.playerName = '';
  socket.tableId = null;

  socket.on('login', function (payload) {
    const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
      socket.emit('loginResult', { success: false, message: 'Name is required' });
      return;
    }

    socket.playerName = name.slice(0, 32);
    socket.emit('loginResult', { success: true, name: socket.playerName });
    sendLobbySnapshot(socket);
  });

  socket.on('requestLobbySnapshot', function () {
    if (!validatePlayerReady(socket)) {
      return;
    }
    sendLobbySnapshot(socket);
  });

  socket.on('createTable', function (payload) {
    if (!validatePlayerReady(socket)) {
      return;
    }

    const tableName = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!tableName) {
      socket.emit('serverMessage', { type: 'error', message: 'Table name is required' });
      return;
    }

    const exists = Object.keys(tables).some(function (tableId) {
      return tables[tableId].name.toLowerCase() === tableName.toLowerCase();
    });

    if (exists) {
      socket.emit('serverMessage', { type: 'error', message: 'A table with that name already exists' });
      return;
    }

    leaveCurrentTable(socket, 'switch_table');

    const id = createTableId();
    const table = {
      id: id,
      name: tableName,
      hostId: socket.id,
      hostName: socket.playerName,
      status: 'waiting',
      players: [{ id: socket.id, name: socket.playerName, hand: [] }],
      game: null,
      scores: {},
      dealerIndex: -1
    };

    table.scores[socket.playerName] = 0;
    tables[id] = table;
    socket.join(id);
    socket.tableId = id;

    emitTableState(table);
    emitLobbySnapshotAll();
    socket.emit('serverMessage', { type: 'info', message: 'Created table ' + tableName });
  });

  socket.on('joinTable', function (payload) {
    if (!validatePlayerReady(socket)) {
      return;
    }

    const tableId = payload && payload.tableId;
    if (!tableId || !tables[tableId]) {
      socket.emit('serverMessage', { type: 'error', message: 'Table not found' });
      return;
    }

    const table = tables[tableId];

    if (table.status === 'in_game') {
      socket.emit('serverMessage', { type: 'error', message: 'Cannot join a game already in progress' });
      return;
    }

    if (table.players.length >= MAX_TABLE_PLAYERS) {
      socket.emit('serverMessage', { type: 'error', message: 'Table is full' });
      return;
    }

    leaveCurrentTable(socket, 'switch_table');

    table.players.push({ id: socket.id, name: socket.playerName, hand: [] });
    if (typeof table.scores[socket.playerName] !== 'number') {
      table.scores[socket.playerName] = 0;
    }

    socket.join(table.id);
    socket.tableId = table.id;

    emitTableState(table);
    emitLobbySnapshotAll();
    io.to(table.id).emit('actionNotice', socket.playerName + ' joined the table');
  });

  socket.on('leaveTable', function () {
    if (!validatePlayerReady(socket)) {
      return;
    }

    leaveCurrentTable(socket, 'leave_table');
    sendLobbySnapshot(socket);
  });

  socket.on('startGame', function () {
    if (!validatePlayerReady(socket)) {
      return;
    }

    const table = findTableBySocket(socket);
    if (!table) {
      socket.emit('serverMessage', { type: 'error', message: 'Join a table first' });
      return;
    }

    if (table.hostId !== socket.id) {
      socket.emit('serverMessage', { type: 'error', message: 'Only the host can start the game' });
      return;
    }

    if (table.status === 'in_game') {
      socket.emit('serverMessage', { type: 'error', message: 'Game is already running' });
      return;
    }

    const result = startGameForTable(table);
    if (!result.success) {
      socket.emit('serverMessage', { type: 'error', message: result.message });
      return;
    }

    io.to(table.id).emit('actionNotice', 'Game started');
  });

  socket.on('requestDiscardCard', function () {
    const table = findTableBySocket(socket);
    if (!table || table.status !== 'in_game' || !table.game) {
      socket.emit('discardCardInfo', { success: false, message: 'No discard card yet' });
      return;
    }

    socket.emit('discardCardInfo', {
      success: true,
      message: describeCard(table.game.cardOnBoard, table.game.chosenColor)
    });
  });

  socket.on('drawCard', function () {
    const table = findTableBySocket(socket);
    if (!table || table.status !== 'in_game' || !table.game) {
      socket.emit('drawResult', { success: false, message: 'Unable to draw a card right now' });
      return;
    }

    const currentPlayer = table.players[table.game.turn];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('drawResult', { success: false, message: 'It is not your turn' });
      return;
    }

    if (table.game.hasDrawn) {
      socket.emit('drawResult', { success: false, message: 'You already drew this turn' });
      return;
    }

    if (hasPlayableCard(table, currentPlayer.hand)) {
      socket.emit('drawResult', {
        success: false,
        message: 'You already have a playable card. Play it instead of drawing.'
      });
      return;
    }

    ensureDeckNotEmpty(table);
    const card = parseInt(table.game.deck.shift(), 10);
    currentPlayer.hand.push(card);
    io.to(currentPlayer.id).emit('haveCard', currentPlayer.hand);

    if (canPlayCardOnBoard(table, card)) {
      table.game.hasDrawn = true;
      socket.emit('drawResult', {
        success: true,
        card: card,
        message: 'You drew ' + describeCard(card) + '. It is playable. You may play it now.'
      });
      emitTableState(table);
      emitTurnPlayer(table);
      return;
    }

    socket.emit('drawResult', {
      success: true,
      card: card,
      message: 'You drew ' + describeCard(card) + '. It is not playable. Turn passes.'
    });

    advanceTurn(table, 1);
    emitTableState(table);
    emitTurnPlayer(table);
  });

  socket.on('playCard', function (payload) {
    const table = findTableBySocket(socket);
    if (!table || table.status !== 'in_game' || !table.game) {
      socket.emit('playResult', { success: false, message: 'Unable to play a card right now' });
      return;
    }

    const currentPlayerIndex = table.game.turn;
    const currentPlayer = table.players[currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('playResult', { success: false, message: 'It is not your turn' });
      return;
    }

    const card = payload ? parseInt(payload.card, 10) : NaN;
    const chosenColor = payload && typeof payload.chosenColor === 'string' ? payload.chosenColor.toLowerCase() : null;

    if (Number.isNaN(card) || currentPlayer.hand.indexOf(card) === -1) {
      socket.emit('playResult', { success: false, message: 'That card is not in your hand' });
      return;
    }

    const isWild = cardColor(card) === 'black';
    if (isWild && ['red', 'yellow', 'green', 'blue'].indexOf(chosenColor) === -1) {
      socket.emit('playResult', { success: false, message: 'Choose a valid color for your Wild card' });
      return;
    }

    if (cardType(card) === 'Draw4') {
      const boardColor = getCurrentBoardColor(table);
      const hasColorMatch = currentPlayer.hand.some(function (handCard) {
        return handCard !== card && cardColor(handCard) !== 'black' && cardColor(handCard) === boardColor;
      });

      if (hasColorMatch) {
        socket.emit('playResult', {
          success: false,
          message: 'Wild Draw Four can only be played when you have no card matching the current color'
        });
        return;
      }
    }

    if (!canPlayCardOnBoard(table, card)) {
      socket.emit('playResult', {
        success: false,
        message: 'Cannot play ' + describeCard(card) + ' on ' + describeCard(table.game.cardOnBoard, table.game.chosenColor)
      });
      return;
    }

    table.game.cardOnBoard = card;
    table.game.chosenColor = isWild ? chosenColor : null;
    table.game.hasDrawn = false;

    const cardPos = currentPlayer.hand.indexOf(card);
    currentPlayer.hand.splice(cardPos, 1);

    emitDiscardCard(table);
    io.to(currentPlayer.id).emit('haveCard', currentPlayer.hand);

    socket.emit('playResult', {
      success: true,
      card: card,
      message: 'Played ' + describeCard(card, table.game.chosenColor)
    });

    if (currentPlayer.hand.length === 1) {
      io.to(table.id).emit('actionNotice', currentPlayer.name + ' says UNO');
    }

    if (currentPlayer.hand.length === 0) {
      endRound(table, currentPlayerIndex, 'all_cards_played');
      return;
    }

    let turnSteps = 1;
    if (cardType(card) === 'Skip') {
      turnSteps = 2;
    } else if (cardType(card) === 'Reverse') {
      table.game.reverse = (table.game.reverse + 1) % 2;
      if (table.players.length === 2) {
        turnSteps = 2;
      }
    } else if (cardType(card) === 'Draw2') {
      const targetIndex = getNextPlayerIndex(table, currentPlayerIndex, 1);
      drawCardsFromDeck(table, targetIndex, 2);
      io.to(table.players[targetIndex].id).emit('haveCard', table.players[targetIndex].hand);
      io.to(table.players[targetIndex].id).emit('actionNotice', 'You draw 2 cards and lose your turn');
      turnSteps = 2;
    } else if (cardType(card) === 'Draw4') {
      const targetIndex = getNextPlayerIndex(table, currentPlayerIndex, 1);
      drawCardsFromDeck(table, targetIndex, 4);
      io.to(table.players[targetIndex].id).emit('haveCard', table.players[targetIndex].hand);
      io.to(table.players[targetIndex].id).emit('actionNotice', 'You draw 4 cards and lose your turn');
      turnSteps = 2;
    }

    advanceTurn(table, turnSteps);
    emitTableState(table);
    emitTurnPlayer(table);
  });

  socket.on('disconnecting', function () {
    leaveCurrentTable(socket, 'disconnect');
  });

  socket.on('disconnect', function () {
    console.log('Player disconnected:', socket.id, socket.playerName || 'unknown');
  });
}
