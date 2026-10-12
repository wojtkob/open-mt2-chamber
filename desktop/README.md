# Open MT2 — Windows desktop client

This package is the native Windows client for the open-mt2 server emulator: an
Electron shell (`desktop/src`) around the repository's own web client. The main
process runs the exact same `BridgeServer`/`VisualSession`/`Metin2Client` code
the server-side web client ships (`../src/webclient`, `../src/client`) on an
ephemeral loopback port, and opens the built React SPA (`../web`) as a desktop
game window. Protocol compatibility with the open-mt2 servers is structural —
the desktop client *is* the repository's client, minus the browser.

The user-facing documentation lives in [../docs/windows-client.md](../docs/windows-client.md).

## Layout

| Path | Responsibility |
| --- | --- |
| `src/main.ts` | Electron main process: lifecycle, windows, menu, IPC, settings, logging. |
| `src/preload.ts` | `contextBridge` surface for the main window and the settings window. |
| `src/bridge/bridgeHost.ts` | Owns a `BridgeServer` + `VisualSession` + `Metin2Client`; no `electron` import. |
| `src/shared/*` | Pure modules (settings schema, CLI parser, window bounds, IPC validation, logging) — unit-tested without Electron. |
| `src/settings/settings.html` | Plain-HTML settings window (server endpoints + remembered account). |
| `test/` | mocha/chai suite, including a functional bridge test on a real ephemeral socket. |

## Scripts

```bash
npm install               # Electron + electron-builder + tooling (also do `npm --prefix ../web install`)
npm run typecheck         # tsc --noEmit over src + test
npm test                  # mocha suite (desktop/test)
npm run bundle            # build the SPA + esbuild-bundle main/preload into dist/
npm run pack              # bundle + electron-builder: NSIS installer + portable EXE + zip
npm run verify            # audit build/windows artefacts (see tools/desktop/verifyDesktop.js)
npm run smoke             # boot the packaged exe and wait for the game window (see tools/desktop/smokeDesktop.js)
npm run start             # bundle (skip web) + launch the client against the local servers
npm run start:dev         # ... with DevTools open
npm run icon              # regenerate build/icon.png (pure-Node generator)
```

Artefacts land in `../build/windows` (gitignored): `OpenMT2-Setup-<v>-<arch>.exe`,
`OpenMT2-Portable-<v>-<arch>.exe` and `open-mt2-windows-<v>-<arch>.zip`.

## Chaining

The one non-`desktop` dependency is the built SPA: `npm run bundle` runs the
root `build:web` step itself, so `npm run pack` from a fresh checkout just
works once `web/node_modules` is installed. Type-checking pulls the webclient
and client sources in through `tsconfig.json` (`@/*` → `../src/*`); the esbuild
bundles inline the exact same sources for the packaged app — zero runtime
dependencies beyond Electron.