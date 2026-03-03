import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { loadSessionStore, saveSessionStore } from "../config/sessions.js";
import { reconcileOrphanedSessionThinkingStates } from "./session-thinking-state.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function createStore(entries: Record<string, unknown>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-thinking-reconcile-"));
  tempDirs.push(dir);
  const storePath = path.join(dir, "sessions.json");
  await saveSessionStore(storePath, entries as never);
  return { dir, storePath };
}

function createConfig(storePath: string): OpenClawConfig {
  return {
    gateway: {
      enabled: true,
    },
    session: {
      store: storePath,
    },
    models: [
      {
        provider: "openai-codex",
        model: "gpt-5.3-codex",
        key: "test",
      },
    ],
  } as OpenClawConfig;
}

describe("reconcileOrphanedSessionThinkingStates", () => {
  it("clears orphaned thinking markers when run ids are inactive", async () => {
    const { storePath } = await createStore({
      "agent:main:main": {
        sessionId: "session-main",
        updatedAt: 1,
        thinkingStartedAt: 100,
        thinkingRunId: "run-stale",
      },
      "agent:main:other": {
        sessionId: "session-other",
        updatedAt: 2,
        thinkingStartedAt: 200,
        thinkingRunId: "run-active",
      },
    });

    const result = await reconcileOrphanedSessionThinkingStates({
      cfg: createConfig(storePath),
      activeRunIds: new Set(["run-active"]),
      minStartedAtMs: 500,
    });

    expect(result.scanned).toBe(2);
    expect(result.cleared).toBe(1);

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store["agent:main:main"]?.thinkingStartedAt).toBeUndefined();
    expect(store["agent:main:main"]?.thinkingRunId).toBeUndefined();
    expect(store["agent:main:other"]?.thinkingRunId).toBe("run-active");
  });

  it("keeps recent startup markers inside grace window", async () => {
    const { storePath } = await createStore({
      "agent:main:main": {
        sessionId: "session-main",
        updatedAt: 1,
        thinkingStartedAt: 10_000,
        thinkingRunId: "run-pending",
      },
    });

    const result = await reconcileOrphanedSessionThinkingStates({
      cfg: createConfig(storePath),
      activeRunIds: new Set(),
      minStartedAtMs: 9_000,
    });

    expect(result.scanned).toBe(1);
    expect(result.cleared).toBe(0);

    const store = loadSessionStore(storePath, { skipCache: true });
    expect(store["agent:main:main"]?.thinkingRunId).toBe("run-pending");
  });
});
