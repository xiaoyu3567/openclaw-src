#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/xiaoyu3567/openclaw-src"
BRANCH="main"
SCOPE="full"
OPENCLAW_VERSION="2026.2.25"
OPENCLAW_REGISTRY="https://registry.npmmirror.com"
DEFAULT_BASE_URL="https://jp.code.respyun.com/v1"
BASE_URL="${OPENCLAW_SUB2API_BASE_URL:-}"
API_KEY="${OPENCLAW_SUB2API_API_KEY:-}"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
REPO_DIR="$WORKSPACE/openclaw-src"

usage() {
  cat <<'EOF'
Usage: install-custom.sh [options]

Options:
  --branch <name>      Branch to deploy (default: main)
  --scope <ui|full>    Deploy scope (default: full)
  --repo <url>         Repo URL (default: https://github.com/xiaoyu3567/openclaw-src)
  --base-url <url>     sub2api baseUrl (optional, prompts if empty)
  --api-key <key>      sub2api apiKey (optional, prompts if empty)
  -h, --help           Show help
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Error: required command not found: %s\n" "$1" >&2
    exit 1
  fi
}

read_required_from_tty() {
  local prompt=$1
  local value=""

  if [ ! -r /dev/tty ]; then
    printf "Error: interactive input is unavailable. Please pass flags instead.\n" >&2
    exit 1
  fi

  while [ -z "$value" ]; do
    printf "%s" "$prompt" > /dev/tty
    IFS= read -r value < /dev/tty || true
    value=$(printf "%s" "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  done

  printf "%s" "$value"
}

read_with_default_from_tty() {
  local prompt=$1
  local fallback=$2
  local value=""

  if [ ! -r /dev/tty ]; then
    printf "Error: interactive input is unavailable. Please pass flags instead.\n" >&2
    exit 1
  fi

  printf "%s" "$prompt" > /dev/tty
  IFS= read -r value < /dev/tty || true
  value=$(printf "%s" "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -z "$value" ]; then
    value=$fallback
  fi
  printf "%s" "$value"
}

prompt_sub2api_credentials() {
  if [ -z "$BASE_URL" ]; then
    BASE_URL=$(read_with_default_from_tty "请输入 sub2api baseUrl（回车使用默认 ${DEFAULT_BASE_URL}）: " "$DEFAULT_BASE_URL")
  fi
  if [ -z "$API_KEY" ]; then
    API_KEY=$(read_required_from_tty "请输入 sub2api apiKey（可见输入）: ")
  fi
}

uninstall_existing_openclaw() {
  if ! command -v openclaw >/dev/null 2>&1; then
    printf "No existing OpenClaw detected, skip uninstall.\n"
    return
  fi

  printf "Existing OpenClaw detected, uninstalling first...\n"
  openclaw gateway stop >/dev/null 2>&1 || true
  npm uninstall -g openclaw >/dev/null 2>&1 || true
  hash -r 2>/dev/null || true

  if command -v openclaw >/dev/null 2>&1; then
    printf "Error: OpenClaw is still present at %s after uninstall attempt.\n" "$(command -v openclaw)" >&2
    printf "Please remove this installation manually, then rerun this script.\n" >&2
    exit 1
  fi

  printf "OpenClaw uninstall check passed.\n"
}

wait_gateway_status_ready() {
  local attempts=${1:-30}
  local delay_sec=${2:-1}
  local out=""
  local i

  for i in $(seq 1 "$attempts"); do
    out=$(openclaw gateway status 2>&1 || true)
    if printf "%s" "$out" | grep -Eiq "Service unit not found|Service not installed|Could not find service|RPC probe: failed"; then
      sleep "$delay_sec"
      continue
    fi
    if [ -n "$out" ]; then
      printf "%s\n" "$out"
    fi
    return 0
  done

  printf "%s\n" "$out" >&2
  return 1
}

wait_gateway_http_ready() {
  local attempts=${1:-30}
  local delay_sec=${2:-1}
  local i

  for i in $(seq 1 "$attempts"); do
    if curl -fsS "http://127.0.0.1:18789/" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_sec"
  done
  return 1
}

configure_openclaw_models() {
  local provider_json
  provider_json=$(node -e '
const baseUrl = String(process.argv[1] || "").trim().replace(/\/$/, "");
const apiKey = String(process.argv[2] || "").trim();
const provider = {
  baseUrl,
  apiKey,
  api: "openai-responses",
  models: [
    {
      id: "gpt-5.3-codex",
      name: "gpt-5.3-codex",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 32768,
    },
  ],
};
process.stdout.write(JSON.stringify(provider));
' "$BASE_URL" "$API_KEY")

  openclaw config set models.mode merge
  openclaw config set models.providers.sub2api "$provider_json" --strict-json
  openclaw config set agents.defaults.model.primary sub2api/gpt-5.3-codex
  openclaw config set "agents.defaults.models[sub2api/gpt-5.3-codex]" "{}" --strict-json
}

configure_usage_provider() {
  OPENCLAW_SUB2API_BASE_URL="$BASE_URL" OPENCLAW_SUB2API_API_KEY="$API_KEY" node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const baseUrl = String(process.env.OPENCLAW_SUB2API_BASE_URL || "").trim().replace(/\/$/, "");
const apiKey = String(process.env.OPENCLAW_SUB2API_API_KEY || "").trim();
const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
const filePath = path.join(stateDir, "settings", "usage-providers.json");

let snapshot = { items: [], version: 0, updatedAtMs: 0 };
if (fs.existsSync(filePath)) {
  try {
    snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    snapshot = { items: [], version: 0, updatedAtMs: 0 };
  }
}

const items = Array.isArray(snapshot.items) ? snapshot.items.slice() : [];
const index = items.findIndex((item) => item && (item.id === "sub2api" || item.name === "sub2api"));
const existing = index >= 0 ? items[index] : {};
const next = {
  id: typeof existing.id === "string" && existing.id.trim() ? existing.id : crypto.randomUUID(),
  name: "sub2api",
  type: "sub2api",
  baseUrl,
  apiKey,
  enabled: true,
  intervalSec: 60,
  timeoutMs: 12000,
};
if (index >= 0) {
  items[index] = next;
} else {
  items.push(next);
}

const output = {
  items,
  version: Number.isFinite(Number(snapshot.version)) ? Number(snapshot.version) + 1 : 1,
  updatedAtMs: Date.now(),
};
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n", "utf8");
'
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
    --base-url)
      BASE_URL=${2:-}
      shift 2
      ;;
    --api-key)
      API_KEY=${2:-}
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

printf "[1/9] Checking base tools...\n"
require_cmd curl
require_cmd git
require_cmd node
require_cmd npm

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    printf "pnpm not found, installing via corepack...\n"
    corepack enable
    corepack prepare pnpm@latest --activate
  fi
fi
require_cmd pnpm

printf "[2/9] Collecting sub2api credentials...\n"
prompt_sub2api_credentials

printf "[3/9] Uninstalling existing OpenClaw (mandatory clean install)...\n"
uninstall_existing_openclaw

printf "[4/9] Installing OpenClaw %s...\n" "$OPENCLAW_VERSION"
npm install -g "openclaw@${OPENCLAW_VERSION}" --omit=optional --registry="$OPENCLAW_REGISTRY"
require_cmd openclaw

printf "[5/9] Writing OpenClaw model/agent/usage config...\n"
configure_openclaw_models
configure_usage_provider
openclaw config set gateway.mode local

printf "[6/9] Preparing repository and dependencies...\n"
mkdir -p "$WORKSPACE"
if [ -d "$REPO_DIR/.git" ]; then
  printf "Repo exists: %s\n" "$REPO_DIR"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
pnpm install </dev/null

printf "[7/9] Running deploy assistant...\n"
ACTION="deploy-recommended"
if [ "$SCOPE" = "full" ]; then
  ACTION="deploy-full"
fi
# Keep stdin away from child commands so curl|bash does not lose remaining script lines.
node scripts/deploy-assistant.mjs --action "$ACTION" --yes --branch "$BRANCH" </dev/null

printf "[8/9] Ensuring gateway service is fully ready...\n"
printf "[8/9.a] openclaw gateway install\n"
openclaw gateway install

printf "[8/9.b] waiting gateway service registration\n"
if ! wait_gateway_status_ready 40 1; then
  printf "Error: gateway service registration check failed after install.\n" >&2
  exit 1
fi

printf "[8/9.c] openclaw gateway start\n"
openclaw gateway start

printf "[8/9.d] waiting gateway status after start\n"
if ! wait_gateway_status_ready 40 1; then
  printf "Error: gateway status check failed after start.\n" >&2
  exit 1
fi

printf "[8/9.e] waiting gateway HTTP readiness\n"
if ! wait_gateway_http_ready 40 1; then
  printf "Error: gateway HTTP check failed on port 18789.\n" >&2
  exit 1
fi
printf "Gateway HTTP check passed on port 18789.\n"

printf "[9/9] openclaw dashboard\n"
openclaw dashboard

printf "\nDone. openclaw-src deployment completed.\n"
