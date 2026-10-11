# Bundled client

Open MT2 ships a TypeScript client that speaks the same wire protocol as the
TMP4 client. It is a **library plus a small CLI**, not a graphical client: the
`auth` and `game` services speak raw TCP with the Metin2 binary framing, so a
browser page cannot connect to them directly. The client runs on Node and can be
embedded in a script, a bot or an integration test.

Everything lives under [`src/client`](../src/client) and compiles into
`dist/client` with the rest of the project, so `npm run build` produces it too.

## Running the CLI

The CLI has three commands. It reads connection settings from flags, then
`CLIENT_*` variables, then the server variables (`AUTH_SERVER_PORT`,
`GAME_SERVER_PORT`, `REAL_SERVER_ADDRESS`) and finally the defaults
(`127.0.0.1`, ports `11002`/`13001`, `admin`/`admin`).

```bash
npm run dev:client -- status                 # ask the auth server for its channels
npm run dev:client -- login                  # full auth + token flow, print characters
npm run dev:client -- play -s 0 -m "hi"      # login, select slot 0, enter, chat, stay 30s

# after `npm run build`:
npm run client -- status --json
```

Common options:

| Option | Meaning | Env fallback |
| --- | --- | --- |
| `--auth-host <host>` | Auth server host | `CLIENT_AUTH_HOST`, `AUTH_SERVER_ADDRESS` |
| `--auth-port <port>` | Auth server port | `CLIENT_AUTH_PORT`, `AUTH_SERVER_PORT` |
| `--game-host <host>` | Game server host | `CLIENT_GAME_HOST`, `REAL_SERVER_ADDRESS` |
| `--game-port <port>` | Game server port | `CLIENT_GAME_PORT`, `GAME_SERVER_PORT` |
| `-u, --username <name>` | Account name | `CLIENT_USERNAME` (default `admin`) |
| `-p, --password <pass>` | Account password | `CLIENT_PASSWORD` (default `admin`) |
| `-s, --slot <n>` | Character slot for `play` | first occupied slot |
| `-m, --message <text>` | Chat line sent after entering | — |
| `--seconds <n>` | How long `play` stays connected | `30` |
| `--json` | Machine-readable output | — |

The CLI loads `.env` itself (existing process variables win), so `--env-file`
is optional.

## Using the library

```ts
import Metin2Client from '@/client/Metin2Client';
```

When consuming the compiled output instead of the source tree, the same import
is `require('./dist/client/Metin2Client')`. [`src/client/index.ts`](../src/client/index.ts)
re-exports the whole public surface (`Metin2Client`, `GameState`, the typed
errors, the protocol helpers) from one place.

### The full flow

```ts
import Metin2Client, { DEFAULT_AUTH_PORT, DEFAULT_GAME_PORT } from '@/client/Metin2Client';

const client = new Metin2Client();

// `error` has no default listener, so attach one or an emitted error throws.
client.on('error', (source, error) => console.error(`[${source}]`, error.message));
client.on('chat', (entry) => console.log(entry.message));

// 1. Auth server: handshake -> credentials -> one-time key.
const account = await client.login({ username: 'admin', password: 'admin' });
// 2. Game server: the key was already redeemed, we are in the select screen.
await client.selectCharacter(account.characters[0].slot);
// 3. Enter the world.
const entered = await client.enterGame();
console.log(`channel ${entered.channel}, game time ${entered.time}`);

// Gameplay verbs work once the state is GAME.
client.chat('hello world');
client.move({ positionX: 100, positionY: 200, ... });
client.attack({ victimVirtualId: 42 });

client.destroy();
```

`login()` performs both connections and closes the auth socket afterwards; use
`authenticateAuth()` / `authenticateGame()` separately if you want to keep them
open (for example to poll the auth server's channel status).

### World state

Every game packet is fed into `client.state` (a
[`GameState`](../src/client/state/GameState.ts)) as it arrives. Read from it
instead of re-parsing packets:

```ts
client.state.getSelf();          // the selected character (vid, name, class, ...)
client.state.getPoints();        // 255 character points
client.state.getPoint(0);        // hp
client.state.getSkills();        // 255 skill entries
client.state.getEntities();      // every spawned player/mob/npc
client.state.getPlayers();       // players only
client.state.getItem(1, 3);      // inventory window 1, position 3
client.state.getDroppedItem(vid);
client.state.getShop();          // open NPC/private shop, or null
client.state.getChatLog();       // last 500 chat lines
client.state.getChannel();       // current channel
client.state.getTime();          // in-game time
client.state.getEmpire();
client.state.getSelfAffects();   // active effects on the local player
```

`GameState` is a typed emitter: subscribe to `entityAdded`, `entityUpdated`,
`entityRemoved`, `itemChanged`, `chat`, `pointsChanged`, `skillsChanged`,
`gameTime`, `channel` and `shopChanged`. `Metin2Client` forwards the most useful
ones (`chat`, `entityAdded`, `entityUpdated`, `entityRemoved`, `shopChanged`,
plus `authState`/`gameState`/`packet`/`error`/`close` with an `auth`/`game`
source tag).

### Gameplay verbs

`Metin2Client` exposes a verb per client->server packet: `move`, `chat`,
`attack`, `target`, `useSkill`, `useItem`, `moveItem`, `dropItem`, `pickUpItem`,
`click`, `answerQuest`, `pressQuestButton`, `quickSlotAdd`, `quickSlotSwap`,
`quickSlotRemove`, `aimFlyTarget`, `addFlyTarget`, `shoot`, `buyShopItem`,
`sellShopItem`, `sellShopItems`, `closeShop`, `openPrivateShop`,
`createCharacter`, `deleteCharacter`, `reportClientVersion` and `markLogin`.
Each one validates the connection state first, so calling a gameplay verb before
`enterGame()` throws `InvalidStateError` instead of writing a packet the server
would drop.

## Architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Transport | `src/client/transport/TcpTransport.ts` | Owns the socket and re-emits complete frames. |
| Framing | `src/client/protocol/serverFrames.ts` | Header -> length table (the server sends no length prefix) and `FrameDecoder`. |
| Decode | `src/client/protocol/ServerPackets.ts` | Parses every server->client frame into a discriminated `ServerPacket`. |
| Encode | `src/client/protocol/ClientPacketWriter.ts` | One writer per client->server packet, byte-compatible with the core `in/*` classes. |
| Connection | `src/client/ClientConnection.ts` | Handshake, keepalive PONG, state machine, `waitUntil`/`waitForState`/`waitForPacket`. |
| Auth | `src/client/auth/AuthClient.ts` | Credential exchange. |
| Game | `src/client/game/GameClient.ts` | Token redemption, character select, enter game, gameplay verbs. |
| State | `src/client/state/GameState.ts` | Passive world model. |
| Facade | `src/client/Metin2Client.ts` | Wires the two connections and the state, exposes the flow. |

The core `in/*` and `out/*` packet classes stay the single source of truth for
the wire format: the client's writers are round-tripped through the core `in/*`
`unpack()` methods, and the client's decoders are round-tripped from the core
`out/*` `pack()` methods, in
[`test/unit/client/protocol`](../test/unit/client/protocol). A layout change on
either side fails those tests instead of silently desynchronizing the stream.

## Errors

Every failure throws a subclass of `ClientError` with a stable `code`, so you
can branch without matching message text:

| Code | Class | Raised when |
| --- | --- | --- |
| `NOT_CONNECTED` | `NotConnectedError` | Sending with no live socket. |
| `ALREADY_CONNECTED` | `AlreadyConnectedError` | Connecting a socket that is already open. |
| `CONNECTION_CLOSED` | `ConnectionClosedError` | Waiting on a connection the server closed. |
| `TIMEOUT` | `TimeoutError` | A request/response wait elapsed. |
| `HANDSHAKE_FAILED` | `HandshakeError` | The handshake did not complete. |
| `AUTH_FAILED` | `AuthError` | Login/token rejected; carries `status` (`WRONGPWD`, `ALREADY`, `CLOSED`, ...). |
| `PROTOCOL` | `ProtocolError` | A frame cannot be framed or decoded. |
| `INVALID_STATE` | `InvalidStateError` | A verb ran in the wrong connection phase. |
| `INVALID_ARGUMENT` | `InvalidArgumentError` | Bad CLI flag/argument, or `play` on an account/slot with no character. |
| `SERVER_REJECTED` | `ServerRejectedError` | The server refused an action; carries `reason`. |

The transport never swallows errors: connection-level failures surface on the
`error` event (tagged `auth`/`game` on `Metin2Client`), while request/response
failures reject the awaiting promise.

## Tests

```bash
npm run test:unit -- --grep client        # protocol, state, errors and the in-process end-to-end flow
```

The end-to-end test (`test/unit/client/Metin2Client.e2e.test.ts`) stands up real
TCP servers in-process (`test/unit/client/support/FakeMetin2Servers.ts`) and
drives the client through handshake, login, token, character select and enter
game, covering the happy path plus a wrong password, an invalid token, a stalled
token and gameplay-before-enter.
