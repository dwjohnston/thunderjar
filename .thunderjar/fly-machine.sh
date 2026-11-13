#!/usr/bin/env bash
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Session Id: session_01LCLeLhah9TqxnEZs1agP1y
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# Starts, stops and clears down the Fly machine that remote runs use. Thunderjar does none of this
# itself: start the machine before working, and stop it when done. Which machine: $FLY_APP and
# $FLY_MACHINE, see fly-lib.sh.
#
#   fly-machine.sh start [cpus]   start it, and wait for its Docker daemon. With cpus, e.g. 8, it's
#                                 sized performance-<cpus>x with 2 GB a CPU first, which restarts
#                                 it if it's running
#   fly-machine.sh stop           stop it
#   fly-machine.sh prune          remove its stopped containers, and every image no container uses
#   fly-machine.sh status         print its state
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=fly-lib.sh
. "$HERE/fly-lib.sh"
DOCKER="$HERE/fly-docker.sh"

# Closes fly-docker.sh's shared SSH connection, before the machine stops or restarts.
disconnect() { ssh -F "$DIR/ssh_config" -O exit tjfly >/dev/null 2>&1 || true; }

# Waits until the machine's Docker daemon answers, twice in a row: after a start it can answer
# once and then go away as the machine restarts.
wait_ready() {
  local ok=0
  for _ in $(seq 1 40); do
    if "$DOCKER" version --format '{{.Server.Version}}' >/dev/null 2>&1; then
      ok=$((ok + 1))
      [ "$ok" -ge 2 ] && return 0
    else
      ok=0
    fi
    sleep 3
  done
  die "the Docker daemon on $ID didn't answer after it started"
}

resolve_machine
case "${1:-}" in
  start)
    cpus="${2:-}"
    case "$STATE" in stopping | suspending) fly machine wait "$ID" -a "$APP" --state stopped -w 90s >/dev/null 2>&1 || true ;; esac
    if [ -n "$cpus" ]; then
      [[ "$cpus" =~ ^[1-9][0-9]*$ ]] || die "cpus must be a whole number, got '$cpus'"
      disconnect
      fly machine update "$ID" -a "$APP" --vm-size "performance-${cpus}x" --vm-memory $((cpus * 2048)) --yes >/dev/null
    elif [ "$STATE" != started ]; then
      fly machine start "$ID" -a "$APP" >/dev/null
    fi
    fly machine wait "$ID" -a "$APP" --state started -w 120s >/dev/null || die "$ID didn't start"
    wait_ready
    echo "$ID started${cpus:+, performance-${cpus}x}"
    ;;
  stop)
    disconnect
    if [ "$STATE" = stopped ]; then
      echo "$ID already stopped"
    else
      fly machine stop "$ID" -a "$APP" >/dev/null
      echo "$ID stopped"
    fi
    ;;
  prune)
    [ "$STATE" = started ] || die "$ID is $STATE: start it first"
    "$DOCKER" container prune --force
    "$DOCKER" image prune --all --force
    ;;
  status) echo "$ID $STATE" ;;
  *) die "expected start, stop, prune or status, got '${1:-}'" ;;
esac
