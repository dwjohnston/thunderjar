#!/usr/bin/env bash
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Session Id: session_01LCLeLkjATuQXxaawiKKoPy
# Supervising engineer: Claude
#
# Humans: add your notes here

# `docker`, on the Fly machine's daemon, for THUNDERJAR_DOCKER: what env.sh points Thunderjar's
# local Docker commands at when this container can't build (see env.sh). Everything goes to
# .thunderjar/fly-docker.sh unchanged, except `build`, which is given `--network host`.
#
# Why: a build's RUN steps on that machine get Fly's resolver, `nameserver fdaa::3`, which the
# build's bridge network can't reach, so the first download fails after a minute with
# `getaddrinfo EAI_AGAIN registry.npmjs.org`. Containers started with `docker run` are fine.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ "${1:-}" = build ]; then
  shift
  exec "$ROOT/.thunderjar/fly-docker.sh" build --network host "$@"
fi
exec "$ROOT/.thunderjar/fly-docker.sh" "$@"
