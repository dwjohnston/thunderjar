#!/usr/bin/env bash
# Runs `docker` against the Docker daemon on a Fly machine, for thunderjar.config.ts's remote
# runtime. Which machine: $FLY_APP and $FLY_MACHINE, see fly-lib.sh.
#
# It doesn't start the machine: start it with `fly-machine.sh start` before working, and stop it
# with `fly-machine.sh stop` after. A stopped one fails with a line saying so.
#
# Docker reaches it as an ssh:// host, so each command opens SSH sessions to it.
# They all share one SSH connection, kept open in the background (OpenSSH's
# ControlMaster), so a command takes well under a second. Opening a new
# `fly ssh console` for each session instead took about 10 seconds a command.
#
# The connection is OpenSSH's, logged in with a certificate from `fly ssh issue`,
# and reaches the machine's SSH server through `fly ssh console` running `nc`
# there. It's opened by the first command that needs it. If it drops mid-run,
# each command connects on its own, slowly, until the next one reopens it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=fly-lib.sh
. "$HERE/fly-lib.sh"
ORG="${FLY_ORG:-personal}"
HOST=tjfly
CONFIG="$DIR/ssh_config"
REAL_SSH="$(command -v ssh)"

# The SSH config and certificate, and a stand-in `ssh` that uses them. Docker runs
# `ssh`, from this script's PATH only.
setup() {
  resolve_machine
  [ "$STATE" = started ] || die "the Fly machine ${MACHINE:-$ID} in app $APP is $STATE: start it with .thunderjar/fly-machine.sh start"
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
  ProxyCommand fly ssh console -a $APP --machine $ID -q -C 'sh -c "exec nc \$FLY_PRIVATE_IP 22"'
EOF
  printf '#!/usr/bin/env bash\nexec %q -F %q "$@"\n' "$REAL_SSH" "$CONFIG" >"$DIR/bin/ssh"
  chmod +x "$DIR/bin/ssh"
}

# Its input is closed, so it can never read this script's own, which is for the docker command,
# e.g. what `docker exec --interactive` is sent.
connected() { "$REAL_SSH" -F "$CONFIG" -O check "$HOST" </dev/null >/dev/null 2>&1; }

# Opens the shared connection in the background, detached from this script's
# output, so whatever ran this isn't left waiting on it.
open_connection() {
  timeout 40 "$REAL_SSH" -F "$CONFIG" -o ControlMaster=yes -o ConnectTimeout=20 -fN "$HOST" </dev/null >/dev/null 2>&1 9>&-
}

# Several commands start at once at the beginning of a run: one sets up, the rest wait.
mkdir -p "$DIR"
exec 9>"$DIR/lock"
flock 9
if ! connected; then
  setup
  # Its SSH server can take a few seconds to come up after the machine starts.
  for _ in 1 2 3; do open_connection && break; sleep 3; done
  connected || die "can't connect to the Fly machine ${MACHINE:-$ID} in app $APP"
fi
flock -u 9
exec 9>&-

export PATH="$DIR/bin:$PATH"
# A build on the machine's daemon runs its steps on the host network: on the bridge network they
# can't resolve any name, because the machine's only DNS server, fdaa::3, is IPv6 and the bridge
# has no IPv6 ("wget: bad address 'registry.npmjs.org'"). Containers run on the bridge are given
# public DNS servers instead, so they're fine.
if [ "${1:-}" = build ]; then
  shift
  exec docker -H "ssh://$HOST" build --network host "$@"
fi
exec docker -H "ssh://$HOST" "$@"
