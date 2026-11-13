#!/usr/bin/env bash
# Sizes and stops the Fly machine in app $FLY_APP (default thunderjar-runtime-dwj), for the runtime's
# beforeExecution and afterExecution in thunderjar.config.ts.
#
#   fly-runtime.sh up     size it for the run, from THUNDERJAR_CONCURRENCY and
#                         THUNDERJAR_CONTAINERS, and start it
#   fly-runtime.sh down   stop it
#
# Neither restarts nor stops the machine while another execution's containers run on it: `up` keeps
# a big enough machine as it is, or waits up to FLY_RUNTIME_WAIT_SECONDS (default 1800) for it to be
# free before resizing, and `down` leaves it running. `down` also removes this execution's own
# leftover containers.
#
# Each container gets half a CPU and 1 GB: performance-<n>x, with n = half the containers that
# run at once, rounded up to a size Fly has (2 GB per CPU). Needs FLYIO_TOKEN.
#
# Thunderjar shows the last line written to stderr when a hook fails, so errors are one line.
set -euo pipefail

APP="${FLY_APP:-thunderjar-runtime-dwj}"
SIZES=(1 2 4 6 8 10 12 14 16)
export FLY_API_TOKEN="${FLY_API_TOKEN:-${FLYIO_TOKEN:-}}"
die() { echo "fly-runtime: $*" >&2; exit 1; }
[ -n "$FLY_API_TOKEN" ] || die "FLYIO_TOKEN is not set"

# Runs fly quietly, failing with the last line it wrote to stderr. Fly's API sometimes fails a
# request ("stream error ... INTERNAL_ERROR"), so it tries three times, 5 seconds apart.
fly_() {
  local out attempt
  for attempt in 1 2 3; do
    out=$(fly "$@" 2>&1) && { printf '%s\n' "$out"; return; }
    [ "$attempt" = 3 ] || sleep 5
  done
  die "$(printf '%s\n' "$out" | awk 'NF { last = $0 } END { print last }')"
}

# Closes fly-docker.sh's shared SSH connection, if it's open: the machine is about to restart or stop.
disconnect() { ssh -F "/tmp/tjfly-$APP/ssh_config" -O exit tjfly >/dev/null 2>&1 || true; }

# The machine's ID, state, CPU kind and CPUs, tab-separated.
machine() {
  read -r ID STATE KIND CPUS < <(fly_ machine list -a "$APP" --json |
    jq -r '.[0] | [.id, .state, .config.guest.cpu_kind, .config.guest.cpus] | @tsv')
  [ -n "${ID:-}" ] && [ "$ID" != null ] || die "Fly app $APP has no machine"
}
machine

# Another execution may share the machine: resizing restarts it and stopping stops it, killing its
# containers, so neither is done while it has some running. Containers are told apart by the
# execution ID in their names, which THUNDERJAR_EXECUTION_ID gives.
DOCKER="$(dirname "$0")/fly-docker.sh"
EXECUTION="${THUNDERJAR_EXECUTION_ID:-}"
# The names of the running containers, one per line. Only asked of a started machine, so it never starts one.
running() { [ "$STATE" = started ] && "$DOCKER" ps --format '{{.Names}}' 2>/dev/null || true; }
others() { running | { if [ -n "$EXECUTION" ]; then grep -v -F -- "-$EXECUTION-" || true; else cat; fi; } | grep -c . || true; }
WAIT_SECONDS="${FLY_RUNTIME_WAIT_SECONDS:-1800}"

case "${1:-}" in
  up)
    concurrency=${THUNDERJAR_CONCURRENCY:-1} containers=${THUNDERJAR_CONTAINERS:-1}
    at_once=$((concurrency < containers ? concurrency : containers))
    wanted=$(((at_once + 1) / 2)) cpus=${SIZES[-1]}
    for size in "${SIZES[@]}"; do
      if [ "$size" -ge "$wanted" ]; then cpus=$size; break; fi
    done
    busy=$(others)
    if [ "$busy" -gt 0 ] && [ "$KIND" = performance ] && [ "$CPUS" -ge "$cpus" ]; then
      echo "$ID is performance-${CPUS}x, shared with $busy running containers of other executions: not resized"
    elif [ "$KIND" = performance ] && [ "$CPUS" = "$cpus" ]; then
      [ "$STATE" = started ] || fly_ machine start -a "$APP" "$ID" >/dev/null
      echo "$ID is already performance-${cpus}x"
    else
      # Too small, and in use: wait for the other executions' containers to finish before resizing.
      waited=0
      while [ "$(others)" -gt 0 ]; do
        [ "$waited" -lt "$WAIT_SECONDS" ] || die "$ID is performance-${CPUS}x and still busy with other executions after ${WAIT_SECONDS}s: not resized to performance-${cpus}x"
        sleep 20; waited=$((waited + 20)); machine
      done
      # Restarts the machine, or starts it if it was stopped.
      disconnect
      fly_ machine update "$ID" -a "$APP" --vm-size "performance-${cpus}x" --vm-memory $((cpus * 2048)) --yes >/dev/null
      echo "$ID resized to performance-${cpus}x for $at_once containers at once"
    fi
    ;;
  down)
    # This execution's containers still there, running or not, were left by a run that failed part
    # way: remove them, rather than leave them running, or killed by the stop and left as exit 255.
    if [ -n "$EXECUTION" ]; then
      mine=$( ([ "$STATE" = started ] && "$DOCKER" ps -a --format '{{.Names}}' 2>/dev/null) | grep -F -- "-$EXECUTION-" || true)
      [ -z "$mine" ] || "$DOCKER" rm --force $mine >/dev/null 2>&1 || true
    fi
    busy=$(others)
    if [ "$busy" -gt 0 ]; then
      echo "$ID left running: $busy running containers of other executions"
      exit 0
    fi
    disconnect
    [ "$STATE" != started ] || fly_ machine stop -a "$APP" "$ID" >/dev/null
    echo "$ID stopped"
    ;;
  *) die "expected up or down, got '${1:-}'" ;;
esac
