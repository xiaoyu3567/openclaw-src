import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import { type SessionEntry, updateSessionStore } from "../config/sessions.js";
import {
  loadCombinedSessionStoreForGateway,
  resolveGatewaySessionStoreTarget,
} from "./session-utils.js";

export type SessionThinkingStateParams = {
  storePath: string;
  candidateKeys: string[];
  runId: string;
  startedAt?: number;
  clear: boolean;
};

function resolveStoreKeyForThinkingState(
  store: Record<string, SessionEntry>,
  params: SessionThinkingStateParams,
): string | null {
  for (const candidate of params.candidateKeys) {
    const key = candidate.trim();
    if (key && store[key]) {
      return key;
    }
  }
  const lowered = new Set(
    params.candidateKeys.map((candidate) => candidate.trim().toLowerCase()).filter(Boolean),
  );
  for (const key of Object.keys(store)) {
    if (lowered.has(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

function resolveCreateKeyForThinkingState(params: SessionThinkingStateParams): string | null {
  for (const candidate of params.candidateKeys) {
    const key = candidate.trim();
    if (key) {
      return key;
    }
  }
  return null;
}

export async function updateSessionThinkingState(
  params: SessionThinkingStateParams,
): Promise<void> {
  await updateSessionStore(params.storePath, (store) => {
    const storeKey = resolveStoreKeyForThinkingState(store, params);
    if (!storeKey) {
      if (params.clear || typeof params.startedAt !== "number") {
        return;
      }
      const createKey = resolveCreateKeyForThinkingState(params);
      if (!createKey) {
        return;
      }
      store[createKey] = {
        sessionId: randomUUID(),
        updatedAt: params.startedAt,
        thinkingStartedAt: params.startedAt,
        thinkingRunId: params.runId,
      };
      return;
    }
    const entry = store[storeKey];
    if (!entry) {
      return;
    }

    if (params.clear) {
      if (entry.thinkingRunId && entry.thinkingRunId !== params.runId) {
        return;
      }
      if (entry.thinkingStartedAt === undefined && entry.thinkingRunId === undefined) {
        return;
      }
      const next: SessionEntry = { ...entry };
      delete next.thinkingStartedAt;
      delete next.thinkingRunId;
      store[storeKey] = next;
      return;
    }

    if (typeof params.startedAt !== "number") {
      return;
    }
    if (entry.thinkingStartedAt === params.startedAt && entry.thinkingRunId === params.runId) {
      return;
    }
    store[storeKey] = {
      ...entry,
      thinkingStartedAt: params.startedAt,
      thinkingRunId: params.runId,
    };
  });
}

type ReconcileSessionThinkingStateParams = {
  cfg: OpenClawConfig;
  activeRunIds: ReadonlySet<string>;
  minStartedAtMs?: number;
};

export type ReconcileSessionThinkingStateResult = {
  scanned: number;
  cleared: number;
};

type ThinkingClearCandidate = {
  storeKeys: string[];
};

function shouldKeepThinkingEntry(params: {
  entry: SessionEntry;
  activeRunIds: ReadonlySet<string>;
  minStartedAtMs?: number;
}): boolean {
  const runId = params.entry.thinkingRunId?.trim();
  if (runId && params.activeRunIds.has(runId)) {
    return true;
  }
  if (
    typeof params.minStartedAtMs === "number" &&
    typeof params.entry.thinkingStartedAt === "number" &&
    params.entry.thinkingStartedAt >= params.minStartedAtMs
  ) {
    return true;
  }
  return false;
}

export async function reconcileOrphanedSessionThinkingStates(
  params: ReconcileSessionThinkingStateParams,
): Promise<ReconcileSessionThinkingStateResult> {
  const { store } = loadCombinedSessionStoreForGateway(params.cfg);
  const pendingByStorePath = new Map<string, ThinkingClearCandidate[]>();
  let scanned = 0;

  for (const [key, entry] of Object.entries(store)) {
    if (entry.thinkingStartedAt === undefined && entry.thinkingRunId === undefined) {
      continue;
    }
    scanned += 1;
    if (
      shouldKeepThinkingEntry({
        entry,
        activeRunIds: params.activeRunIds,
        minStartedAtMs: params.minStartedAtMs,
      })
    ) {
      continue;
    }
    const target = resolveGatewaySessionStoreTarget({
      cfg: params.cfg,
      key,
    });
    const existing = pendingByStorePath.get(target.storePath) ?? [];
    existing.push({
      storeKeys: target.storeKeys,
    });
    pendingByStorePath.set(target.storePath, existing);
  }

  let cleared = 0;
  for (const [storePath, candidates] of pendingByStorePath) {
    const clearedInStore = await updateSessionStore(storePath, (rawStore) => {
      let changed = 0;
      for (const candidate of candidates) {
        const matchedKey = candidate.storeKeys.find((storeKey) => Boolean(rawStore[storeKey]));
        if (!matchedKey) {
          continue;
        }
        const entry = rawStore[matchedKey];
        if (!entry) {
          continue;
        }
        if (
          shouldKeepThinkingEntry({
            entry,
            activeRunIds: params.activeRunIds,
            minStartedAtMs: params.minStartedAtMs,
          })
        ) {
          continue;
        }
        if (entry.thinkingStartedAt === undefined && entry.thinkingRunId === undefined) {
          continue;
        }
        const next: SessionEntry = { ...entry };
        delete next.thinkingStartedAt;
        delete next.thinkingRunId;
        rawStore[matchedKey] = next;
        changed += 1;
      }
      return changed;
    });
    cleared += clearedInStore;
  }

  return { scanned, cleared };
}
