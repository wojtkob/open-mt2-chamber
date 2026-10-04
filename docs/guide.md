## Requirements

- **TMP4 client** (40k client)
- **Node.js** (version 20 or higher)
- **Docker**

## Setup Client

Open serverinfo.py file and update the variables:

```python
SERVER_NAME			= "Open MT2 Server"
SERVER_IP			= "localhost"
CH1_NAME			= "CH1"
PORT_1				= 13001
PORT_AUTH			= 11002
PORT_MARK			= 13001
```

ps: If you changed the ports in the .env, put the relative values ​​here

## Run

- Install dependencies
```bash
npm install
```
- Setup .env file (you can use .env.example as example)
- Execute this command on terminal:
```bash
npm run docker:dep
```
- Execute migration command:
```bash
npm run migrate
```
- Run the auth server
```bash
npm run dev:auth
```
- Run the game server
```bash
npm run dev:game
```
ps: `npm run dev:auth:debug` / `npm run dev:game:debug` run the same servers with `LOG_LEVEL=debug` — useful when investigating, since many rejection paths only log at debug level.
- Open mt2 client and use these values for login and password:
```bash
login: admin
password: admin
```

## Production build

```bash
npm run build          # tsc + tsc-alias, then copies the runtime assets into dist/
npm run verify:dist    # fails if dist/ is missing assets or has unresolved imports
npm run auth:prod      # node dist/auth/main.js
npm run game:prod      # node dist/game/main.js
```

`npm run build` copies the files `tsc` does not emit — the per-map walkability
grids (`*.attr.gz`), the per-map spawn tables and the database schema — into
`dist/`, so the compiled tree is self-contained. The servers locate those assets
through `src/core/infra/config/RuntimePaths.ts`, which is anchored on the
installation root and therefore independent of the working directory.

`node --env-file=.env` is optional: `src/core/infra/config/env.ts` reads `.env`
(or the file named by `OPEN_MT2_ENV_FILE`) at boot when the variable is not
already set, which is what lets the packaged install read
`/etc/open-mt2/open-mt2.env`.

## ARM64 / Pine A64

See [**docs/arm64.md**](arm64.md) for the installable package, the systemd
services and the ARM64 CI pipeline.

## Commands