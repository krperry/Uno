const socket = io({ autoConnect: true });

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cards = new Image();
const back = new Image();

const cdWidth = 240;
const cdHeight = 360;
const playerNameStorageKey = 'unoPlayerName';

const appState = {
  loggedIn: false,
  playerName: '',
  currentTable: null,
  hand: [],
  handIndex: 0,
  turn: false,
  discard: null,
  discardChosenColor: null,
  selectedLobbyIndex: 0,
  lobbyTables: [],
  gameStatus: 'waiting',
  isHost: false,
  helpOpen: false
};

const el = {
  authView: document.getElementById('auth-view'),
  lobbyView: document.getElementById('lobby-view'),
  tableView: document.getElementById('table-view'),
  gamePanel: document.getElementById('game-panel'),
  nameInput: document.getElementById('name-input'),
  loginBtn: document.getElementById('login-btn'),
  clearNameBtn: document.getElementById('clear-name-btn'),
  lobbySummary: document.getElementById('lobby-summary'),
  tableList: document.getElementById('table-list'),
  joinTableBtn: document.getElementById('join-table-btn'),
  refreshLobbyBtn: document.getElementById('refresh-lobby-btn'),
  newTableName: document.getElementById('new-table-name'),
  createTableBtn: document.getElementById('create-table-btn'),
  tableMeta: document.getElementById('table-meta'),
  tableHost: document.getElementById('table-host'),
  playerSummary: document.getElementById('player-summary'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveTableBtn: document.getElementById('leave-table-btn'),
  helpOverlay: document.getElementById('help-overlay'),
  closeHelpBtn: document.getElementById('close-help-btn')
};

function init() {
  cards.src = 'images/deck.svg';
  back.src = 'images/uno.svg';
  canvas.style.backgroundColor = '#10ac84';

  try {
    el.nameInput.value = window.localStorage.getItem(playerNameStorageKey) || '';
  } catch (error) {
    console.warn('Unable to read saved player name', error);
  }

  bindUi();
  render();
}

function bindUi() {
  el.loginBtn.addEventListener('click', login);
  el.clearNameBtn.addEventListener('click', clearSavedName);
  el.refreshLobbyBtn.addEventListener('click', function () {
    socket.emit('requestLobbySnapshot');
  });
  el.createTableBtn.addEventListener('click', createTable);
  el.joinTableBtn.addEventListener('click', joinSelectedTable);
  el.startGameBtn.addEventListener('click', startGame);
  el.leaveTableBtn.addEventListener('click', leaveTable);
  el.closeHelpBtn.addEventListener('click', closeHelpOverlay);

  el.nameInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      login();
    }
  });

  el.newTableName.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      createTable();
    }
  });

  el.tableList.addEventListener('keydown', handleLobbyListKeys);

  document.addEventListener('click', onMouseClick, false);
  document.addEventListener('touchstart', onMouseClick, false);
  canvas.addEventListener('keydown', handleGameKeys);
}

function login() {
  const name = (el.nameInput.value || '').trim();
  if (!name) {
    srSpeak('Enter a name before logging in', 'assertive');
    return;
  }

  socket.emit('login', { name: name });
}

function clearSavedName() {
  try {
    window.localStorage.removeItem(playerNameStorageKey);
  } catch (error) {
    console.warn('Unable to clear saved player name', error);
  }
  el.nameInput.value = '';
  el.nameInput.focus();
  srSpeak('Saved name cleared', 'polite');
}

function createTable() {
  const tableName = (el.newTableName.value || '').trim();
  if (!tableName) {
    srSpeak('Enter a table name first', 'assertive');
    return;
  }

  socket.emit('createTable', { name: tableName });
}

function joinSelectedTable() {
  const selected = appState.lobbyTables[appState.selectedLobbyIndex];
  if (!selected) {
    srSpeak('No table selected', 'assertive');
    return;
  }

  socket.emit('joinTable', { tableId: selected.id });
}

function leaveTable() {
  socket.emit('leaveTable');
}

function startGame() {
  socket.emit('startGame');
}

function handleLobbyListKeys(event) {
  if (appState.currentTable) {
    return;
  }

  if (!appState.lobbyTables.length) {
    return;
  }

  if (event.key === 'ArrowDown') {
    appState.selectedLobbyIndex = Math.min(appState.selectedLobbyIndex + 1, appState.lobbyTables.length - 1);
    renderLobbyTables();
    event.preventDefault();
  } else if (event.key === 'ArrowUp') {
    appState.selectedLobbyIndex = Math.max(appState.selectedLobbyIndex - 1, 0);
    renderLobbyTables();
    event.preventDefault();
  } else if (event.key === 'Enter') {
    joinSelectedTable();
    event.preventDefault();
  }
}

function onMouseClick(event) {
  if (!appState.currentTable || appState.gameStatus !== 'in_game') {
    return;
  }

  if (appState.helpOpen) {
    return;
  }

  if (event.target !== canvas) {
    return;
  }

  canvas.focus();

  const pointer = event.changedTouches && event.changedTouches.length
    ? event.changedTouches[0]
    : event;
  const rect = canvas.getBoundingClientRect();
  const x = pointer.clientX - rect.left;
  const y = pointer.clientY - rect.top;

  const hand = appState.hand;
  const spacing = canvas.width / (2 + Math.max(0, hand.length - 1));
  const lastCard = (hand.length / 112) * (cdWidth / 3) + spacing * hand.length - (cdWidth / 4) + (cdWidth / 2);
  const firstCard = 2 + (hand.length / 112) * (cdWidth / 3) + spacing - (cdWidth / 4);

  if (y >= 400 && y <= 580 && x >= firstCard && x <= lastCard) {
    for (let i = 0, pos = firstCard; i < hand.length; i++, pos += spacing) {
      if (x >= pos && x <= pos + spacing) {
        appState.handIndex = i;
        emitPlayCard(hand[i]);
        return;
      }
    }
  } else if (
    x >= canvas.width - cdWidth / 2 - 60 &&
    x <= canvas.width - 60 &&
    y >= canvas.height / 2 - cdHeight / 4 &&
    y <= canvas.height / 2 + cdHeight / 4
  ) {
    emitDrawCard();
  }
}

function handleGameKeys(event) {
  if (!appState.currentTable || appState.gameStatus !== 'in_game') {
    if (event.key === '?') {
      openHelpOverlay();
      event.preventDefault();
    }
    return;
  }

  const key = (event.key || '').toLowerCase();
  let handled = false;
  let message = '';

  if (key === '?') {
    openHelpOverlay();
    handled = true;
  } else if (key === 'escape' && appState.helpOpen) {
    closeHelpOverlay();
    handled = true;
  } else if (appState.helpOpen) {
    handled = true;
  } else if (key === 'arrowleft') {
    if (appState.hand.length) {
      appState.handIndex = Math.max(0, appState.handIndex - 1);
      message = getSelectedCardDescription() + ' selected';
    } else {
      message = 'No cards in hand';
    }
    handled = true;
  } else if (key === 'arrowright') {
    if (appState.hand.length) {
      appState.handIndex = Math.min(appState.hand.length - 1, appState.handIndex + 1);
      message = getSelectedCardDescription() + ' selected';
    } else {
      message = 'No cards in hand';
    }
    handled = true;
  } else if (key === 'enter' || key === ' ') {
    if (appState.hand.length) {
      emitPlayCard(appState.hand[appState.handIndex]);
    } else {
      message = 'No cards in hand';
    }
    handled = true;
  } else if (key === 'd') {
    emitDrawCard();
    handled = true;
  } else if (key === 'p') {
    socket.emit('requestDiscardCard');
    handled = true;
  } else if (key === 'c') {
    message = getSelectedCardDescription();
    handled = true;
  } else if (key === 'h') {
    message = appState.hand.length
      ? appState.hand.map(function (card) { return cardType(card) + ' ' + cardColor(card); }).join(', ')
      : 'No cards in hand';
    handled = true;
  }

  if (handled) {
    event.preventDefault();
    if (message) {
      srSpeak(message, 'assertive');
    }
  }
}

function emitDrawCard() {
  if (appState.gameStatus !== 'in_game') {
    srSpeak('Game has not started yet', 'assertive');
    return;
  }

  if (!appState.turn) {
    srSpeak('It is not your turn', 'assertive');
    return;
  }

  socket.emit('drawCard');
}

function emitPlayCard(card) {
  if (appState.gameStatus !== 'in_game') {
    srSpeak('Game has not started yet', 'assertive');
    return;
  }

  if (!appState.turn) {
    srSpeak('It is not your turn', 'assertive');
    return;
  }

  if (!appState.hand.length) {
    srSpeak('No card selected', 'assertive');
    return;
  }

  let chosenColor = null;
  if (cardColor(card) === 'black') {
    chosenColor = promptForWildColor();
    if (!chosenColor) {
      srSpeak('Wild color selection canceled', 'assertive');
      return;
    }
  }

  socket.emit('playCard', {
    card: card,
    chosenColor: chosenColor
  });

  srSpeak('Attempting to play ' + describeCardForSpeech(card, chosenColor), 'polite');
}

function openHelpOverlay() {
  appState.helpOpen = true;
  el.helpOverlay.classList.remove('hidden');
  el.closeHelpBtn.focus();
}

function closeHelpOverlay() {
  appState.helpOpen = false;
  el.helpOverlay.classList.add('hidden');
  if (appState.currentTable && appState.gameStatus === 'in_game') {
    canvas.focus();
  } else {
    el.tableList.focus();
  }
}

function render() {
  el.authView.classList.toggle('hidden', appState.loggedIn);
  el.lobbyView.classList.toggle('hidden', !appState.loggedIn || !!appState.currentTable);
  el.tableView.classList.toggle('hidden', !appState.currentTable);

  if (appState.currentTable) {
    el.gamePanel.classList.toggle('hidden', appState.gameStatus !== 'in_game');
    el.tableMeta.textContent = appState.currentTable.name + ' - ' + (appState.gameStatus === 'in_game' ? 'In game' : 'Waiting for players');
    el.tableHost.textContent = 'Host: ' + appState.currentTable.hostName;
    el.startGameBtn.disabled = !appState.isHost || appState.currentTable.players.length < 2 || appState.gameStatus === 'in_game';

    if (appState.gameStatus === 'in_game') {
      canvas.focus();
    }
  }

  renderLobbyTables();
  renderPlayerSummary();
}

function renderLobbyTables() {
  const tables = appState.lobbyTables;
  el.tableList.innerHTML = '';

  if (!tables.length) {
    el.lobbySummary.textContent = 'No tables yet. Create one to get started.';
    return;
  }

  el.lobbySummary.textContent = 'Use arrow keys and Enter to join, or click with the mouse.';

  tables.forEach(function (table, index) {
    const li = document.createElement('li');
    li.className = 'table-item' + (index === appState.selectedLobbyIndex ? ' selected' : '');
    li.tabIndex = -1;
    li.textContent = table.name + ' | ' + table.status + ' | ' + table.playerCount + '/' + table.maxPlayers + ' | Host: ' + table.hostName;
    li.addEventListener('click', function () {
      appState.selectedLobbyIndex = index;
      renderLobbyTables();
      socket.emit('joinTable', { tableId: table.id });
    });
    el.tableList.appendChild(li);
  });
}

function renderPlayerSummary() {
  el.playerSummary.innerHTML = '';

  if (!appState.currentTable) {
    return;
  }

  appState.currentTable.players.forEach(function (player) {
    const li = document.createElement('li');
    const countText = appState.gameStatus === 'in_game' ? ' - cards: ' + player.cardCount : '';
    const hostText = player.id === appState.currentTable.hostId ? ' (host)' : '';
    li.textContent = player.name + hostText + countText;
    el.playerSummary.appendChild(li);
  });
}

function announcePlayerSummary(table) {
  if (!table || !Array.isArray(table.players) || !table.players.length) {
    return;
  }

  const summary = table.players.map(function (player) {
    const countText = table.status === 'in_game' ? player.cardCount + ' cards' : 'waiting';
    return player.name + ', ' + countText;
  }).join('. ');

  srSpeak('Players: ' + summary, 'polite');
}

function drawHand() {
  ctx.clearRect(0, 400, canvas.width, canvas.height);

  const hand = appState.hand;
  for (let i = 0; i < hand.length; i++) {
    ctx.drawImage(
      cards,
      1 + cdWidth * (hand[i] % 14),
      1 + cdHeight * Math.floor(hand[i] / 14),
      cdWidth,
      cdHeight,
      (hand.length / 112) * (cdWidth / 3) + (canvas.width / (2 + (hand.length - 1))) * (i + 1) - (cdWidth / 4),
      400,
      cdWidth / 2,
      cdHeight / 2
    );
  }
}

function drawDiscard(cardNum) {
  if (typeof cardNum !== 'number') {
    return;
  }

  ctx.drawImage(
    cards,
    1 + cdWidth * (cardNum % 14),
    1 + cdHeight * Math.floor(cardNum / 14),
    cdWidth,
    cdHeight,
    canvas.width / 2 - cdWidth / 4,
    canvas.height / 2 - cdHeight / 4,
    cdWidth / 2,
    cdHeight / 2
  );
}

function drawDeckBack() {
  ctx.drawImage(back, canvas.width - cdWidth / 2 - 60, canvas.height / 2 - cdHeight / 4, cdWidth / 2, cdHeight / 2);
}

function drawTurnArrow() {
  const x = 100;
  const y = 350;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x - 5, y - 10, 10, 20);
  ctx.beginPath();
  ctx.moveTo(x - 15, y + 10);
  ctx.lineTo(x + 15, y + 10);
  ctx.lineTo(x, y + 30);
  ctx.fill();
}

function getSelectedCardDescription() {
  if (!appState.hand.length) {
    return 'No card selected';
  }

  const safeIndex = Math.max(0, Math.min(appState.hand.length - 1, appState.handIndex));
  appState.handIndex = safeIndex;
  return cardType(appState.hand[safeIndex]) + ' ' + cardColor(appState.hand[safeIndex]);
}

function describeCardForSpeech(card, forcedColor) {
  const color = cardColor(card) === 'black' && forcedColor ? forcedColor : cardColor(card);
  return cardType(card) + ' ' + color;
}

function promptForWildColor() {
  const validColors = ['red', 'yellow', 'green', 'blue'];
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = prompt('Choose a color: red, yellow, green, or blue', 'red');
    if (answer === null) {
      continue;
    }

    const normalized = answer.trim().toLowerCase();
    if (validColors.indexOf(normalized) !== -1) {
      return normalized;
    }
    if (normalized === 'r') {
      return 'red';
    }
    if (normalized === 'y') {
      return 'yellow';
    }
    if (normalized === 'g') {
      return 'green';
    }
    if (normalized === 'b') {
      return 'blue';
    }
  }

  return null;
}

function srSpeak(text, priority) {
  const regionId = priority === 'assertive' ? 'sr-alert' : 'sr-status';
  const region = document.getElementById(regionId);
  if (!region) {
    return;
  }

  region.textContent = '';
  window.setTimeout(function () {
    region.textContent = text;
  }, 40);
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

socket.on('connect', function () {
  srSpeak('Connected to server', 'polite');
});

socket.on('disconnect', function () {
  srSpeak('Disconnected from server', 'assertive');
});

socket.on('serverMessage', function (payload) {
  if (!payload || !payload.message) {
    return;
  }

  srSpeak(payload.message, payload.type === 'error' ? 'assertive' : 'polite');
});

socket.on('loginResult', function (payload) {
  if (!payload || !payload.success) {
    srSpeak(payload && payload.message ? payload.message : 'Login failed', 'assertive');
    return;
  }

  appState.loggedIn = true;
  appState.playerName = payload.name;

  try {
    window.localStorage.setItem(playerNameStorageKey, payload.name);
  } catch (error) {
    console.warn('Unable to save player name', error);
  }

  socket.emit('requestLobbySnapshot');
  srSpeak('Logged in as ' + payload.name, 'assertive');
  render();
});

socket.on('lobbySnapshot', function (payload) {
  const tables = payload && Array.isArray(payload.tables) ? payload.tables : [];
  appState.lobbyTables = tables;
  appState.selectedLobbyIndex = Math.min(appState.selectedLobbyIndex, Math.max(0, tables.length - 1));
  renderLobbyTables();
});

socket.on('tableState', function (payload) {
  if (!payload || !payload.table) {
    appState.currentTable = null;
    appState.gameStatus = 'waiting';
    appState.turn = false;
    render();
    return;
  }

  appState.currentTable = payload.table;
  appState.gameStatus = payload.table.status;
  appState.isHost = !!payload.youAreHost;
  announcePlayerSummary(payload.table);

  if (payload.table.status !== 'in_game') {
    appState.turn = false;
    appState.hand = [];
    appState.handIndex = 0;
    appState.discard = null;
    appState.discardChosenColor = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  render();
});

socket.on('haveCard', function (cardsInHand) {
  appState.hand = Array.isArray(cardsInHand) ? cardsInHand : [];
  appState.handIndex = Math.max(0, Math.min(appState.handIndex, Math.max(0, appState.hand.length - 1)));
  drawHand();

  if (appState.hand.length) {
    srSpeak(getSelectedCardDescription() + ' selected', 'polite');
  }
});

socket.on('sendCard', function (payload) {
  const card = typeof payload === 'object' && payload ? payload.card : payload;
  const chosenColor = typeof payload === 'object' && payload ? payload.chosenColor || null : null;

  appState.discard = card;
  appState.discardChosenColor = chosenColor;

  drawDiscard(card);
  drawDeckBack();
  srSpeak('Discard is ' + describeCardForSpeech(card, chosenColor), 'assertive');
});

socket.on('turnPlayer', function (payload) {
  if (!payload) {
    return;
  }

  appState.turn = payload.id === socket.id;

  if (appState.turn) {
    drawTurnArrow();
    let msg = 'Your turn';
    if (payload.topDiscard) {
      msg += '. Top discard: ' + payload.topDiscard;
    }
    if (payload.mustDraw) {
      msg += '. You have no playable card. Press D to draw.';
    }
    srSpeak(msg, 'assertive');
  } else {
    srSpeak((payload.name || 'Another player') + ' is taking a turn', 'polite');
  }
});

socket.on('discardCardInfo', function (payload) {
  if (!payload) {
    srSpeak('No discard card available', 'assertive');
    return;
  }

  srSpeak(payload.message || 'No discard card available', payload.success ? 'polite' : 'assertive');
});

socket.on('playResult', function (payload) {
  if (!payload) {
    return;
  }

  srSpeak(payload.message || 'Play action updated', payload.success ? 'polite' : 'assertive');
});

socket.on('drawResult', function (payload) {
  if (!payload) {
    return;
  }

  srSpeak(payload.message || 'Draw action updated', payload.success ? 'polite' : 'assertive');
});

socket.on('actionNotice', function (message) {
  if (!message) {
    return;
  }
  srSpeak(message, 'assertive');
});

socket.on('roundSummary', function (summary) {
  if (!summary) {
    return;
  }

  const scoreText = (summary.scores || []).map(function (entry) {
    return entry.name + ' ' + entry.score;
  }).join(', ');

  const msg = summary.winner + ' wins the game for ' + summary.roundPoints + ' points.' + (scoreText ? ' Scores: ' + scoreText : '');
  srSpeak(msg, 'assertive');
});

init();
