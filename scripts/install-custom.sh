#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/xiaoyu3567/openclaw-src"
BRANCH="main"
SCOPE="ui"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
REPO_DIR="$WORKSPACE/openclaw-src"

usage() {
  cat <<'EOF'
Usage: install-custom.sh [options]

Options:
  --branch <name>      Branch to deploy (default: main)
  --scope <ui|full>    Deploy scope (default: ui)
  --repo <url>         Repo URL (default: https://github.com/xiaoyu3567/openclaw-src)
  -h, --help           Show help
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Error: required command not found: %s\n" "$1" >&2
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH=${2:-}
      shift 2
      ;;
    --scope)
      SCOPE=${2:-}
      shift 2
      ;;
    --repo)
      REPO_URL=${2:-}
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

printf "[1/5] Checking base tools...\n"
require_cmd curl
require_cmd git
require_cmd node

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    printf "pnpm not found, installing via corepack...\n"
    corepack enable
    corepack prepare pnpm@latest --activate
  fi
fi
require_cmd pnpm

printf "[2/5] Ensuring OpenClaw is installed...\n"
if ! command -v openclaw >/dev/null 2>&1; then
  curl -fsSL https://openclaw.ai/install.sh | bash
fi
require_cmd openclaw

printf "[3/5] Preparing repository...\n"
mkdir -p "$WORKSPACE"
if [ -d "$REPO_DIR/.git" ]; then
  printf "Repo exists: %s\n" "$REPO_DIR"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"
fi

printf "[4/5] Installing dependencies...\n"
cd "$REPO_DIR"
pnpm install

printf "[5/5] Running deploy assistant...\n"
ACTION="deploy-recommended"
if [ "$SCOPE" = "full" ]; then
  ACTION="deploy-full"
fi
node scripts/deploy-assistant.mjs --action "$ACTION" --yes --branch "$BRANCH"

printf "\nDone. openclaw-src deployment completed.\n"
