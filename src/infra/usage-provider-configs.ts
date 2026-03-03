import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { createAsyncLock, readJsonFile, writeJsonAtomic } from "./json-files.js";

export type UsageProviderKind = "sub2api";

export type UsageProviderConfig = {
  id: string;
  name: string;
  type: UsageProviderKind;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  intervalSec: number;
  timeoutMs: number;
};

export type UsageProviderConfigSnapshot = {
  items: UsageProviderConfig[];
  version: number;
  updatedAtMs: number;
};

type UsageProviderConfigStore = UsageProviderConfigSnapshot;

export class UsageProviderConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageProviderConfigValidationError";
  }
}

const DEFAULT_SNAPSHOT: UsageProviderConfigSnapshot = {
  items: [],
  version: 0,
  updatedAtMs: 0,
};

const withLock = createAsyncLock();

function resolveUsageProvidersFilePath(baseDir?: string): string {
  const root = baseDir ?? resolveStateDir();
  return path.join(root, "settings", "usage-providers.json");
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveNumber(value: unknown, fallback: number, floor: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(floor, Math.floor(n));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

function coerceUsageProviderConfig(
  value: unknown,
  opts?: { allowMissingId?: boolean },
): UsageProviderConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const idRaw = toTrimmedString(entry.id);
  const id = idRaw || (opts?.allowMissingId ? randomUUID() : "");
  const name = toTrimmedString(entry.name);
  const baseUrl = normalizeBaseUrl(toTrimmedString(entry.baseUrl));
  const apiKey = toTrimmedString(entry.apiKey);
  const enabled = typeof entry.enabled === "boolean" ? entry.enabled : true;
  const type: UsageProviderKind = "sub2api";
  const intervalSec = toPositiveNumber(entry.intervalSec, 60, 10);
  const timeoutMs = toPositiveNumber(entry.timeoutMs, 12_000, 2_000);

  if (!id || !name || !baseUrl || !apiKey) {
    return null;
  }

  return {
    id,
    name,
    type,
    baseUrl,
    apiKey,
    enabled,
    intervalSec,
    timeoutMs,
  };
}

function sanitizeSnapshot(value: unknown): UsageProviderConfigSnapshot {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SNAPSHOT };
  }
  const parsed = value as Record<string, unknown>;
  const entries = Array.isArray(parsed.items) ? parsed.items : [];
  const items = entries
    .map((entry) => coerceUsageProviderConfig(entry, { allowMissingId: true }))
    .filter((entry): entry is UsageProviderConfig => Boolean(entry));

  return {
    items,
    version:
      typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? Math.max(0, Math.floor(parsed.version))
        : 0,
    updatedAtMs:
      typeof parsed.updatedAtMs === "number" && Number.isFinite(parsed.updatedAtMs)
        ? Math.max(0, Math.floor(parsed.updatedAtMs))
        : 0,
  };
}

async function loadSnapshot(filePath: string): Promise<UsageProviderConfigSnapshot> {
  const existing = await readJsonFile<UsageProviderConfigStore>(filePath);
  if (!existing) {
    return { ...DEFAULT_SNAPSHOT };
  }
  return sanitizeSnapshot(existing);
}

async function writeSnapshot(
  filePath: string,
  snapshot: UsageProviderConfigSnapshot,
): Promise<void> {
  await writeJsonAtomic(filePath, snapshot);
}

export async function listUsageProviderConfigs(
  baseDir?: string,
): Promise<UsageProviderConfigSnapshot> {
  const filePath = resolveUsageProvidersFilePath(baseDir);
  return await loadSnapshot(filePath);
}

export async function upsertUsageProviderConfig(
  input: unknown,
  baseDir?: string,
): Promise<{ item: UsageProviderConfig } & UsageProviderConfigSnapshot> {
  const nextItem = coerceUsageProviderConfig(input, { allowMissingId: true });
  if (!nextItem) {
    throw new UsageProviderConfigValidationError(
      "usage.provider.config.upsert requires item with id/name/baseUrl/apiKey",
    );
  }

  const filePath = resolveUsageProvidersFilePath(baseDir);
  return await withLock(async () => {
    const current = await loadSnapshot(filePath);
    const index = current.items.findIndex((entry) => entry.id === nextItem.id);
    const items = [...current.items];
    if (index === -1) {
      items.push(nextItem);
    } else {
      items[index] = nextItem;
    }
    const snapshot: UsageProviderConfigSnapshot = {
      items,
      version: current.version + 1,
      updatedAtMs: Date.now(),
    };
    await writeSnapshot(filePath, snapshot);
    return { ...snapshot, item: nextItem };
  });
}

export async function deleteUsageProviderConfig(
  id: unknown,
  baseDir?: string,
): Promise<{ ok: boolean } & UsageProviderConfigSnapshot> {
  const targetId = toTrimmedString(id);
  if (!targetId) {
    throw new UsageProviderConfigValidationError("usage.provider.config.delete requires id");
  }

  const filePath = resolveUsageProvidersFilePath(baseDir);
  return await withLock(async () => {
    const current = await loadSnapshot(filePath);
    const items = current.items.filter((entry) => entry.id !== targetId);
    if (items.length === current.items.length) {
      return { ...current, ok: true };
    }
    const snapshot: UsageProviderConfigSnapshot = {
      items,
      version: current.version + 1,
      updatedAtMs: Date.now(),
    };
    await writeSnapshot(filePath, snapshot);
    return { ...snapshot, ok: true };
  });
}

export const __test = {
  coerceUsageProviderConfig,
  sanitizeSnapshot,
  resolveUsageProvidersFilePath,
};
