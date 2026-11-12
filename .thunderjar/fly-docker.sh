#!/usr/bin/env bash
# Runs `docker` against the Docker daemon on the Fly machine in app $FLY_APP (default
# thunderjar-runtime-dwj), for thunderjar.config.ts's remote runtime.
#
# Docker reaches it as an ssh:// host, so each command opens SSH sessions to it.
# They all share one SSH connection, kept open in the background (OpenSSH's
# ControlMaster), so a command takes well under a second. Opening a new
# `fly ssh console` for each session instead took about 10 seconds a command.
#
# The connection is OpenSSH's, logged in with a certificate from `fly ssh issue`,
# and reaches the machine's SSH server through `fly ssh console` running `nc`
# there. It's opened by the first command that needs it, starting the machine if
# it's stopped. fly-runtime.sh closes it. If it drops mid-run, each command
# connects on its own, slowly, until the next one reopens it. Needs FLYIO_TOKEN.
set -euo pipefail

APP="${FLY_APP:-thunderjar-runtime-dwj}"
ORG="${FLY_ORG:-personal}"
HOST=tjfly
export FLY_API_TOKEN="${FLY_API_TOKEN:-${FLYIO_TOKEN:?FLYIO_TOKEN is not set}}"

# Short, because the control socket's path must fit in a Unix socket address.
# fly-runtime.sh uses the same path to close the connection.
DIR="/tmp/tjfly-$APP"
CONFIG="$DIR/ssh_config"
REAL_SSH="$(command -v ssh)"

die() { echo "fly-docker: $*" >&2; exit 1; }

# The SSH config and certificate, and a stand-in `ssh` that uses them. Docker runs
# `ssh`, from this script's PATH only.
setup() {
  mkdir -p "$DIR/bin"
  # Certificates last 24 hours: get a new one after 20.
  if [ ! -f "$DIR/key-cert.pub" ] || [ -n "$(find "$DIR/key-cert.pub" -mmin +1200)" ]; then
    fly ssh issue "$ORG" "$DIR/key" --hours 24 --overwrite >/dev/null 2>&1 || die "fly ssh issue failed"
  fi
  cat >"$CONFIG" <<EOF
Host $HOST
  User root
  IdentityFile $DIR/key
  CertificateFile $DIR/key-cert.pub
  IdentitiesOnly yes
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  LogLevel ERROR
  ControlPath $DIR/ctl
  ControlMaster no
  ServerAliveInterval 15
  ServerAliveCountMax 3
  ProxyCommand fly ssh console -a $APP -q -C 'sh -c "exec nc \$FLY_PRIVATE_IP 22"'
EOF
  printf '#!/usr/bin/env bash\nexec %q -F %q "$@"\n' "$REAL_SSH" "$CONFIG" >"$DIR/bin/ssh"
  chmod +x "$DIR/bin/ssh"
}

connected() { "$REAL_SSH" -F "$CONFIG" -O check "$HOST" >/dev/null 2>&1; }

# Opens the shared connection in the background, detached from this script's
# output, so whatever ran this isn't left waiting on it.
open_connection() {
  timeout 40 "$REAL_SSH" -F "$CONFIG" -o ControlMaster=yes -o ConnectTimeout=20 -fN "$HOST" </dev/null >/dev/null 2>&1 9>&-
}

# Starts the machine if it isn't running, first waiting for it to finish stopping if it's doing that.
start_machine() {
  local id state
  read -r id state < <(fly machine list -a "$APP" --json | jq -r '.[0] | [.id, .state] | @tsv')
  [ -n "${id:-}" ] && [ "$id" != null ] || die "Fly app $APP has no machine"
  [ "$state" = started ] && return
  case "$state" in stopping | suspending) fly machine wait "$id" -a "$APP" --state stopped -w 90s >/dev/null 2>&1 || true ;; esac
  fly machine start -a "$APP" "$id" >/dev/null 2>&1 || true
  fly machine wait "$id" -a "$APP" --state started -w 90s >/dev/null 2>&1 || die "the Fly machine in app $APP didn't start"
}

# Several commands start at once at the beginning of a run: one sets up, the rest wait.
mkdir -p "$DIR"
exec 9>"$DIR/lock"
flock 9
if ! connected; then
  setup
  if ! open_connection; then
    start_machine
    # Its SSH server can take a few seconds to come up after the machine starts.
    for _ in 1 2 3 4 5; do open_connection && break; sleep 3; done
    connected || die "can't connect to the Fly machine in app $APP"
  fi
fi
flock -u 9
exec 9>&-

export PATH="$DIR/bin:$PATH"
exec docker -H "ssh://$HOST" "$@"
