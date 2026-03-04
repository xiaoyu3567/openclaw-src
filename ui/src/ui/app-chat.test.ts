import { describe, expect, it, vi } from "vitest";
import { handleRefineChatPrompt } from "./app-chat.ts";

type FakeHost = Parameters<typeof handleRefineChatPrompt>[0];

function createHost(overrides: Partial<FakeHost> = {}): FakeHost {
  return {
    connected: true,
    client: {
      request: vi.fn(async () => ({ refined: "refined prompt" })),
    } as unknown as FakeHost["client"],
    chatMessage: "draft prompt",
    chatMessages: [
      { role: "user", content: "previous ask" },
      { role: "assistant", content: "previous answer" },
    ],
    chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    chatRefineLoading: false,
    chatRefineStage: "idle",
    chatRefineResultKind: null,
    chatRefineResultMessage: null,
    chatRefineResultTimer: null,
    quickToolsOpen: false,
    quickToolRunning: false,
    quickResultText: null,
    quickResultError: null,
    chatRefineLastOriginal: null,
    chatRefineLastAt: null,
    chatRefineRequestId: 0,
    sessionKey: "agent:main:test",
    basePath: "/",
    hello: null,
    chatAvatarUrl: null,
    refreshSessionsAfterChat: new Set<string>(),
    ...overrides,
  };
}

describe("handleRefineChatPrompt", () => {
  it("successfully replaces draft with refined text", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ refined: "refined output" });
    const host = createHost({ client: { request } as unknown as FakeHost["client"] });

    await handleRefineChatPrompt(host);

    expect(host.chatMessage).toBe("refined output");
    expect(host.chatRefineResultKind).toBe("success");
    expect(host.chatRefineResultMessage).toBe("Refined.");
    expect(host.chatRefineLoading).toBe(false);
    expect(host.chatRefineStage).toBe("idle");
    expect(request).toHaveBeenNthCalledWith(1, "status", {});
    expect(request).toHaveBeenNthCalledWith(
      2,
      "prompt.refine",
      expect.objectContaining({ sessionKey: "agent:main:test", draft: "draft prompt" }),
    );
  });

  it("returns no significant changes when refined equals draft", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ refined: "draft prompt" });
    const host = createHost({ client: { request } as unknown as FakeHost["client"] });

    await handleRefineChatPrompt(host);

    expect(host.chatMessage).toBe("draft prompt");
    expect(host.chatRefineResultKind).toBe("info");
    expect(host.chatRefineResultMessage).toBe("No significant changes.");
  });

  it("handles timeout as expected", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockImplementation(async (method: string) => {
      if (method === "status") {
        return { ok: true };
      }
      return new Promise(() => undefined);
    });
    const host = createHost({ client: { request } as unknown as FakeHost["client"] });

    const run = handleRefineChatPrompt(host);
    await vi.advanceTimersByTimeAsync(20_500);
    await run;

    expect(host.chatRefineResultKind).toBe("error");
    expect(host.chatRefineResultMessage).toBe("Refine failed: timeout (20s).");
    expect(host.chatRefineLoading).toBe(false);
    vi.useRealTimers();
  });

  it("maps backend error", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("model error"));
    const host = createHost({ client: { request } as unknown as FakeHost["client"] });

    await handleRefineChatPrompt(host);

    expect(host.chatRefineResultKind).toBe("error");
    expect(host.chatRefineResultMessage).toBe("Refine failed: upstream model error.");
    expect(host.chatMessage).toBe("draft prompt");
  });
});
