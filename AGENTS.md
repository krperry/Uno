# AGENTS.md

## Project Snapshot

- This is a browser-based UNO game with a Node.js + Express + Socket.IO server.
- The active runtime entrypoints are [server.js](server.js), [public/main.js](public/main.js), [public/index.html](public/index.html), and [public/style.css](public/style.css).

## Working Conventions

- Prefer small, local changes that preserve the current game flow and accessibility behavior.
- Keep server logic in [server.js](server.js) and client behavior in [public/main.js](public/main.js); avoid moving gameplay rules into the browser.
- The account store in [data/accounts.json](data/accounts.json) is runtime data, not a source of truth for code changes.
- Link to [README.md](README.md) for behavior details, rules, and the manual verification checklist instead of duplicating that content here.

## Validation

- The only package script is `npm start`; use it to run the app locally.
- There are no automated tests in this workspace, so validate behavior with the manual browser-session checklist in [README.md](README.md).
- When changing gameplay or lobby behavior, verify the Socket.IO server and the browser client together; most issues cross that boundary.
