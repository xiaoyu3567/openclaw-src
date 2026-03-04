#!/usr/bin/env bash

set -euo pipefail

RAW_BRANCH="main"

resolve_raw_branch_from_args() {
  local prev=""
  for arg in "$@"; do
    if [ "$prev" = "--branch" ]; then
      RAW_BRANCH="$arg"
      return
    fi
    prev="$arg"
  done
}

usage() {
  cat <<'USAGE'
Usage: install-custom.sh [options]

This entry script auto-detects your OS and dispatches to:
  - macOS: install-custom-macos.sh
  - Linux: install-custom-linux.sh

Options are passed through unchanged.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

os="$(uname -s 2>/dev/null || echo unknown)"
case "$os" in
  Darwin)
    target="install-custom-macos.sh"
    ;;
  Linux)
    target="install-custom-linux.sh"
    ;;
  *)
    printf "Error: unsupported OS: %s\n" "$os" >&2
    printf "Supported: macOS (Darwin), Linux\n" >&2
    exit 1
    ;;
esac

resolve_raw_branch_from_args "$@"
REPO_RAW_BASE="https://raw.githubusercontent.com/xiaoyu3567/openclaw-src/${RAW_BRANCH}/scripts"

printf "Detected OS: %s, dispatching to %s (branch: %s) ...\n" "$os" "$target" "$RAW_BRANCH"

if ! command -v curl >/dev/null 2>&1; then
  printf "Error: curl is required but not found.\n" >&2
  exit 1
fi

exec bash <(curl -fsSL "$REPO_RAW_BASE/$target") "$@"
