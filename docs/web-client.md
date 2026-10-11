# Visual web client

Open MT2 also ships a **visual client**: a browser UI you can log in with,
walk the character-select screen, and play from — without the TMP4 game client.
It speaks exactly the same protocol as the [bundled client](client.md); it just
does it from a page.

The auth and game services speak raw TCP with the Metin2 binary framing, and a
browser page cannot open a raw TCP socket. So the visual client is **two
pieces**:

```
browser (React SPA)                Node bridge                        auth / game
┌───────────────────┐   HTTP+SSE  ┌────────────────────┐   TCP       ┌────────────┐
│ web/  (Vite)      │ ──────────► │ src/webclient      │ ──────────► │ 11002/13001│
│ screens, reducer  │ ◄────────── │ VisualSession      │ ◄────────── │ raw frames │
└───────────────────┘             │ → src/client/**    │             └────────────┘
                                  └────────────────────┘
```

- The **bridge** (`src/webclient`, compiled to `dist/webclient`) reuses the
  whole `src/client` library: it owns one live `Metin2Client`, exposes the
  lifecycle over REST, and streams every world change over SSE.
- The **SPA** (`web/`, a React + Vite app) talks to the bridge over JSON + SSE.
  It imports the wire types from [`src/webclient/contract.ts`](../src/webclient/contract.ts)
  **type-only**, so the shapes the UI renders and the shapes the bridge emits
  cannot drift apart.

## Running it

From a source checkout:

```bash
npm install
npm --prefix web install        # the SPA has its own package.json

# development: hot-reloading SPA + the bridge
npm run dev:auth                # terminal 1: auth server
npm run dev:game                # terminal 2: game server
npm run dev:webclient           # terminal 3: bridge  → http://127.0.0.1:8080
npm run dev:web                 # terminal 4: Vite dev server (proxies /api to the bridge)

# production: build both, then serve the SPA and the API from one process
npm run build                   # compiles the bridge into dist/webclient
npm run build:web               # builds the SPA into web/dist (and dist/webclient/static)
npm run web                     # → http://127.0.0.1:8080
```

Log in with the seeded account (`admin` / `admin`) against the auth/game servers
you are running. `npm run build:web` also copies the built SPA into
`dist/webclient/static`, which is the directory an installed release resolves —
so packaging `dist/` after `build:web` ships the browser UI with the server.

### Configuration

The bridge reads these from the environment (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEB_CLIENT_HOST` | `127.0.0.1` | Listen address. Bind `0.0.0.0` to play from another device. |
| `WEB_CLIENT_PORT` | `8080` | Listen port. |
| `WEB_CLIENT_DIR` | auto | Directory with the built SPA. Auto-detects `web/dist` then `dist/webclient/static`. |
| `WEB_CLIENT_AUTH_HOST` | `127.0.0.1` | Auth host the login form pre-fills. |
| `WEB_CLIENT_AUTH_PORT` | `11002` | Auth port the login form pre-fills. |
| `WEB_CLIENT_GAME_HOST` | `127.0.0.1` | Game host the login form pre-fills. |
| `WEB_CLIENT_GAME_PORT` | `13001` | Game port the login form pre-fills. |

The SPA itself only needs `VITE_BRIDGE_BASE` (optional) when the bridge is on a
different origin than the page; by default it calls the same origin and the Vite
dev server proxies `/api` to `WEB_BRIDGE_URL` (`http://127.0.0.1:8080`).

## HTTP API

Everything the UI does is one of these calls. Bodies are JSON; errors are
uniform (`{ "error": { "code": "...", "message": "..." } }`).

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Service identity, defaults and Node info. |
| `GET` | `/api/state` | — | The full session [`Snapshot`](../src/webclient/contract.ts). |
| `GET` | `/api/events` | — | SSE stream of `BridgeEvent`s (`event: update`). |
| `POST` | `/api/login` | `{ username, password, authHost?, authPort?, gameHost?, gamePort?, timeoutMs? }` | `{ snapshot }` at the **select** stage. |
| `POST` | `/api/select` | `{ slot }` | `{ snapshot }` at the **loading** stage. |
| `POST` | `/api/enter` | — | `{ snapshot }` at the **game** stage. |
| `POST` | `/api/chat` | `{ message, messageType? }` | `{ ok: true }`. |
| `POST` | `/api/verb` | one of the gameplay verbs (see below) | `{ ok: true }`. |
| `POST` | `/api/request-status` | — | `{ success, channels }` from the auth server. |
| `POST` | `/api/disconnect` | — | `{ snapshot }` back at **idle**. |

### Error codes to HTTP status

| Code | Status | Meaning |
| --- | --- | --- |
| `INVALID_ARGUMENT` | 400 | The request body failed validation. |
| `AUTH_FAILED` | 401 | Login/token rejected (carries the server status, e.g. `WRONGPWD`). |
| `BUSY` / `INVALID_STATE` / `ALREADY_CONNECTED` / `SERVER_REJECTED` | 409 | The action is not valid in the current session stage. |
| `NOT_CONNECTED` / `CONNECTION_CLOSED` / `PROTOCOL` / `HANDSHAKE_FAILED` | 502 | The upstream TCP session failed. |
| `TIMEOUT` | 504 | A server request/response wait elapsed. |
| anything else | 500 | Unexpected bridge failure. |

### Gameplay verbs

`POST /api/verb` dispatches to the matching [`Metin2Client`](client.md) method.
The `verb` field selects the payload: `move`, `target`, `attack`, `useSkill`,
`useItem`, `moveItem`, `dropItem`, `pickUp`, `click`, `answerQuest`,
`pressQuestButton`, `quickSlotAdd`, `quickSlotSwap`, `quickSlotRemove`,
`aimFlyTarget`, `addFlyTarget`, `shoot`, `buyShopItem`, `sellShopItem`,
`sellShopItems`, `closeShop`. Each body is validated before it reaches the
client; a malformed one is a 400, never a half-sent packet.

The live `BridgeEvent` union (`stage`, `connectionState`, `packet`, `chat`,
`entityAdded`/`entityUpdated`/`entityRemoved`, `shopChanged`, `points`,
`skills`, `gameTime`, `channel`, `itemChanged`, `selfAffects`, `error`,
`close`, `snapshot`) is defined once in
[`src/webclient/contract.ts`](../src/webclient/contract.ts) and consumed by the
SPA's reducer; add a field there and both sides get it.

## The interface

| Screen | What it shows |
| --- | --- |
| **Login** | Account/password, advanced server endpoints, inline validation. |
| **Connecting** | Live connection stage while the login flow runs. |
| **Character select** | Up to four slots with class/level/guild and the channel list. |
| **Game** | HUD (HP/MP/ST/gold/level + vuln/status points), nearby entities with target/attack, inventory with use/drop, an open NPC/private shop, the chat log, and a protocol-debug panel (connection transitions + the last raw frames). |

The UI is built to fail visibly rather than silently: every screen handles the
loading, empty, error, offline (SSE dropped) and disconnected states, a
top-level error boundary catches render crashes, and toasts surface every
session error. It is mobile-first responsive (a single column collapses on
narrow viewports), uses `prefers-reduced-motion`, and exposes ARIA roles
(`role="progressbar"`, `aria-live` status, `aria-pressed` toggles) so screens
are navigable with a keyboard and a screen reader.

## Tests

```bash
npm run test:web      # SPA: reducer, api client, formatters, Login/Game screens (Vitest + Testing Library)
npm run test:unit -- --grep "VisualSession|BridgeServer|webclient"   # bridge: validators + HTTP/SSE
```

The bridge tests stand up the same in-process fake TCP servers the client tests
use (`test/unit/client/support/FakeMetin2Servers.ts`), drive a real login → select
→ enter flow through `VisualSession`, and exercise the HTTP surface (health,
state, the full lifecycle, error mapping, static fallback, SSE) end to end.

## Notes

- The bridge is intentionally dependency-free at runtime (`node:http` only), so
  the compiled `dist/` keeps the repository's zero-runtime-dependency property.
- `web/` is its own package with its own `tsconfig`, build and tests. The root
  Prettier check does not cover `.tsx`; use `npm run format:web` /
  `npm run format:web:check` for the SPA.
- The bridge holds **one** live session, which is what a single-player dev tool
  needs. It is not a multi-tenant gateway: anyone who can reach the port shares
  that session. Keep it on `127.0.0.1` unless you intend otherwise.
