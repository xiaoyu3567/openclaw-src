import { toNumber } from "../format.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { SessionsListResult } from "../types.ts";

export type SessionsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionsLoading: boolean;
  sessionsResult: SessionsListResult | null;
  sessionsError: string | null;
  sessionsFilterActive: string;
  sessionsFilterLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;
};

export async function loadSessions(
  state: SessionsState,
  overrides?: {
    activeMinutes?: number;
    limit?: number;
    includeGlobal?: boolean;
    includeUnknown?: boolean;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.sessionsLoading) {
    return;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const includeGlobal = overrides?.includeGlobal ?? state.sessionsIncludeGlobal;
    const includeUnknown = overrides?.includeUnknown ?? state.sessionsIncludeUnknown;
    const activeMinutes = overrides?.activeMinutes ?? toNumber(state.sessionsFilterActive, 0);
    const limit = overrides?.limit ?? toNumber(state.sessionsFilterLimit, 0);
    const params: Record<string, unknown> = {
      includeGlobal,
      includeUnknown,
    };
    if (activeMinutes > 0) {
      params.activeMinutes = activeMinutes;
    }
    if (limit > 0) {
      params.limit = limit;
    }
    const res = await state.client.request<SessionsListResult | undefined>("sessions.list", params);
    if (res) {
      state.sessionsResult = res;
    }
  } catch (err) {
    state.sessionsError = String(err);
  } finally {
    state.sessionsLoading = false;
  }
}

export async function patchSession(
  state: SessionsState,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  const params: Record<string, unknown> = { key };
  if ("label" in patch) {
    params.label = patch.label;
  }
  if ("thinkingLevel" in patch) {
    params.thinkingLevel = patch.thinkingLevel;
  }
  if ("verboseLevel" in patch) {
    params.verboseLevel = patch.verboseLevel;
  }
  if ("reasoningLevel" in patch) {
    params.reasoningLevel = patch.reasoningLevel;
  }
  try {
    await state.client.request("sessions.patch", params);
    await loadSessions(state);
  } catch (err) {
    state.sessionsError = String(err);
  }
}

export async function deleteSession(state: SessionsState, key: string): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  if (state.sessionsLoading) {
    return false;
  }
  const confirmed = window.confirm(
    `Delete session "${key}"?\n\nDeletes the session entry and archives its transcript.`,
  );
  if (!confirmed) {
    return false;
  }
  state.sessionsLoading = true;
  state.sessionsError = null;
  try {
    const result = await state.client.request<{ ok?: boolean; deleted?: boolean } | undefined>(
      "sessions.delete",
      { key, deleteTranscript: true },
    );
    if (result && typeof result === "object" && result.deleted === false) {
      state.sessionsError = `Session "${key}" was not deleted.`;
      return false;
    }
    if (result && typeof result === "object" && result.ok === false) {
      state.sessionsError = `Delete session "${key}" failed.`;
      return false;
    }
    return true;
  } catch (err) {
    state.sessionsError = String(err);
    return false;
  } finally {
    state.sessionsLoading = false;
  }
}

export async function deleteSessionAndRefresh(state: SessionsState, key: string): Promise<boolean> {
  const deleted = await deleteSession(state, key);
  if (!deleted) {
    return false;
  }
  await loadSessions(state);
  return true;
}

export async function createSessionAndRefresh(
  state: SessionsState,
  key: string,
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  if (state.sessionsLoading) {
    return null;
  }

  const normalizedKey = key.trim();
  if (!normalizedKey) {
    state.sessionsError = "Session key is required.";
    return null;
  }

  state.sessionsLoading = true;
  state.sessionsError = null;
  let createdKey: string | null = null;
  try {
    const result = await state.client.request<{ ok?: boolean; key?: string } | undefined>(
      "sessions.reset",
      { key: normalizedKey, reason: "new" },
    );
    if (result && typeof result === "object" && result.ok === false) {
      state.sessionsError = `Create session "${normalizedKey}" failed.`;
      return null;
    }
    createdKey =
      result && typeof result === "object" && typeof result.key === "string"
        ? result.key
        : normalizedKey;
  } catch (err) {
    state.sessionsError = String(err);
    return null;
  } finally {
    state.sessionsLoading = false;
  }

  await loadSessions(state);
  return createdKey;
}
