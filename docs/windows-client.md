# Windows client

Open MT2 can be played from a **native Windows client**. It is an Electron
shell (`desktop/`) that runs the same two pieces the web client ships — the
Node bridge (`src/webclient`) and the browser game UI (`web/`) — directly on
the desktop:

```
desktop window (Open MT2.exe)
┌───────────────────────────┐        loopback HTTP + SSE
│ React SPA (web/dist)      │ ◄────────────────────────────┐
└───────────────────────────┘                              │
                                BridgeServer (127.0.0.1,   │
                                ephemeral port, in-process)│
                                ├── VisualSession          │
                                └── Metin2Client ── TCP ──► auth 11002 / game 13001
```

Because the shell embeds the repository's own client library and game UI, the
desktop client is compatible with any open-mt2 auth/game server out of the
box — what you see in the window is the exact packet flow the web client uses,
just without the browser in between.

## Requirements

- Windows 10 or 11 (x64). The client is packaged per architecture
  (`--arch x64 | arm64`); the NSIS installer and the portable EXE below assume
  x64.
- The open-mt2 **servers** must be reachable from the machine where the client
  runs (`127.0.0.1` when running the server locally — see
  [the guide](guide.md)).
- **To build** (not to play): Node 22+, and once `desktop/node_modules` exists.

## Playing

The two artefacts are produced by [`npm run desktop:build`](#building):

| File | What it is |
| --- | --- |
| `build/windows/OpenMT2-Setup-<v>-x64.exe` | Installer (start-menu + desktop shortcut, install directory selectable). |
| `build/windows/OpenMT2-Portable-<v>-x64.exe` | Single-file portable client — no installation required. |

Run either and log in with the credentials the auth server knows (`admin` /
`admin` by default). The login form, character select and the game world are
rendered by the same SPA the web client uses.

### Server settings

`Game → Server Settings…` (or `Ctrl+,`) opens the settings window where the
auth and game server addresses are configured. Settings are persisted in
`%APPDATA%\Open MT2\settings.json`, so the client remembers both the server
addresses and the account name between launches. The persisted server
addresses are only *defaults* — the login form lets you override them per
login.

### Data & logs

- Settings: `%APPDATA%\Open MT2\settings.json`
- Logs: `%APPDATA%\Open MT2\logs\desktop.log` (open from `Game → Open Logs Folder`)

The log levels are `error`/`warn`/`info`/`debug`; the persisted setting is
`logLevel` (default `info`).

## Command-line flags

The client is a normal Electron app first — launch it with no flags and it
reads the persisted settings. For power users and CI smoke tests:

```
OpenMT2 [options]

  --host <host>          server host, applied to both auth and game
  --auth-host <host>     auth server host (overrides --host)
  --auth-port <port>     auth server port (default 11002)
  --game-host <host>     game server host (overrides --host)
  --game-port <port>     game server port (default 13001)
  --account <name>       username the login form pre-fills
  --log-level <level>    error | warn | info | debug
  --user-data-dir <dir>  override the Electron user-data directory
  --static-dir <dir>     serve the SPA from <dir> instead of the bundled copy
  --dev-tools            open the developer tools on launch
  --no-single-instance   allow more than one client process
  -h | --help            print this help and exit

Anything after a "--" separator is passed through to Chromium.
```

CLI values override the persisted settings; they do not overwrite them.

## Building

```bash
# the SPA has its own node_modules; the desktop client has its own as well
cd desktop && npm install && cd ..

npm run desktop:build        # SPA → bundle → NSIS installer + portable EXE
npm run desktop:verify       # audit build/windows (see below)
```

`tools/desktop/buildDesktop.js` orchestrates the whole chain:

1. `npm run build:web` — builds the React SPA into `web/dist`.
2. esbuild bundles `desktop/src/main.ts` and `desktop/src/preload.ts` into
   `desktop/dist/*.cjs` together with the **whole client library**
   (`src/webclient` + `src/client` + the `core` modules they use) — the
   packaged app ships no runtime dependencies beyond Electron.
3. The SPA is copied into `desktop/dist/static` and the settings page into
   `desktop/dist/settings`.
4. `tools/desktop/generateIcon.js` draws the app icon (pure Node, no image
   libraries).
5. electron-builder packages `dist/main.cjs` (the `main` entry of
   `desktop/package.json`) into `OpenMT2-Setup-<v>-x64.exe`,
   `OpenMT2-Portable-<v>-x64.exe` and `open-mt2-windows-<v>-x64.zip` under
   `build/windows/`.

### Verifying

`npm run desktop:verify` reads the artefacts without running a GUI and checks:

- the Electron executable is present and non-trivial,
- the `win-unpacked` zip is structurally sound (central directory parsed in pure
  Node) and every one of its entries matches the unpacked tree byte-for-byte in
  size,
- `resources/app.asar` exists,
- every runtime file the shell needs is inside the asar
  (`dist/main.cjs`, `dist/preload.cjs`, `dist/static/index.html`,
  `dist/settings/settings.html`, `package.json`),
- each artefact is non-trivial in size,

then writes `SHA256SUMS` next to the artefacts.

### Smoke test

`npm run desktop:smoke` launches the packaged `win-unpacked` executable with an
isolated `--user-data-dir`, watches its log until the main window reports it is
up (which proves the Electron main process brought the in-process bridge to
life and loaded the bundled SPA), then kills the process tree. Pass
`-- --exe <path>` to point at a different executable (e.g. the portable build
staged elsewhere).

## Development

```bash
npm run desktop:bundle       # rebuild dist/ only (SPA + esbuild bundles)
npm run desktop:start        # bundle + launch the client
npm run desktop:start -- --dev-tools    # ... with DevTools
npm run desktop:test         # desktop unit tests (desktop/test)
npm run desktop:typecheck    # tsc --noEmit over desktop/
npm run desktop:icon         # regenerate build/icon.png
```

The desktop package is deliberately dependency-free at runtime (the esbuild
bundles inline everything), so a dev loop is: edit `desktop/src/**`, re-run
`npm run desktop:bundle`, relaunch.

## Architecture

| Piece | Location | Responsibility |
| --- | --- | --- |
| Main process | `desktop/src/main.ts` | App lifecycle, windows, menu, IPC, settings, logging. |
| Bridge host | `desktop/src/bridge/bridgeHost.ts` | Owns a `BridgeServer` + `VisualSession` + `Metin2Client` on an ephemeral loopback port. |
| Shared logic | `desktop/src/shared/*` | Pure modules (settings schema, CLI parser, window bounds, IPC validation, logging) — no `electron` import, unit-tested. |
| Preload | `desktop/src/preload.ts` | `contextBridge` surface for the renderers. |
| Settings window | `desktop/src/settings/settings.html` | Plain-HTML form for server endpoints + remembered account. |
| Packaging | `tools/desktop/buildDesktop.js`, `verifyDesktop.js` | Build + audit the Windows artefacts. |
| Tests | `desktop/test/**` | Unit + functional tests (mocha/chai; the bridge functional test talks to a real ephemeral socket). |

The security posture is strict: renderers run with `contextIsolation: true`,
`sandbox: true`, `nodeIntegration: false`; navigation is locked to the bridge
origin; the SPA gets a static CSP; and every IPC payload is validated by the
`desktop/src/shared/ipc.ts` parsers before any state changes.

### VisualSession `setDefaults`

The shell needs to swap the server endpoints the login form pre-fills without
restarting a running session. `VisualSession` gained a `setDefaults()`
(`src/webclient/session/VisualSession.ts`) that replaces the endpoint defaults
and broadcasts a `snapshot` event, so the SPA re-renders the pre-filled values.

## Tests

```bash
npm run desktop:test              # desktop/shared + desktop/bridge
npm run test:unit -- --grep VisualSession    # the shared src/webclient tests (root mocha)
```