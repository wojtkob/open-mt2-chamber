#!/usr/bin/env bash
#
# Builds the installable open-mt2 release package.
#
# open-mt2 is a pure TypeScript/Node.js project: no dependency ships a native
# addon, so the compiled output is byte-for-byte architecture neutral and one
# build serves x86_64 and ARM64/AArch64 alike. What this script does is turn the
# repository into a self-contained tree that a bare Armbian box can unpack
# without a compiler, a network connection to npm, or the TypeScript sources:
#
#   dist/          tsc + tsc-alias output, with the map grids, spawn tables and
#                  schema script copied in by tools/copy-assets.js
#   node_modules/  production dependencies only (npm ci --omit=dev)
#   deploy/        install.sh, uninstall.sh, systemd units, env template
#   package.json   production dependency manifest + start scripts
#
# Usage:
#   deploy/build-arm64.sh                 build for the host architecture
#   deploy/build-arm64.sh --arch aarch64  label the package (default: uname -m)
#   deploy/build-arm64.sh --out-dir /tmp  where to write the tarball
#   deploy/build-arm64.sh --skip-install  skip the deploy/ integrity checks
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

ARCH="$(uname -m)"
OUT_DIR="${PROJECT_ROOT}/release"
SKIP_INSTALL_CHECK=false
MIN_NODE_MAJOR=22

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==> WARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==> ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --arch)          ARCH="${2:?--arch needs a value}"; shift 2 ;;
        --arch=*)        ARCH="${1#*=}"; shift ;;
        --out-dir)       OUT_DIR="${2:?--out-dir needs a value}"; shift 2 ;;
        --out-dir=*)     OUT_DIR="${1#*=}"; shift ;;
        --skip-install)  SKIP_INSTALL_CHECK=true; shift ;;
        -h|--help)       sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)               die "unknown argument: $1" ;;
    esac
done

command -v node >/dev/null 2>&1 || die "node is required to build the package (Node.js >= ${MIN_NODE_MAJOR})"
command -v npm  >/dev/null 2>&1 || die "npm is required to build the package"
command -v tar  >/dev/null 2>&1 || die "tar is required to build the package"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "${NODE_MAJOR}" -ge "${MIN_NODE_MAJOR}" ] || die "Node.js >= ${MIN_NODE_MAJOR} is required, found $(node -v)"
log "node $(node -v), npm $(npm -v), building for ${ARCH}"

VERSION="$(node -p 'require("./package.json").version')"
PACKAGE_NAME="open-mt2-${VERSION}-${ARCH}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/open-mt2-build.XXXXXX")"
TREE_DIR="${STAGING_DIR}/${PACKAGE_NAME}"

cleanup() { rm -rf "${STAGING_DIR}"; }
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Dependencies needed to compile.
# ---------------------------------------------------------------------------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
    log "installing build dependencies (npm ci)"
    npm ci --no-audit --no-fund
else
    log "reusing existing node_modules"
fi

# ---------------------------------------------------------------------------
# 2. Compile + copy runtime assets.
# ---------------------------------------------------------------------------
log "building (tsc + tsc-alias + asset copy)"
npm run --silent build

log "verifying the compiled tree is complete"
node tools/verify-dist.js

# ---------------------------------------------------------------------------
# 3. Production-only dependency tree, staged next to dist/.
# ---------------------------------------------------------------------------
log "installing production dependencies (npm ci --omit=dev)"
mkdir -p "${TREE_DIR}"
cp "${PROJECT_ROOT}/package.json" "${PROJECT_ROOT}/package-lock.json" "${TREE_DIR}/"
(
    cd "${TREE_DIR}"
    # --ignore-scripts keeps husky (a devDependency git hook) out of the way,
    # and no production dependency has an install script to skip.
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)

log "copying dist/ and the deployment kit"
cp -R "${PROJECT_ROOT}/dist" "${TREE_DIR}/dist"
mkdir -p "${TREE_DIR}/deploy"
cp "${SCRIPT_DIR}/install.sh" \
   "${SCRIPT_DIR}/uninstall.sh" \
   "${SCRIPT_DIR}/open-mt2.env.example" \
   "${SCRIPT_DIR}/README.txt" \
   "${TREE_DIR}/deploy/"
cp -R "${SCRIPT_DIR}/systemd" "${TREE_DIR}/deploy/systemd"
chmod +x "${TREE_DIR}/deploy/install.sh" "${TREE_DIR}/deploy/uninstall.sh"

# The migrator and the servers are started with plain `node <file>`; the
# in-process .env loader reads /etc/open-mt2/open-mt2.env at boot.
printf '%s\n' "${VERSION}" > "${TREE_DIR}/VERSION"
cat > "${TREE_DIR}/INSTALL.txt" <<'INSTALL_DOC'
open-mt2 — installation

  1. copy this directory to the target machine (any Linux, ARM64/AArch64 included)
  2. sudo ./deploy/install.sh
  3. edit /etc/open-mt2/open-mt2.env  (REAL_SERVER_ADDRESS must be reachable by the client)
  4. sudo systemctl restart open-mt2-auth open-mt2-game

Logs:   journalctl -u open-mt2-auth -u open-mt2-game -f
Status: systemctl status open-mt2-auth open-mt2-game
INSTALL_DOC

if [ "${SKIP_INSTALL_CHECK}" = false ]; then
    log "checking the deployment kit"
    for required in install.sh uninstall.sh open-mt2.env.example systemd/open-mt2-auth.service systemd/open-mt2-game.service; do
        [ -f "${TREE_DIR}/deploy/${required}" ] || die "missing ${required} in the package"
    done
    bash -n "${TREE_DIR}/deploy/install.sh"   || die "install.sh has a syntax error"
    bash -n "${TREE_DIR}/deploy/uninstall.sh" || die "uninstall.sh has a syntax error"
fi

# ---------------------------------------------------------------------------
# 4. Smoke test: the packaged tree must load without the repository around it.
# ---------------------------------------------------------------------------
log "smoke testing the packaged tree"
(
    cd "${TREE_DIR}"
    NODE_ENV=production LOG_LEVEL=error node -e '
        const path = require("node:path");
        require(path.join(process.cwd(), "dist", "auth", "Container.js"));
        require(path.join(process.cwd(), "dist", "game", "Container.js"));
        require(path.join(process.cwd(), "dist", "cli", "migrate.js"));
        const RuntimePaths = require(path.join(process.cwd(), "dist", "core", "infra", "config", "RuntimePaths.js")).default;
        for (const dir of ["attr", "spawn"]) {
            if (!RuntimePaths.hasDataDir(dir)) throw new Error("missing data directory: " + dir);
        }
        const fs = require("node:fs");
        const quests = fs.readdirSync(path.join(process.cwd(), "dist", "core", "domain", "quests", "quests"));
        if (!quests.some((f) => f.endsWith(".js"))) throw new Error("no compiled quests");
    '
) || die "the packaged tree failed to load — see the error above"

# ---------------------------------------------------------------------------
# 5. Archive.
# ---------------------------------------------------------------------------
mkdir -p "${OUT_DIR}"
TARBALL="${OUT_DIR}/${PACKAGE_NAME}.tar.gz"
log "writing ${TARBALL}"
tar -czf "${TARBALL}" -C "${STAGING_DIR}" "${PACKAGE_NAME}"

if command -v sha256sum >/dev/null 2>&1; then
    (cd "${OUT_DIR}" && sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256")
elif command -v shasum >/dev/null 2>&1; then
    (cd "${OUT_DIR}" && shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256")
else
    warn "no sha256 tool available, skipping the checksum file"
fi

SIZE="$(du -h "${TARBALL}" | cut -f1)"
log "done: ${PACKAGE_NAME}.tar.gz (${SIZE})"
echo
echo "Install it on the Pine A64 / Armbian box with:"
echo "    scp ${TARBALL} <user>@<host>:~/"
echo "    ssh <user>@<host> 'tar -xzf ~/${PACKAGE_NAME}.tar.gz && cd ~/${PACKAGE_NAME} && sudo ./deploy/install.sh'"