import type { ChatAbortControllerEntry } from "./chat-abort.js";

export type ChatRunLivenessState = "healthy" | "suspect" | "stalled" | "timeout";

export type ChatRunLivenessThresholds = {
  firstProgressSoftMs: number;
  firstProgressHardMs: number;
  silenceSoftMs: number;
  silenceHardMs: number;
};

export const DEFAULT_CHAT_RUN_LIVENESS_THRESHOLDS: ChatRunLivenessThresholds = {
  firstProgressSoftMs: 45_000,
  firstProgressHardMs: 180_000,
  silenceSoftMs: 120_000,
  silenceHardMs: 300_000,
};

export type ChatRunLivenessResult = {
  state: ChatRunLivenessState;
  reason: "timeout" | "starting" | "active" | "no-progress" | "stalled";
  ageMs: number;
  silenceMs?: number;
};

export function classifyChatRunLiveness(
  entry: ChatAbortControllerEntry,
  now: number,
  thresholds: ChatRunLivenessThresholds = DEFAULT_CHAT_RUN_LIVENESS_THRESHOLDS,
): ChatRunLivenessResult {
  const ageMs = Math.max(0, now - entry.startedAtMs);
  if (now > entry.expiresAtMs) {
    return {
      state: "timeout",
      reason: "timeout",
      ageMs,
    };
  }

  if (typeof entry.firstProgressAtMs !== "number") {
    if (ageMs >= thresholds.firstProgressHardMs) {
      return {
        state: "stalled",
        reason: "no-progress",
        ageMs,
      };
    }
    if (ageMs >= thresholds.firstProgressSoftMs) {
      return {
        state: "suspect",
        reason: "no-progress",
        ageMs,
      };
    }
    return {
      state: "healthy",
      reason: "starting",
      ageMs,
    };
  }

  const silenceFrom =
    typeof entry.lastProgressAtMs === "number" ? entry.lastProgressAtMs : entry.firstProgressAtMs;
  const silenceMs = Math.max(0, now - silenceFrom);
  if (silenceMs >= thresholds.silenceHardMs) {
    return {
      state: "stalled",
      reason: "stalled",
      ageMs,
      silenceMs,
    };
  }
  if (silenceMs >= thresholds.silenceSoftMs) {
    return {
      state: "suspect",
      reason: "stalled",
      ageMs,
      silenceMs,
    };
  }
  return {
    state: "healthy",
    reason: "active",
    ageMs,
    silenceMs,
  };
}
