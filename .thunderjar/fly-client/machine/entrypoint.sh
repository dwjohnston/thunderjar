#!/bin/sh
# 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
# Supervising engineer: David Johnston. Humans: add your notes here.
#
# The machine's main process: runs the Docker daemon, and exits once the machine has been idle for
# FLY_SLEEP_MINUTES. Its restart policy is "no", so Fly then stops the machine.
#
# The backstop for when the client that would stop it has gone away, e.g. a closed laptop or a
# finished CI job. It never destroys the machine: a stopped one only costs its volume.
#
# Idle: no running containers, and no SSH sessions, i.e. no process run through Fly's SSH server,
# hallpass, other than the `nc` a client's shared connection goes through. Without hallpass in
# sight, any `docker system dial-stdio` counts as a session.
set -u

SLEEP_SECONDS=$(( ${FLY_SLEEP_MINUTES:-30} * 60 ))
CHECK_SECONDS=30

dockerd-entrypoint.sh dockerd &
DOCKERD=$!

stop_dockerd() {
  kill -TERM "$DOCKERD" 2>/dev/null
  wait "$DOCKERD" 2>/dev/null
}
trap 'stop_dockerd; exit 0' TERM INT

sessions() {
  hallpass=$(pidof hallpass 2>/dev/null | cut -d' ' -f1)
  count=0
  for dir in /proc/[0-9]*; do
    if [ -n "$hallpass" ]; then
      ppid=$(awk '/^PPid:/ { print $2 }' "$dir/status" 2>/dev/null)
      [ "$ppid" = "$hallpass" ] || continue
      [ "$(cat "$dir/comm" 2>/dev/null)" = nc ] && continue
      count=$((count + 1))
    elif tr '\0' ' ' <"$dir/cmdline" 2>/dev/null | grep -q 'system dial-stdio'; then
      count=$((count + 1))
    fi
  done
  echo "$count"
}

running_containers() {
  docker ps --quiet 2>/dev/null | wc -l
}

idle_since=$(date +%s)
while kill -0 "$DOCKERD" 2>/dev/null; do
  sleep "$CHECK_SECONDS"
  now=$(date +%s)
  if [ "$(sessions)" -gt 0 ] || [ "$(running_containers)" -gt 0 ]; then
    idle_since=$now
  elif [ $((now - idle_since)) -ge "$SLEEP_SECONDS" ]; then
    echo "watchdog: idle for ${FLY_SLEEP_MINUTES:-30} minutes, stopping the machine"
    stop_dockerd
    exit 0
  fi
done

echo "watchdog: dockerd exited"
exit 1
