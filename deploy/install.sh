#!/usr/bin/env bash
#
# Installs open-mt2 on a Debian/Armbian host, including ARM64/AArch64 boards
# such as the Pine A64. Runs the whole life cycle: dependencies, Node.js check,
# service account, files, systemd units, database schema.
#
# Must be run from the extracted release directory as root:
#
#     cd open-mt2-<version>-<arch>
#     sudo ./deploy/install.sh
#
# Options:
#     --prefix DIR        install into DIR              (default: /opt/open-mt2)
#     --config-dir DIR    configuration directory       (default: /etc/open-mt2)
#     --user NAME         service account               (default: openmt2)
#     --log-dir DIR       log directory                 (default: /var/log/open-mt2)
#     --skip-deps         do not install MariaDB/Redis, assume they are present
#     --skip-migrate      do not touch the database
#     --migrate           apply the schema without asking (still destructive)
#     --no-start          install the units but leave them stopped
#     --force             reinstall over an existing installation
#     -h, --help          this help
#
set -euo pipefail

PREFIX="/opt/open-mt2"
CONFIG_DIR="/etc/open-mt2"
SERVICE_USER="openmt2"
LOG_DIR="/var/log/open-mt2"
INSTALL_DEPS=true
RUN_MIGRATE=ask
START_SERVICES=true
FORCE=false

MIN_NODE_MAJOR=22
RECOMMENDED_NODE_MAJOR=22

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==> WARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==> ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '3,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix)      PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
        --config-dir)  CONFIG_DIR="${2:?--config-dir needs a value}"; shift 2 ;;
        --user)        SERVICE_USER="${2:?--user needs a value}"; shift 2 ;;
        --log-dir)     LOG_DIR="${2:?--log-dir needs a value}"; shift 2 ;;
        --skip-deps)   INSTALL_DEPS=false; shift ;;
        --skip-migrate) RUN_MIGRATE=no; shift ;;
        --migrate)     RUN_MIGRATE=yes; shift ;;
        --no-start)    START_SERVICES=false; shift ;;
        --force)       FORCE=true; shift ;;
        -h|--help)     usage; exit 0 ;;
        *)             die "unknown argument: $1 (try --help)" ;;
    esac
done

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "must run as root (try: sudo $0)"
[ -d "${PACKAGE_DIR}/dist" ] || die "dist/ not found in ${PACKAGE_DIR} — is this the extracted release directory?"
[ -f "${PACKAGE_DIR}/dist/auth/main.js" ] || die "dist/auth/main.js missing — the package is incomplete"
[ -f "${PACKAGE_DIR}/dist/game/main.js" ] || die "dist/game/main.js missing — the package is incomplete"
[ -d "${PACKAGE_DIR}/node_modules" ] || die "node_modules missing — the package is incomplete"

if [ -d "${PREFIX}" ] && [ "${FORCE}" = false ]; then
    if [ -f "${PREFIX}/.installed" ]; then
        die "${PREFIX} is already installed. Re-run with --force to replace it, or use deploy/uninstall.sh first."
    fi
    die "${PREFIX} already exists and was not created by this installer. Re-run with --force to replace it."
fi

ARCH="$(uname -m)"
log "open-mt2 installation on ${ARCH} ($(uname -s) $(uname -r))"
case "${ARCH}" in
    aarch64|arm64) ok "ARM64/AArch64 detected — the compiled package is architecture neutral" ;;
    x86_64|amd64)  log "x86_64 host: the same package also runs on ARM64 (no native addons)" ;;
    *)             warn "unusual architecture '${ARCH}'; the servers are pure JavaScript, so it should still work" ;;
esac

if ! command -v apt-get >/dev/null 2>&1; then
    die "apt-get not found. This installer targets Debian/Armbian; install Node.js >= ${MIN_NODE_MAJOR}, MariaDB or MySQL, and Redis manually, then re-run."
fi

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
apt_update() {
    if [ "${APT_UPDATED:-false}" = false ]; then
        log "updating the package index"
        DEBIAN_FRONTEND=noninteractive apt-get update -y
        APT_UPDATED=true
    fi
}

package_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "ok installed"; }

if [ "${INSTALL_DEPS}" = true ]; then
    apt_update
    MISSING=()
    for pkg in mariadb-server redis-server ca-certificates; do
        package_installed "${pkg}" || MISSING+=("${pkg}")
    done
    # Accept MySQL as an alternative to MariaDB on hosts that already use it.
    if [ "${#MISSING[@]}" -gt 0 ] && { package_installed mysql-server || package_installed mariadb-server-10.6; }; then
        MISSING=()
        for pkg in mysql-server redis-server ca-certificates; do
            package_installed "${pkg}" || MISSING+=("${pkg}")
        done
    fi

    if [ "${#MISSING[@]}" -gt 0 ]; then
        log "installing: ${MISSING[*]}"
        DEBIAN_FRONTEND=noninteractive apt-get install -y "${MISSING[@]}"
    fi
    ok "MariaDB/MySQL and Redis are present"
fi

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
NODE_BIN="$(command -v node || true)"
node_major() { "${1}" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if [ -z "${NODE_BIN}" ] || [ "$(node_major "${NODE_BIN}")" -lt "${MIN_NODE_MAJOR}" ]; then
    if [ -n "${NODE_BIN}" ]; then
        warn "Node.js $( "${NODE_BIN}" -v ) found at ${NODE_BIN} is older than v${MIN_NODE_MAJOR}"
    else
        warn "Node.js is not installed"
    fi

    CANDIDATE="$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/ {print $2}')"
    DIST_MAJOR=0
    if [ -n "${CANDIDATE}" ] && [ "${CANDIDATE}" != "(none)" ]; then
        DIST_MAJOR="$(printf '%s' "${CANDIDATE}" | cut -d. -f1)"
    fi

    if [ "${DIST_MAJOR}" -ge "${MIN_NODE_MAJOR}" ] 2>/dev/null; then
        log "installing Node.js ${CANDIDATE} from the distribution repositories"
        DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
        NODE_BIN="$(command -v node)"
    else
        log "distribution Node.js is ${CANDIDATE:-unavailable} (< ${MIN_NODE_MAJOR}); adding the NodeSource repository for ${RECOMMENDED_NODE_MAJOR}.x"
        apt_update
        apt-get install -y curl ca-certificates
        curl -fsSL "https://deb.nodesource.com/setup_${RECOMMENDED_NODE_MAJOR}.x" | bash -
        DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
        NODE_BIN="$(command -v node)"
    fi
fi

[ -n "${NODE_BIN}" ] || die "Node.js installation failed"
NODE_VERSION="$("${NODE_BIN}" -v)"
[ "$(node_major "${NODE_BIN}")" -ge "${MIN_NODE_MAJOR}" ] || die "Node.js >= v${MIN_NODE_MAJOR} required, found ${NODE_VERSION}"
ok "using Node.js ${NODE_VERSION} (${NODE_BIN})"

# ---------------------------------------------------------------------------
# Service account and directories
# ---------------------------------------------------------------------------
if ! getent group "${SERVICE_USER}" >/dev/null 2>&1; then
    groupadd --system "${SERVICE_USER}"
    ok "created group ${SERVICE_USER}"
fi
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    useradd --system --gid "${SERVICE_USER}" --home-dir "${PREFIX}" --shell /usr/sbin/nologin "${SERVICE_USER}"
    ok "created service account ${SERVICE_USER}"
else
    log "service account ${SERVICE_USER} already exists"
fi

install -d -m 0755 -o root -g root "${PREFIX}"
install -d -m 0755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${LOG_DIR}"
install -d -m 0755 -o root -g root "${CONFIG_DIR}"

# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------
log "installing into ${PREFIX}"
if [ "${FORCE}" = true ] && [ -d "${PREFIX}/dist" ]; then
    rm -rf "${PREFIX}/dist"
fi
cp -R "${PACKAGE_DIR}/dist" "${PREFIX}/dist"
cp -R "${PACKAGE_DIR}/node_modules" "${PREFIX}/node_modules"
cp "${PACKAGE_DIR}/package.json" "${PREFIX}/package.json"
[ -f "${PACKAGE_DIR}/package-lock.json" ] && cp "${PACKAGE_DIR}/package-lock.json" "${PREFIX}/package-lock.json"
[ -f "${PACKAGE_DIR}/VERSION" ] && cp "${PACKAGE_DIR}/VERSION" "${PREFIX}/VERSION"
# RuntimePaths walks up from dist/ looking for this file, which is what makes
# asset lookup independent of the working directory.
[ -f "${PACKAGE_DIR}/package.json" ] || die "package.json missing from the release directory"
chown -R root:root "${PREFIX}"
chmod -R a+rX "${PREFIX}"
touch "${PREFIX}/.installed"
ok "application files installed"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ENV_FILE="${CONFIG_DIR}/open-mt2.env"
detect_lan_ip() {
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit } }'
}
LAN_IP="$(detect_lan_ip || true)"
[ -n "${LAN_IP}" ] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "${LAN_IP}" ] || LAN_IP=""

if [ -f "${ENV_FILE}" ]; then
    cp "${ENV_FILE}" "${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
    log "existing configuration backed up"
    ok "configuration kept at ${ENV_FILE}"
else
    sed -e "s#^REAL_SERVER_ADDRESS=.*#REAL_SERVER_ADDRESS=${LAN_IP}#" \
        -e "s#^LOG_DIR=.*#LOG_DIR=${LOG_DIR}#" \
        "${SCRIPT_DIR}/open-mt2.env.example" > "${ENV_FILE}"
    chmod 0640 "${ENV_FILE}"
    chown root:"${SERVICE_USER}" "${ENV_FILE}"
    ok "configuration written to ${ENV_FILE} (REAL_SERVER_ADDRESS=${LAN_IP:-<set it manually>})"
fi

# A dedicated, least-privilege database account, unless the operator chose one.
DB_USER="$(grep -E '^DB_USER=' "${ENV_FILE}" | cut -d= -f2- || true)"
DB_PASSWORD="$(grep -E '^DB_ROOT_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- || true)"
if [ -n "${DB_USER}" ] && [ "${DB_USER}" != "root" ] && [ -n "${DB_PASSWORD}" ]; then
    MYSQL_CLI="$(command -v mariadb || command -v mysql || true)"
    if [ -n "${MYSQL_CLI}" ]; then
        log "granting ${DB_USER} access to the MySQL/MariaDB server"
        "${MYSQL_CLI}" -u root <<SQL || warn "could not grant privileges automatically; do it by hand or set DB_USER=root"
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO '${DB_USER}'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
    fi
fi

# ---------------------------------------------------------------------------
# systemd units
# ---------------------------------------------------------------------------
UNIT_DIR="/etc/systemd/system"
log "installing systemd units"
for unit in open-mt2-auth.service open-mt2-game.service; do
    sed -e "s#__SERVICE_USER__#${SERVICE_USER}#g" \
        -e "s#__SERVICE_GROUP__#${SERVICE_USER}#g" \
        -e "s#__INSTALL_DIR__#${PREFIX}#g" \
        -e "s#__CONFIG_DIR__#${CONFIG_DIR}#g" \
        -e "s#__LOG_DIR__#${LOG_DIR}#g" \
        -e "s#__NODE_BIN__#${NODE_BIN}#g" \
        "${SCRIPT_DIR}/systemd/${unit}" > "${UNIT_DIR}/${unit}"
    chmod 0644 "${UNIT_DIR}/${unit}"
done

if [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    systemctl enable open-mt2-auth.service open-mt2-game.service >/dev/null
    ok "units enabled (open-mt2-auth, open-mt2-game)"
else
    warn "systemd is not running (container?); units copied to ${UNIT_DIR} but not enabled"
fi

# ---------------------------------------------------------------------------
# Database schema
# ---------------------------------------------------------------------------
should_migrate() {
    case "${RUN_MIGRATE}" in
        yes) return 0 ;;
        no)  return 1 ;;
    esac
    log "The migration DROPS and recreates the 'auth' and 'game' databases,"
    log "including every character. Any existing world is lost."
    if [ -t 0 ]; then
        read -r -p "Apply the schema now? [y/N] " answer
    else
        answer="n"
    fi
    case "${answer}" in
        y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

if should_migrate; then
    if systemctl is-active --quiet mariadb 2>/dev/null || systemctl is-active --quiet mysql 2>/dev/null; then
        :
    else
        log "starting the database server"
        systemctl enable --now mariadb 2>/dev/null || systemctl enable --now mysql 2>/dev/null || true
    fi
    systemctl enable --now redis-server 2>/dev/null || systemctl enable --now redis 2>/dev/null || true

    log "applying the database schema"
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
    if "${NODE_BIN}" "${PREFIX}/dist/cli/migrate.js"; then
        ok "database ready"
    else
        die "the migration failed. Check ${LOG_DIR}/info.log and the MySQL credentials in ${ENV_FILE}"
    fi
else
    warn "database migration skipped — the servers will not start until it is applied"
    warn "run it with: sudo bash -c 'set -a; . ${ENV_FILE}; set +a; exec ${NODE_BIN} ${PREFIX}/dist/cli/migrate.js'"
fi

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------
if [ "${START_SERVICES}" = true ] && [ -d /run/systemd/system ]; then
    log "starting the servers"
    systemctl restart open-mt2-auth.service open-mt2-game.service
    sleep 3

    for unit in open-mt2-auth open-mt2-game; do
        if systemctl is-active --quiet "${unit}"; then
            ok "${unit} is running"
        else
            warn "${unit} failed to start; last log lines:"
            journalctl -u "${unit}" --no-pager -n 20 || true
        fi
    done
else
    warn "services not started; enable them with: systemctl enable --now open-mt2-auth open-mt2-game"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
AUTH_PORT="$(grep -E '^AUTH_SERVER_PORT=' "${ENV_FILE}" | cut -d= -f2- || echo 11002)"
GAME_PORT="$(grep -E '^GAME_SERVER_PORT=' "${ENV_FILE}" | cut -d= -f2- || echo 13001)"
CONFIGURED_IP="$(grep -E '^REAL_SERVER_ADDRESS=' "${ENV_FILE}" | cut -d= -f2- || true)"

cat <<SUMMARY

open-mt2 installed
  installation   ${PREFIX}
  configuration  ${ENV_FILE}
  logs           ${LOG_DIR} and journalctl -u open-mt2-auth -u open-mt2-game
  services       systemctl status open-mt2-auth open-mt2-game

Point the client's serverinfo.py at this machine:
  SERVER_IP = "${CONFIGURED_IP:-<your IPv4>}"
  PORT_1    = ${GAME_PORT}
  PORT_AUTH = ${AUTH_PORT}

If ${CONFIGURED_IP} is empty, set REAL_SERVER_ADDRESS in ${ENV_FILE} to the IPv4
address the client can reach, then: systemctl restart open-mt2-auth open-mt2-game

Firewalls: allow inbound ${AUTH_PORT}/tcp and ${GAME_PORT}/tcp.
SUMMARY