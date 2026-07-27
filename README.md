# UNO Multiplayer (Socket.IO)

A browser-based UNO game with a Node.js + Socket.IO server, designed for both keyboard/screen-reader and mouse/touch play.

## Current Features

- Login screen with name entry every visit
- Last-used name prefilled from local storage
- Lobby with named tables
- Table capacity limit: 6 players
- Host-only game start
- Cannot start with fewer than 2 players
- In-game quit/leave support
- If one player remains, that player wins and table returns to waiting
- Host can start a new game from the same table
- Mouse, touch, and keyboard all supported
- Screen-reader live announcements for turns, actions, and player summaries

## UNO Rules Implemented

### Wild

- Wild can be played regardless of current color
- Player must choose red/yellow/green/blue
- Turn ends immediately after playing Wild
- Next player must follow chosen color (or play legal Wild)

### Wild Draw Four

- Allowed only when player has no card matching current color
- Color match restriction checks color only
- After play, player chooses color
- Next player draws 4 and loses turn

### Draw Stacking

- Stacking is not allowed (classic UNO behavior)

### Challenge Rule

- Wild Draw Four challenge flow is not implemented in this version

## Controls

## In Lobby

- Mouse: click a table to select/join
- Keyboard:
- Up/Down arrows: move selection
- Enter: join selected table

## In Game

- Mouse/touch:
- Click/tap card to play
- Click/tap draw pile to draw
- Keyboard:
- Left Arrow: previous card
- Right Arrow: next card
- Enter or Space: play selected card
- D: draw a card
- P: read top discard card
- C: read selected card
- H: read full hand
- ?: open keyboard help
- Escape: close help

## Accessibility

- Live regions announce important game events
- Visible player list shows names and card counts
- Keyboard help dialog restores focus to game board when closed
- Mouse/touch interactions remain active for visual play

## Accounts

- Players create server-stored accounts using email, password, and a display name
- Display names are unique (case-insensitive), so `Ken` and `ken` cannot both exist
- Players log in with email and password; gameplay still uses their display name
- Players can delete their account, which frees the display name for reuse

## Project Structure

- server.js: Socket.IO server, lobby/table management, game rules, turn enforcement
- public/index.html: login/lobby/table/game UI
- public/main.js: client state machine, rendering, controls, accessibility announcements
- public/style.css: responsive layout and visual styling
- public/images/: UNO deck and back images

## Run Locally

1. Install dependencies:

npm install

2. Start server:

npm start

3. Open in browser:

http://localhost:3000

## Suggested Test Pass

Use at least 2 browser sessions (separate profiles/incognito recommended).

1. Login and Lobby
- Verify login appears every visit
- Verify last name is prefilled
- Create named table
- Join table from second session
- Verify table caps at 6 players

2. Start Rules
- Verify non-host cannot start
- Verify host cannot start with 1 player
- Verify host can start with 2+ players

3. Turn and Play Validation
- Try playing out of turn and confirm blocked
- Try drawing out of turn and confirm blocked
- Verify server rejects invalid play/draw attempts

4. Wild and Draw Four
- Play Wild, choose color, confirm turn ends
- Play legal Draw Four (no current-color card), confirm next player draws 4 and is skipped
- Attempt illegal Draw Four (with current-color card), confirm rejection

5. Leave/End Behavior
- Leave during active game and verify cards return to deck
- Leave until one player remains and verify winner handling
- Verify table returns to waiting state
- Verify host can start a new game on same table

6. Input and Accessibility
- Verify mouse card play and draw pile interaction
- Verify touch interaction (if available)
- Verify keyboard mapping listed above
- Verify ? help opens and Escape closes with focus restored
- Verify player summary updates include card counts

## Notes

- Server state is in memory only (no persistence across server restarts)
- If server restarts, lobby tables and active games reset
