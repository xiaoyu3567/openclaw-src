import { describe, expect, it } from "vitest";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import { mergeSessionThinkingView } from "./session-thinking-view.js";
import type { GatewaySessionRow } from "./session-utils.types.js";

function createSessionRow(overrides: Partial<GatewaySessionRow> = {}): GatewaySessionRow {
  return {
    key: "agent:main:main",
    kind: "direct",
    updatedAt: 1_000,
    ...overrides,
  };
}

function createRunEntry(
  overrides: Partial<ChatAbortControllerEntry> = {},
): ChatAbortControllerEntry {
  return {
    controller: new AbortController(),
    sessionId: "session-1",
    sessionKey: "agent:main:main",
    startedAtMs: 1_000,
    expiresAtMs: 10_000,
    ...overrides,
  };
}

describe("mergeSessionThinkingView", () => {
  it("marks active runs as thinking and exposes latest progress", () => {
    const sessions = [createSessionRow({ thinkingStartedAt: 1_000 })];
    const runs = new Map<string, ChatAbortControllerEntry>([
      [
        "run-1",
        createRunEntry({
          firstProgressAtMs: 1_100,
          lastProgressAtMs: 1_200,
        }),
      ],
    ]);

    const merged = mergeSessionThinkingView(sessions, runs, 1_250);
    expect(merged[0]?.thinkingState).toBe("thinking");
    expect(merged[0]?.thinkingLastProgressAt).toBe(1_200);
  });

  it("marks no-progress runs as suspect", () => {
    const sessions = [createSessionRow({ thinkingStartedAt: 1_000 })];
    const runs = new Map<string, ChatAbortControllerEntry>([
      [
        "run-2",
        createRunEntry({
          startedAtMs: 1_000,
          expiresAtMs: 60_000,
        }),
      ],
    ]);

    const merged = mergeSessionThinkingView(sessions, runs, 50_000);
    expect(merged[0]?.thinkingState).toBe("suspect");
  });

  it("falls back to stalled when marker exists without active run", () => {
    const sessions = [createSessionRow({ thinkingStartedAt: 1_000 })];
    const merged = mergeSessionThinkingView(sessions, new Map(), 4_000);
    expect(merged[0]?.thinkingState).toBe("stalled");
    expect(merged[0]?.thinkingSilenceMs).toBe(3_000);
  });

  it("marks idle when no marker and no run exists", () => {
    const sessions = [createSessionRow()];
    const merged = mergeSessionThinkingView(sessions, new Map(), 4_000);
    expect(merged[0]?.thinkingState).toBe("idle");
  });
});
