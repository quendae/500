# Multiplayer deployment

Remik 500 uses a host-authoritative WebRTC mesh with a deliberately small Cloudflare Worker/Durable Object service for signaling only. The signaling service never runs game rules and never receives the authoritative card state.

## Recommended same-origin deployment

1. Deploy the static site (`index.html`, `styles.css`, `src/`) on your HTTPS host.
2. In `cloudflare-signaling/`, run `npm install` and `npx wrangler deploy`.
3. Route `/api/*` on the game's public hostname to this Worker. The Worker intentionally accepts signaling from the same origin only.
4. Leave `<meta name="rummy500-signaling-url" content="">` empty. The client will use `location.origin`.
5. Verify `GET /api/health` returns `{ "ok": true, "service": "rummy500-signaling" }`.

The room exists for 30 minutes or until the host starts/closes it. After SDP exchange, gameplay travels over a reliable ordered WebRTC DataChannel. The host assigns stable seats 0–6, validates guest actions and filters hidden hands/stock before broadcasting state.

## Network model

- At least two human players are required for online play: host + one guest.
- The host may fill any remaining seats with host-side bots.
- Guests send actions such as `draw-stock`, `draw-discard`, `meld`, `layoff`, and `discard`; they never submit game state.
- If a human disconnects during a game, the current implementation pauses the table and shows a visible disconnect screen rather than attempting fragile automatic reconnection.
- Single-player never depends on the Worker and remains available if signaling is down.
