#!/usr/bin/env bash
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# Destroys a Fly machine made by fly-create.sh, and the volumes mounted on it, so all its Docker
# images and containers go too. Doesn't remove the app.
#
#   fly-destroy.sh <name or ID>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -n "${1:-}" ] || { echo "usage: ${0##*/} <name or ID>" >&2; exit 1; }
FLY_MACHINE="$1"
# shellcheck source=fly-lib.sh
. "$HERE/fly-lib.sh"

resolve_machine
volumes=$(fly machine list -a "$APP" --json | jq -r --arg id "$ID" '.[] | select(.id == $id) | .config.mounts // [] | .[].volume')

# Close fly-docker.sh's shared SSH connection.
ssh -F "$DIR/ssh_config" -O exit tjfly >/dev/null 2>&1 || true
fly machine destroy "$ID" -a "$APP" --force >/dev/null
echo "destroyed machine $MACHINE ($ID)"
for vol in $volumes; do
  fly volumes destroy "$vol" -a "$APP" --yes >/dev/null
  echo "destroyed volume $vol"
done
rm -rf "$DIR"
