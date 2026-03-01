import { nothing } from "lit";
import { html } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { UsageState } from "./controllers/usage.ts";
import { loadUsage, loadSessionTimeSeries, loadSessionLogs } from "./controllers/usage.ts";
import {
  clearUsageProviderConfigs,
  loadUsageProviderConfigs,
  normalizeBaseUrl,
  sanitizeUsageProviderConfig,
  sanitizeUsageProviderConfigs,
  type UsageProviderCardState,
  type UsageProviderConfig,
  type UsageProviderConfigSnapshot,
} from "./provider-usage.ts";
import { generateUUID } from "./uuid.ts";
import { renderProviderUsagePanel } from "./views/provider-usage.ts";
import { renderUsage } from "./views/usage.ts";

// Module-scope debounce for usage date changes (avoids type-unsafe hacks on state object)
let usageDateDebounceTimeout: number | null = null;
const providerAutoRefreshTimers = new Map<string, number>();

const debouncedLoadUsage = (state: UsageState) => {
  if (usageDateDebounceTimeout) {
    clearTimeout(usageDateDebounceTimeout);
  }
  usageDateDebounceTimeout = window.setTimeout(() => void loadUsage(state), 400);
};

const ensureProviderCard = (
  state: AppViewState,
  id: string,
  fallback?: Partial<UsageProviderCardState>,
): UsageProviderCardState => {
  const current = state.usageProviderCards[id];
  if (current) {
    return current;
  }
  const next: UsageProviderCardState = {
    loading: false,
    error: null,
    status: "idle",
    lastUpdatedAt: null,
    latencyMs: null,
    data: null,
    ...fallback,
  };
  state.usageProviderCards = { ...state.usageProviderCards, [id]: next };
  return next;
};

const PROVIDER_CONFIG_SYNC_INTERVAL_MS = 30_000;
let providerConfigSyncTimer: number | null = null;
let providerConfigFocusListener: (() => void) | null = null;
let providerConfigSyncHost: AppViewState | null = null;

const toErrorMessage = (err: unknown): string => {
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "request failed";
};

const parseProviderConfigSnapshot = (payload: unknown): UsageProviderConfigSnapshot => {
  if (!payload || typeof payload !== "object") {
    return { items: [], version: 0, updatedAtMs: 0 };
  }
  const parsed = payload as Record<string, unknown>;
  const versionRaw =
    typeof parsed.version === "number" ? parsed.version : Number(parsed.version ?? 0);
  const updatedAtRaw =
    typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Number(parsed.updatedAtMs ?? 0);
  return {
    items: sanitizeUsageProviderConfigs(parsed.items),
    version: Number.isFinite(versionRaw) ? Math.max(0, Math.floor(versionRaw)) : 0,
    updatedAtMs: Number.isFinite(updatedAtRaw) ? Math.max(0, Math.floor(updatedAtRaw)) : 0,
  };
};

const pruneProviderCards = (state: AppViewState) => {
  const allowed = new Set(state.usageProviderConfigs.map((entry) => entry.id));
  const next: Record<string, UsageProviderCardState> = {};
  for (const [id, card] of Object.entries(state.usageProviderCards)) {
    if (allowed.has(id)) {
      next[id] = card;
    }
  }
  state.usageProviderCards = next;
};

const applyProviderConfigSnapshot = (
  state: AppViewState,
  snapshot: UsageProviderConfigSnapshot,
) => {
  const previousIds = new Set(state.usageProviderConfigs.map((entry) => entry.id));
  state.usageProviderConfigs = snapshot.items;
  state.usageProviderConfigsVersion = snapshot.version;
  state.usageProviderConfigsLoadedAt = Date.now();
  pruneProviderCards(state);
  scheduleProviderAutoRefresh(state);
  const added = snapshot.items.map((entry) => entry.id).filter((id) => !previousIds.has(id));
  for (const id of added) {
    void refreshProvider(state, id);
  }
};

const refreshProvider = async (state: AppViewState, id: string) => {
  const config = state.usageProviderConfigs.find((entry) => entry.id === id);
  if (!config || !config.enabled) {
    return;
  }
  if (!state.client || !state.connected) {
    state.usageProviderCards = {
      ...state.usageProviderCards,
      [id]: {
        ...ensureProviderCard(state, id),
        loading: false,
        status: "error",
        error: "Gateway 未连接，无法查询 Provider 用量",
      },
    };
    return;
  }
  const card = ensureProviderCard(state, id);
  state.usageProviderCards = {
    ...state.usageProviderCards,
    [id]: { ...card, loading: true, error: null },
  };
  const start = Date.now();
  try {
    const data = await state.client.request("usage.provider.fetch", {
      type: config.type,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
    });
    state.usageProviderCards = {
      ...state.usageProviderCards,
      [id]: {
        loading: false,
        error: null,
        status: "ok",
        lastUpdatedAt: Date.now(),
        latencyMs: Date.now() - start,
        data: (data ?? null) as UsageProviderCardState["data"],
      },
    };
  } catch (err) {
    state.usageProviderCards = {
      ...state.usageProviderCards,
      [id]: {
        ...ensureProviderCard(state, id),
        loading: false,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      },
    };
  }
};

const scheduleProviderAutoRefresh = (state: AppViewState) => {
  for (const timerId of providerAutoRefreshTimers.values()) {
    window.clearInterval(timerId);
  }
  providerAutoRefreshTimers.clear();
  if (!state.usageProviderAutoRefresh) {
    return;
  }
  for (const config of state.usageProviderConfigs) {
    if (!config.enabled) {
      continue;
    }
    const intervalMs = Math.max(10, config.intervalSec) * 1000;
    const timer = window.setInterval(() => {
      void refreshProvider(state, config.id);
    }, intervalMs);
    providerAutoRefreshTimers.set(config.id, timer);
  }
};

const refreshAllProviders = async (state: AppViewState) => {
  await Promise.all(
    state.usageProviderConfigs
      .filter((entry) => entry.enabled)
      .map((entry) => refreshProvider(state, entry.id)),
  );
};

const loadProviderConfigsFromGateway = async (
  state: AppViewState,
  opts?: { force?: boolean; skipLegacyMigration?: boolean },
) => {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.usageProviderConfigsLoading) {
    return;
  }
  if (!opts?.force && state.usageProviderConfigsLoadedAt) {
    const elapsed = Date.now() - state.usageProviderConfigsLoadedAt;
    if (elapsed < 5_000) {
      return;
    }
  }

  state.usageProviderConfigsLoading = true;
  state.usageProviderConfigsError = null;

  try {
    let snapshot = parseProviderConfigSnapshot(
      await state.client.request("usage.provider.config.list", {}),
    );

    if (
      !opts?.skipLegacyMigration &&
      !state.usageProviderLegacyMigrated &&
      snapshot.items.length === 0
    ) {
      const legacyItems = loadUsageProviderConfigs();
      if (legacyItems.length > 0) {
        for (const item of legacyItems) {
          await state.client.request("usage.provider.config.upsert", { item });
        }
        clearUsageProviderConfigs();
        snapshot = parseProviderConfigSnapshot(
          await state.client.request("usage.provider.config.list", {}),
        );
      }
      state.usageProviderLegacyMigrated = true;
    } else if (!state.usageProviderLegacyMigrated && snapshot.items.length > 0) {
      state.usageProviderLegacyMigrated = true;
    }

    applyProviderConfigSnapshot(state, snapshot);
  } catch (err) {
    state.usageProviderConfigsError = toErrorMessage(err);
  } finally {
    state.usageProviderConfigsLoading = false;
  }
};

const upsertProviderConfig = async (state: AppViewState, item: UsageProviderConfig) => {
  if (!state.client || !state.connected) {
    state.usageProviderConfigsError = "Gateway 未连接，无法保存 Provider 配置";
    return null;
  }
  state.usageProviderConfigsError = null;
  state.usageProviderConfigsLoading = true;
  try {
    const payload = await state.client.request("usage.provider.config.upsert", {
      item,
    });
    const snapshot = parseProviderConfigSnapshot(payload);
    applyProviderConfigSnapshot(state, snapshot);
    const maybeItem = sanitizeUsageProviderConfig(payload.item);
    return maybeItem?.id ?? item.id;
  } catch (err) {
    state.usageProviderConfigsError = toErrorMessage(err);
    return null;
  } finally {
    state.usageProviderConfigsLoading = false;
  }
};

const deleteProviderConfig = async (state: AppViewState, id: string) => {
  if (!state.client || !state.connected) {
    state.usageProviderConfigsError = "Gateway 未连接，无法删除 Provider 配置";
    return false;
  }
  state.usageProviderConfigsError = null;
  state.usageProviderConfigsLoading = true;
  try {
    const payload = await state.client.request("usage.provider.config.delete", { id });
    const snapshot = parseProviderConfigSnapshot(payload);
    applyProviderConfigSnapshot(state, snapshot);
    return true;
  } catch (err) {
    state.usageProviderConfigsError = toErrorMessage(err);
    return false;
  } finally {
    state.usageProviderConfigsLoading = false;
  }
};

const stopProviderConfigSync = () => {
  if (providerConfigSyncTimer !== null) {
    window.clearInterval(providerConfigSyncTimer);
    providerConfigSyncTimer = null;
  }
  if (providerConfigFocusListener) {
    window.removeEventListener("focus", providerConfigFocusListener);
    providerConfigFocusListener = null;
  }
  providerConfigSyncHost = null;
};

const ensureProviderConfigSync = (state: AppViewState) => {
  const shouldSync = state.tab === "usage" && Boolean(state.client) && state.connected;
  if (!shouldSync) {
    if (providerConfigSyncHost === state) {
      stopProviderConfigSync();
    }
    return;
  }

  if (providerConfigSyncHost !== state) {
    stopProviderConfigSync();
    providerConfigSyncHost = state;
    providerConfigFocusListener = () => {
      if (providerConfigSyncHost !== state) {
        return;
      }
      void loadProviderConfigsFromGateway(state, { force: true, skipLegacyMigration: true });
    };
    window.addEventListener("focus", providerConfigFocusListener);
    providerConfigSyncTimer = window.setInterval(() => {
      if (providerConfigSyncHost !== state) {
        return;
      }
      void loadProviderConfigsFromGateway(state, { force: true, skipLegacyMigration: true });
    }, PROVIDER_CONFIG_SYNC_INTERVAL_MS);
    void loadProviderConfigsFromGateway(state, { force: true });
    return;
  }

  void loadProviderConfigsFromGateway(state);
};

export function renderUsageTab(state: AppViewState) {
  ensureProviderConfigSync(state);
  if (state.tab !== "usage") {
    return nothing;
  }

  return html`
    ${renderProviderUsagePanel({
      configs: state.usageProviderConfigs,
      cards: state.usageProviderCards,
      adding: state.usageProviderAdding,
      autoRefresh: state.usageProviderAutoRefresh,
      loading: state.usageProviderConfigsLoading,
      error: state.usageProviderConfigsError,
      form: state.usageProviderForm,
      onToggleAdd: () => {
        state.usageProviderAdding = !state.usageProviderAdding;
      },
      onFormFieldChange: (key, value) => {
        state.usageProviderForm = { ...state.usageProviderForm, [key]: value };
      },
      onAdd: () => {
        const name = state.usageProviderForm.name.trim();
        const baseUrl = normalizeBaseUrl(state.usageProviderForm.baseUrl);
        const apiKey = state.usageProviderForm.apiKey.trim();
        if (!name || !baseUrl || !apiKey) {
          return;
        }
        const intervalSec = Number(state.usageProviderForm.intervalSec);
        const timeoutMs = Number(state.usageProviderForm.timeoutMs);
        const next: UsageProviderConfig = {
          id: generateUUID(),
          name,
          type: "sub2api",
          baseUrl,
          apiKey,
          enabled: true,
          intervalSec: Number.isFinite(intervalSec) ? Math.max(10, Math.floor(intervalSec)) : 60,
          timeoutMs: Number.isFinite(timeoutMs) ? Math.max(2000, Math.floor(timeoutMs)) : 12000,
        };
        void (async () => {
          const savedId = await upsertProviderConfig(state, next);
          if (!savedId) {
            return;
          }
          state.usageProviderForm = {
            name: "",
            type: "sub2api",
            baseUrl: "",
            apiKey: "",
            intervalSec: "60",
            timeoutMs: "12000",
          };
          void refreshProvider(state, savedId);
        })();
      },
      onDelete: (id) => {
        void (async () => {
          const ok = await deleteProviderConfig(state, id);
          if (!ok) {
            return;
          }
          const clone = { ...state.usageProviderCards };
          delete clone[id];
          state.usageProviderCards = clone;
        })();
      },
      onRefreshOne: (id) => {
        void refreshProvider(state, id);
      },
      onRefreshAll: () => {
        void refreshAllProviders(state);
      },
      onToggleAutoRefresh: (next) => {
        state.usageProviderAutoRefresh = next;
        scheduleProviderAutoRefresh(state);
      },
    })}

    ${renderUsage({
      loading: state.usageLoading,
      error: state.usageError,
      startDate: state.usageStartDate,
      endDate: state.usageEndDate,
      sessions: state.usageResult?.sessions ?? [],
      sessionsLimitReached: (state.usageResult?.sessions?.length ?? 0) >= 1000,
      totals: state.usageResult?.totals ?? null,
      aggregates: state.usageResult?.aggregates ?? null,
      costDaily: state.usageCostSummary?.daily ?? [],
      selectedSessions: state.usageSelectedSessions,
      selectedDays: state.usageSelectedDays,
      selectedHours: state.usageSelectedHours,
      chartMode: state.usageChartMode,
      dailyChartMode: state.usageDailyChartMode,
      timeSeriesMode: state.usageTimeSeriesMode,
      timeSeriesBreakdownMode: state.usageTimeSeriesBreakdownMode,
      timeSeries: state.usageTimeSeries,
      timeSeriesLoading: state.usageTimeSeriesLoading,
      timeSeriesCursorStart: state.usageTimeSeriesCursorStart,
      timeSeriesCursorEnd: state.usageTimeSeriesCursorEnd,
      sessionLogs: state.usageSessionLogs,
      sessionLogsLoading: state.usageSessionLogsLoading,
      sessionLogsExpanded: state.usageSessionLogsExpanded,
      logFilterRoles: state.usageLogFilterRoles,
      logFilterTools: state.usageLogFilterTools,
      logFilterHasTools: state.usageLogFilterHasTools,
      logFilterQuery: state.usageLogFilterQuery,
      query: state.usageQuery,
      queryDraft: state.usageQueryDraft,
      sessionSort: state.usageSessionSort,
      sessionSortDir: state.usageSessionSortDir,
      recentSessions: state.usageRecentSessions,
      sessionsTab: state.usageSessionsTab,
      visibleColumns: state.usageVisibleColumns as import("./views/usage.ts").UsageColumnId[],
      timeZone: state.usageTimeZone,
      contextExpanded: state.usageContextExpanded,
      headerPinned: state.usageHeaderPinned,
      onStartDateChange: (date) => {
        state.usageStartDate = date;
        state.usageSelectedDays = [];
        state.usageSelectedHours = [];
        state.usageSelectedSessions = [];
        debouncedLoadUsage(state);
      },
      onEndDateChange: (date) => {
        state.usageEndDate = date;
        state.usageSelectedDays = [];
        state.usageSelectedHours = [];
        state.usageSelectedSessions = [];
        debouncedLoadUsage(state);
      },
      onRefresh: () => loadUsage(state),
      onTimeZoneChange: (zone) => {
        state.usageTimeZone = zone;
        state.usageSelectedDays = [];
        state.usageSelectedHours = [];
        state.usageSelectedSessions = [];
        void loadUsage(state);
      },
      onToggleContextExpanded: () => {
        state.usageContextExpanded = !state.usageContextExpanded;
      },
      onToggleSessionLogsExpanded: () => {
        state.usageSessionLogsExpanded = !state.usageSessionLogsExpanded;
      },
      onLogFilterRolesChange: (next) => {
        state.usageLogFilterRoles = next;
      },
      onLogFilterToolsChange: (next) => {
        state.usageLogFilterTools = next;
      },
      onLogFilterHasToolsChange: (next) => {
        state.usageLogFilterHasTools = next;
      },
      onLogFilterQueryChange: (next) => {
        state.usageLogFilterQuery = next;
      },
      onLogFilterClear: () => {
        state.usageLogFilterRoles = [];
        state.usageLogFilterTools = [];
        state.usageLogFilterHasTools = false;
        state.usageLogFilterQuery = "";
      },
      onToggleHeaderPinned: () => {
        state.usageHeaderPinned = !state.usageHeaderPinned;
      },
      onSelectHour: (hour, shiftKey) => {
        if (shiftKey && state.usageSelectedHours.length > 0) {
          const allHours = Array.from({ length: 24 }, (_, i) => i);
          const lastSelected = state.usageSelectedHours[state.usageSelectedHours.length - 1];
          const lastIdx = allHours.indexOf(lastSelected);
          const thisIdx = allHours.indexOf(hour);
          if (lastIdx !== -1 && thisIdx !== -1) {
            const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
            const range = allHours.slice(start, end + 1);
            state.usageSelectedHours = [...new Set([...state.usageSelectedHours, ...range])];
          }
        } else {
          if (state.usageSelectedHours.includes(hour)) {
            state.usageSelectedHours = state.usageSelectedHours.filter((h) => h !== hour);
          } else {
            state.usageSelectedHours = [...state.usageSelectedHours, hour];
          }
        }
      },
      onQueryDraftChange: (query) => {
        state.usageQueryDraft = query;
        if (state.usageQueryDebounceTimer) {
          window.clearTimeout(state.usageQueryDebounceTimer);
        }
        state.usageQueryDebounceTimer = window.setTimeout(() => {
          state.usageQuery = state.usageQueryDraft;
          state.usageQueryDebounceTimer = null;
        }, 250);
      },
      onApplyQuery: () => {
        if (state.usageQueryDebounceTimer) {
          window.clearTimeout(state.usageQueryDebounceTimer);
          state.usageQueryDebounceTimer = null;
        }
        state.usageQuery = state.usageQueryDraft;
      },
      onClearQuery: () => {
        if (state.usageQueryDebounceTimer) {
          window.clearTimeout(state.usageQueryDebounceTimer);
          state.usageQueryDebounceTimer = null;
        }
        state.usageQueryDraft = "";
        state.usageQuery = "";
      },
      onSessionSortChange: (sort) => {
        state.usageSessionSort = sort;
      },
      onSessionSortDirChange: (dir) => {
        state.usageSessionSortDir = dir;
      },
      onSessionsTabChange: (tab) => {
        state.usageSessionsTab = tab;
      },
      onToggleColumn: (column) => {
        if (state.usageVisibleColumns.includes(column)) {
          state.usageVisibleColumns = state.usageVisibleColumns.filter((entry) => entry !== column);
        } else {
          state.usageVisibleColumns = [...state.usageVisibleColumns, column];
        }
      },
      onSelectSession: (key, shiftKey) => {
        state.usageTimeSeries = null;
        state.usageSessionLogs = null;
        state.usageRecentSessions = [
          key,
          ...state.usageRecentSessions.filter((entry) => entry !== key),
        ].slice(0, 8);

        if (shiftKey && state.usageSelectedSessions.length > 0) {
          // Shift-click: select range from last selected to this session
          // Sort sessions same way as displayed (by tokens or cost descending)
          const isTokenMode = state.usageChartMode === "tokens";
          const sortedSessions = [...(state.usageResult?.sessions ?? [])].toSorted((a, b) => {
            const valA = isTokenMode ? (a.usage?.totalTokens ?? 0) : (a.usage?.totalCost ?? 0);
            const valB = isTokenMode ? (b.usage?.totalTokens ?? 0) : (b.usage?.totalCost ?? 0);
            return valB - valA;
          });
          const allKeys = sortedSessions.map((s) => s.key);
          const lastSelected = state.usageSelectedSessions[state.usageSelectedSessions.length - 1];
          const lastIdx = allKeys.indexOf(lastSelected);
          const thisIdx = allKeys.indexOf(key);
          if (lastIdx !== -1 && thisIdx !== -1) {
            const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
            const range = allKeys.slice(start, end + 1);
            const newSelection = [...new Set([...state.usageSelectedSessions, ...range])];
            state.usageSelectedSessions = newSelection;
          }
        } else {
          // Regular click: focus a single session (so details always open).
          // Click the focused session again to clear selection.
          if (state.usageSelectedSessions.length === 1 && state.usageSelectedSessions[0] === key) {
            state.usageSelectedSessions = [];
          } else {
            state.usageSelectedSessions = [key];
          }
        }

        // Reset range selection when switching sessions
        state.usageTimeSeriesCursorStart = null;
        state.usageTimeSeriesCursorEnd = null;

        // Load timeseries/logs only if exactly one session selected
        if (state.usageSelectedSessions.length === 1) {
          void loadSessionTimeSeries(state, state.usageSelectedSessions[0]);
          void loadSessionLogs(state, state.usageSelectedSessions[0]);
        }
      },
      onSelectDay: (day, shiftKey) => {
        if (shiftKey && state.usageSelectedDays.length > 0) {
          // Shift-click: select range from last selected to this day
          const allDays = (state.usageCostSummary?.daily ?? []).map((d) => d.date);
          const lastSelected = state.usageSelectedDays[state.usageSelectedDays.length - 1];
          const lastIdx = allDays.indexOf(lastSelected);
          const thisIdx = allDays.indexOf(day);
          if (lastIdx !== -1 && thisIdx !== -1) {
            const [start, end] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
            const range = allDays.slice(start, end + 1);
            // Merge with existing selection
            const newSelection = [...new Set([...state.usageSelectedDays, ...range])];
            state.usageSelectedDays = newSelection;
          }
        } else {
          // Regular click: toggle single day
          if (state.usageSelectedDays.includes(day)) {
            state.usageSelectedDays = state.usageSelectedDays.filter((d) => d !== day);
          } else {
            state.usageSelectedDays = [day];
          }
        }
      },
      onChartModeChange: (mode) => {
        state.usageChartMode = mode;
      },
      onDailyChartModeChange: (mode) => {
        state.usageDailyChartMode = mode;
      },
      onTimeSeriesModeChange: (mode) => {
        state.usageTimeSeriesMode = mode;
      },
      onTimeSeriesBreakdownChange: (mode) => {
        state.usageTimeSeriesBreakdownMode = mode;
      },
      onTimeSeriesCursorRangeChange: (start, end) => {
        state.usageTimeSeriesCursorStart = start;
        state.usageTimeSeriesCursorEnd = end;
      },
      onClearDays: () => {
        state.usageSelectedDays = [];
      },
      onClearHours: () => {
        state.usageSelectedHours = [];
      },
      onClearSessions: () => {
        state.usageSelectedSessions = [];
        state.usageTimeSeries = null;
        state.usageSessionLogs = null;
      },
      onClearFilters: () => {
        state.usageSelectedDays = [];
        state.usageSelectedHours = [];
        state.usageSelectedSessions = [];
        state.usageTimeSeries = null;
        state.usageSessionLogs = null;
      },
    })}
  `;
}
