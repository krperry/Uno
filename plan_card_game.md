# Card Game Platform Plan

## Goal

Turn the current UNO-only flow into a game platform that can host UNO now and add Hearts, Spades, and Cribbage later, while keeping the interface accessible for sighted and blind players.

## Implementation Order

1. Fix login UX and session memory.
2. Insert a game picker after login.
3. Route tables by game type.
4. Extend UNO into a 500-point match series.
5. Add accessible placeholder screens for Hearts, Spades, and Cribbage.

## Security Decision

- Use a browser-local remember-me token for returning users.
- Do not store the password as the remembered secret.
- Do not treat a password hash as the password.

## First Slice

- Keep UNO as the only playable game.
- Show the other games as accessible placeholders.
- Keep table and lobby behavior compatible with future game types.
