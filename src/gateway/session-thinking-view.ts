import type { ChatAbortControllerEntry } from "./chat-abort.js";
import { classifyChatRunLiveness, type ChatRunLivenessResult } from "./chat-liveness.js";
import type { GatewaySessionRow } from "./session-utils.types.js";

type GatewaySessionThinkingState = NonNullable<GatewaySessionRow["thinkingState"]>;

type ThinkingSnapshot = {
  thinkingState: GatewaySessionThinkingState;
  thinkingLastProgressAt?: number;
  thinkingSilenceMs?: number;
};

const THINKING_STATE_PRIORITY: Record<GatewaySessionThinkingState, number> = {
  idle: 0,
  thinking: 1,
  suspect: 2,
  stalled: 3,
};

function mapLivenessToThinkingState(liveness: ChatRunLivenessResult): GatewaySessionThinkingState {
  if (liveness.state === "healthy") {
    return "thinking";
  }
  if (liveness.state === "suspect") {
    return "suspect";
  }
  return "stalled";
}

function shouldReplaceSnapshot(
  current: ThinkingSnapshot | undefined,
  next: ThinkingSnapshot,
): boolean {
  if (!current) {
    return true;
  }
  const currentPriority = THINKING_STATE_PRIORITY[current.thinkingState];
  const nextPriority = THINKING_STATE_PRIORITY[next.thinkingState];
  if (nextPriority !== currentPriority) {
    return nextPriority > currentPriority;
  }
  return (next.thinkingLastProgressAt ?? 0) > (current.thinkingLastProgressAt ?? 0);
}

function setIndexedSnapshot(
  index: Map<string, ThinkingSnapshot>,
  key: string,
  snapshot: ThinkingSnapshot,
): void {
  const normalized = key.trim();
  if (!normalized) {
    return;
  }
  const current = index.get(normalized);
  if (shouldReplaceSnapshot(current, snapshot)) {
    index.set(normalized, snapshot);
  }
}

function resolveThinkingSnapshotFromActiveRun(
  entry: ChatAbortControllerEntry,
  now: number,
): ThinkingSnapshot {
  const liveness = classifyChatRunLiveness(entry, now);
  return {
    thinkingState: mapLivenessToThinkingState(liveness),
    thinkingLastProgressAt: entry.lastProgressAtMs ?? entry.firstProgressAtMs,
    thinkingSilenceMs: liveness.silenceMs,
  };
}

function buildRuntimeThinkingIndex(
  chatAbortControllers: Map<string, ChatAbortControllerEntry>,
  now: number,
): Map<string, ThinkingSnapshot> {
  const index = new Map<string, ThinkingSnapshot>();
  for (const entry of chatAbortControllers.values()) {
    const snapshot = resolveThinkingSnapshotFromActiveRun(entry, now);
    setIndexedSnapshot(index, entry.sessionKey, snapshot);
    setIndexedSnapshot(index, entry.sessionKey.toLowerCase(), snapshot);
  }
  return index;
}

export function mergeSessionThinkingView(
  sessions: GatewaySessionRow[],
  chatAbortControllers: Map<string, ChatAbortControllerEntry>,
  now: number,
): GatewaySessionRow[] {
  const runtimeIndex = buildRuntimeThinkingIndex(chatAbortControllers, now);
  return sessions.map((row) => {
    const runtime = runtimeIndex.get(row.key) ?? runtimeIndex.get(row.key.toLowerCase());
    if (runtime) {
      return {
        ...row,
        ...runtime,
      };
    }
    if (typeof row.thinkingStartedAt === "number") {
      return {
        ...row,
        thinkingState: "stalled",
        thinkingSilenceMs: Math.max(0, now - row.thinkingStartedAt),
      };
    }
    return {
      ...row,
      thinkingState: "idle",
      thinkingLastProgressAt: undefined,
      thinkingSilenceMs: undefined,
    };
  });
}
