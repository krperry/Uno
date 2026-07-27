const socket = io({autoConnect: false});
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const cdWidth = 240;
const cdHeight = 360;
const cards = new Image();
const back = new Image();

let room;
let hand = [];
let turn;
let playerName;
let discard;
let discardChosenColor = null;
let handIndex=0;
let round=1;
const playerNameStorageKey = 'playerName';

/**
 * Given a card number, returns its color
 * @function
 * @param {Number} num Number of the card position in deck
 * @return {String} Card color. Either black, red, yellow, green or blue.
 */
function cardColor(num) {
  let color;
  if (num % 14 === 13) {
    return 'black';
  }
  switch (Math.floor(num / 14)) {
    case 0:
    case 4:
      color = 'red';
      break;
    case 1:
    case 5:
      color = 'yellow';
      break;
    case 2:
    case 6:
      color = 'green';
      break;
    case 3:
    case 7:
      color = 'blue';
      break;
  }
  return color;
}

/**
 * Given a card number, returns its type
 * @function
 * @param {Number} num Number of the card position in deck
 * @return {String} Card type. Either skip, reverse, draw2, draw4, wild or number.
 */
function cardType(num) {
  switch (num % 14) {
    case 10: //Skip
      return 'Skip';
    case 11: //Reverse
      return 'Reverse';
    case 12: //Draw 2
      return 'Draw2';
    case 13: //Wild or Wild Draw 4
      if (Math.floor(num / 14) >= 4) {
        return 'Draw4';
      } else {
        return 'Wild';
      }
    default:
      return 'Number ' + (num % 14);
  }
}


function init() {
  ctx.font = "12px Arial";
  canvas.style.backgroundColor = '#10ac84';
  cards.src = 'images/deck.svg';
  back.src = 'images/uno.svg';

  playerName = getPlayerName();
  canvas.setAttribute('aria-label', 'UNO game board for ' + playerName);

  document.addEventListener('touchstart', onMouseClick, false);
  document.addEventListener('click', onMouseClick, false);
  canvas.addEventListener('keydown', handleKeyboardAction);
  canvas.focus();

  socket.connect();
}

function getPlayerName() {
  let savedName = '';
  try {
    savedName = window.sessionStorage.getItem(playerNameStorageKey) || '';
  } catch (error) {
    console.warn('Unable to read stored player name', error);
  }

  const defaultName = savedName || '';
  let resolvedName = '';

  for (let attempt = 0; attempt < 3 && !resolvedName; attempt++) {
    const enteredName = prompt('Enter your name:', defaultName);
    if (enteredName !== null && enteredName.trim() !== '') {
      resolvedName = enteredName.trim();
    }
  }

  if (!resolvedName) {
    resolvedName = 'Player ' + Math.floor(1000 + Math.random() * 9000);
  }

  try {
    window.sessionStorage.setItem(playerNameStorageKey, resolvedName);
  } catch (error) {
    console.warn('Unable to store player name', error);
  }

  return resolvedName;
}

socket.on('connect', requestRoom);
socket.on('confirmLeave', requestRoom);

function requestRoom() {
  dialog('Waiting for a Room...');
  socket.emit('requestRoom', playerName);
  room = 0;
  hand = [];
  turn = false;
  round = 1;
  console.log('>> Room Request', playerName);
}

socket.on('responseRoom', function ([name, people, maxPeople]) {
  if (name !== 'error') {
    room = name;
    console.log('<< Room Response', name);
    // ctx.fillText(name, 0, 10);
    // ctx.drawImage(back, canvas.width-cdWidth/2-60, canvas.height/2-cdHeight/4, cdWidth/2, cdHeight/2);
    // ctx.fillText(playerName, 100, 390);
    dialog(name + ': Waiting for Players (' + people +'/' + maxPeople + ')');
  } else {
    socket.disconnect();
    alert('Rooms are full! Try again later');
  }
});

socket.on('countDown', function(countDown) {
  if (countDown > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'orange';
    ctx.fillRect(canvas.width / 2 - 10, canvas.height / 2 + 40, 21, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(countDown, canvas.width / 2, canvas.height / 2 + 50);
    srSpeak('Game starts in ' + countDown, 'assertive');
  } else {
    const width = 800;
    const height = 250;
    ctx.clearRect(canvas.width/2 - width/2, canvas.height/2 - height/2, width, height);
    ctx.drawImage(back, canvas.width-cdWidth/2-60, canvas.height/2-cdHeight/4, cdWidth/2, cdHeight/2);
    ctx.font = 'normal 15px sans-serif';
    ctx.fillText(playerName, 100, 390);
    srSpeak('The game is starting for ' + playerName, 'assertive');
  }
});

socket.on('playerDisconnect', function() {
  //ctx.clearRect(0, 0, canvas.width, canvas.height);
  //socket.emit('leaveRoom', room);
  console.log('<< Player disconnected', room);
});

function onMouseClick(e) {

  // Keep keyboard input scoped to the board after any pointer interaction.
  canvas.focus();

  const offsetY = parseInt(window.getComputedStyle(canvas).marginTop);
  const offsetX = parseInt(window.getComputedStyle(canvas).marginLeft);
  const X = e.pageX - offsetX;
  const Y = e.pageY - offsetY;

  let lastCard = (hand.length/112)*(cdWidth/3)+(canvas.width/(2+(hand.length-1)))*(hand.length)-(cdWidth/4)+cdWidth/2;
  let initCard = 2 + (hand.length/112)*(cdWidth/3)+(canvas.width/(2+(hand.length-1)))-(cdWidth/4);

  if (Y >= 400 && Y <= 580 && X >= initCard && X <= lastCard) {
    for (let i = 0, pos = initCard; i < hand.length; i++, pos += canvas.width/(2+(hand.length-1))) {
      if (X >= pos && X <= pos+canvas.width/(2+(hand.length-1))) {
        // debugArea(pos, pos+canvas.width/(2+(hand.length-1)), 400, 580);
        emitPlayCard(hand[i]);
        return;
      }
    }
  } else if (X >= canvas.width-cdWidth/2-60 &&  X <= canvas.width-60 &&
    Y >= canvas.height/2-cdHeight/4 && Y <= canvas.height/2+cdHeight/4) {
    socket.emit('drawCard', [1, room]);
  }
}

socket.on('turnPlayer', function(data) {
  const turnPlayer = typeof data === 'object' && data !== null ? data : { id: data, name: null };
  if (turnPlayer.id === socket.id) {
    turn = true;
    console.log('<< Your turn');
    arrow();
    let turnMessage = 'Your turn' + (turnPlayer.name ? ', ' + turnPlayer.name : '');
    if (turnPlayer.topDiscard) {
      turnMessage += '. Top discard: ' + turnPlayer.topDiscard;
    }
    if (turnPlayer.mustDraw) {
      turnMessage += '. You have no playable cards. Press T or G to draw.';
    }
    srSpeak(turnMessage, 'assertive');
  } else {
    turn = false;
    console.log('<< Not your turn');
    srSpeak((turnPlayer.name || 'Another player') + "'s turn", 'polite');
  }
});

socket.on('haveCard', function(nums) {
  hand = nums;
  clampHandIndex();
  ctx.clearRect(0, 400, canvas.width, canvas.height);
  for (let i = 0; i < hand.length; i++) {
    ctx.drawImage(
        cards,
        1+cdWidth*(hand[i]%14),
        1+cdHeight*Math.floor(hand[i]/14),
        cdWidth,
        cdHeight,
        (hand.length/112)*(cdWidth/3)+(canvas.width/(2+(hand.length-1)))*(i+1)-(cdWidth/4),
        400,
        cdWidth/2,
        cdHeight/2
    );
    console.log('<< Have card', hand[i]);
  }
  if (hand.length) {
    srSpeak(getSelectedCardDescription() + ' selected', 'polite');
  }
  if (round==1){
  let s="";
                         for (let i =0; i<hand.length;i++){
              s+=(cardType(hand[i])+" "+cardColor(hand[i]))+", ";
              }
              if (s!==""){
                            srSpeak(s,"assertive");
                            }else{
                                                        srSpeak("You win!","assertive");
                            
                            }
  round++;
  }
});

socket.on('sendCard', function(payload) {
  const cardNum = typeof payload === 'object' && payload !== null ? payload.card : payload;
  discardChosenColor = typeof payload === 'object' && payload !== null ? payload.chosenColor || null : null;
  discard = cardNum;
  ctx.drawImage(cards, 1+cdWidth*(cardNum%14), 1+cdHeight*Math.floor(cardNum/14), cdWidth, cdHeight, canvas.width/2-cdWidth/4, canvas.height/2-cdHeight/4, cdWidth/2, cdHeight/2);
  srSpeak('Discard card ' + describeCardForSpeech(cardNum, discardChosenColor), 'assertive');
});

socket.on('discardCardInfo', function(result) {
  if (!result) {
    srSpeak('No discard card yet', 'assertive');
    return;
  }
  srSpeak(result.message, result.success ? 'polite' : 'assertive');
});

socket.on('playResult', function(result) {
  if (!result) {
    return;
  }
  srSpeak(result.message || 'Play action updated', result.success ? 'polite' : 'assertive');
});

socket.on('drawResult', function(result) {
  if (!result) {
    return;
  }
  srSpeak(result.message || 'Draw action updated', result.success ? 'polite' : 'assertive');
});

socket.on('actionNotice', function(message) {
  if (message) {
    srSpeak(message, 'assertive');
  }
});

socket.on('roundSummary', function(summary) {
  if (!summary) {
    return;
  }

  round = 1;
  const scoreText = (summary.scores || []).map(function(entry) {
    return entry.name + ' ' + entry.score;
  }).join(', ');

  const roundMessage = summary.winner + ' wins the round for ' + summary.roundPoints + ' points. '
    + 'Total ' + summary.total + ' of ' + summary.target + '. '
    + (scoreText ? 'Scores: ' + scoreText + '.' : '')
    + ' Next round starts soon.';

  dialog('Round winner: ' + summary.winner + ' (+' + summary.roundPoints + ')');
  srSpeak(roundMessage, 'assertive');
});

socket.on('matchWinner', function(result) {
  if (!result) {
    return;
  }

  round = 1;
  const matchMessage = result.winner + ' wins the match with ' + result.total
    + ' points. Target was ' + result.target + '. New match starts soon.';
  dialog('Match winner: ' + result.winner);
  srSpeak(matchMessage, 'assertive');
});

function debugArea(x1, x2, y1, y2) {
  ctx.beginPath();
  ctx.moveTo(0, y1);
  ctx.lineTo(canvas.width, y1);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, y2);
  ctx.lineTo(canvas.width, y2);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x1, 0);
  ctx.lineTo(x1, canvas.height);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, 0);
  ctx.lineTo(x2, canvas.height);
  ctx.closePath();
  ctx.stroke();
}

function chooseColor() {

  let cx = canvas.width / 2;
  let cy = canvas.height / 2;
  let r = cdHeight / 4;
  let colors = ['red', 'blue', 'green', 'gold'];

  for(let i = 0; i < 4; i++) {
      let startAngle = i * Math.PI / 2;
      let endAngle = startAngle + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.stroke();
  }

  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.fillText("Choose a color", canvas.width / 2, canvas.height / 2 - r - 10);
    srSpeak("Choose a color","assertive");
  ctx.textAlign = 'start';
}

function dialog(text) {
  const width = 800;
  const height = 250;
  ctx.fillStyle = 'orange';
  ctx.fillRect(canvas.width/2 - width/2, canvas.height/2 - height/2, width, height);
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'normal 15px sans-serif';
  ctx.fillText(playerName, canvas.width/2, canvas.height/2 - 50);
  ctx.font = 'normal bold 20px sans-serif';
  ctx.fillText(text, canvas.width/2, canvas.height/2);
  srSpeak(playerName + '. ' + text, 'assertive');
}

function arrow() {
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
  /* srSpeak(text, priority)
    text: the message to be vocalised
    priority (non mandatory): "polite" (by default) or "assertive" 
*/
function srSpeak(text, priority) {
  const regionId = priority === 'assertive' ? 'sr-alert' : 'sr-status';
  const el = document.getElementById(regionId);
  if (!el) {
    return;
  }

  el.textContent = '';
  window.setTimeout(function () {
    el.textContent = text;
  }, 50);
}

function getSelectedCardDescription() {
  clampHandIndex();
  if (!hand.length || handIndex < 0 || handIndex >= hand.length) {
    return 'No card selected';
  }
  return cardType(hand[handIndex]) + ' ' + cardColor(hand[handIndex]);
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

function emitPlayCard(card) {
  if (!hand.length) {
    srSpeak('No card selected', 'assertive');
    return;
  }

  let selectedColor = null;
  if (cardColor(card) === 'black') {
    selectedColor = promptForWildColor();
    if (!selectedColor) {
      srSpeak('Wild color selection cancelled', 'assertive');
      return;
    }
  }

  socket.emit('playCard', [card, room, selectedColor]);
  srSpeak('Attempting to play ' + describeCardForSpeech(card, selectedColor), 'polite');
}

function clampHandIndex() {
  if (!hand.length) {
    handIndex = 0;
    return;
  }
  handIndex = Math.max(0, Math.min(hand.length - 1, handIndex));
}

function handleKeyboardAction(e) {
  const key = (e.key || '').toLowerCase();
  const keyCode = e.keyCode || e.which;
  let message = '';
  let handled = false;

  switch (key) {
    case 't':
    case 'g':
      socket.emit('drawCard', [1, room]);
      message = 'Attempting to draw a card';
      handled = true;
      break;
    case 'w':
    case 'enter':
    case ' ':
      if (hand.length) {
        emitPlayCard(hand[handIndex]);
        message = '';
      } else {
        message = 'No card selected';
      }
      handled = true;
      break;
    case 'r':
      if (room) {
        socket.emit('requestDiscardCard', room);
        message = '';
      } else {
        message = 'No discard card yet';
      }
      handled = true;
      break;
    case 's':
      if (typeof discard === 'number') {
        message = describeCardForSpeech(discard, discardChosenColor);
      } else {
        message = 'No discard card yet';
      }
      handled = true;
      break;
    case 'c':
      message = getSelectedCardDescription();
      handled = true;
      break;
    case 'a':
    case 'arrowleft':
      if (hand.length) {
        handIndex -= 1;
        clampHandIndex();
        message = getSelectedCardDescription() + ' selected';
      } else {
        message = 'No cards in hand';
      }
      handled = true;
      break;
    case 'd':
    case 'arrowright':
      if (hand.length) {
        handIndex += 1;
        clampHandIndex();
        message = getSelectedCardDescription() + ' selected';
      } else {
        message = 'No cards in hand';
      }
      handled = true;
      break;
    case 'h':
      if (hand.length) {
        message = hand.map(function (card) {
          return cardType(card) + ' ' + cardColor(card);
        }).join(', ');
      } else {
        message = 'No cards in hand';
      }
      handled = true;
      break;
  }

  if (!handled && (keyCode === 37 || keyCode === 39)) {
    if (hand.length) {
      handIndex += keyCode === 37 ? -1 : 1;
      clampHandIndex();
      message = getSelectedCardDescription() + ' selected';
    } else {
      message = 'No cards in hand';
    }
    handled = true;
  }

  if (handled) {
    e.preventDefault();
    if (message) {
      srSpeak(message, 'assertive');
    }
  }
}

init();
