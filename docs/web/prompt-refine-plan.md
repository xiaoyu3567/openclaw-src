# Prompt Refine Feature Plan (UI + API)

Status: planned (no code implementation in this document)
Owner: Andrew + 小A
Branch target: `chore/risk-hardening-p0` (or follow-up feature branch)

## 1) Goal

Add a `Refine` action next to `Send` in chat composer.

- Refine uses current session context + current draft to improve prompt clarity.
- Refine updates the input box only.
- Refine never auto-sends.
- User keeps final control before sending.

## 2) UX Contract (locked)

### Desktop

- Show `Refine` near `Send` in the composer action row.
- Preferred label: `Refine` with icon (or text+icon based on existing style).

### Mobile

- `Refine` is icon-only (`✨`).
- `Refine` is square.
- `Refine` height matches `Send`.
- `Refine` is left of `Send` and stays on the same row.

### Behavior

- Empty input: `Refine` disabled.
- Not connected: `Refine` disabled.
- While refining: show loading state (`Refining...` or spinner).
- On success: replace draft with refined text and show lightweight success hint.
- On failure: keep original draft, show non-blocking error.
- Add one-step `Undo refine` (time-limited, recommended 10-15s).

## 3) Scope

### MVP (in scope)

- UI button + loading/error/success states.
- Call refine API with session context.
- Replace input with refined output.
- Undo single-step revert.

### Out of scope (MVP)

- Diff compare panel.
- Multi-version refine history.
- Auto-send after refine.
- Attachment-aware refinement.

## 4) API Contract (proposed)

RPC method: `prompt.refine`

Request:

- `sessionKey: string`
- `draft: string`
- `maxHistoryMessages?: number` (default 10)
- `style?: "concise" | "balanced" | "detailed"` (default balanced)

Response:

- `refined: string`
- `reason?: string` (optional, for debug/log)

Rules:

- No tool execution.
- Text-only generation.
- Enforce length limits.
- Preserve user intent and key literals.

## 5) Refine Prompt Policy (model-side behavior)

Model must:

- Keep user intent unchanged.
- Improve clarity, structure, and actionability.
- Preserve key entities: paths, commands, env vars, IDs, numbers, constraints.
- Keep user language style (Chinese-English mixed if present).

Model must not:

- Add unrelated requirements.
- Invent facts not in draft/context.
- Output wrappers/markdown unless requested.

Output format:

- Return only refined text.

## 6) File-Level Implementation Checklist

### 6.1 UI state + wiring

1. `ui/src/ui/app-view-state.ts`

- Add fields:
  - `chatRefineLoading: boolean`
  - `chatRefineError: string | null`
  - `chatRefineLastOriginal: string | null`
  - `chatRefineLastAt: number | null`
  - `chatRefineRequestId: number` (optional anti-race)

2. `ui/src/ui/app.ts`

- Initialize the fields above with defaults.
- Expose handlers:
  - `handleChatRefine()`
  - `handleChatRefineUndo()`

### 6.2 Chat behavior controller

3. `ui/src/ui/app-chat.ts`

- Add `refineChatPrompt(...)` async action.
- Build payload from `sessionKey + chatMessage`.
- Call gateway RPC `prompt.refine`.
- Handle race condition:
  - capture request id and original draft snapshot.
  - apply result only if current request id is latest and user has not diverged (or use conservative merge policy).
- Set success/failure state.
- Implement one-step undo restore.

### 6.3 Gateway client typing

4. `ui/src/ui/types.ts`

- Add request/response types for `prompt.refine`.

5. `ui/src/ui/gateway.ts` (if needed)

- No protocol changes if generic request already supports custom methods.
- Add typed helper only if beneficial.

### 6.4 Composer rendering

6. `ui/src/ui/views/chat.ts`

- Add `Refine` button props + callbacks.
- Insert button immediately left of `Send` in action row.
- Mobile behavior:
  - icon-only on mobile breakpoint
  - square dimensions
  - same height as send
  - single-row layout with send
- Render loading/disabled states.
- Add optional `Undo refine` affordance.

### 6.5 Styles

7. `ui/src/styles/chat/layout.css`
8. `ui/src/styles/layout.mobile.css`

- Add `.chat-refine-btn` styles.
- Enforce mobile square button and no-wrap row.
- Keep existing visual language and spacing.

### 6.6 Backend endpoint

9. `src/gateway/*` (exact file to confirm during implementation)

- Register RPC handler for `prompt.refine`.
- Pull recent session history (N messages).
- Run refine model call with locked system prompt policy.
- Return `refined` text.

10. `src/.../types` (gateway/shared types)

- Add schema/type for request/response.

### 6.7 Tests

11. `ui/src/ui/views/chat.test.ts`

- Button visibility/placement.
- Disabled/loading states.
- Mobile icon-only behavior (where testable).

12. `ui/src/ui/app-chat.*.test.ts` (or create)

- Success path updates draft.
- Error path preserves draft.
- Undo restore works.
- Race case: stale response does not override newer input.

13. Gateway tests (new)

- `prompt.refine` returns refined text.
- Empty draft rejected.
- Context limit respected.

## 7) Acceptance Criteria

- Refine is visible near Send on desktop.
- On mobile, Refine is icon-only, square, same height as Send, left of Send, same row.
- Refine never sends messages automatically.
- Success replaces draft; failure keeps original text.
- Undo works for last refine.
- No regressions to existing send/newline behavior.

## 8) Delivery Plan

1. Implement UI-only shell with mocked refine call path.
2. Add backend `prompt.refine` and wire real call.
3. Run `pnpm ui:build` and targeted tests.
4. Deploy built assets to active OpenClaw runtime.
5. Verify in desktop + mobile viewport.
