# openclaw-src

A practical, production-focused fork of OpenClaw.

> Built for smoother daily workflows: better session control, clearer thinking status, and safer recovery when runs get stuck.

## Why this fork?

This repo keeps the OpenClaw core experience, but improves the parts that matter most in real usage:

- faster multi-session operations
- better observability for agent thinking state
- stronger self-healing after gateway restart or stalled runs
- cleaner usage dashboard and mobile UX

## Highlights

### 1) Better Session Management (Control UI)

- Topbar actions: create (`+`), delete (trash), refresh.
- Flexible session creation:
  - full key
  - short suffix (auto expands to `agent:main:xxx`)
  - random suffix
- Flexible deletion:
  - by index
  - by full key
  - by key tail
- Chat session dropdown now shows all sessions (not recent-only).
- Returning to Chat keeps your current session whenever possible.

### 2) Per-Session Thinking + Liveness Recovery

- Persistent thinking markers per session:
  - `thinkingStartedAt`
  - `thinkingRunId`
- Thinking state is now explicit:
  - `idle`
  - `thinking`
  - `suspect` (likely no progress)
  - `stalled` (stuck/recovering)
- Progress-based liveness detection helps distinguish long tasks vs unresponsive runs.
- Maintenance loop auto-reclaims stalled/timeout runs.
- Startup reconcile clears orphan thinking markers after gateway restart.

### 3) Input UX for Real Work

- `Enter` = newline
- `Ctrl/Cmd + Enter` = send
- Removed inline `New session` button in composer to reduce accidental clicks

### 4) Usage Page Improvements

- Provider usage cards with multi-provider config support.
- Shows balance/quota, period usage, RPM/TPM, latency, refresh time.
- "Today" and "Total" sections are collapsed by default for cleaner first screen.
- Raw JSON view available for troubleshooting.

### 5) Mobile Usability Fixes

- Chat controls are visible and reliably operable on mobile.
- Better wrapping/layout in topbar and controls.
- Tighter spacing for better readability and interaction density.

## Quick Deploy

### macOS

```bash
# 1) Install OpenClaw
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com

# 2) Onboard
openclaw onboard --install-daemon

# 3) Clone + build UI
cd ~/.openclaw/workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd openclaw-src
pnpm install
pnpm ui:build

# 4) Replace web UI assets + restart gateway
rsync -a --delete dist/control-ui/ /opt/homebrew/lib/node_modules/openclaw/dist/control-ui/
openclaw gateway restart
openclaw gateway status
```

### Windows (PowerShell)

```powershell
# 1) Install OpenClaw
npm install -g openclaw@2026.2.25 --omit=optional --registry=https://registry.npmmirror.com

# 2) Onboard
openclaw onboard --install-daemon

# 3) Clone + build UI
cd $HOME\.openclaw\workspace
git clone https://github.com/xiaoyu3567/openclaw-src openclaw-src
cd .\openclaw-src
pnpm install
pnpm ui:build

# 4) Replace web UI assets + restart gateway
$openclawRoot = Join-Path $env:APPDATA "npm\node_modules\openclaw\dist\control-ui"
robocopy ".\dist\control-ui" $openclawRoot /MIR
openclaw gateway restart
openclaw gateway status
```

## 30-Second Post-Upgrade Check

- Open Chat and confirm session dropdown includes all expected sessions.
- Send one message and verify topbar thinking state transitions correctly.
- Restart gateway once and ensure thinking does not stay stuck forever.
- Open Usage page and confirm Today/Total sections default to collapsed.

## Notes

- This README focuses on practical differences and fast onboarding.
- For implementation details, check commit history and changes under `src/gateway` and `ui/src/ui`.
