#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BACKUP_ROOT_DEFAULT="${HOME}/.openclaw/deploy-backups"

BACKUP_ID=""
PORT=18789

usage() {
  cat <<'EOF'
Usage: scripts/rollback.sh --id <backup-id> [options]

Options:
  --id <backup-id>   Backup id (required)
  --port <n>         Gateway HTTP check port (default: 18789)
  -h, --help         Show help
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Error: required command not found: %s\n" "$1" >&2
    exit 1
  fi
}

resolve_openclaw_root() {
  local bin real
  bin=$(command -v openclaw)
  real=$(node -e 'const fs=require("fs"); console.log(fs.realpathSync(process.argv[1]));' "$bin" 2>/dev/null || true)
  if [ -n "$real" ] && [[ "$real" == */dist/index.js ]]; then
    printf "%s\n" "${real%/dist/index.js}"
    return
  fi

  local npm_root
  npm_root=$(npm root -g 2>/dev/null || true)
  if [ -n "$npm_root" ] && [ -d "$npm_root/openclaw/dist" ]; then
    printf "%s\n" "$npm_root/openclaw"
    return
  fi

  printf "Error: unable to resolve global openclaw install root\n" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id)
      BACKUP_ID=${2:-}
      shift 2
      ;;
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

if [ -z "$BACKUP_ID" ]; then
  printf "Error: --id is required\n" >&2
  usage
  exit 1
fi

require_cmd node
require_cmd openclaw
require_cmd tar
require_cmd curl

BACKUP_DIR="$BACKUP_ROOT_DEFAULT/$BACKUP_ID"
META_FILE="$BACKUP_DIR/meta.env"
if [ ! -d "$BACKUP_DIR" ] || [ ! -f "$META_FILE" ]; then
  printf "Error: backup not found: %s\n" "$BACKUP_DIR" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$META_FILE"
SCOPE=${scope:-ui}

OPENCLAW_ROOT=$(resolve_openclaw_root)
OPENCLAW_DIST="$OPENCLAW_ROOT/dist"

printf "Restoring backup %s (scope=%s)...\n" "$BACKUP_ID" "$SCOPE"
if [ "$SCOPE" = "ui" ]; then
  ARCHIVE="$BACKUP_DIR/control-ui.tgz"
  [ -f "$ARCHIVE" ] || { printf "Error: missing archive: %s\n" "$ARCHIVE" >&2; exit 1; }
  tar -C "$OPENCLAW_DIST" -xzf "$ARCHIVE"
else
  ARCHIVE="$BACKUP_DIR/dist-full.tgz"
  [ -f "$ARCHIVE" ] || { printf "Error: missing archive: %s\n" "$ARCHIVE" >&2; exit 1; }
  tar -C "$OPENCLAW_ROOT" -xzf "$ARCHIVE"
fi

openclaw gateway restart
openclaw gateway status

if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null; then
  printf "Rollback succeeded and gateway is reachable on port %s.\n" "$PORT"
else
  printf "Rollback completed but gateway HTTP check failed on port %s.\n" "$PORT" >&2
fi
