const socket = io({ autoConnect: true });

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cards = new Image();
const back = new Image();

const cdWidth = 240;
const cdHeight = 360;
const playerEmailStorageKey = 'unoPlayerEmail';
const displayNameStorageKey = 'unoDisplayName';
const rememberTokenStorageKey = 'unoRememberToken';

const GAME_CATALOG = {
  uno: { type: 'uno', name: 'UNO', playable: true, description: 'Join a live UNO table.' },
  hearts: { type: 'hearts', name: 'Hearts', playable: false, description: 'Hearts is not implemented yet.' },
  spades: { type: 'spades', name: 'Spades', playable: false, description: 'Spades is not implemented yet.' },
  cribbage: { type: 'cribbage', name: 'Cribbage', playable: false, description: 'Cribbage is not implemented yet.' }
};

const appState = {
  loggedIn: false,
  accountEmail: '',
  playerName: '',
  currentScreen: 'auth',
  selectedGameType: null,
  selectedGameName: '',
  resumeLoginPending: false,
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
  helpOpen: false,
  pendingDrawCard: null,
  handBeforeDraw: null,
  tableStatusMessage: 'Join a table to start playing.',
  tableStatusTone: 'info',
  currentTurnPlayerId: null,
  currentTurnPlayerName: '',
  currentTurnTopDiscard: '',
  currentTurnMustDraw: false,
  currentRoundNumber: 1,
  currentStartingPlayerName: '',
  currentTurnAnnouncement: '',
  announcementTimer: null,
  announcementOpen: false,
  speechLockUntil: 0
};

let speechRenderTimer = null;

const el = {
  authView: document.getElementById('auth-view'),
  gamePickerView: document.getElementById('game-picker-view'),
  placeholderView: document.getElementById('placeholder-view'),
  accountBar: document.getElementById('account-bar'),
  accountLabel: document.getElementById('account-label'),
  lobbyView: document.getElementById('lobby-view'),
  tableView: document.getElementById('table-view'),
  gamePanel: document.getElementById('game-panel'),
  emailInput: document.getElementById('email-input'),
  passwordInput: document.getElementById('password-input'),
  displayNameInput: document.getElementById('display-name-input'),
  rememberMeInput: document.getElementById('remember-me-input'),
  loginBtn: document.getElementById('login-btn'),
  createAccountBtn: document.getElementById('create-account-btn'),
  deleteAccountBtn: document.getElementById('delete-account-btn'),
  clearSavedBtn: document.getElementById('clear-saved-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  deleteAccountAuthBtn: document.getElementById('delete-account-auth-btn'),
  lobbySummary: document.getElementById('lobby-summary'),
  tableList: document.getElementById('table-list'),
  joinTableBtn: document.getElementById('join-table-btn'),
  refreshLobbyBtn: document.getElementById('refresh-lobby-btn'),
  newTableName: document.getElementById('new-table-name'),
  createTableBtn: document.getElementById('create-table-btn'),
  tableMeta: document.getElementById('table-meta'),
  tableHost: document.getElementById('table-host'),
  tableStatus: document.getElementById('table-status'),
  playerSummary: document.getElementById('player-summary'),
  startGameBtn: document.getElementById('start-game-btn'),
  leaveTableBtn: document.getElementById('leave-table-btn'),
  gamePickerSummary: document.getElementById('game-picker-summary'),
  placeholderTitle: document.getElementById('placeholder-title'),
  placeholderMessage: document.getElementById('placeholder-message'),
  placeholderBackBtn: document.getElementById('placeholder-back-btn'),
  placeholderUnoBtn: document.getElementById('placeholder-uno-btn'),
  selectUnoBtn: document.getElementById('select-uno-btn'),
  selectHeartsBtn: document.getElementById('select-hearts-btn'),
  selectSpadesBtn: document.getElementById('select-spades-btn'),
  selectCribbageBtn: document.getElementById('select-cribbage-btn'),
  helpOverlay: document.getElementById('help-overlay'),
  closeHelpBtn: document.getElementById('close-help-btn'),
  announcementOverlay: document.getElementById('announcement-overlay'),
  announcementEyebrow: document.getElementById('announcement-eyebrow'),
  announcementTitle: document.getElementById('announcement-title'),
  announcementMessage: document.getElementById('announcement-message'),
  closeAnnouncementBtn: document.getElementById('close-announcement-btn')
};

function setTableStatus(message, tone) {
  appState.tableStatusMessage = message || '';
  appState.tableStatusTone = tone || 'info';

  if (!el.tableStatus) {
    return;
  }

  el.tableStatus.textContent = appState.tableStatusMessage;
  el.tableStatus.className = 'table-status ' + appState.tableStatusTone;
}

function getGameDefinition(gameType) {
  return GAME_CATALOG[gameType] || null;
}

function setScreen(screen) {
  appState.currentScreen = screen;
  render();
}

function updateCurrentTurnAnnouncement(payload) {
  const roundLabel = payload && payload.turnNumber ? 'Round ' + payload.turnNumber + '. ' : '';
  const starterLabel = payload && payload.startingPlayer ? 'Starting player: ' + payload.startingPlayer + '. ' : '';
  const turnLabel = payload && payload.name ? (payload.id === socket.id ? 'Your turn' : payload.name + '\'s turn') : 'No active turn';
  const discardLabel = payload && payload.topDiscard ? '. Top discard: ' + payload.topDiscard : '';
  const drawLabel = payload && payload.mustDraw ? '. You have no playable card. Press D to draw.' : '';

  appState.currentTurnAnnouncement = roundLabel + starterLabel + turnLabel + discardLabel + drawLabel;
  appState.currentTurnPlayerName = payload && payload.name ? payload.name : '';
  appState.currentTurnTopDiscard = payload && payload.topDiscard ? payload.topDiscard : '';
  appState.currentTurnMustDraw = !!(payload && payload.mustDraw);
  appState.currentRoundNumber = payload && payload.turnNumber ? payload.turnNumber : appState.currentRoundNumber;
  appState.currentStartingPlayerName = payload && payload.startingPlayer ? payload.startingPlayer : appState.currentStartingPlayerName;
}

function speakCurrentTurn() {
  if (appState.currentTurnAnnouncement) {
    srSpeak(appState.currentTurnAnnouncement, 'assertive', { canInterruptLock: true });
  } else {
    srSpeak('No active turn announcement', 'assertive', { canInterruptLock: true });
  }
}

function clearRememberedLogin() {
  try {
    window.localStorage.removeItem(rememberTokenStorageKey);
  } catch (error) {
    console.warn('Unable to clear remembered login', error);
  }
}

function storeRememberedLogin(token) {
  try {
    if (token) {
      window.localStorage.setItem(rememberTokenStorageKey, token);
    } else {
      window.localStorage.removeItem(rememberTokenStorageKey);
    }
  } catch (error) {
    console.warn('Unable to store remembered login', error);
  }
}

function attemptResumeLogin() {
  if (appState.loggedIn || appState.resumeLoginPending) {
    return;
  }

  let token = '';
  try {
    token = window.localStorage.getItem(rememberTokenStorageKey) || '';
  } catch (error) {
    console.warn('Unable to read remembered login', error);
    return;
  }

  if (!token) {
    return;
  }

  appState.resumeLoginPending = true;
  socket.emit('resumeLogin', { token: token });
}

function resetLoggedInState() {
  appState.loggedIn = false;
  appState.accountEmail = '';
  appState.playerName = '';
  appState.currentTable = null;
  appState.turn = false;
  appState.hand = [];
  appState.handIndex = 0;
  appState.handBeforeDraw = null;
  appState.discard = null;
  appState.discardChosenColor = null;
  appState.pendingDrawCard = null;
  appState.gameStatus = 'waiting';
  appState.isHost = false;
  appState.currentTurnPlayerId = null;
}

function showGamePicker() {
  appState.selectedGameType = null;
  appState.selectedGameName = '';
  appState.currentTable = null;
  setScreen('game-picker');
  window.setTimeout(function () {
    if (el.selectUnoBtn) {
      el.selectUnoBtn.focus();
    }
  }, 0);
}

function openGamePlaceholder(gameType) {
  const gameDefinition = getGameDefinition(gameType);
  if (!gameDefinition) {
    return;
  }

  appState.selectedGameType = gameDefinition.type;
  appState.selectedGameName = gameDefinition.name;
  appState.currentTable = null;
  setScreen('placeholder');
  if (el.placeholderTitle) {
    el.placeholderTitle.textContent = gameDefinition.name;
  }
  if (el.placeholderMessage) {
    el.placeholderMessage.textContent = gameDefinition.description + ' UNO is the only playable game right now.';
  }
  window.setTimeout(function () {
    if (el.placeholderBackBtn) {
      el.placeholderBackBtn.focus();
    }
  }, 0);
}

function selectGame(gameType) {
  const gameDefinition = getGameDefinition(gameType);
  if (!gameDefinition) {
    srSpeak('That game is not available', 'assertive');
    return;
  }

  if (!gameDefinition.playable) {
    openGamePlaceholder(gameDefinition.type);
    srSpeak(gameDefinition.name + ' is not implemented yet', 'assertive');
    return;
  }

  appState.selectedGameType = gameDefinition.type;
  appState.selectedGameName = gameDefinition.name;
  appState.currentTable = null;
  setScreen('lobby');
  socket.emit('requestLobbySnapshot');
  srSpeak('Selected ' + gameDefinition.name, 'polite');
}

function init() {
  cards.src = 'images/deck.svg';
  back.src = 'images/uno.svg';
  canvas.style.backgroundColor = '#10ac84';

  try {
    el.emailInput.value = window.localStorage.getItem(playerEmailStorageKey) || '';
    el.displayNameInput.value = window.localStorage.getItem(displayNameStorageKey) || '';
  } catch (error) {
    console.warn('Unable to read saved auth fields', error);
  }

  bindUi();
  if (socket.connected) {
    attemptResumeLogin();
  }
  render();
}

function bindUi() {
  el.loginBtn.addEventListener('click', login);
  el.createAccountBtn.addEventListener('click', createAccount);
  el.deleteAccountBtn.addEventListener('click', deleteAccountFromAuthForm);
  el.clearSavedBtn.addEventListener('click', clearSavedEmail);
  el.logoutBtn.addEventListener('click', logout);
  el.deleteAccountAuthBtn.addEventListener('click', deleteLoggedInAccount);
  el.refreshLobbyBtn.addEventListener('click', function () {
    socket.emit('requestLobbySnapshot');
  });
  el.createTableBtn.addEventListener('click', createTable);
  el.joinTableBtn.addEventListener('click', joinSelectedTable);
  el.startGameBtn.addEventListener('click', startGame);
  el.leaveTableBtn.addEventListener('click', leaveTable);
  el.placeholderBackBtn.addEventListener('click', function () {
    showGamePicker();
  });
  el.placeholderUnoBtn.addEventListener('click', function () {
    selectGame('uno');
  });
  el.selectUnoBtn.addEventListener('click', function () {
    selectGame('uno');
  });
  el.selectHeartsBtn.addEventListener('click', function () {
    selectGame('hearts');
  });
  el.selectSpadesBtn.addEventListener('click', function () {
    selectGame('spades');
  });
  el.selectCribbageBtn.addEventListener('click', function () {
    selectGame('cribbage');
  });
  el.closeHelpBtn.addEventListener('click', closeHelpOverlay);
  el.closeAnnouncementBtn.addEventListener('click', closeAnnouncementOverlay);

  el.emailInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      login();
    }
  });

  el.passwordInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      login();
    }
  });

  el.displayNameInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      createAccount();
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
  const email = (el.emailInput.value || '').trim();
  const password = el.passwordInput.value || '';

  if (!email || !password) {
    srSpeak('Enter email and password before logging in', 'assertive');
    return;
  }

  socket.emit('login', {
    email: email,
    password: password,
    rememberMe: !!(el.rememberMeInput && el.rememberMeInput.checked)
  });
}

function createAccount() {
  const email = (el.emailInput.value || '').trim();
  const password = el.passwordInput.value || '';
  const displayName = (el.displayNameInput.value || '').trim();

  if (!email || !password || !displayName) {
    srSpeak('Email, password, and display name are required to create an account', 'assertive');
    return;
  }

  socket.emit('registerAccount', {
    email: email,
    password: password,
    displayName: displayName,
    rememberMe: !!(el.rememberMeInput && el.rememberMeInput.checked)
  });
}

function clearSavedEmail() {
  try {
    window.localStorage.removeItem(playerEmailStorageKey);
  } catch (error) {
    console.warn('Unable to clear saved email', error);
  }
  el.emailInput.value = '';
  el.emailInput.focus();
  srSpeak('Saved email cleared', 'polite');
}

function logout() {
  socket.emit('logout');
}

function deleteAccountFromAuthForm() {
  const email = (el.emailInput.value || '').trim();
  const password = el.passwordInput.value || '';

  if (!email || !password) {
    srSpeak('Enter email and password to delete the account', 'assertive');
    return;
  }

  if (!window.confirm('Delete this account permanently? This frees the display name.')) {
    return;
  }

  socket.emit('deleteAccount', {
    email: email,
    password: password
  });
}

function deleteLoggedInAccount() {
  if (!window.confirm('Delete your account permanently? This frees your display name.')) {
    return;
  }

  const password = window.prompt('Enter your password to confirm account deletion', '');
  if (password === null) {
    return;
  }

  socket.emit('deleteAccount', { password: password });
}

function createTable() {
  const tableName = (el.newTableName.value || '').trim();
  if (!tableName) {
    srSpeak('Enter a table name first', 'assertive');
    return;
  }

  const selectedGameType = appState.selectedGameType || 'uno';
  const selectedGame = getGameDefinition(selectedGameType);
  if (!selectedGame || !selectedGame.playable) {
    srSpeak('Select UNO to create a playable table', 'assertive');
    return;
  }

  socket.emit('createTable', { name: tableName, gameType: selectedGame.type });
}

function joinSelectedTable() {
  const tables = appState.lobbyTables.filter(function (table) {
    return !appState.selectedGameType || table.gameType === appState.selectedGameType;
  });
  const selected = tables[appState.selectedLobbyIndex];
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

  const tables = appState.lobbyTables.filter(function (table) {
    return !appState.selectedGameType || table.gameType === appState.selectedGameType;
  });

  if (!tables.length) {
    return;
  }

  if (event.key === 'ArrowDown') {
    appState.selectedLobbyIndex = Math.min(appState.selectedLobbyIndex + 1, tables.length - 1);
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
  } else if (key === 'escape' && appState.announcementOpen) {
    closeAnnouncementOverlay();
    handled = true;
  } else if (key === 'escape' && appState.helpOpen) {
    closeHelpOverlay();
    handled = true;
  } else if (appState.helpOpen) {
    handled = true;
  } else if (key === 'arrowleft') {
    if (appState.hand.length) {
      appState.handIndex = Math.max(0, appState.handIndex - 1);
      drawHand();
      message = getSelectedCardDescription() + ' selected';
    } else {
      message = 'No cards in hand';
    }
    handled = true;
  } else if (key === 'arrowright') {
    if (appState.hand.length) {
      appState.handIndex = Math.min(appState.hand.length - 1, appState.handIndex + 1);
      drawHand();
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
  } else if (key === 't') {
    speakCurrentTurn();
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
      srSpeak(message, 'assertive', { canInterruptLock: true });
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

  appState.handBeforeDraw = appState.hand.slice();
  socket.emit('drawCard');
}

function focusDrawnCard(card) {
  if (typeof card !== 'number' || !appState.hand.length) {
    return false;
  }

  const previousHand = Array.isArray(appState.handBeforeDraw) ? appState.handBeforeDraw : [];
  const oldCount = previousHand.filter(function (handCard) {
    return handCard === card;
  }).length;

  let seen = 0;
  for (let i = 0; i < appState.hand.length; i++) {
    if (appState.hand[i] !== card) {
      continue;
    }

    if (seen === oldCount) {
      appState.handIndex = i;
      return true;
    }

    seen += 1;
  }

  const fallbackIndex = appState.hand.indexOf(card);
  if (fallbackIndex !== -1) {
    appState.handIndex = fallbackIndex;
    return true;
  }

  return false;
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

function showAnnouncementOverlay(options) {
  const title = options && options.title ? options.title : 'Announcement';
  const message = options && options.message ? options.message : '';
  const eyebrow = options && options.eyebrow ? options.eyebrow : '';
  const tone = options && options.tone ? options.tone : 'info';
  const sticky = !!(options && options.sticky);
  const duration = options && typeof options.duration === 'number' ? options.duration : 3200;

  if (!el.announcementOverlay) {
    return;
  }

  if (appState.announcementTimer) {
    window.clearTimeout(appState.announcementTimer);
    appState.announcementTimer = null;
  }

  appState.announcementOpen = true;
  el.announcementEyebrow.textContent = eyebrow;
  el.announcementTitle.textContent = title;
  el.announcementMessage.textContent = message;
  el.announcementOverlay.classList.remove('hidden');
  el.announcementTitle.parentElement.className = 'overlay-card announcement-card ' + tone;

  if (sticky) {
    el.closeAnnouncementBtn.focus();
    return;
  }

  appState.announcementTimer = window.setTimeout(function () {
    closeAnnouncementOverlay(false);
  }, duration);
}

function closeAnnouncementOverlay(restoreFocus) {
  if (!el.announcementOverlay) {
    return;
  }

  if (appState.announcementTimer) {
    window.clearTimeout(appState.announcementTimer);
    appState.announcementTimer = null;
  }

  appState.announcementOpen = false;
  el.announcementOverlay.classList.add('hidden');

  if (restoreFocus === false) {
    return;
  }

  if (appState.currentTable && appState.gameStatus === 'in_game') {
    canvas.focus();
  }
}

function render() {
  el.authView.classList.toggle('hidden', appState.loggedIn);
  el.gamePickerView.classList.toggle('hidden', !appState.loggedIn || appState.currentScreen !== 'game-picker');
  el.placeholderView.classList.toggle('hidden', !appState.loggedIn || appState.currentScreen !== 'placeholder');
  el.accountBar.classList.toggle('hidden', !appState.loggedIn);
  el.lobbyView.classList.toggle('hidden', !appState.loggedIn || appState.currentScreen !== 'lobby' || !!appState.currentTable);
  el.tableView.classList.toggle('hidden', !appState.currentTable);

  if (appState.loggedIn) {
    el.accountLabel.textContent = 'Logged in as ' + appState.playerName + ' (' + appState.accountEmail + ')';
  }

  if (el.gamePickerSummary) {
    el.gamePickerSummary.textContent = appState.selectedGameType
      ? 'Selected game: ' + (getGameDefinition(appState.selectedGameType) || { name: 'UNO' }).name
      : 'Pick a card game to continue. UNO is available now; the others are accessible previews for later work.';
  }

  if (appState.currentTable) {
    el.gamePanel.classList.toggle('hidden', appState.gameStatus !== 'in_game');
    el.tableMeta.textContent = (appState.currentTable.gameName || 'UNO') + ': ' + appState.currentTable.name + ' - ' + (appState.gameStatus === 'in_game' ? 'In game' : 'Waiting for players');
    el.tableHost.textContent = 'Host: ' + appState.currentTable.hostName;
    el.startGameBtn.disabled = !appState.isHost || appState.currentTable.players.length < 2 || appState.gameStatus === 'in_game';
    setTableStatus(appState.tableStatusMessage, appState.tableStatusTone);

    if (appState.gameStatus === 'in_game') {
      canvas.focus();
    }
  } else {
    setTableStatus('Join a table to start playing.', 'info');
  }

  renderLobbyTables();
  renderPlayerSummary();
}

function renderLobbyTables() {
  const tables = appState.lobbyTables.filter(function (table) {
    return !appState.selectedGameType || table.gameType === appState.selectedGameType;
  });
  el.tableList.innerHTML = '';

  if (appState.selectedLobbyIndex >= tables.length) {
    appState.selectedLobbyIndex = Math.max(0, tables.length - 1);
  }

  if (!tables.length) {
    const selectedGame = getGameDefinition(appState.selectedGameType || 'uno') || GAME_CATALOG.uno;
    el.lobbySummary.textContent = 'No ' + selectedGame.name + ' tables yet. Create one to get started.';
    return;
  }

  const selectedGame = getGameDefinition(appState.selectedGameType || 'uno') || GAME_CATALOG.uno;
  el.lobbySummary.textContent = 'Use arrow keys and Enter to join a ' + selectedGame.name + ' table, or click with the mouse.';

  tables.forEach(function (table, index) {
    const li = document.createElement('li');
    li.className = 'table-item' + (index === appState.selectedLobbyIndex ? ' selected' : '');
    li.tabIndex = -1;
    li.textContent = (table.gameName || 'UNO') + ' | ' + table.name + ' | ' + table.status + ' | ' + table.playerCount + '/' + table.maxPlayers + ' | Host: ' + table.hostName;
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
    const label = document.createElement('span');
    const details = document.createElement('span');
    const isCurrentTurn = appState.gameStatus === 'in_game' && player.id === appState.currentTurnPlayerId;
    const hasUno = appState.gameStatus === 'in_game' && player.cardCount === 1;
    const tags = [];
    const roundPoints = typeof player.roundPoints === 'number' ? player.roundPoints : 0;
    const totalPoints = typeof player.score === 'number' ? player.score : 0;

    if (player.id === appState.currentTable.hostId) {
      tags.push('host');
    }
    if (player.id === socket.id) {
      tags.push('you');
    }
    if (isCurrentTurn) {
      tags.push('current turn');
      li.classList.add('current-turn');
    }
    if (hasUno) {
      tags.push('UNO');
      li.classList.add('uno');
    }

    const countText = appState.gameStatus === 'in_game'
      ? 'Cards: ' + player.cardCount + ' | Round: ' + roundPoints + ' | Total: ' + totalPoints
      : 'Score: ' + totalPoints;
    const tagText = tags.length ? ' (' + tags.join(', ') + ')' : '';

    label.className = 'player-label';
    label.textContent = player.name;
    details.className = 'player-tags';
    details.textContent = tagText + ' - ' + countText;

    li.appendChild(label);
    li.appendChild(details);
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
  const selectedIndex = hand.length ? Math.max(0, Math.min(hand.length - 1, appState.handIndex)) : -1;
  for (let i = 0; i < hand.length; i++) {
    const x = (hand.length / 112) * (cdWidth / 3) + (canvas.width / (2 + (hand.length - 1))) * (i + 1) - (cdWidth / 4);
    const y = 400;

    ctx.drawImage(
      cards,
      1 + cdWidth * (hand[i] % 14),
      1 + cdHeight * Math.floor(hand[i] / 14),
      cdWidth,
      cdHeight,
      x,
      y,
      cdWidth / 2,
      cdHeight / 2
    );

    if (i === selectedIndex) {
      ctx.save();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ffd166';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 8;
      ctx.strokeRect(x - 3, y - 3, cdWidth / 2 + 6, cdHeight / 2 + 6);
      ctx.restore();
    }
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

function srSpeak(text, priority, options) {
  if (!text) {
    return;
  }

  const statusRegion = document.getElementById('sr-status');
  const alertRegion = document.getElementById('sr-alert');
  const region = priority === 'assertive' ? alertRegion : statusRegion;
  const lockMs = options && typeof options.lockMs === 'number' ? options.lockMs : 0;
  const canInterruptLock = !!(options && options.canInterruptLock);

  if (!region) {
    return;
  }

  if (!canInterruptLock && Date.now() < appState.speechLockUntil) {
    return;
  }

  if (lockMs > 0) {
    appState.speechLockUntil = Date.now() + lockMs;
  } else if (canInterruptLock) {
    appState.speechLockUntil = 0;
  }

  if (speechRenderTimer) {
    window.clearTimeout(speechRenderTimer);
    speechRenderTimer = null;
  }

  if (statusRegion) {
    statusRegion.textContent = '';
  }
  if (alertRegion) {
    alertRegion.textContent = '';
  }

  speechRenderTimer = window.setTimeout(function () {
    region.textContent = text;
    speechRenderTimer = null;
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

function getColorSortRank(card) {
  switch (cardColor(card)) {
    case 'red':
      return 0;
    case 'yellow':
      return 1;
    case 'green':
      return 2;
    case 'blue':
      return 3;
    case 'black':
      return 4;
    default:
      return 5;
  }
}

function getCardKindRank(card) {
  if (cardColor(card) === 'black') {
    return 2;
  }

  return card % 14 <= 9 ? 0 : 1;
}

function getCardValueSortRank(card) {
  const value = card % 14;
  if (value <= 9) {
    return value;
  }

  if (value === 10) {
    return 0;
  }
  if (value === 11) {
    return 1;
  }
  if (value === 12) {
    return 2;
  }

  return Math.floor(card / 14) >= 4 ? 1 : 0;
}

function compareCardsForHandSort(a, b) {
  const colorDiff = getColorSortRank(a) - getColorSortRank(b);
  if (colorDiff !== 0) {
    return colorDiff;
  }

  const kindDiff = getCardKindRank(a) - getCardKindRank(b);
  if (kindDiff !== 0) {
    return kindDiff;
  }

  const valueDiff = getCardValueSortRank(a) - getCardValueSortRank(b);
  if (valueDiff !== 0) {
    return valueDiff;
  }

  return a - b;
}

socket.on('connect', function () {
  srSpeak('Connected to server', 'polite');
  attemptResumeLogin();
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
    if (appState.resumeLoginPending) {
      clearRememberedLogin();
      appState.resumeLoginPending = false;
    }
    srSpeak(payload && payload.message ? payload.message : 'Login failed', 'assertive');
    setScreen('auth');
    return;
  }

  const wasResumeLogin = appState.resumeLoginPending;
  appState.resumeLoginPending = false;

  appState.loggedIn = true;
  appState.accountEmail = payload.email || '';
  appState.playerName = payload.name;
  appState.selectedGameType = null;
  appState.selectedGameName = '';
  appState.currentTable = null;
  appState.selectedLobbyIndex = 0;
  appState.lobbyTables = [];
  showGamePicker();

  try {
    if (payload.email) {
      window.localStorage.setItem(playerEmailStorageKey, payload.email);
    }
    window.localStorage.setItem(displayNameStorageKey, payload.name);
  } catch (error) {
    console.warn('Unable to save auth fields', error);
  }

  if (payload.rememberToken) {
    storeRememberedLogin(payload.rememberToken);
  } else if (!wasResumeLogin) {
    clearRememberedLogin();
  }

  el.passwordInput.value = '';
  socket.emit('requestLobbySnapshot');
  srSpeak('Logged in as ' + payload.name, 'assertive');
  render();
});

socket.on('logoutResult', function (payload) {
  if (!payload || !payload.success) {
    srSpeak(payload && payload.message ? payload.message : 'Logout failed', 'assertive');
    return;
  }

  clearRememberedLogin();
  resetLoggedInState();
  appState.selectedGameType = null;
  appState.selectedGameName = '';
  appState.selectedLobbyIndex = 0;
  appState.lobbyTables = [];
  setScreen('auth');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  closeAnnouncementOverlay(false);
  setTableStatus('Join a table to start playing.', 'info');
  render();
  srSpeak(payload.message || 'Logged out', 'assertive');
});

socket.on('deleteAccountResult', function (payload) {
  if (!payload || !payload.success) {
    srSpeak(payload && payload.message ? payload.message : 'Account deletion failed', 'assertive');
    return;
  }

  clearRememberedLogin();
  resetLoggedInState();
  appState.selectedGameType = null;
  appState.selectedGameName = '';
  appState.selectedLobbyIndex = 0;
  appState.lobbyTables = [];
  setScreen('auth');

  try {
    window.localStorage.removeItem(displayNameStorageKey);
  } catch (error) {
    console.warn('Unable to clear saved display name', error);
  }

  el.passwordInput.value = '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  closeAnnouncementOverlay(false);
  setTableStatus('Join a table to start playing.', 'info');
  render();
  srSpeak(payload.message || 'Account deleted', 'assertive');
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
    appState.currentTurnPlayerId = null;
    appState.handBeforeDraw = null;
    closeAnnouncementOverlay(false);
    render();
    return;
  }

  appState.currentTable = payload.table;
  appState.gameStatus = payload.table.status;
  appState.isHost = !!payload.youAreHost;
  announcePlayerSummary(payload.table);

  if (payload.table.status !== 'in_game') {
    appState.turn = false;
    appState.currentTurnPlayerId = null;
    appState.hand = [];
    appState.handIndex = 0;
    appState.handBeforeDraw = null;
    appState.discard = null;
    appState.discardChosenColor = null;
    appState.pendingDrawCard = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!appState.tableStatusMessage || appState.tableStatusTone !== 'success') {
      setTableStatus('Waiting for the host to start the next game.', 'info');
    }
  } else if (!appState.currentTurnPlayerId) {
    closeAnnouncementOverlay(false);
    setTableStatus('Game in progress. Waiting for the next turn update.', 'info');
  }

  render();
});

socket.on('starterDrawSummary', function (payload) {
  if (!payload || !Array.isArray(payload.draws) || !payload.draws.length) {
    return;
  }

  const drawLines = payload.draws.map(function (draw) {
    return draw.name + ' drew ' + draw.description + ' (' + draw.score + ' points)';
  }).join('. ');
  const winnerName = payload.winner && payload.winner.name ? payload.winner.name : 'A player';
  const winnerMessage = payload.message || (winnerName + ' starts the first round.');
  const message = drawLines + '. ' + winnerMessage;

  showAnnouncementOverlay({
    eyebrow: 'Round Start',
    title: 'First starter draw',
    message: message,
    tone: 'info',
    sticky: false,
    duration: 4200
  });

  setTableStatus(winnerMessage, 'info');
  srSpeak(message, 'assertive', { lockMs: 2000 });
});

socket.on('haveCard', function (cardsInHand) {
  const previousHand = appState.hand.slice();
  const sortedHand = Array.isArray(cardsInHand)
    ? cardsInHand.slice().sort(compareCardsForHandSort)
    : [];
  appState.hand = sortedHand;

  if (typeof appState.pendingDrawCard === 'number' && appState.hand.length) {
    const oldCount = previousHand.filter(function (card) {
      return card === appState.pendingDrawCard;
    }).length;

    let seen = 0;
    let selectedIndex = -1;
    for (let i = 0; i < appState.hand.length; i++) {
      if (appState.hand[i] !== appState.pendingDrawCard) {
        continue;
      }

      if (seen === oldCount) {
        selectedIndex = i;
        break;
      }
      seen += 1;
    }

    if (selectedIndex === -1) {
      selectedIndex = appState.hand.indexOf(appState.pendingDrawCard);
    }

    if (selectedIndex !== -1) {
      appState.handIndex = selectedIndex;
    }
    appState.pendingDrawCard = null;
  } else {
    appState.handIndex = Math.max(0, Math.min(appState.handIndex, Math.max(0, appState.hand.length - 1)));
  }

  appState.handIndex = Math.max(0, Math.min(appState.handIndex, Math.max(0, appState.hand.length - 1)));
  drawHand();

  if (appState.hand.length) {
    srSpeak(getSelectedCardDescription() + ' selected', 'polite', { canInterruptLock: true });
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

  appState.currentTurnPlayerId = payload.id;
  appState.turn = payload.id === socket.id;
  updateCurrentTurnAnnouncement(payload);

  if (appState.turn) {
    drawTurnArrow();
    setTableStatus(appState.currentTurnAnnouncement || 'Your turn', 'alert');
    srSpeak(appState.currentTurnAnnouncement || 'Your turn', 'assertive');
  } else {
    setTableStatus(appState.currentTurnAnnouncement || ((payload.name || 'Another player') + "'s turn."), 'info');
    srSpeak(appState.currentTurnAnnouncement || ((payload.name || 'Another player') + ' is taking a turn'), 'polite');
  }

  renderPlayerSummary();
});

socket.on('discardCardInfo', function (payload) {
  if (!payload) {
    srSpeak('No discard card available', 'assertive', { canInterruptLock: true });
    return;
  }

  srSpeak(payload.message || 'No discard card available', payload.success ? 'polite' : 'assertive', { canInterruptLock: true });
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

  if (payload.success && typeof payload.card === 'number') {
    const focusedDrawnCard = focusDrawnCard(payload.card);
    drawHand();

    const drawMessage = 'You drew ' + describeCardForSpeech(payload.card);
    const detailMessage = payload.message && payload.message.indexOf('You drew') === 0
      ? payload.message.slice(payload.message.indexOf('.') + 1).trim()
      : payload.message;
    const selectedMessage = focusedDrawnCard ? ' Selected.' : '';
    srSpeak((detailMessage ? drawMessage + '. ' + detailMessage : drawMessage) + selectedMessage, 'assertive', { lockMs: 1800 });
    appState.handBeforeDraw = null;
    return;
  }

  appState.handBeforeDraw = null;
  srSpeak(payload.message || 'Draw action updated', payload.success ? 'polite' : 'assertive');
});

socket.on('actionNotice', function (message) {
  if (!message) {
    return;
  }

  if (/says UNO$/i.test(message)) {
    showAnnouncementOverlay({
      eyebrow: 'UNO',
      title: message,
      message: 'A player is down to one card.',
      tone: 'uno',
      sticky: false,
      duration: 3600
    });
  } else if (/won the game/i.test(message)) {
    showAnnouncementOverlay({
      eyebrow: 'Round Winner',
      title: 'Game Over',
      message: message,
      tone: 'winner',
      sticky: true
    });
  }

  setTableStatus(message, /won the game|wins the game/i.test(message) ? 'success' : 'alert');
  srSpeak(message, 'assertive', /says UNO$/i.test(message) ? { lockMs: 1800 } : null);
});

socket.on('roundSummary', function (summary) {
  if (!summary) {
    return;
  }

  const scoreText = (summary.scores || []).map(function (entry) {
    return entry.name + ': +' + entry.roundPoints + ' this round, ' + entry.totalPoints + ' total';
  }).join(', ');

  const msg = summary.winner + ' won round ' + (summary.roundNumber || 1) + ' for ' + summary.roundPoints + ' points.' + (scoreText ? ' Scores: ' + scoreText : '');
  appState.currentTurnPlayerId = null;
  appState.currentTurnAnnouncement = '';
  appState.turn = false;
  appState.hand = [];
  appState.handIndex = 0;
  appState.handBeforeDraw = null;
  appState.pendingDrawCard = null;
  drawHand();
  showAnnouncementOverlay({
    eyebrow: 'Round Winner',
    title: summary.winner + ' won the round',
    message: msg,
    tone: 'winner',
    sticky: false,
    duration: 4200
  });
  setTableStatus(msg, 'success');
  renderPlayerSummary();
  srSpeak(msg, 'assertive', { lockMs: 2200 });
});

socket.on('matchSummary', function (summary) {
  if (!summary) {
    return;
  }

  const scoreText = (summary.scores || []).map(function (entry) {
    return entry.name + ': ' + entry.totalPoints;
  }).join(', ');

  const msg = summary.winner + ' reached ' + summary.score + ' points and won the match.' + (scoreText ? ' Final scores: ' + scoreText : '');
  showAnnouncementOverlay({
    eyebrow: 'Match Winner',
    title: summary.winner + ' won the match',
    message: msg,
    tone: 'winner',
    sticky: true
  });
  setTableStatus(msg, 'success');
  srSpeak(msg, 'assertive', { lockMs: 2500 });
});

init();
