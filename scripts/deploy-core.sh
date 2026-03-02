#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
BACKUP_ROOT_DEFAULT="${HOME}/.openclaw/deploy-backups"

SCOPE="ui"
BRANCH="main"
ASSUME_YES=0
DRY_RUN=0
SKIP_PULL=0
BACKUP_RETAIN=5
PORT=18789
BACKUP_ID=""
DEPLOY_SUCCEEDED=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy-core.sh [options]

Options:
  --scope <ui|full>        Deploy scope (default: ui)
  --branch <name>          Git branch to pull (default: main)
  --yes                    Skip confirmation prompt
  --dry-run                Print actions without executing
  --skip-pull              Skip git pull --rebase
  --backup-retain <n>      Keep latest N backups (default: 5)
  --port <n>               Gateway health check port (default: 18789)
  -h, --help               Show help
EOF
}

log_section() {
  printf "\n== %s ==\n" "$1"
}

log_step() {
  printf "[%s] %s\n" "$1" "$2"
}

run_cmd() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf "[dry-run] %s\n" "$*"
    return 0
  fi
  "$@"
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

confirm_or_exit() {
  if [ "$ASSUME_YES" -eq 1 ]; then
    return
  fi
  printf "Proceed with %s deploy on branch %s? [y/N]: " "$SCOPE" "$BRANCH"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *)
      printf "Cancelled.\n"
      exit 0
      ;;
  esac
}

trim_backups() {
  local backup_root=$1
  local keep=$2
  [ -d "$backup_root" ] || return 0
  local count=0
  while IFS= read -r path; do
    count=$((count + 1))
    if [ "$count" -le "$keep" ]; then
      continue
    fi
    run_cmd rm -rf "$path"
  done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' | sort -r)
}

on_error() {
  local code=$?
  trap - ERR
  if [ "$DRY_RUN" -eq 0 ] && [ "$DEPLOY_SUCCEEDED" -ne 1 ] && [ -n "$BACKUP_ID" ]; then
    printf "\nDeployment failed. Attempting auto rollback with backup %s...\n" "$BACKUP_ID"
    "$SCRIPT_DIR/rollback.sh" --id "$BACKUP_ID" --port "$PORT" || true
  fi
  exit "$code"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope)
      SCOPE=${2:-}
      shift 2
      ;;
    --branch)
      BRANCH=${2:-}
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --backup-retain)
      BACKUP_RETAIN=${2:-}
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

if [ "$SCOPE" != "ui" ] && [ "$SCOPE" != "full" ]; then
  printf "Error: --scope must be ui or full\n" >&2
  exit 1
fi

trap on_error ERR

log_section "Step 1/7 - Preflight"
require_cmd git
require_cmd node
require_cmd pnpm
require_cmd openclaw
require_cmd curl
require_cmd tar
require_cmd rsync

log_step "OK" "git=$(git --version | awk '{print $3}')"
log_step "OK" "node=$(node -v)"
log_step "OK" "pnpm=$(pnpm -v)"

OPENCLAW_ROOT=$(resolve_openclaw_root)
OPENCLAW_DIST="$OPENCLAW_ROOT/dist"
TARGET_UI="$OPENCLAW_DIST/control-ui"
BACKUP_ROOT="$BACKUP_ROOT_DEFAULT"
mkdir -p "$BACKUP_ROOT"

if [ ! -d "$OPENCLAW_DIST" ]; then
  printf "Error: openclaw dist not found: %s\n" "$OPENCLAW_DIST" >&2
  exit 1
fi

confirm_or_exit

log_section "Step 2/7 - Update source"
cd "$REPO_ROOT"
if [ "$SKIP_PULL" -eq 0 ]; then
  run_cmd git fetch origin "$BRANCH"
  run_cmd git pull --rebase origin "$BRANCH"
else
  log_step "SKIP" "git pull skipped by --skip-pull"
fi

log_section "Step 3/7 - Build"
if [ "$SCOPE" = "ui" ]; then
  run_cmd pnpm ui:build
else
  run_cmd pnpm tsdown
  run_cmd pnpm ui:build
fi

log_section "Step 4/7 - Backup"
BACKUP_ID="backup-$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
run_cmd mkdir -p "$BACKUP_DIR"
printf "scope=%s\ncreated_at=%s\nopenclaw_root=%s\n" "$SCOPE" "$(date -Iseconds)" "$OPENCLAW_ROOT" \
  | { if [ "$DRY_RUN" -eq 1 ]; then cat >/dev/null; else cat >"$BACKUP_DIR/meta.env"; fi; }
if [ "$SCOPE" = "ui" ]; then
  run_cmd tar -C "$OPENCLAW_DIST" -czf "$BACKUP_DIR/control-ui.tgz" control-ui
else
  run_cmd tar -C "$OPENCLAW_ROOT" -czf "$BACKUP_DIR/dist-full.tgz" dist
fi
log_step "OK" "backup_id=$BACKUP_ID"

log_section "Step 5/7 - Deploy"
if [ "$SCOPE" = "ui" ]; then
  run_cmd mkdir -p "$TARGET_UI"
  run_cmd rsync -a --delete "$REPO_ROOT/dist/control-ui/" "$TARGET_UI/"
else
  run_cmd rsync -a --delete "$REPO_ROOT/dist/" "$OPENCLAW_DIST/"
fi

log_section "Step 6/7 - Restart gateway"
run_cmd openclaw gateway restart

log_section "Step 7/7 - Verify"
run_cmd openclaw gateway status
if [ "$DRY_RUN" -eq 0 ]; then
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null; then
    log_step "OK" "http://127.0.0.1:${PORT}/ reachable"
  else
    printf "Warning: gateway HTTP check failed on port %s\n" "$PORT" >&2
  fi
fi

trim_backups "$BACKUP_ROOT" "$BACKUP_RETAIN"
DEPLOY_SUCCEEDED=1

log_section "Done"
printf "Deploy succeeded.\n"
printf "scope=%s\n" "$SCOPE"
printf "backup_id=%s\n" "$BACKUP_ID"
printf "rollback=%s --id %s\n" "$SCRIPT_DIR/rollback.sh" "$BACKUP_ID"
