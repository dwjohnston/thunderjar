# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Session Id: session_01LCLeLhah9TqxnEZs1agP1y
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# Shared by fly-docker.sh and fly-machine.sh: which Fly machine they work on.
#
# One app, $FLY_APP (default thunderjar-runtime-dwj), holds a machine for each purpose, e.g. one for
# development and one for CI. $FLY_MACHINE picks one, by name or ID. Unset, the app must have only
# one machine. Needs FLYIO_TOKEN.

APP="${FLY_APP:-thunderjar-runtime-dwj}"
MACHINE="${FLY_MACHINE:-}"
export FLY_API_TOKEN="${FLY_API_TOKEN:-${FLYIO_TOKEN:-}}"

# Short, because the SSH control socket's path inside it must fit in a Unix socket address.
DIR="/tmp/tjfly-$APP-${MACHINE:-default}"

die() { echo "${0##*/}: $*" >&2; exit 1; }
[ -n "$FLY_API_TOKEN" ] || die "FLYIO_TOKEN is not set"

# Sets ID and STATE for the machine: the one named or with the ID $FLY_MACHINE, or the app's only one.
resolve_machine() {
  local list count
  list=$(fly machine list -a "$APP" --json 2>&1) || die "couldn't list the machines of Fly app $APP: $(printf '%s\n' "$list" | tail -n 1)"
  if [ -n "$MACHINE" ]; then
    read -r ID STATE < <(printf '%s' "$list" | jq -r --arg m "$MACHINE" '.[] | select(.name == $m or .id == $m) | [.id, .state] | @tsv' | head -n 1)
    [ -n "${ID:-}" ] || die "Fly app $APP has no machine named $MACHINE"
  else
    count=$(printf '%s' "$list" | jq length)
    [ "$count" = 1 ] || die "Fly app $APP has $count machines: set FLY_MACHINE to one of $(printf '%s' "$list" | jq -r '[.[].name] | join(", ")')"
    read -r ID STATE < <(printf '%s' "$list" | jq -r '.[0] | [.id, .state] | @tsv')
  fi
}
