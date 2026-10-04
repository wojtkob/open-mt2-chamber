#!/usr/bin/env bash
#
# Removes an open-mt2 installation created by deploy/install.sh.
#
#     sudo ./deploy/uninstall.sh              stop, disable, remove files
#     sudo ./deploy/uninstall.sh --purge      also delete /etc/open-mt2 (config
#                                             and the database credentials)
#     sudo ./deploy/uninstall.sh --drop-db    additionally DROP the auth and game
#                                             databases (irreversible)
#     sudo ./deploy/uninstall.sh --keep-deps  leave MariaDB/Redis installed
#
# Options:
#     --prefix DIR      installed prefix            (default: /opt/open-mt2)
#     --config-dir DIR  configuration directory     (default: /etc/open-mt2)
#     --user NAME       service account             (default: openmt2)
#
set -euo pipefail

PREFIX="/opt/open-mt2"
CONFIG_DIR="/etc/open-mt2"
SERVICE_USER="openmt2"
PURGE=false
DROP_DB=false
KEEP_DEPS=false

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==> WARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==> ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix)     PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
        --config-dir) CONFIG_DIR="${2:?--config-dir needs a value}"; shift 2 ;;
        --user)       SERVICE_USER="${2:?--user needs a value}"; shift 2 ;;
        --purge)      PURGE=true; shift ;;
        --drop-db)    DROP_DB=true; PURGE=true; shift ;;
        --keep-deps)  KEEP_DEPS=true; shift ;;
        -h|--help)    usage; exit 0 ;;
        *)            die "unknown argument: $1 (try --help)" ;;
    esac
done

[ "$(id -u)" -eq 0 ] || die "must run as root (try: sudo $0)"

if [ ! -d "${PREFIX}" ] && [ ! -f "${CONFIG_DIR}/open-mt2.env" ]; then
    die "no open-mt2 installation found at ${PREFIX} or ${CONFIG_DIR}"
fi

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------
if [ -d /run/systemd/system ]; then
    for unit in open-mt2-game open-mt2-auth; do
        if systemctl list-unit-files "${unit}.service" >/dev/null 2>&1 && \
           systemctl cat "${unit}" >/dev/null 2>&1; then
            log "stopping ${unit}"
            systemctl disable --now "${unit}" >/dev/null 2>&1 || true
            rm -f "/etc/systemd/system/${unit}.service"
            ok "${unit} removed"
        fi
    done
    systemctl daemon-reload
    systemctl reset-failed >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
if [ "${DROP_DB}" = true ]; then
    MYSQL_CLI="$(command -v mariadb || command -v mysql || true)"
    if [ -z "${MYSQL_CLI}" ]; then
        warn "no mariadb/mysql client found, skipping the database drop"
    elif [ ! -f "${CONFIG_DIR}/open-mt2.env" ]; then
        warn "${CONFIG_DIR}/open-mt2.env is gone, skipping the database drop"
    else
        set -a
        # shellcheck disable=SC1090
        . "${CONFIG_DIR}/open-mt2.env"
        set +a
        log "dropping the auth and game databases"
        if [ -n "${DB_ROOT_PASSWORD:-}" ]; then
            MYSQL_PWD="${DB_ROOT_PASSWORD}" "${MYSQL_CLI}" -u "${DB_USER:-root}" \
                -e 'DROP DATABASE IF EXISTS `auth`; DROP DATABASE IF EXISTS `game`;' || warn "the drop failed"
        else
            "${MYSQL_CLI}" -u "${DB_USER:-root}" \
                -e 'DROP DATABASE IF EXISTS `auth`; DROP DATABASE IF EXISTS `game`;' || warn "the drop failed"
        fi
        ok "databases dropped"
    fi
fi

# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------
if [ -d "${PREFIX}" ]; then
    log "removing ${PREFIX}"
    rm -rf "${PREFIX}"
    ok "installation removed"
fi

if [ "${PURGE}" = true ] && [ -d "${CONFIG_DIR}" ]; then
    log "removing ${CONFIG_DIR}"
    rm -rf "${CONFIG_DIR}"
    ok "configuration removed"
else
    [ -d "${CONFIG_DIR}" ] && ok "configuration kept at ${CONFIG_DIR} (use --purge to delete it)"
fi

if id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    log "removing the ${SERVICE_USER} account"
    userdel "${SERVICE_USER}" >/dev/null 2>&1 || warn "could not remove ${SERVICE_USER}"
    getent group "${SERVICE_USER}" >/dev/null 2>&1 && groupdel "${SERVICE_USER}" >/dev/null 2>&1 || true
    ok "service account removed"
fi

if [ -d /var/log/open-mt2 ] && [ "${PURGE}" = true ]; then
    rm -rf /var/log/open-mt2
    ok "logs removed"
fi

if [ "${KEEP_DEPS}" = false ]; then
    log "leaving MariaDB and Redis installed (pass --keep-deps to skip this message)"
fi

cat <<SUMMARY

open-mt2 uninstalled.

  systemctl list-units 'open-mt2*'   # should be empty
SUMMARY