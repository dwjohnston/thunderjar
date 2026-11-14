#!/usr/bin/env bash
# Starts and sizes the Fly machine in app $FLY_APP (default thunderjar-runtime-dwj), for the
# runtime's beforeExecution and afterExecution in thunderjar.config.ts.
#
#   fly-runtime.sh up        claim the machine for this execution, start it if it's stopped, and
#                            size it from THUNDERJAR_CONCURRENCY and THUNDERJAR_CONTAINERS
#   fly-runtime.sh down      release it: remove this execution's leftover containers and its lease
#   fly-runtime.sh install   install the idle watchdog (fly-machine-init.sh) as the machine's
#                            main process; `up` does this too, when it can
#
# The machine isn't stopped after each execution. It stops itself once it has been idle for
# FLY_IDLE_MINUTES (default 60), as `up` last set it: see fly-machine-init.sh. So back-to-back
# executions find it running, at the size the last one left it, and a client that dies can't
# leave it running for long.
#
# Each container gets half a CPU and 1 GB: performance-<n>x, with n = half the containers that
# run at once, rounded up to a size Fly has (2 GB per CPU). A stopped machine is started at that
# size. A running one is only resized if it's too small, as that restarts it, and then only once
# no other execution is using it, waiting up to FLY_RUNTIME_WAIT_SECONDS (default 1800) for that.
#
# Executions share the machine. Each holds a lease, a file on the machine named for its execution,
# from `up` to `down`, claimed before anything is resized. Another execution is using it if it
# holds a lease newer than LEASE_HOURS, or has containers running there: they're told apart by the
# execution ID in their names. If the machine can't be asked, that's taken as in use.
#
# Needs FLYIO_TOKEN. Thunderjar shows the last line written to stderr when a hook fails, so
# errors are one line.
set -euo pipefail

APP="${FLY_APP:-thunderjar-runtime-dwj}"
SIZES=(1 2 4 6 8 10 12 14 16)
export FLY_API_TOKEN="${FLY_API_TOKEN:-${FLYIO_TOKEN:-}}"
die() { echo "fly-runtime: $*" >&2; exit 1; }
[ -n "$FLY_API_TOKEN" ] || die "FLYIO_TOKEN is not set"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER="$HERE/fly-docker.sh"
EXECUTION="${THUNDERJAR_EXECUTION_ID:-}"
LEASE="${EXECUTION:-manual}"
LEASE_HOURS=6
MACHINE_DIR=/var/lib/docker/.thunderjar
LEASES="$MACHINE_DIR/leases"
IDLE_MINUTES="${FLY_IDLE_MINUTES:-60}"
WAIT_SECONDS="${FLY_RUNTIME_WAIT_SECONDS:-1800}"
[[ "$IDLE_MINUTES" =~ ^[1-9][0-9]*$ ]] || die "FLY_IDLE_MINUTES must be a whole number of minutes, got '$IDLE_MINUTES'"

# The watchdog, where it's written on the machine, and its hash, kept in the machine's metadata to
# tell whether the installed one is current.
INIT_LOCAL="$HERE/fly-machine-init.sh"
INIT_REMOTE=/usr/local/bin/thunderjar-init.sh
INIT_HASH="$(sha256sum "$INIT_LOCAL" | cut -c1-12)"
INSTALL=(--file-local "$INIT_REMOTE=$INIT_LOCAL" --entrypoint "/bin/sh $INIT_REMOTE" --restart on-failure --metadata "thunderjar_init=$INIT_HASH")

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

# The machine's ID, state, CPU kind, CPUs and installed watchdog hash. Read afresh each time.
machine() {
  read -r ID STATE KIND CPUS INSTALLED < <(fly_ machine list -a "$APP" --json |
    jq -r '.[0] | [.id, .state, .config.guest.cpu_kind, .config.guest.cpus, (.config.metadata.thunderjar_init // "none")] | @tsv')
  [ -n "${ID:-}" ] && [ "$ID" != null ] || die "Fly app $APP has no machine"
}

# Closes fly-docker.sh's shared SSH connection, before the machine restarts. Only `up` does, when
# it resizes or installs, and only once no other execution is using the machine.
disconnect() { ssh -F "/tmp/tjfly-$APP/ssh_config" -O exit tjfly >/dev/null 2>&1 || true; }

# Runs a shell command on the machine, over fly-docker.sh's shared SSH connection. Given on stdin:
# the machine's SSH server runs a command's words without a shell, so `&&`, `;` and `>` would be
# taken as arguments.
on_machine() { printf '%s\n' "$1" | ssh -F "/tmp/tjfly-$APP/ssh_config" -o ConnectTimeout=20 tjfly sh -s 2>/dev/null; }

# Waits until the machine's Docker daemon answers, twice in a row: after a start or a resize it
# can answer once and then go away as the machine restarts. fly-docker.sh starts it if it's stopped.
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
  die "the Docker daemon on the Fly machine in app $APP didn't answer after it started"
}

# Claims the machine for this execution, and sets how long it may stay idle.
claim() {
  on_machine "mkdir -p $LEASES && touch $LEASES/$LEASE $MACHINE_DIR/last-active && echo $IDLE_MINUTES > $MACHINE_DIR/idle-minutes" ||
    die "couldn't write this execution's lease on the Fly machine in app $APP"
}

# How many other executions are using the machine: their leases, or else whether they have
# containers running (1 or 0). `?` if the machine can't be asked, which callers take as in use.
others() {
  local out leases running
  out=$(on_machine "find $LEASES -type f -mmin -$((LEASE_HOURS * 60)) ! -name $LEASE | wc -l; docker ps --format '{{.Names}}'") || { echo "?"; return; }
  leases=$(printf '%s\n' "$out" | head -n 1 | tr -dc 0-9)
  running=$(printf '%s\n' "$out" | tail -n +2 | { if [ -n "$EXECUTION" ]; then grep -v -F -- "-$EXECUTION-" || true; else cat; fi; } | grep -c . || true)
  [ -n "$leases" ] || { echo "?"; return; }
  if [ "$leases" -gt 0 ]; then echo "$leases"; elif [ "$running" -gt 0 ]; then echo 1; else echo 0; fi
}

# Waits until no other execution is using the machine, up to WAIT_SECONDS. Fails if it still is.
wait_until_free() {
  local waited=0 busy
  while busy=$(others) && [ "$busy" != 0 ]; do
    [ "$waited" -lt "$WAIT_SECONDS" ] || die "$ID is still in use by other executions ($busy) after ${WAIT_SECONDS}s: $1"
    sleep 20
    waited=$((waited + 20))
  done
}

case "${1:-}" in
  up)
    concurrency=${THUNDERJAR_CONCURRENCY:-1} containers=${THUNDERJAR_CONTAINERS:-1}
    at_once=$((concurrency < containers ? concurrency : containers))
    wanted=$(((at_once + 1) / 2)) cpus=${SIZES[-1]}
    for size in "${SIZES[@]}"; do
      if [ "$size" -ge "$wanted" ]; then cpus=$size; break; fi
    done
    size=(--vm-size "performance-${cpus}x" --vm-memory $((cpus * 2048)))
    machine
    case "$STATE" in stopping | suspending) fly machine wait "$ID" -a "$APP" --state stopped -w 90s >/dev/null 2>&1 || true; machine ;; esac
    if [ "$STATE" != started ]; then
      # Nobody is using a stopped machine: start it at the size wanted, with the current watchdog.
      if [ "$KIND" = performance ] && [ "$CPUS" = "$cpus" ] && [ "$INSTALLED" = "$INIT_HASH" ]; then
        fly_ machine start -a "$APP" "$ID" >/dev/null
        echo "$ID started, performance-${cpus}x"
      else
        fly_ machine update "$ID" -a "$APP" "${size[@]}" "${INSTALL[@]}" --yes >/dev/null
        echo "$ID started, performance-${cpus}x for $at_once containers at once"
      fi
      wait_ready
      claim
      exit 0
    fi
    # Running: claimed first, so another execution's `up` doesn't restart it under this one.
    wait_ready
    claim
    if [ "$KIND" != performance ] || [ "$CPUS" -lt "$cpus" ]; then
      wait_until_free "not resized from $KIND-${CPUS}x to performance-${cpus}x"
      disconnect
      fly_ machine update "$ID" -a "$APP" "${size[@]}" "${INSTALL[@]}" --yes >/dev/null
      wait_ready
      claim
      echo "$ID resized to performance-${cpus}x for $at_once containers at once"
    elif [ "$INSTALLED" != "$INIT_HASH" ] && [ "$(others)" = 0 ]; then
      disconnect
      fly_ machine update "$ID" -a "$APP" "${INSTALL[@]}" --yes >/dev/null
      wait_ready
      claim
      echo "$ID is performance-${CPUS}x: kept, and its idle watchdog updated"
    else
      echo "$ID is running, performance-${CPUS}x: kept"
      [ "$INSTALLED" = "$INIT_HASH" ] || echo "fly-runtime: $ID's idle watchdog is out of date, and the machine is in use: run \`fly-runtime.sh install\` once it's free" >&2
    fi
    ;;
  down)
    machine
    if [ "$STATE" != started ]; then
      echo "$ID already stopped"
      exit 0
    fi
    # This execution's containers still there, running or not, were left by a run that failed part
    # way: remove them, rather than leave them running.
    if [ -n "$EXECUTION" ]; then
      mine=$("$DOCKER" ps -a --format '{{.Names}}' 2>/dev/null | grep -F -- "-$EXECUTION-" || true)
      [ -z "$mine" ] || "$DOCKER" rm --force $mine >/dev/null 2>&1 || true
    fi
    # The idle period counts from here, unless another execution is still using it.
    on_machine "rm -f $LEASES/$LEASE; touch $MACHINE_DIR/last-active" || echo "fly-runtime: couldn't remove this execution's lease: it expires after ${LEASE_HOURS}h" >&2
    busy=$(others)
    if [ "$busy" = 0 ]; then
      echo "$ID released: it stops itself after $(on_machine "cat $MACHINE_DIR/idle-minutes" || echo "$IDLE_MINUTES") idle minutes"
    else
      echo "$ID released: still in use by other executions ($busy)"
    fi
    ;;
  install)
    machine
    if [ "$STATE" = started ]; then
      wait_ready
      wait_until_free "the idle watchdog wasn't installed"
      disconnect
    fi
    fly_ machine update "$ID" -a "$APP" "${INSTALL[@]}" --yes >/dev/null
    echo "$ID: idle watchdog $INIT_HASH installed"
    ;;
  *) die "expected up, down or install, got '${1:-}'" ;;
esac
