#!/bin/sh
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Session Id: session_01LCLeLkjATuQXxaawiKKoPy
# Supervising engineer: David Johnston
#
# Humans: add your notes here

# The main process of the Fly machine in app thunderjar-runtime-dwj: starts its Docker daemon, then
# stops the machine once it has been idle for a while. fly-runtime.sh installs it, as the machine's
# entrypoint, with the restart policy on-failure: when this exits 0 the machine stops and stays
# stopped, and if the daemon dies this exits 1 and Fly restarts the machine.
#
# Idle means: no execution's lease newer than LEASE_HOURS, no running container, and no Docker
# event, e.g. a pull, push or build step, since the last check. The idle period is the number of
# minutes in $STATE/idle-minutes, written by fly-runtime.sh up (60 if there's none). It counts from
# the last time the machine was busy, the machine starting, or fly-runtime.sh touching
# $STATE/last-active, whichever is latest.
#
# Nothing here needs a Fly token: the machine stops because its main process ends.

STATE=/var/lib/docker/.thunderjar
LEASES="$STATE/leases"
LEASE_HOURS=6
TICK=30

say() { echo "thunderjar-idle: $*" | tee -a "$STATE/watchdog.log"; }

mkdir -p "$LEASES"
dockerd-entrypoint.sh "$@" &
DOCKERD=$!

stop_daemon() {
  kill -TERM "$DOCKERD" 2>/dev/null
  wait "$DOCKERD"
}
# `fly machine stop` signals this process: pass it on, so the daemon shuts down cleanly.
trap 'say "signalled: stopping the Docker daemon"; stop_daemon; exit 0' INT TERM

last_active=$(date +%s)
checked=$last_active
say "started; idle period $(cat "$STATE/idle-minutes" 2>/dev/null || echo 60) minutes"
while :; do
  sleep "$TICK" &
  wait $!
  if ! kill -0 "$DOCKERD" 2>/dev/null; then
    say "the Docker daemon exited: exiting 1, so Fly restarts the machine"
    exit 1
  fi
  now=$(date +%s)
  why=""
  [ -n "$(find "$LEASES" -type f -mmin -$((LEASE_HOURS * 60)) 2>/dev/null | head -n 1)" ] && why="a lease"
  [ -z "$why" ] && [ -n "$(docker ps -q 2>/dev/null | head -n 1)" ] && why="a running container"
  [ -z "$why" ] && [ -n "$(docker events --since "$checked" --until "$now" 2>/dev/null | head -n 1)" ] && why="Docker activity"
  checked=$now
  if [ -n "$why" ]; then
    last_active=$now
    continue
  fi
  touched=$(stat -c %Y "$STATE/last-active" 2>/dev/null || echo 0)
  [ "$touched" -gt "$last_active" ] && last_active=$touched
  minutes=$(cat "$STATE/idle-minutes" 2>/dev/null)
  case "$minutes" in '' | *[!0-9]*) minutes=60 ;; esac
  if [ $((now - last_active)) -ge $((minutes * 60)) ]; then
    say "idle for $(((now - last_active) / 60)) minutes, the limit is $minutes: stopping the machine"
    stop_daemon
    exit 0
  fi
done
