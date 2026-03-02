import { describe, expect, it } from "vitest";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import { classifyChatRunLiveness, DEFAULT_CHAT_RUN_LIVENESS_THRESHOLDS } from "./chat-liveness.js";

function createEntry(overrides: Partial<ChatAbortControllerEntry> = {}): ChatAbortControllerEntry {
  return {
    controller: new AbortController(),
    sessionId: "session-1",
    sessionKey: "agent:main:main",
    startedAtMs: 1_000,
    expiresAtMs: 20_000,
    ...overrides,
  };
}

describe("classifyChatRunLiveness", () => {
  it("returns timeout when run exceeded expiresAtMs", () => {
    const entry = createEntry({ expiresAtMs: 1_500 });
    const result = classifyChatRunLiveness(entry, 2_000);
    expect(result.state).toBe("timeout");
    expect(result.reason).toBe("timeout");
  });

  it("flags no-progress runs as suspect then stalled", () => {
    const thresholds = {
      ...DEFAULT_CHAT_RUN_LIVENESS_THRESHOLDS,
      firstProgressSoftMs: 100,
      firstProgressHardMs: 200,
    };
    const entry = createEntry({ startedAtMs: 1_000, expiresAtMs: 10_000 });

    const suspect = classifyChatRunLiveness(entry, 1_150, thresholds);
    expect(suspect.state).toBe("suspect");
    expect(suspect.reason).toBe("no-progress");

    const stalled = classifyChatRunLiveness(entry, 1_250, thresholds);
    expect(stalled.state).toBe("stalled");
    expect(stalled.reason).toBe("no-progress");
  });

  it("keeps runs healthy while progress is recent", () => {
    const thresholds = {
      ...DEFAULT_CHAT_RUN_LIVENESS_THRESHOLDS,
      silenceSoftMs: 100,
      silenceHardMs: 200,
    };
    const entry = createEntry({
      firstProgressAtMs: 1_100,
      lastProgressAtMs: 1_150,
      expiresAtMs: 10_000,
    });

    const healthy = classifyChatRunLiveness(entry, 1_220, thresholds);
    expect(healthy.state).toBe("healthy");
    expect(healthy.reason).toBe("active");

    const stalled = classifyChatRunLiveness(entry, 1_400, thresholds);
    expect(stalled.state).toBe("stalled");
    expect(stalled.reason).toBe("stalled");
  });
});
