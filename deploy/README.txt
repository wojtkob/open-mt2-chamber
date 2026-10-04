#!/usr/bin/env bash
#
# open-mt2 — deployment kit
#
#   build-arm64.sh  builds a release tarball that installs on any Linux host,
#                   including ARM64/AArch64 boards such as the Pine A64 running
#                   Armbian. Safe to run on x86_64 too: the project has no native
#                   addons, so the compiled JavaScript is architecture neutral.
#   install.sh      installs and configures the two systemd services.
#   uninstall.sh    removes an installation.
#
# Layout produced in release/:
#   open-mt2-<version>-<arch>.tar.gz   the installable package
#   open-mt2-<version>-<arch>.sha256   its checksum