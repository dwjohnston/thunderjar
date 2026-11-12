#!/usr/bin/env bash
# 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLihXvsaKQZdBjhN81n.
# Supervising engineer: David Johnston. Humans: add your notes here.
#
# Prints the state of the Fly runtime for a gauntlet run: the machine's state and recent events
# (to spot someone else using it), its Docker disk use, and the containers on it. Read-only, but
# like any fly-docker.sh command it starts the machine if it's stopped: pass --no-start to only
# read the events and state then.
#
#   scripts/gauntlet/remote-snapshot.sh [--no-start]
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=env.sh
source "$ROOT/scripts/gauntlet/env.sh"
APP="${FLY_APP:-thunderjar-runtime-dwj}"
D="$ROOT/.thunderjar/fly-docker.sh"

echo "== $(date -u +%FT%TZ) machine"
fly machine list -a "$APP" --json | jq -r '.[] | "\(.id) \(.state) \(.config.guest.cpu_kind)-\(.config.guest.cpus)x \(.config.guest.memory_mb)MB"'
id=$(fly machine list -a "$APP" --json | jq -r '.[0].id')
echo "== recent events"
fly machine status "$id" -a "$APP" 2>/dev/null | sed -n '/Event Logs/,$p' | sed -n '3,8p'
state=$(fly machine list -a "$APP" --json | jq -r '.[0].state')
if [ "${1:-}" = --no-start ] && [ "$state" != started ]; then exit 0; fi
echo "== disk"
fly ssh console -a "$APP" -q -C 'df -h /var/lib/docker' 2>/dev/null | tail -1
"$D" system df 2>&1
echo "== containers (running / all)"
echo "$("$D" ps -q | wc -l) / $("$D" ps -aq | wc -l)"
"$D" ps --format '{{.Names}} {{.Status}}' | head -20
