#!/usr/bin/env bash
# Gauntlet bootstrap: makes this (ephemeral) cloud container ready to run Thunderjar remotely.
# Idempotent. Safe to re-run. Never prints, logs or writes secret values.
#
#   scripts/gauntlet/bootstrap.sh              install tools, start Docker, log in to ghcr, preflight
#   source scripts/gauntlet/env.sh             then, in your shell: map the env var names
#   scripts/gauntlet/bootstrap.sh run <args>   exec `bun src/cli/index.ts <args>` with the mapped env
#   scripts/gauntlet/bootstrap.sh preflight    only the preflight
#
# Exit status is non-zero if a required tool or variable is missing.
set +x
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRATCH="${GAUNTLET_SCRATCH:-${TMPDIR:-/tmp}/gauntlet}"
mkdir -p "$SCRATCH"
DOCKERD_LOG="$SCRATCH/dockerd.log"
CA_BUNDLE="${SSL_CERT_FILE:-/root/.ccr/ca-bundle.crt}"

say() { printf '[gauntlet] %s\n' "$*" >&2; }

# shellcheck source=env.sh
source "$ROOT/scripts/gauntlet/env.sh"

SUDO=""
[ "$(id -u)" = 0 ] || SUDO="sudo"

apt_install() {
  export DEBIAN_FRONTEND=noninteractive
  $SUDO apt-get install -y --no-install-recommends "$@" >"$SCRATCH/apt.log" 2>&1 ||
    { $SUDO apt-get update >>"$SCRATCH/apt.log" 2>&1 && $SUDO apt-get install -y --no-install-recommends "$@" >>"$SCRATCH/apt.log" 2>&1; }
}

install_tools() {
  local pkgs=()
  command -v ssh >/dev/null || pkgs+=(openssh-client)
  command -v jq >/dev/null || pkgs+=(jq)
  command -v flock >/dev/null || pkgs+=(util-linux)
  command -v nc >/dev/null || pkgs+=(netcat-openbsd)
  command -v curl >/dev/null || pkgs+=(curl ca-certificates)
  if [ "${#pkgs[@]}" -gt 0 ]; then
    say "apt install: ${pkgs[*]}"
    apt_install "${pkgs[@]}" || say "apt install failed, see $SCRATCH/apt.log"
  fi
  if ! command -v fly >/dev/null; then
    say "installing flyctl"
    # fly.io's installer; TLS is verified using the proxy CA bundle.
    if curl -fsSL --cacert "$CA_BUNDLE" https://fly.io/install.sh -o "$SCRATCH/fly-install.sh" &&
      FLYCTL_INSTALL="$HOME/.fly" sh "$SCRATCH/fly-install.sh" >"$SCRATCH/fly-install.log" 2>&1; then
      :
    else
      say "flyctl install failed, see $SCRATCH/fly-install.log"
    fi
    [ -x "$HOME/.fly/bin/flyctl" ] && ln -sf "$HOME/.fly/bin/flyctl" /usr/local/bin/fly 2>/dev/null
    [ -x "$HOME/.fly/bin/flyctl" ] && ! command -v fly >/dev/null && ln -sf "$HOME/.fly/bin/flyctl" "$HOME/.fly/bin/fly"
  fi
  command -v bun >/dev/null || say "bun is missing (install from https://bun.sh)"
  [ -d "$ROOT/node_modules" ] || (cd "$ROOT" && bun install >"$SCRATCH/bun-install.log" 2>&1) || say "bun install failed"
}

docker_up() { docker info >/dev/null 2>&1; }

start_docker() {
  if docker_up; then say "docker daemon already running"; return 0; fi
  command -v dockerd >/dev/null || { say "dockerd not installed"; return 1; }
  # dockerd's own proxy settings: it pulls images through the egress proxy and must trust its CA.
  local envs=(env)
  [ -n "${HTTPS_PROXY:-}" ] && envs+=("HTTPS_PROXY=$HTTPS_PROXY" "https_proxy=$HTTPS_PROXY")
  [ -n "${NO_PROXY:-}" ] && envs+=("NO_PROXY=$NO_PROXY")
  [ -f "$CA_BUNDLE" ] && envs+=("SSL_CERT_FILE=$CA_BUNDLE")
  # Variants, least to most degraded.
  local variants=(
    ""
    "--storage-driver=vfs"
    "--iptables=false --ip6tables=false"
    "--storage-driver=vfs --iptables=false --ip6tables=false"
    "--storage-driver=vfs --iptables=false --ip6tables=false --bridge=none"
  )
  local v
  : >"$DOCKERD_LOG"
  for v in "${variants[@]}"; do
    say "trying dockerd ${v:-(plain)}"
    printf '\n===== dockerd %s =====\n' "${v:-plain}" >>"$DOCKERD_LOG"
    # shellcheck disable=SC2086
    nohup "${envs[@]}" dockerd $v >>"$DOCKERD_LOG" 2>&1 &
    local pid=$!
    local i
    for i in $(seq 1 20); do
      docker_up && { say "dockerd up with: ${v:-plain} (pid $pid)"; echo "${v:-plain}" >"$SCRATCH/dockerd.variant"; return 0; }
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    say "failed; last error: $(grep -E 'level=(error|fatal)|failed|error' "$DOCKERD_LOG" | tail -1 | cut -c1-300)"
  done
  say "dockerd could not start; full log: $DOCKERD_LOG"
  return 1
}

ghcr_login() {
  if [ -n "${GHCR_USER:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
    if docker_up; then
      printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null 2>"$SCRATCH/docker-login.err" &&
        say "docker login ghcr.io ok" || say "docker login ghcr.io failed (see $SCRATCH/docker-login.err)"
    else
      say "no local docker daemon: skipping docker login ghcr.io"
    fi
  else
    say "GHCR_USER/GHCR_TOKEN not both set: skipping docker login"
  fi
}

# Names only.
preflight() {
  local missing=0 n
  say "preflight (names only)"
  for n in fly ssh jq flock nc docker bun; do
    if command -v "$n" >/dev/null; then echo "  ok       tool $n"; else echo "  MISSING  tool $n"; missing=1; fi
  done
  for n in FLYIO_TOKEN THUNDERJAR_DB_CONNECTION OPENROUTER_TOKEN ANTHROPIC_API_KEY GHCR_USER GHCR_TOKEN; do
    if [ -n "${!n:-}" ]; then echo "  ok       var  $n"; else echo "  MISSING  var  $n"; missing=1; fi
  done
  for n in THUNDERJAR_DB_URL OPENROUTER_API_KEY FLY_API_TOKEN; do
    if [ -n "${!n:-}" ]; then echo "  ok       mapped $n"; else echo "  MISSING  mapped $n"; missing=1; fi
  done
  if docker_up; then echo "  ok       local docker daemon"; else echo "  info     local docker daemon not running (builds then need another daemon)"; fi
  [ "$missing" = 0 ] && say "preflight passed" || say "preflight FAILED"
  return "$missing"
}

case "${1:-all}" in
  all)
    install_tools
    start_docker || true
    ghcr_login
    preflight
    ;;
  preflight) preflight ;;
  run)
    shift
    cd "$ROOT" && exec bun src/cli/index.ts "$@"
    ;;
  *) echo "usage: bootstrap.sh [all|preflight|run <thunderjar args>]" >&2; exit 2 ;;
esac
