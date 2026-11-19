#!/usr/bin/env bash
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Session Id: session_01LCLeLhah9TqxnEZs1agP1y
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# Creates, starts, stops, clears down and destroys the Fly machines that remote runs use. Thunderjar
# does none of this itself: start the machine before working, and stop it when done. Which machine:
# $FLY_APP and $FLY_MACHINE, see fly-lib.sh, or the name given to create and destroy.
#
#   fly-machine.sh create <name> [--region REGION] [--volume-gb GB] [--cpus CPUS]
#                                 create a docker:dind machine, with a volume at /var/lib/docker,
#                                 and wait for its Docker daemon. Creates the app $FLY_APP first if
#                                 it doesn't exist. --region defaults to $FLY_REGION or iad,
#                                 --volume-gb to 80, --cpus to $FLYIO_INSTANCE_SIZE or 2
#   fly-machine.sh start [cpus]   start it, and wait for its Docker daemon. With cpus, e.g. 8, or
#                                 else FLYIO_INSTANCE_SIZE (from the environment or the repo's
#                                 .env), it's sized performance-<cpus>x with 2 GB a CPU first,
#                                 which restarts it if it's running at another size
#   fly-machine.sh stop           stop it
#   fly-machine.sh prune          remove its stopped containers, and every image no container uses
#   fly-machine.sh status         print its state
#   fly-machine.sh destroy <name or ID>
#                                 destroy it and the volumes mounted on it, so all its Docker
#                                 images and containers go too. The app stays
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD="${1:-}"
[ $# -gt 0 ] && shift
# create and destroy take the machine as an argument, rather than from $FLY_MACHINE.
case "$CMD" in
  create | destroy)
    [ -n "${1:-}" ] && [ "${1#-}" = "$1" ] || { echo "usage: ${0##*/} $CMD <name$([ "$CMD" = destroy ] && echo " or ID")>" >&2; exit 1; }
    FLY_MACHINE="$1"
    shift
    ;;
esac
# shellcheck source=fly-lib.sh
. "$HERE/fly-lib.sh"
DOCKER="$HERE/fly-docker.sh"

# Closes fly-docker.sh's shared SSH connection, before the machine stops, restarts or goes.
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

# Prints its CPU kind, CPUs and memory in MB, e.g. "performance 16 32768".
machine_size() {
  fly machine list -a "$APP" --json | jq -r --arg id "$ID" '.[] | select(.id == $id) | .config.guest | "\(.cpu_kind) \(.cpus) \(.memory_mb)"'
}

create() {
  local region="${FLY_REGION:-iad}" volume_gb=80 cpus="${FLYIO_INSTANCE_SIZE:-2}" volume vol
  while [ $# -gt 0 ]; do
    case "$1" in
      --region) region="${2:?--region needs a value}"; shift 2 ;;
      --volume-gb) volume_gb="${2:?--volume-gb needs a value}"; shift 2 ;;
      --cpus) cpus="${2:?--cpus needs a value}"; shift 2 ;;
      *) die "unknown option '$1'" ;;
    esac
  done
  [[ "$volume_gb" =~ ^[1-9][0-9]*$ ]] || die "--volume-gb must be a whole number, got '$volume_gb'"
  [[ "$cpus" =~ ^[1-9][0-9]*$ ]] || die "--cpus must be a whole number, got '$cpus'"
  # Volume names allow only letters, digits and underscores.
  volume="docker_$(printf '%s' "$MACHINE" | tr -c 'a-zA-Z0-9_' '_')"

  if ! fly status -a "$APP" >/dev/null 2>&1; then
    fly apps create "$APP" --org "${FLY_ORG:-personal}" >/dev/null
    echo "created app $APP"
  fi
  [ -z "$(fly machine list -a "$APP" --json | jq -r --arg m "$MACHINE" '.[] | select(.name == $m) | .id')" ] \
    || die "Fly app $APP already has a machine named $MACHINE"

  vol=$(fly volumes create "$volume" -a "$APP" --region "$region" --size "$volume_gb" --require-unique-zone=false --yes --json | jq -r .id)
  echo "created volume $vol ($volume, ${volume_gb} GB, $region)"

  # DOCKER_TLS_CERTDIR empty: dind serves only its Unix socket, which fly-docker.sh uses over SSH.
  if ! fly machine run docker:dind -a "$APP" --name "$MACHINE" --region "$region" \
    --vm-size "performance-${cpus}x" --vm-memory $((cpus * 2048)) \
    --volume "$vol:/var/lib/docker" --env DOCKER_TLS_CERTDIR= \
    --restart always --detach >/dev/null; then
    fly volumes destroy "$vol" -a "$APP" --yes >/dev/null 2>&1 || true
    die "couldn't create the machine; removed volume $vol"
  fi

  resolve_machine
  fly machine wait "$ID" -a "$APP" --state started -w 120s >/dev/null || die "$ID didn't start"
  wait_ready
  echo "$MACHINE ($ID) created, performance-${cpus}x. Use it with FLY_MACHINE=$MACHINE"
}

if [ "$CMD" = create ]; then
  create "$@"
  exit 0
fi

resolve_machine
case "$CMD" in
  start)
    # The repo root's .env, which Bun loads for thunderjar.config.ts, sets it too.
    if [ -z "${FLYIO_INSTANCE_SIZE:-}" ] && [ -f "$HERE/../.env" ]; then
      FLYIO_INSTANCE_SIZE=$(sed -n 's/^FLYIO_INSTANCE_SIZE=//p' "$HERE/../.env" | tail -n 1 | tr -d "\"' \r")
    fi
    cpus="${1:-${FLYIO_INSTANCE_SIZE:-}}"
    case "$STATE" in stopping | suspending) fly machine wait "$ID" -a "$APP" --state stopped -w 90s >/dev/null 2>&1 || true ;; esac
    if [ -n "$cpus" ]; then
      [[ "$cpus" =~ ^[1-9][0-9]*$ ]] || die "cpus must be a whole number, got '$cpus'"
    fi
    # Resizing restarts it, so only when its size differs.
    if [ -n "$cpus" ] && [ "$(machine_size)" != "performance $cpus $((cpus * 2048))" ]; then
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
  destroy)
    volumes=$(fly machine list -a "$APP" --json | jq -r --arg id "$ID" '.[] | select(.id == $id) | .config.mounts // [] | .[].volume')
    disconnect
    fly machine destroy "$ID" -a "$APP" --force >/dev/null
    echo "destroyed machine $MACHINE ($ID)"
    for vol in $volumes; do
      fly volumes destroy "$vol" -a "$APP" --yes >/dev/null
      echo "destroyed volume $vol"
    done
    rm -rf "$DIR"
    ;;
  *) die "expected create, start, stop, prune, status or destroy, got '$CMD'" ;;
esac
