import { describe, expect, it, vi } from "vitest";
import { startGatewayMaintenanceTimers } from "./server-maintenance.js";

describe("gateway maintenance chat liveness", () => {
  it("aborts stalled runs with stall stopReason", () => {
    const now = 1_000;
    const startedAt = now - 400_000;
    const runId = "run-stalled";
    const sessionKey = "agent:main:main";

    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    const timers: Array<() => void> = [];
    globalThis.setInterval = ((cb: TimerHandler) => {
      timers.push(() => {
        if (typeof cb === "function") {
          cb();
        }
      });
      return timers.length as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    globalThis.clearInterval = (() => undefined) as typeof clearInterval;

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    const broadcast = vi.fn();
    const nodeSendToSession = vi.fn();
    const chatAbortControllers = new Map([
      [
        runId,
        {
          controller: new AbortController(),
          sessionId: "session-1",
          sessionKey,
          startedAtMs: startedAt,
          expiresAtMs: now + 3_600_000,
        },
      ],
    ]);

    try {
      const timersHandle = startGatewayMaintenanceTimers({
        broadcast,
        nodeSendToAllSubscribed: vi.fn(),
        getPresenceVersion: () => 0,
        getHealthVersion: () => 0,
        refreshGatewayHealthSnapshot: async () => ({ ok: true }) as never,
        logHealth: { error: vi.fn() },
        dedupe: new Map(),
        chatAbortControllers,
        chatRunState: { abortedRuns: new Map() },
        chatRunBuffers: new Map([[runId, "partial"]]),
        chatDeltaSentAt: new Map([[runId, now - 1_000]]),
        removeChatRun: vi.fn(() => ({ sessionKey, clientRunId: runId })),
        agentRunSeq: new Map([[runId, 2]]),
        nodeSendToSession,
      });

      // dedupe cleanup timer is the third timer registered in startGatewayMaintenanceTimers
      timers[2]?.();

      expect(chatAbortControllers.has(runId)).toBe(false);
      const chatBroadcastCall = broadcast.mock.calls.find(([event]) => event === "chat");
      expect(chatBroadcastCall).toBeDefined();
      expect(chatBroadcastCall?.[1]).toEqual(
        expect.objectContaining({
          state: "aborted",
          stopReason: "stall",
          runId,
          sessionKey,
        }),
      );

      clearInterval(timersHandle.tickInterval);
      clearInterval(timersHandle.healthInterval);
      clearInterval(timersHandle.dedupeCleanup);
    } finally {
      dateNowSpy.mockRestore();
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
