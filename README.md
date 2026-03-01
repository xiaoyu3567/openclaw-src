# openclaw-src (Customized from OpenClaw)

This repository is a customized version based on OpenClaw, focused on improving daily personal operation efficiency in Control UI and session workflows.

## What is improved

- Session management enhancements (Control UI)
  - Added topbar actions for session create (`+`), delete (trash), and refresh.
  - Session creation supports full key, short suffix (`agent:main:xxx`), random suffix generation, and auto-switch.
  - Session deletion supports index, full key, and short-tail matching.
  - Deletion now returns explicit success/failure feedback (no silent failures).

- Chat input behavior optimization
  - `Enter` inserts newline.
  - `Ctrl/Cmd+Enter` sends message.
  - Removed composer `New session` button to reduce accidental resets.

- Backend per-session thinking timer
  - Added persistent session fields: `thinkingStartedAt`, `thinkingRunId`.
  - Exposed thinking state via `sessions.list`.
  - Topbar shows per-session status: `idle` or `thinking: HH:MM:SS`.
  - Thinking timer state persists across session switching and page refresh.

- Mobile UI refinements
  - Fixed chat control visibility and usability on mobile.
  - Optimized header/control wrapping for small screens.
  - Reduced spacing and padding for denser, more practical mobile layout.

- Provider usage and quota panel
  - Added provider usage panel in Usage tab.
  - Supports multiple provider entries (name, base URL, API key, refresh interval, timeout).
  - Displays quota/usage status, RPM/TPM, latency, and last refresh time.
  - Supports raw JSON expansion for troubleshooting.

## Notes

- This repository is intended as a practical custom fork for personal operations.
- Content focuses on functional differences from upstream OpenClaw.
