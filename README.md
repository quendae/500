# Remik 500 / Rummy 500

A browser implementation of **Rummy 500** for **2–7 players**, with offline bots and private host-authoritative WebRTC multiplayer.

## What is implemented

- 2–7 seats.
- Single-player: one human plus bots filling every other seat.
- Online multiplayer: host + at least one remote human; remaining seats can be filled with host-side bots.
- 13-card deal for 2 players, 7-card deal for 3+ players.
- 54-card deck (52 + 2 jokers) for 2–4 players; two combined decks (108 cards) for 5–7.
- Sets of 3–4 equal ranks and suited runs of 3+ cards.
- Ace low or high, never around the corner.
- Wild jokers with a fixed declared interpretation. Ambiguous joker melds show an explicit choice instead of silently changing later.
- Open/fanned discard pile. A buried discard can be taken together with every card above it only when the deepest selected card can immediately be melded or laid off.
- Laying off on any player's meld while preserving scoring ownership of the added card.
- Rummy 500 scoring to a 500-point match target.
- Host-authoritative multiplayer with per-seat hidden-information filtering.
- Responsive card-room UI for desktop, tablet, portrait phone and landscape phone.
- Unit tests, complete bot-vs-bot simulation tests and Playwright viewport regression in GitHub Actions.

## Rules profile

The default rules follow the widely documented North American 500 Rummy / Joker Rummy profile: number cards score face value, J/Q/K score 10, Ace/Joker score 15, and an Ace used low in an A-2-3... run scores 1. The table uses the normal rule that the top discard may be taken into hand, but it cannot simply be discarded back on the same turn.

The extra out-of-turn **“Call Rummy!”** reaction is intentionally disabled in this build; this is a recognized table variation and avoids a simultaneous reaction race in P2P play. Normal draw/meld/layoff/discard play is unchanged.

## Run locally

Serve the repository over HTTP (ES modules are used):

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`. Single-player works without any backend.

## Multiplayer

See [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md). Multiplayer uses a Cloudflare Durable Object only for room authentication and SDP exchange. Once WebRTC is connected, the host owns the real simulation and guests send actions only.

## Tests

```bash
npm install
npm run test:unit
npx playwright install chromium
npm run test:ui
```

The simulation suite repeatedly plays complete bot-only games for every table size from 2 through 7 and checks card conservation while the games progress.

## Visual direction

The interface follows the same family as the SKAT/Belote projects: dark green-black room, emerald felt, warm walnut frame, ivory cards, restrained gold for active/important states, serif display typography and short physical card motion. No external image assets are required.
