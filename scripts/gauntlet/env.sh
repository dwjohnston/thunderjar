# shellcheck shell=bash
# Source this file (do not execute it): `source scripts/gauntlet/env.sh`
# Maps the owner's variable names onto the names Thunderjar's config and harnesses read.
# Only sets a target when it is unset and the source is set. Prints nothing. Never run with `set -x`.
#
#   THUNDERJAR_DB_CONNECTION -> THUNDERJAR_DB_URL   (thunderjar.config.ts: postgresStore urlEnv)
#   FLYIO_TOKEN              -> FLY_API_TOKEN       (flyctl; fly-*.sh also read FLYIO_TOKEN)
#   OPENROUTER_TOKEN         -> OPENROUTER_API_KEY  (harnesses)
#   AAK                      -> ANTHROPIC_API_KEY   (Claude Code harness; cloud sessions filter the real name)
#   GHCR_TOKEN / GHCR_USER   -> used by bootstrap.sh for `docker login ghcr.io`
#
# Builds: in a cloud container whose egress proxy re-terminates TLS (/root/.ccr/ca-bundle.crt
# exists), a local `docker build` fails at its first download: the build's RUN steps don't trust
# the proxy's CA (npm: SELF_SIGNED_CERT_IN_CHAIN). So there THUNDERJAR_DOCKER is pointed at
# runtime-build-docker.sh, and prerun images are built on, and pushed from, the Fly machine.
# Set GAUNTLET_BUILD_ON_RUNTIME=0 to build on the local daemon anyway, or =1 to force it.
# Also sets THUNDERJAR_REMOTE=1 and, if a local dockerd was started by bootstrap.sh, nothing else:
# DOCKER_HOST is left alone (the default socket /var/run/docker.sock is used).

[ -z "${THUNDERJAR_DB_URL:-}" ] && [ -n "${THUNDERJAR_DB_CONNECTION:-}" ] && export THUNDERJAR_DB_URL="$THUNDERJAR_DB_CONNECTION"
[ -z "${OPENROUTER_API_KEY:-}" ] && [ -n "${OPENROUTER_TOKEN:-}" ] && export OPENROUTER_API_KEY="$OPENROUTER_TOKEN"
[ -z "${FLY_API_TOKEN:-}" ] && [ -n "${FLYIO_TOKEN:-}" ] && export FLY_API_TOKEN="$FLYIO_TOKEN"
[ -z "${ANTHROPIC_API_KEY:-}" ] && [ -n "${AAK:-}" ] && export ANTHROPIC_API_KEY="$AAK"
export THUNDERJAR_REMOTE=1
_gauntlet_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -z "${THUNDERJAR_DOCKER:-}" ]; then
  case "${GAUNTLET_BUILD_ON_RUNTIME:-auto}" in
    1) export THUNDERJAR_DOCKER="$_gauntlet_root/scripts/gauntlet/runtime-build-docker.sh" ;;
    auto) [ -f /root/.ccr/ca-bundle.crt ] && export THUNDERJAR_DOCKER="$_gauntlet_root/scripts/gauntlet/runtime-build-docker.sh" ;;
  esac
fi
unset _gauntlet_root
case ":$PATH:" in *":$HOME/.fly/bin:"*) ;; *) export PATH="$HOME/.fly/bin:$PATH" ;; esac
true
