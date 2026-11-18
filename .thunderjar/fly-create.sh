#!/usr/bin/env bash
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# Creates a Fly machine for remote runs, with a volume for its Docker data, and waits for its
# Docker daemon. Creates the app $FLY_APP first if it doesn't exist. Remove it with fly-destroy.sh.
#
#   fly-create.sh <name> [--region REGION] [--volume-gb GB] [--cpus CPUS]
#
#   name          the machine's name, which FLY_MACHINE picks it by, e.g. dev or ci
#   --region      Fly region, default $FLY_REGION or iad
#   --volume-gb   size of the volume at /var/lib/docker, default 80
#   --cpus        sized performance-<cpus>x with 2 GB a CPU, default $FLYIO_INSTANCE_SIZE or 2
#
# The machine runs docker:dind. fly-docker.sh reaches its daemon over Fly's SSH server.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="${1:-}"
[ -n "$NAME" ] && [ "${NAME#-}" = "$NAME" ] || { echo "usage: ${0##*/} <name> [--region REGION] [--volume-gb GB] [--cpus CPUS]" >&2; exit 1; }
shift
FLY_MACHINE="$NAME"
# shellcheck source=fly-lib.sh
. "$HERE/fly-lib.sh"

REGION="${FLY_REGION:-iad}"
VOLUME_GB=80
CPUS="${FLYIO_INSTANCE_SIZE:-2}"
while [ $# -gt 0 ]; do
  case "$1" in
    --region) REGION="${2:?--region needs a value}"; shift 2 ;;
    --volume-gb) VOLUME_GB="${2:?--volume-gb needs a value}"; shift 2 ;;
    --cpus) CPUS="${2:?--cpus needs a value}"; shift 2 ;;
    *) die "unknown option '$1'" ;;
  esac
done
[[ "$VOLUME_GB" =~ ^[1-9][0-9]*$ ]] || die "--volume-gb must be a whole number, got '$VOLUME_GB'"
[[ "$CPUS" =~ ^[1-9][0-9]*$ ]] || die "--cpus must be a whole number, got '$CPUS'"
# Volume names allow only letters, digits and underscores.
VOLUME="docker_$(printf '%s' "$NAME" | tr -c 'a-zA-Z0-9_' '_')"

if ! fly status -a "$APP" >/dev/null 2>&1; then
  fly apps create "$APP" --org "${FLY_ORG:-personal}" >/dev/null
  echo "created app $APP"
fi

list=$(fly machine list -a "$APP" --json)
[ -z "$(printf '%s' "$list" | jq -r --arg m "$NAME" '.[] | select(.name == $m) | .id')" ] || die "Fly app $APP already has a machine named $NAME"

vol=$(fly volumes create "$VOLUME" -a "$APP" --region "$REGION" --size "$VOLUME_GB" --require-unique-zone=false --yes --json | jq -r .id)
echo "created volume $vol ($VOLUME, ${VOLUME_GB} GB, $REGION)"

# DOCKER_TLS_CERTDIR empty: dind serves only its Unix socket, which fly-docker.sh uses over SSH.
if ! fly machine run docker:dind -a "$APP" --name "$NAME" --region "$REGION" \
  --vm-size "performance-${CPUS}x" --vm-memory $((CPUS * 2048)) \
  --volume "$vol:/var/lib/docker" --env DOCKER_TLS_CERTDIR= \
  --restart always --detach >/dev/null; then
  fly volumes destroy "$vol" -a "$APP" --yes >/dev/null 2>&1 || true
  die "couldn't create the machine; removed volume $vol"
fi

resolve_machine
fly machine wait "$ID" -a "$APP" --state started -w 120s >/dev/null || die "$ID didn't start"
for _ in $(seq 1 40); do
  if "$HERE/fly-docker.sh" version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    echo "$NAME ($ID) created, performance-${CPUS}x. Use it with FLY_MACHINE=$NAME"
    exit 0
  fi
  sleep 3
done
die "$NAME ($ID) was created, but its Docker daemon didn't answer"
