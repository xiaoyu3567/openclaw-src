import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import {
  UsageProviderConfigValidationError,
  deleteUsageProviderConfig,
  listUsageProviderConfigs,
  upsertUsageProviderConfig,
} from "./usage-provider-configs.js";

describe("usage provider configs", () => {
  it("returns an empty snapshot by default", async () => {
    await withStateDirEnv("openclaw-usage-provider-configs-", async () => {
      const snapshot = await listUsageProviderConfigs();
      expect(snapshot).toEqual({ items: [], version: 0, updatedAtMs: 0 });
    });
  });

  it("upserts provider config and persists it", async () => {
    await withStateDirEnv("openclaw-usage-provider-configs-", async ({ stateDir }) => {
      const saved = await upsertUsageProviderConfig({
        name: "jp",
        type: "sub2api",
        baseUrl: "https://example.com/v1/",
        apiKey: "sk-123",
        enabled: true,
        intervalSec: 5,
        timeoutMs: 100,
      });

      expect(saved.items).toHaveLength(1);
      expect(saved.version).toBe(1);
      expect(saved.item.name).toBe("jp");
      expect(saved.item.baseUrl).toBe("https://example.com/v1");
      expect(saved.item.intervalSec).toBe(10);
      expect(saved.item.timeoutMs).toBe(2000);
      expect(saved.item.id).toBeTruthy();

      const filePath = path.join(stateDir, "settings", "usage-providers.json");
      const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as {
        items?: Array<{ name?: string }>;
      };
      expect(raw.items?.[0]?.name).toBe("jp");
    });
  });

  it("deletes provider config", async () => {
    await withStateDirEnv("openclaw-usage-provider-configs-", async () => {
      const saved = await upsertUsageProviderConfig({
        id: "provider-a",
        name: "a",
        type: "sub2api",
        baseUrl: "https://example.com/v1",
        apiKey: "sk-a",
        enabled: true,
        intervalSec: 60,
        timeoutMs: 12000,
      });
      expect(saved.items).toHaveLength(1);

      const deleted = await deleteUsageProviderConfig("provider-a");
      expect(deleted.items).toEqual([]);
      expect(deleted.version).toBe(2);

      const loaded = await listUsageProviderConfigs();
      expect(loaded.items).toEqual([]);
      expect(loaded.version).toBe(2);
    });
  });

  it("rejects invalid config payload", async () => {
    await withStateDirEnv("openclaw-usage-provider-configs-", async () => {
      await expect(
        upsertUsageProviderConfig({
          name: "",
          baseUrl: "https://example.com/v1",
          apiKey: "",
        }),
      ).rejects.toBeInstanceOf(UsageProviderConfigValidationError);
    });
  });
});
