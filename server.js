const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));
io.on('connection', onConnection);
http.listen(port, () => console.log('listening on port ' + port));

const numRooms = 5;
const maxPeople = 10;

let deck = Array.apply(null, Array(112)).map(function (_, i) {return i;});
deck.splice(56, 1); //56
deck.splice(69, 1); //70
deck.splice(82, 1); //84
deck.splice(95, 1); //98

let data = [];
for (let i = 1; i <= numRooms; i++) {
  let room = [];
  room['timeout'] = [];
  room['timeout']['id'] = 0;
  room['timeout']['s'] = 10;
  room['deck'] = [];
  room['reverse'] = 0;
  room['turn'] = 0;
  room['cardOnBoard'] = 0;
  room['chosenColor'] = null;
  room['hasDrawn'] = false;
  room['scores'] = {};
  room['dealer'] = -1;
  room['roundTimer'] = 0;
  room['people'] = 0;
  let players = [];
  for (let j = 0; j < maxPeople; j++) {
    let p = [];
    p['id'] = 0;
    p['name'] = "";
    p['hand'] = [];
    players[j] = p;
  }
  room['players'] = players;
  data['Room_'+i] = room;
}

/**
 * Shuffles all elements in array
 * @function
 * @param {Array} a Array to shuffle
 */
function shuffle(a) {
  let j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
}

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

/**
 * Given a card number, returns its scoring
 * @function
 * @param {Number} num Number of the card position in deck
 * @return {Number} Points value.
 */
function cardScore(num) {
  let points;
  switch (num % 14) {
    case 10: //Skip
    case 11: //Reverse
    case 12: //Draw 2
      points = 20;
      break;
    case 13: //Wild or Wild Draw 4
      points = 50;
      break;
    default:
      points = num % 14;
      break;
  }
  return points;
}

function normalizeIndex(index, total) {
  return ((index % total) + total) % total;
}

function getNextPlayerIndex(roomData, startIndex, steps) {
  const direction = roomData['reverse'] === 0 ? 1 : -1;
  return normalizeIndex(startIndex + direction * steps, roomData['people']);
}

function getCurrentBoardColor(roomData) {
  const boardColor = cardColor(roomData['cardOnBoard']);
  if (boardColor === 'black' && roomData['chosenColor']) {
    return roomData['chosenColor'];
  }
  return boardColor;
}

function describeCard(card, chosenColor) {
  const color = cardColor(card) === 'black' && chosenColor ? chosenColor : cardColor(card);
  return cardType(card) + ' ' + color;
}

function canPlayCardOnBoard(roomData, card) {
  const playedColor = cardColor(card);
  const playedNumber = card % 14;
  const boardNumber = roomData['cardOnBoard'] % 14;
  const boardColor = getCurrentBoardColor(roomData);

  if (playedColor === 'black') {
    return true;
  }

  return playedColor === boardColor || playedNumber === boardNumber;
}

function hasPlayableCard(roomData, hand) {
  return hand.some(function(card) {
    return canPlayCardOnBoard(roomData, card);
  });
}

function emitDiscardCard(roomName) {
  const roomData = data[roomName];
  io.to(roomName).emit('sendCard', {
    card: roomData['cardOnBoard'],
    chosenColor: roomData['chosenColor']
  });
}

function emitTurnPlayer(roomName) {
  const roomData = data[roomName];
  const currentPlayerIndex = roomData['turn'];
  const hand = roomData['players'][currentPlayerIndex]['hand'];
  const canPlay = hasPlayableCard(roomData, hand);

  io.to(roomName).emit('turnPlayer', {
    id: roomData['players'][currentPlayerIndex]['id'],
    name: roomData['players'][currentPlayerIndex]['name'],
    canPlay: canPlay,
    mustDraw: !canPlay,
    topDiscard: describeCard(roomData['cardOnBoard'], roomData['chosenColor'])
  });
}

function advanceTurn(roomName, steps) {
  const roomData = data[roomName];
  roomData['turn'] = getNextPlayerIndex(roomData, roomData['turn'], steps);
  roomData['hasDrawn'] = false;
}

function drawCardsFromDeck(roomData, playerIndex, count) {
  for (let i = 0; i < count; i++) {
    const card = parseInt(roomData['deck'].shift());
    roomData['players'][playerIndex]['hand'].push(card);
  }
}

function calculateRoundPoints(roomData, winnerIndex) {
  let points = 0;
  for (let i = 0; i < roomData['people']; i++) {
    if (i === winnerIndex) {
      continue;
    }

    for (let j = 0; j < roomData['players'][i]['hand'].length; j++) {
      points += cardScore(roomData['players'][i]['hand'][j]);
    }
  }
  return points;
}

function getScoreboard(roomData) {
  const scores = [];
  for (let i = 0; i < roomData['people']; i++) {
    const name = roomData['players'][i]['name'];
    scores.push({
      name: name,
      score: roomData['scores'][name] || 0
    });
  }
  scores.sort(function(a, b) {
    return b.score - a.score;
  });
  return scores;
}

function resetMatchScores(roomData) {
  roomData['scores'] = {};
  for (let i = 0; i < roomData['people']; i++) {
    const name = roomData['players'][i]['name'];
    roomData['scores'][name] = 0;
  }
}

function finishRound(roomName, winnerIndex) {
  const roomData = data[roomName];
  const targetScore = 500;
  const winnerName = roomData['players'][winnerIndex]['name'];
  const roundPoints = calculateRoundPoints(roomData, winnerIndex);

  roomData['scores'][winnerName] = (roomData['scores'][winnerName] || 0) + roundPoints;
  const winnerTotal = roomData['scores'][winnerName];

  io.to(roomName).emit('roundSummary', {
    winner: winnerName,
    roundPoints: roundPoints,
    total: winnerTotal,
    target: targetScore,
    scores: getScoreboard(roomData)
  });

  if (winnerTotal >= targetScore) {
    io.to(roomName).emit('matchWinner', {
      winner: winnerName,
      total: winnerTotal,
      target: targetScore
    });
    resetMatchScores(roomData);
    roomData['dealer'] = -1;
    io.to(roomName).emit('actionNotice', 'New match starts in 6 seconds');
  } else {
    io.to(roomName).emit('actionNotice', 'Next round starts in 6 seconds');
  }

  roomData['hasDrawn'] = false;
  if (roomData['roundTimer']) {
    clearTimeout(roomData['roundTimer']);
  }

  roomData['roundTimer'] = setTimeout(function() {
    roomData['roundTimer'] = 0;
    startGame(roomName);
  }, 6000);
}

/**
 * Starts a countdown for start a game on a room
 * @function
 * @param {String} name Room name
 */
function startingCountdown(name) {
  let countDown = data[name]['timeout']['s']--;
  io.to(name).emit('countDown', countDown);
  console.log('>> ' + name + ': Starting in ' + countDown);
  if (countDown <= 0) {
    clearInterval(data[name]['timeout']['id']);
    startGame(name);
  }
}

/**
 * Request for start the game.
 * @param {String} name Room name
 */
function startGame(name) {
  console.log('>> ' + name + ': Requesting game...');
  let people;
  try {
    people = io.sockets.adapter.rooms[name].length;
  } catch (e) {
    console.log('>> ' + name + ': No people here...');
    return;
  }
  if (people >= 2) {
    console.log('>> ' + name + ': Starting');
    let sockets_ids = Object.keys(io.sockets.adapter.rooms[name].sockets);
    data[name]['people'] = people;

    for (let i = 0; i < people; i++) {
      data[name]['players'][i]['id'] = sockets_ids[i];
      let playerName = io.sockets.sockets[sockets_ids[i]].playerName;
      data[name]['players'][i]['name'] = playerName;
      data[name]['players'][i]['hand'] = [];
      if (typeof data[name]['scores'][playerName] !== 'number') {
        data[name]['scores'][playerName] = 0;
      }
      console.log('>> ' + name + ': ' + playerName +
                ' (' + sockets_ids[i] + ') is Player ' + i);
    }

    for (let i = people; i < maxPeople; i++) {
      data[name]['players'][i]['id'] = 0;
      data[name]['players'][i]['name'] = '';
      data[name]['players'][i]['hand'] = [];
    }

    //Shuffle a copy of a new deck
    let newDeck = [...deck];
    shuffle(newDeck);
    data[name]['deck'] = newDeck;
    console.log('>> ' + name + ': Shuffling deck');

    let dealer;
    if (data[name]['dealer'] < 0 || data[name]['dealer'] >= people) {
      //Every player draws a card.
      //Player with the highest point value is the dealer.
      let scores = new Array(people);
      do {
        console.log('>> ' + name + ': Deciding dealer');
        for (let i = 0, card = 0, score = 0; i < people; i++) {
          card = parseInt(newDeck.shift());
          newDeck.push(card);
          score = cardScore(card);
          console.log('>> ' + name + ': Player ' + i + ' draws ' + cardType(card) +
          ' ' + cardColor(card) + ' and gets ' + score + ' points');
          scores[i] = score;
        }
      } while (new Set(scores).size !== scores.length);
      dealer = scores.indexOf(Math.max(...scores));
      console.log('>> ' + name + ': The dealer is Player ' + dealer);
    } else {
      dealer = normalizeIndex(data[name]['dealer'] + 1, people);
      console.log('>> ' + name + ': Dealer rotates to Player ' + dealer);
    }
    data[name]['dealer'] = dealer;

    //Each player is dealt 7 cards
    for (let i = 0, card = 0; i < people * 7; i++) {
      let player = (i + dealer + 1) % people;
      card = parseInt(newDeck.shift());
      data[name]['players'][player]['hand'].push(card);
      console.log('>> ' + name + ': Player ' + player + ' draws '
      + cardType(card) + ' ' + cardColor(card));
    }

    let cardOnBoard;
    do {
      cardOnBoard = parseInt(newDeck.shift());
      console.log('>> ' + name + ': Card on board ' +
                  cardType(cardOnBoard) + ' ' + cardColor(cardOnBoard));
      if (cardColor(cardOnBoard) === 'black') {
        newDeck.push(cardOnBoard);
        console.log('>> ' + name + ': Replacing for another card');
      } else {
        break;
      }
    } while (true);
    data[name]['cardOnBoard'] = cardOnBoard;
    data[name]['chosenColor'] = null;
    data[name]['hasDrawn'] = false;

    data[name]['turn'] = (dealer + 1) % people;
    data[name]['reverse'] = 0;

    if (cardType(cardOnBoard) === 'Draw2') {
      drawCardsFromDeck(data[name], data[name]['turn'], 2);
      advanceTurn(name, 1);
    } else if (cardType(cardOnBoard) === 'Reverse') {
      data[name]['reverse'] = 1;
      if (people === 2) {
        advanceTurn(name, 1);
      }
    } else if (cardType(cardOnBoard) === 'Skip') {
      advanceTurn(name, 1);
    }

    console.log('>> ' + name + ': Turn is for ' + data[name]['players'][(data[name]['turn'])]['name']);
    console.log('>> ' + name + ': Reverse (' + (!!data[name]['reverse']) + ')');

    for (let i = 0; i < people; i++) {
      io.to(data[name]['players'][i]['id']).emit('haveCard', data[name]['players'][i]['hand']);
    }
    emitDiscardCard(name);
    emitTurnPlayer(name);
  } else {
    console.log('>> ' + name + ': Not enough people...');
  }
}

/**
 * Whenever a client connects
 * @function
 * @param {Socket} socket Client socket
 */
function onConnection(socket) {

  /**
   * Whenever a room is requested, looks for a slot for the player,
   * upto 10 players in a room, maxRooms and started games are respected.
   * @method
   * @param {String} playerName Player name
   * @return responseRoom with name of the room, otherwise error.
   */
  socket.on('requestRoom', function(playerName) {
    socket.playerName = playerName;
    for (let i = 1; i <= numRooms; i++) {
      let name = 'Room_' + i;
      let people;
      try {
        people = io.sockets.adapter.rooms[name].length;
      } catch (e) {
        people = 0;
      }

      //Reconnect
/*
      for (let i = 0; i < data[name]['people']; i++) {
        if (data[name]['players'][i]['name'] === socket.playerName) {
          socket.join(name);
          io.to(socket.id).emit('haveCard', data[name]['players'][i]['hand']);
          io.to(socket.id).emit('sendCard', data[name]['cardOnBoard']);
          io.to(socket.id).emit('turnPlayer', data[name]['players'][(data[name]['turn'])]['id']);
          console.log('>> Reconnect');
          return;
        }
      }*/

      if (people < maxPeople && data[name]['timeout']['s'] > 0) {
        socket.join(name);
        console.log('>> User ' + socket.playerName +
        ' connected on ' + name + ' (' + (people + 1) + '/' + maxPeople + ')');
        io.to(name).emit('responseRoom', [name, people + 1, maxPeople]);
        if (people + 1 >= 2) {
          clearInterval(data[name]['timeout']['id']);
          data[name]['timeout']['s'] = 3;
          data[name]['timeout']['id'] = setInterval(function() {
            startingCountdown(name);
          }, 1000);
        }
        return;
      }
    }
    io.to(socket.id).emit('responseRoom', 'error');
    console.log('>> Rooms exceeded');
  });
  
  socket.on('requestDiscardCard', function(name) {
    if (!data[name] || typeof data[name]['cardOnBoard'] === 'undefined') {
      socket.emit('discardCardInfo', { success: false, message: 'No discard card yet' });
      return;
    }

    socket.emit('discardCardInfo', {
      success: true,
      message: describeCard(data[name]['cardOnBoard'], data[name]['chosenColor'])
    });
  });

  /**
   * Whenever someone is performing a disconnection,
   * leave its room and notify to the rest
   * @method
   */
   //// TODO: Empty a room
  socket.on('disconnecting', function() {
    room = Object.keys(io.sockets.adapter.sids[socket.id])[1];
    if (room !== undefined) {
      clearInterval(data[room]['timeout']['id']);
      if (data[room]['roundTimer']) {
        clearTimeout(data[room]['roundTimer']);
        data[room]['roundTimer'] = 0;
      }
      io.to(room).emit('playerDisconnect', room);
      console.log('>> ' + room + ': Player ' + socket.playerName + ' ('+
                  socket.id + ') leaves the room');
    }
  });

  /**
   * Whenever disconnection is completed
   * @method
   */
  socket.on('disconnect', function() {
    console.log('>> Player ' + socket.playerName + ' ('+
                socket.id + ') disconnected');
  });

  socket.on('drawCard', function(res) {
    if (!res || !res[1] || !data[res[1]]) {
      socket.emit('drawResult', { success: false, message: 'Unable to draw a card right now' });
      return;
    }

    const roomName = res[1];
    const roomData = data[roomName];
    const numPlayer = roomData['turn'];
    const idPlayer = roomData['players'][numPlayer]['id'];
    const handPlayer = roomData['players'][numPlayer]['hand'];

    if (idPlayer !== socket.id) {
      socket.emit('drawResult', { success: false, message: 'It is not your turn' });
      return;
    }

    if (roomData['hasDrawn']) {
      socket.emit('drawResult', { success: false, message: 'You already drew this turn' });
      return;
    }

    if (hasPlayableCard(roomData, handPlayer)) {
      socket.emit('drawResult', {
        success: false,
        message: 'You already have a playable card. Play it or choose another card.'
      });
      return;
    }

    const card = parseInt(roomData['deck'].shift());
    handPlayer.push(card);
    io.to(idPlayer).emit('haveCard', handPlayer);

    if (canPlayCardOnBoard(roomData, card)) {
      roomData['hasDrawn'] = true;
      socket.emit('drawResult', {
        success: true,
        card: card,
        message: 'You drew ' + describeCard(card) + '. It is playable. You may play now.'
      });
      emitTurnPlayer(roomName);
      return;
    }

    socket.emit('drawResult', {
      success: true,
      card: card,
      message: 'You drew ' + describeCard(card) + '. It is not playable. Turn passes to the next player.'
    });

    advanceTurn(roomName, 1);
    emitTurnPlayer(roomName);
  });

  socket.on('playCard', function(res) {
    if (!res || !res[1] || !data[res[1]]) {
      socket.emit('playResult', { success: false, message: 'Unable to play a card right now' });
      return;
    }

    const roomName = res[1];
    const roomData = data[roomName];
    const numPlayer = roomData['turn'];
    const idPlayer = roomData['players'][numPlayer]['id'];
    const handPlayer = roomData['players'][numPlayer]['hand'];
    const cardToPlay = parseInt(res[0]);
    const declaredColor = typeof res[2] === 'string' ? res[2].toLowerCase() : null;

    if (idPlayer !== socket.id) {
      socket.emit('playResult', { success: false, message: 'It is not your turn' });
      return;
    }

    if (handPlayer.indexOf(cardToPlay) === -1) {
      socket.emit('playResult', { success: false, message: 'That card is not in your hand' });
      return;
    }

    const isWild = cardColor(cardToPlay) === 'black';
    if (isWild && ['red', 'yellow', 'green', 'blue'].indexOf(declaredColor) === -1) {
      socket.emit('playResult', { success: false, message: 'Choose a valid color for your Wild card' });
      return;
    }

    if (cardType(cardToPlay) === 'Draw4') {
      const boardColor = getCurrentBoardColor(roomData);
      const hasColorMatch = handPlayer.some(function(card) {
        return card !== cardToPlay && cardColor(card) !== 'black' && cardColor(card) === boardColor;
      });
      if (hasColorMatch) {
        socket.emit('playResult', {
          success: false,
          message: 'Draw4 can only be played when you have no card matching the current color'
        });
        return;
      }
    }

    if (!canPlayCardOnBoard(roomData, cardToPlay)) {
      socket.emit('playResult', {
        success: false,
        message: 'Cannot play ' + describeCard(cardToPlay) +
        ' on ' + describeCard(roomData['cardOnBoard'], roomData['chosenColor'])
      });
      return;
    }

    // Play card
    roomData['cardOnBoard'] = cardToPlay;
    roomData['chosenColor'] = isWild ? declaredColor : null;
    roomData['hasDrawn'] = false;

    // Remove card
    let cardPos = handPlayer.indexOf(cardToPlay);
    if (cardPos > -1) {
      handPlayer.splice(cardPos, 1);
    }

    emitDiscardCard(roomName);
    io.to(idPlayer).emit('haveCard', handPlayer);

    const playedDescription = describeCard(cardToPlay, roomData['chosenColor']);
    socket.emit('playResult', {
      success: true,
      card: cardToPlay,
      message: 'Played ' + playedDescription
    });

    if (handPlayer.length === 1) {
      io.to(roomName).emit('actionNotice', roomData['players'][numPlayer]['name'] + ' says UNO');
    }

    if (handPlayer.length === 0) {
      io.to(roomName).emit('actionNotice', roomData['players'][numPlayer]['name'] + ' wins the round');
      finishRound(roomName, numPlayer);
      return;
    }

    // Next turn
    let turnSteps = 1;
    if (cardType(cardToPlay) === 'Skip') {
      turnSteps = 2;
    } else if (cardType(cardToPlay) === 'Reverse') {
      roomData['reverse'] = (roomData['reverse'] + 1) % 2;
      if (roomData['people'] === 2) {
        turnSteps = 2;
      }
    } else if (cardType(cardToPlay) === 'Draw2') {
      const targetIndex = getNextPlayerIndex(roomData, numPlayer, 1);
      drawCardsFromDeck(roomData, targetIndex, 2);
      io.to(roomData['players'][targetIndex]['id']).emit('haveCard', roomData['players'][targetIndex]['hand']);
      io.to(roomData['players'][targetIndex]['id']).emit('actionNotice', 'You draw 2 cards and lose your turn');
      turnSteps = 2;
    } else if (cardType(cardToPlay) === 'Draw4') {
      const targetIndex = getNextPlayerIndex(roomData, numPlayer, 1);
      drawCardsFromDeck(roomData, targetIndex, 4);
      io.to(roomData['players'][targetIndex]['id']).emit('haveCard', roomData['players'][targetIndex]['hand']);
      io.to(roomData['players'][targetIndex]['id']).emit('actionNotice', 'You draw 4 cards and lose your turn');
      turnSteps = 2;
    }

    advanceTurn(roomName, turnSteps);
    emitTurnPlayer(roomName);
  });
}
