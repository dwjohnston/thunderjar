# shellcheck shell=bash
# Source this file (do not execute it): `source scripts/gauntlet/env.sh`
# Maps the owner's variable names onto the names Thunderjar's config and harnesses read.
# Only sets a target when it is unset and the source is set. Prints nothing. Never run with `set -x`.
#
#   THUNDERJAR_DB_CONNECTION -> THUNDERJAR_DB_URL   (thunderjar.config.ts: postgresStore urlEnv)
#   FLYIO_TOKEN              -> FLY_API_TOKEN       (flyctl; fly-*.sh also read FLYIO_TOKEN)
#   OPENROUTER_TOKEN         -> OPENROUTER_API_KEY  (harnesses)
#   THUNDERJAR_ANTHROPIC_API_KEY -> ANTHROPIC_API_KEY (claude-code harness)
#   GHCR_TOKEN / GHCR_USER   -> used by bootstrap.sh for `docker login ghcr.io`
# Also sets THUNDERJAR_REMOTE=1 and, if a local dockerd was started by bootstrap.sh, nothing else:
# DOCKER_HOST is left alone (the default socket /var/run/docker.sock is used).

[ -z "${THUNDERJAR_DB_URL:-}" ] && [ -n "${THUNDERJAR_DB_CONNECTION:-}" ] && export THUNDERJAR_DB_URL="$THUNDERJAR_DB_CONNECTION"
[ -z "${OPENROUTER_API_KEY:-}" ] && [ -n "${OPENROUTER_TOKEN:-}" ] && export OPENROUTER_API_KEY="$OPENROUTER_TOKEN"
[ -z "${FLY_API_TOKEN:-}" ] && [ -n "${FLYIO_TOKEN:-}" ] && export FLY_API_TOKEN="$FLYIO_TOKEN"
[ -z "${ANTHROPIC_API_KEY:-}" ] && [ -n "${THUNDERJAR_ANTHROPIC_API_KEY:-}" ] && export ANTHROPIC_API_KEY="$THUNDERJAR_ANTHROPIC_API_KEY"
export THUNDERJAR_REMOTE=1
case ":$PATH:" in *":$HOME/.fly/bin:"*) ;; *) export PATH="$HOME/.fly/bin:$PATH" ;; esac
true
