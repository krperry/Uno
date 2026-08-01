# Accessible Card Table

An accessible, browser-based multiplayer card table built with Node.js, Express, and Socket.IO.

This repository is now a standalone project focused on a shared card-table platform where games are playable by everyone across keyboard, screen reader, mouse, and touch workflows.

## Project Direction

- This project is no longer maintained as a forked UNO-only codebase.
- It is now the foundation for a multi-game card table.
- Accessibility-first design is a core requirement for all current and future games.

## Current Status

- UNO is currently the only fully implemented game.
- Lobby, table join/start flow, and account login are active and used by the UNO experience.
- The platform is being expanded so additional card games can be added into the same table system.

## Planned Games

The following games are planned for addition:

- Hearts
- Spades
- Cribbage
- More to come

## UNO Feature Highlights

- Host-controlled table start (minimum 2 players)
- Up to 6 players per table
- In-game leave/quit handling and winner resolution
- Wild and Wild Draw Four flow with server-side validation
- Keyboard command support for gameplay actions
- Live screen-reader announcements for turns and game events

## Accessibility Commitments

- Full keyboard play support
- Screen-reader friendly status and event announcements
- Mouse and touch support without blocking accessible workflows
- Ongoing improvements as each new game is added

## Run Locally

1. Install dependencies:

npm install

2. Start server:

npm start

3. Open in browser:

http://localhost:3000

## Attribution

This project was originally created by Izan Perez Cosano.

Attribution is based on the earliest repository commits, including the first commit on 2019-02-19 authored by Izan Perez Cosano.
