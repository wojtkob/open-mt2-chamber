# Running open-mt2 on ARM64 (Pine A64 / Armbian)

open-mt2 is a Node.js + TypeScript project with **no native addons**. Every
dependency (`awilix`, `bcryptjs`, `mysql2`, `redis`, `winston`, `reflect-metadata`)
is pure JavaScript, and all packet serialization goes through `Buffer` with
explicit little-endian accessors. The compiled output in `dist/` is therefore
architecture neutral: **the same package runs on x86_64 and on ARM64/AArch64**,
and there is no cross-compilation step.

What ARM64 does require is a *complete* runtime tree. The servers read their map
grids, spawn tables and database schema from the filesystem, and `tsc` does not
emit those. `npm run build` copies them into `dist/`, and
`tools/verify-dist.js` fails the build if anything is missing.

Verified on the CI pipeline: the container image is built for `linux/arm64`
under QEMU and the packaged tree is smoke-tested on AArch64.

## 1. Build the package

From a checkout (any architecture, Node.js >= 20 required):

```bash
npm ci
npm run build          # tsc + tsc-alias, then copies the runtime assets
npm run verify:dist    # fails if dist/ is incomplete
```

Produce the installable tarball:

```bash
deploy/build-arm64.sh --arch aarch64
```

The result is `release/open-mt2-<version>-aarch64.tar.gz` plus a `.sha256`
checksum. It contains:

```
dist/            compiled servers, migrator, map grids, spawn tables, schema
node_modules/    production dependencies only
package.json     production manifest
deploy/          install.sh, uninstall.sh, systemd units, env template
```

`build-arm64.sh` also smoke-tests the staged tree, so a package that cannot boot
is never written.

## 2. Install on the Pine A64

Copy the tarball over and run the installer as root:

```bash
tar -xzf open-mt2-<version>-aarch64.tar.gz
cd open-mt2-<version>-aarch64
sudo ./deploy/install.sh
```

The installer:

1. detects the architecture and warns if MariaDB/MySQL or Redis are missing
   (`--skip-deps` to skip installing them),
2. makes sure Node.js >= 20 is present, adding the NodeSource repository when the
   distribution ships something older (Armbian's own `nodejs` package is often
   below 20),
3. creates the `openmt2` system account, `/opt/open-mt2` and `/var/log/open-mt2`,
4. writes `/etc/open-mt2/open-mt2.env` from the annotated template, detecting
   your LAN address for `REAL_SERVER_ADDRESS`,
5. installs and enables `open-mt2-auth.service` and `open-mt2-game.service`,
6. offers to apply the database schema,
7. starts both services and prints the ports to open.

### Installer options

| Option | Effect |
|--------|--------|
| `--prefix DIR` | install somewhere other than `/opt/open-mt2` |
| `--config-dir DIR` | configuration directory (default `/etc/open-mt2`) |
| `--log-dir DIR` | log directory (default `/var/log/open-mt2`) |
| `--user NAME` | service account (default `openmt2`) |
| `--skip-deps` | do not install MariaDB/Redis |
| `--skip-migrate` | do not touch the database |
| `--migrate` | apply the schema without asking |
| `--no-start` | install the units but leave them stopped |
| `--force` | replace an existing installation |

## 3. Configure

`/etc/open-mt2/open-mt2.env` is read by systemd (`EnvironmentFile=`) and, as a
fallback for any older Node.js, by the servers themselves.

| Variable | Meaning |
|----------|---------|
| `AUTH_SERVER_ADDRESS` / `GAME_SERVER_ADDRESS` | local bind address — use `0.0.0.0` to accept LAN clients |
| `AUTH_SERVER_PORT` / `GAME_SERVER_PORT` | local ports (11002 / 13001) |
| `REAL_SERVER_ADDRESS` | IPv4 handed to the client in the login handshake |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_ROOT_PASSWORD` | MySQL/MariaDB credentials |
| `AUTH_DB_DATABASE_NAME`, `GAME_DB_DATABASE_NAME` | schema names (`auth`, `game`) |
| `SEED_ADMIN_PASSWORD` | password of the seeded `admin` account |
| `CACHE_HOST`, `CACHE_PORT`, `CACHE_PING_INTERVAL` | Redis |
| `LOG_LEVEL` | `error`, `warn`, `info` (default) or `debug` |
| `LOG_DIR` | log file directory |
| `NODE_OPTIONS` | V8 flags, e.g. `--max-old-space-size=512` |

> **`REAL_SERVER_ADDRESS` must be a dotted-quad IPv4 literal.** It is written into
> the client handshake as a 32 bit integer, so hostnames are not resolved. The
> installer fills in your LAN address; set it by hand if the box is behind NAT
> or gets its address over DHCP.

Restart after editing:

```bash
sudo systemctl restart open-mt2-auth open-mt2-game
```

## 4. Point the client at the server

In the client's `serverinfo.py`:

```python
SERVER_IP = "192.168.1.50"   # the Pine A64 address
CH1_NAME  = "CH1"
PORT_1    = 13001
PORT_AUTH = 11002
PORT_MARK = 13001
```

Log in with `admin` / the password in `SEED_ADMIN_PASSWORD`.

## 5. Operating

```bash
systemctl status open-mt2-auth open-mt2-game
journalctl -u open-mt2-auth -u open-mt2-game -f
tail -f /var/log/open-mt2/error.log
```

Both services restart automatically on failure and shut down gracefully on
`SIGTERM` (the game server despawns players and flushes character state).

To remove the installation:

```bash
sudo ./deploy/uninstall.sh            # keeps the configuration
sudo ./deploy/uninstall.sh --purge    # also removes /etc/open-mt2 and the logs
sudo ./deploy/uninstall.sh --drop-db  # also drops the auth and game schemas
```

## Notes for small boards

A Pine A64 has 1–2 GB of RAM. MariaDB and Redis dominate the footprint:

- `NODE_OPTIONS=--max-old-space-size=512` in the env file keeps the game server
  from ballooning; the servers are memory light.
- Keep `LOG_LEVEL=info`. `debug` logs every packet and will fill the journal and
  `/var/log/open-mt2`.
- Use `vm.swappiness=10` if the kernel starts reclaiming under load.
- MariaDB's default buffer pool (128 MB) is more than adequate; raise
  `innodb_buffer_pool_size` only after measuring.

## Running in Docker instead

The image is multi-arch (`linux/amd64`, `linux/arm64`):

```bash
docker buildx build --platform linux/arm64 -t open-mt2:arm64 .
```

It runs as the unprivileged `node` user, writes logs to
`/opt/open-mt2/logs`, exposes 11002 and 13001, and needs `DB_HOST` / `CACHE_HOST`
pointing at reachable services (`docker-compose.dep.yml` provides MariaDB and
Redis for local development).