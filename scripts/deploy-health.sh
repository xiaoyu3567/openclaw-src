#!/usr/bin/env bash

set -euo pipefail

PORT=18789

usage() {
  cat <<'EOF'
Usage: scripts/deploy-health.sh [--port <n>]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      PORT=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf "Unknown option: %s\n" "$1" >&2
      usage
      exit 1
      ;;
  esac
done

check_cmd() {
  local cmd=$1
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "[OK] %s\n" "$cmd"
  else
    printf "[FAIL] %s not found\n" "$cmd"
  fi
}

printf "OpenClaw deploy health check\n"
printf "===========================\n"

check_cmd git
check_cmd node
check_cmd pnpm
check_cmd openclaw
check_cmd curl

if openclaw gateway status >/dev/null 2>&1; then
  printf "[OK] gateway status\n"
else
  printf "[WARN] gateway status command reported an issue\n"
fi

if ss -ltn 2>/dev/null | grep -q ":${PORT}"; then
  printf "[OK] port %s is listening\n" "$PORT"
else
  printf "[WARN] port %s is not listening\n" "$PORT"
fi

if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  printf "[OK] http://127.0.0.1:%s/ reachable\n" "$PORT"
else
  printf "[WARN] http://127.0.0.1:%s/ not reachable\n" "$PORT"
fi
