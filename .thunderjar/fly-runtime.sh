#!/usr/bin/env bash
# Sizes and stops the Fly machine in app $FLY_APP (default thunderjar-runtime-dwj), for the runtime's
# beforeExecution and afterExecution in thunderjar.config.ts.
#
#   fly-runtime.sh up     size it for the run, from THUNDERJAR_CONCURRENCY and
#                         THUNDERJAR_CONTAINERS, and start it
#   fly-runtime.sh down   stop it
#
# Each container gets half a CPU and 1 GB: performance-<n>x, with n = half the containers that
# run at once, rounded up to a size Fly has (2 GB per CPU). Needs FLYIO_TOKEN.
#
# The machine is shared: CI, a teammate or another session may be running on it. So each run
# holds a lease, a file on the machine named for its execution, from `up` to `down`:
#   - `up` doesn't resize while another run holds a lease or has containers running: resizing
#     restarts the machine, which would kill them. It leaves the size as it is, and says so.
#   - `down` stops the machine only once no other run holds a lease and no container is running.
# A lease older than LEASE_HOURS is ignored: its run died without running `down`.
#
# Thunderjar shows the last line written to stderr when a hook fails, so errors are one line.
set -euo pipefail

APP="${FLY_APP:-thunderjar-runtime-dwj}"
SIZES=(1 2 4 6 8 10 12 14 16)
export FLY_API_TOKEN="${FLY_API_TOKEN:-${FLYIO_TOKEN:-}}"
die() { echo "fly-runtime: $*" >&2; exit 1; }
[ -n "$FLY_API_TOKEN" ] || die "FLYIO_TOKEN is not set"

# Runs fly quietly, failing with the last line it wrote to stderr.
fly_() {
  local out
  out=$(fly "$@" 2>&1) || die "$(printf '%s\n' "$out" | awk 'NF { last = $0 } END { print last }')"
  printf '%s\n' "$out"
}

# Closes fly-docker.sh's shared SSH connection, if it's open: the machine is about to restart or stop.
disconnect() { ssh -F "/tmp/tjfly-$APP/ssh_config" -O exit tjfly >/dev/null 2>&1 || true; }

# The machine's ID, state, CPU kind and CPUs, tab-separated.
read -r ID STATE KIND CPUS < <(fly_ machine list -a "$APP" --json |
  jq -r '.[0] | [.id, .state, .config.guest.cpu_kind, .config.guest.cpus] | @tsv')
[ -n "${ID:-}" ] && [ "$ID" != null ] || die "Fly app $APP has no machine"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEASES=/var/lib/docker/.thunderjar-leases
LEASE_HOURS=6
LEASE="${THUNDERJAR_EXECUTION_ID:-manual-$$}"

# Runs a shell command on the machine, over fly-docker.sh's shared SSH connection.
on_machine() { ssh -F "/tmp/tjfly-$APP/ssh_config" -o ConnectTimeout=20 tjfly "sh -c '$1'" 2>/dev/null; }

# Waits until the machine's Docker daemon answers, twice in a row: after a start or a resize it
# can answer once and then go away as the machine restarts.
wait_ready() {
  local ok=0
  for _ in $(seq 1 40); do
    if "$HERE/fly-docker.sh" version --format '{{.Server.Version}}' >/dev/null 2>&1; then
      ok=$((ok + 1))
      [ "$ok" -ge 2 ] && return 0
    else
      ok=0
    fi
    sleep 3
  done
  die "the Docker daemon on the Fly machine in app $APP didn't answer after it started"
}

# How many other runs are using the machine: leases other than this run's, newer than
# LEASE_HOURS, or else whether any container is running (1 or 0). 0 if the machine can't be asked.
others() {
  local leases running
  leases=$(on_machine "mkdir -p $LEASES && find $LEASES -type f -mmin -$((LEASE_HOURS * 60)) ! -name $LEASE | wc -l" || echo 0)
  running=$(on_machine "docker ps -q | wc -l" || echo 0)
  leases=${leases//[^0-9]/} running=${running//[^0-9]/}
  if [ "${leases:-0}" -gt 0 ]; then echo "$leases"; elif [ "${running:-0}" -gt 0 ]; then echo 1; else echo 0; fi
}

case "${1:-}" in
  up)
    concurrency=${THUNDERJAR_CONCURRENCY:-1} containers=${THUNDERJAR_CONTAINERS:-1}
    at_once=$((concurrency < containers ? concurrency : containers))
    wanted=$(((at_once + 1) / 2)) cpus=${SIZES[-1]}
    for size in "${SIZES[@]}"; do
      if [ "$size" -ge "$wanted" ]; then cpus=$size; break; fi
    done
    in_use=0
    # Only a started machine can be in use.
    if [ "$STATE" = started ]; then "$HERE/fly-docker.sh" version >/dev/null 2>&1 && in_use=$(others); fi
    if [ "$KIND" = performance ] && [ "$CPUS" = "$cpus" ]; then
      [ "$STATE" = started ] || fly_ machine start -a "$APP" "$ID" >/dev/null
      echo "$ID is already performance-${cpus}x"
    elif [ "$in_use" -gt 0 ]; then
      echo "$ID is in use by another run: left at $KIND-${CPUS}x, not resized to performance-${cpus}x" >&2
    else
      # Restarts the machine, or starts it if it was stopped.
      disconnect
      fly_ machine update "$ID" -a "$APP" --vm-size "performance-${cpus}x" --vm-memory $((cpus * 2048)) --yes >/dev/null
      echo "$ID resized to performance-${cpus}x for $at_once containers at once"
    fi
    wait_ready
    on_machine "mkdir -p $LEASES && touch $LEASES/$LEASE" || die "couldn't write this run's lease on the Fly machine in app $APP"
    ;;
  down)
    if [ "$STATE" != started ]; then
      disconnect
      echo "$ID already stopped"
      exit 0
    fi
    on_machine "rm -f $LEASES/$LEASE" || true
    in_use=$(others)
    if [ "$in_use" -gt 0 ]; then
      echo "$ID left running: in use by another run" >&2
      exit 0
    fi
    disconnect
    fly_ machine stop -a "$APP" "$ID" >/dev/null
    echo "$ID stopped"
    ;;
  *) die "expected up or down, got '${1:-}'" ;;
esac
