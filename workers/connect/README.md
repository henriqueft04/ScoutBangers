# scoutbangers-connect

Cross-device playback ("Connect"): one Durable Object per signed-in account
keeps the account's playback state and relays it between that account's
devices. Exactly one device is *active* (makes the sound) and pushes state;
the others mirror it and send commands. Wire protocol:
`apps/web/src/lib/connect-protocol.ts`. Supabase is only the identity
provider — nothing is read from or written to it.

## Deploy

Pushing to `main` deploys it (`.github/workflows/deploy-worker.yml`).
Requirements:

- `scoutbangers.com` is a zone on the Cloudflare account (the worker is
  served from `connect.scoutbangers.com`).
- `SUPABASE_URL` in `wrangler.toml`. Tokens are verified against the
  project's published signing keys (`/auth/v1/.well-known/jwks.json`).
  Only if the project still uses the legacy shared secret:
  `wrangler secret put SUPABASE_JWT_SECRET`.

## Local development

```
npm run dev                       # relay on ws://localhost:8787
# apps/web/.env.local:
VITE_CONNECT_URL=ws://localhost:8787
```

## Security model

- A socket needs an allowed `Origin` and a valid Supabase access token,
  sent as the WebSocket subprotocol `bearer.<jwt>` (never in the URL).
  Tokens without `sub` or `exp`, expired, or with an unexpected signature
  are refused. The session is keyed by the verified `sub`.
- A socket is closed (code 4401) on its first message after its token
  expires; the app reconnects with a fresh one.
- A socket is one device for life (re-introducing itself as another closes
  it), at most 16 sockets per account.
- Every payload is validated by the shared protocol parser; only the active
  device may change state; unknown fields are rejected.
- Per-socket and per-account token buckets bound message rates; a socket far
  past its budget is closed (4008).

## Free-plan budget

Durable Objects free tier: 100k requests/day for the whole account
(incoming WebSocket messages count 20:1), no charge while hibernating.
Normal use is a handful of messages per song change. The per-account bucket
(8 msg/s sustained) caps what one user can burn, but **signups are open**, so
add a Cloudflare rate-limiting rule on `connect.scoutbangers.com` (e.g. a
low limit of new connections per IP per minute) before relying on it at
scale.

## Close codes

| Code | Meaning | Client behaviour |
| --- | --- | --- |
| 4000 | Replaced by a newer socket of the same device | Stays closed |
| 4001 | Socket changed device identity | Reconnects |
| 4008 | Rate limited | Stays closed until the app is foregrounded |
| 4401 | Token expired | Reconnects with a fresh token |
