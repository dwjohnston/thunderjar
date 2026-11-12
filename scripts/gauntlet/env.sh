# shellcheck shell=bash
# Source this file (do not execute it): `source scripts/gauntlet/env.sh`
# Maps the owner's variable names onto the names Thunderjar's config and harnesses read.
# Only sets a target when it is unset and the source is set. Prints nothing. Never run with `set -x`.
#
#   THUNDERJAR_DB_CONNECTION -> THUNDERJAR_DB_URL   (thunderjar.config.ts: postgresStore urlEnv)
#   FLYIO_TOKEN              -> FLY_API_TOKEN       (flyctl; fly-*.sh also read FLYIO_TOKEN)
#   OPENROUTER_TOKEN         -> OPENROUTER_API_KEY  (harnesses)
#   GHCR_TOKEN / GHCR_USER   -> used by bootstrap.sh for `docker login ghcr.io`
# Also sets THUNDERJAR_REMOTE=1, THUNDERJAR_RUN_DATA and THUNDERJAR_GAUNTLET_PAIRS (below) and, if a local dockerd was started by bootstrap.sh, nothing else:
# DOCKER_HOST is left alone (the default socket /var/run/docker.sock is used).

[ -z "${THUNDERJAR_DB_URL:-}" ] && [ -n "${THUNDERJAR_DB_CONNECTION:-}" ] && export THUNDERJAR_DB_URL="$THUNDERJAR_DB_CONNECTION"
[ -z "${OPENROUTER_API_KEY:-}" ] && [ -n "${OPENROUTER_TOKEN:-}" ] && export OPENROUTER_API_KEY="$OPENROUTER_TOKEN"
[ -z "${FLY_API_TOKEN:-}" ] && [ -n "${FLYIO_TOKEN:-}" ] && export FLY_API_TOKEN="$FLYIO_TOKEN"
export THUNDERJAR_REMOTE=1
# This sandbox's egress proxy only carries HTTPS, so Supabase's Postgres (raw TCP) is unreachable:
# record run data in the local SQLite file instead. Set THUNDERJAR_RUN_DATA=postgres to use Supabase.
[ -z "${THUNDERJAR_RUN_DATA:-}" ] && export THUNDERJAR_RUN_DATA=sqlite
# Build prerun images on the Fly machine's daemon, not the local one: this sandbox's egress proxy
# re-signs TLS, and build steps (npm, git) don't trust its CA. It also leaves the prerun images
# where the containers run. Docker's client still uses this machine's `docker login`.
[ -z "${THUNDERJAR_DOCKER:-}" ] && export THUNDERJAR_DOCKER="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.thunderjar/fly-docker.sh"
# Without ANTHROPIC_API_KEY, gauntlet test cases run only their OpenRouter pairs (Copilot, OpenCode).
[ -z "${THUNDERJAR_GAUNTLET_PAIRS:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && export THUNDERJAR_GAUNTLET_PAIRS=openrouter
case ":$PATH:" in *":$HOME/.fly/bin:"*) ;; *) export PATH="$HOME/.fly/bin:$PATH" ;; esac
true
