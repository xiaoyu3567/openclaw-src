import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { t } from "../i18n/index.ts";
import { refreshChat } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import type { AppViewState } from "./app-view-state.ts";
import { OpenClawApp } from "./app.ts";
import { ChatState, loadChatHistory } from "./controllers/chat.ts";
import {
  createSessionAndRefresh,
  deleteSessionAndRefresh,
  loadSessions,
} from "./controllers/sessions.ts";
import { icons } from "./icons.ts";
import { iconForTab, pathForTab, titleForTab, type Tab } from "./navigation.ts";
import type { ThemeTransitionContext } from "./theme-transition.ts";
import type { ThemeMode } from "./theme.ts";
import type { SessionsListResult } from "./types.ts";
import { renderSessionDialogView } from "./views/session-dialog.ts";

type SessionDefaultsSnapshot = {
  mainSessionKey?: string;
  mainKey?: string;
};

function resolveSidebarChatSessionKey(state: AppViewState): string {
  const snapshot = state.hello?.snapshot as
    | { sessionDefaults?: SessionDefaultsSnapshot }
    | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  return "main";
}

function resetChatStateForSessionSwitch(state: AppViewState, sessionKey: string) {
  state.sessionKey = sessionKey;
  state.chatMessage = "";
  state.chatStream = null;
  (state as unknown as OpenClawApp).chatStreamStartedAt = null;
  state.chatRunId = null;
  (state as unknown as OpenClawApp).resetToolStream();
  (state as unknown as OpenClawApp).resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey,
    lastActiveSessionKey: sessionKey,
  });
}

function resolveSidebarChatTargetSessionKey(state: AppViewState): string {
  const currentSessionKey = state.sessionKey.trim();
  const fallbackMainSessionKey = resolveSidebarChatSessionKey(state);
  if (!currentSessionKey) {
    return fallbackMainSessionKey;
  }

  const sessions = state.sessionsResult?.sessions;
  if (!sessions || sessions.length === 0) {
    return currentSessionKey;
  }

  const exists = sessions.some((entry) => entry.key === currentSessionKey);
  return exists ? currentSessionKey : fallbackMainSessionKey;
}

function resolveAgentSessionPrefix(sessionKey: string): string {
  const normalized = sessionKey.trim();
  const match = /^agent:[^:]+:/.exec(normalized);
  if (match) {
    return match[0];
  }
  return "agent:main:";
}

function randomSessionSuffix(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `s${now}${rand}`;
}

export function renderTab(state: AppViewState, tab: Tab) {
  const href = pathForTab(tab, state.basePath);
  return html`
    <a
      href=${href}
      class="nav-item ${state.tab === tab ? "active" : ""}"
      @click=${(event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        if (tab === "chat") {
          const targetSessionKey = resolveSidebarChatTargetSessionKey(state);
          if (state.sessionKey !== targetSessionKey) {
            resetChatStateForSessionSwitch(state, targetSessionKey);
            void state.loadAssistantIdentity();
          }
        }
        state.setTab(tab);
      }}
      title=${titleForTab(tab)}
    >
      <span class="nav-item__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
      <span class="nav-item__text">${titleForTab(tab)}</span>
    </a>
  `;
}

export function renderChatControls(state: AppViewState) {
  const mainSessionKey = resolveMainSessionKey(state.hello, state.sessionsResult);
  const sessionOptions = resolveSessionOptions(
    state.sessionKey,
    state.sessionsResult,
    mainSessionKey,
  );
  const disableThinkingToggle = state.onboarding;
  const disableFocusToggle = state.onboarding;
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const focusActive = state.onboarding ? true : state.settings.chatFocusMode;
  const sessionPrefix = resolveAgentSessionPrefix(mainSessionKey ?? state.sessionKey);
  const deletableSessionOptions = sessionOptions.filter((entry) => entry.key !== mainSessionKey);
  const switchActiveSession = (next: string) => {
    state.sessionKey = next;
    state.chatMessage = "";
    state.chatStream = null;
    (state as unknown as OpenClawApp).chatStreamStartedAt = null;
    state.chatRunId = null;
    (state as unknown as OpenClawApp).resetToolStream();
    (state as unknown as OpenClawApp).resetChatScroll();
    state.applySettings({
      ...state.settings,
      sessionKey: next,
      lastActiveSessionKey: next,
    });
    void state.loadAssistantIdentity();
    syncUrlWithSessionKey(
      state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
      next,
      true,
    );
    void Promise.all([
      loadChatHistory(state as unknown as ChatState),
      loadSessions(state as unknown as OpenClawApp, {
        activeMinutes: 0,
        limit: 0,
      }),
    ]);
  };
  // Refresh icon
  const refreshIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
    </svg>
  `;
  const addIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 5v14"></path>
      <path d="M5 12h14"></path>
    </svg>
  `;
  const deleteIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M6 6l1 14h10l1-14"></path>
    </svg>
  `;
  const focusIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 7V4h3"></path>
      <path d="M20 7V4h-3"></path>
      <path d="M4 17v3h3"></path>
      <path d="M20 17v3h-3"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
  return html`
    <div class="chat-controls">
      <label class="field chat-controls__session">
        <select
          .value=${state.sessionKey}
          ?disabled=${!state.connected}
          @change=${(e: Event) => {
            const next = (e.target as HTMLSelectElement).value;
            switchActiveSession(next);
          }}
        >
          ${repeat(
            sessionOptions,
            (entry) => entry.key,
            (entry) =>
              html`<option value=${entry.key} title=${entry.key}>
                ${entry.displayName ?? entry.key}
              </option>`,
          )}
        </select>
      </label>
      <button
        class="btn btn--sm btn--icon"
        ?disabled=${state.chatLoading || !state.connected}
        @click=${async () => {
          const app = state as unknown as OpenClawApp;
          app.chatManualRefreshInFlight = true;
          app.chatNewMessagesBelow = false;
          await app.updateComplete;
          app.resetToolStream();
          try {
            await refreshChat(state as unknown as Parameters<typeof refreshChat>[0], {
              scheduleScroll: false,
            });
            app.scrollToBottom({ smooth: true });
          } finally {
            requestAnimationFrame(() => {
              app.chatManualRefreshInFlight = false;
              app.chatNewMessagesBelow = false;
            });
          }
        }}
        title=${t("chat.refreshTitle")}
      >
        ${refreshIcon}
      </button>
      <button
        class="btn btn--sm btn--icon"
        ?disabled=${!state.connected || state.sessionsLoading || state.chatLoading}
        @click=${() => {
          state.sessionDialogMode = "create";
          state.sessionDialogInput = "";
          state.sessionDialogError = null;
          state.sessionDialogConfirmOverwrite = false;
        }}
        title="Create or reset session"
      >
        ${addIcon}
      </button>
      <button
        class="btn btn--sm btn--icon danger"
        ?disabled=${
          !state.connected ||
          state.sessionsLoading ||
          deletableSessionOptions.length === 0 ||
          state.chatLoading
        }
        @click=${() => {
          if (deletableSessionOptions.length === 0) {
            state.sessionDialogMode = "delete";
            state.sessionDialogInput = "";
            state.sessionDialogError = "No deletable sessions available.";
            state.sessionDialogConfirmOverwrite = false;
            return;
          }
          state.sessionDialogMode = "delete";
          state.sessionDialogInput =
            deletableSessionOptions.find((entry) => entry.key === state.sessionKey)?.key ??
            deletableSessionOptions[0]?.key ??
            "";
          state.sessionDialogError = null;
          state.sessionDialogConfirmOverwrite = false;
        }}
        title="Delete session"
      >
        ${deleteIcon}
      </button>
      <span class="chat-controls__separator">|</span>
      <button
        class="btn btn--sm btn--icon ${showThinking ? "active" : ""}"
        ?disabled=${disableThinkingToggle}
        @click=${() => {
          if (disableThinkingToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatShowThinking: !state.settings.chatShowThinking,
          });
        }}
        aria-pressed=${showThinking}
        title=${disableThinkingToggle ? t("chat.onboardingDisabled") : t("chat.thinkingToggle")}
      >
        ${icons.brain}
      </button>
      <button
        class="btn btn--sm btn--icon ${focusActive ? "active" : ""}"
        ?disabled=${disableFocusToggle}
        @click=${() => {
          if (disableFocusToggle) {
            return;
          }
          state.applySettings({
            ...state.settings,
            chatFocusMode: !state.settings.chatFocusMode,
          });
        }}
        aria-pressed=${focusActive}
        title=${disableFocusToggle ? t("chat.onboardingDisabled") : t("chat.focusToggle")}
      >
        ${focusIcon}
      </button>
    </div>
    ${
      state.sessionDialogMode
        ? renderSessionDialog({
            state,
            sessionPrefix,
            sessionOptions,
            deletableSessionOptions,
            switchActiveSession,
            mainSessionKey,
          })
        : nothing
    }
  `;
}

function resolveDeleteSessionSelection(
  entries: Array<{ key: string; displayName?: string }>,
  input: string,
): { selectedKey: string | null; error: string | null } {
  const normalized = input.trim();
  if (!normalized) {
    return { selectedKey: null, error: "Session key/index is required." };
  }
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= entries.length) {
    return { selectedKey: entries[numeric - 1]?.key ?? null, error: null };
  }
  const normalizedInput = normalized.toLowerCase();
  const exactMatch =
    entries.find((entry) => entry.key === normalized) ??
    entries.find((entry) => (entry.displayName ?? "") === normalized);
  const suffixMatches = entries.filter((entry) => {
    const key = entry.key.toLowerCase();
    const displayName = (entry.displayName ?? "").toLowerCase();
    return (
      key === normalizedInput ||
      key.endsWith(`:${normalizedInput}`) ||
      displayName === normalizedInput
    );
  });
  if (exactMatch) {
    return { selectedKey: exactMatch.key, error: null };
  }
  if (suffixMatches.length > 1) {
    return {
      selectedKey: null,
      error: `Ambiguous session input. Use full key or index:\n${suffixMatches.map((entry) => entry.key).join("\n")}`,
    };
  }
  if (suffixMatches.length === 1) {
    return { selectedKey: suffixMatches[0]?.key ?? null, error: null };
  }
  return {
    selectedKey: null,
    error: "Session not found. Use index, full key, or unique key tail.",
  };
}

async function submitSessionDialog(params: {
  state: AppViewState;
  sessionPrefix: string;
  sessionOptions: Array<{ key: string; displayName?: string }>;
  deletableSessionOptions: Array<{ key: string; displayName?: string }>;
  switchActiveSession: (next: string) => void;
  mainSessionKey: string | null;
}) {
  const {
    state,
    sessionPrefix,
    sessionOptions,
    deletableSessionOptions,
    switchActiveSession,
    mainSessionKey,
  } = params;
  const isCreate = state.sessionDialogMode === "create";
  if (!isCreate && state.sessionDialogMode !== "delete") {
    return;
  }
  state.sessionDialogBusy = true;
  state.sessionDialogError = null;
  try {
    if (isCreate) {
      const input = state.sessionDialogInput.trim();
      const targetKey =
        input.length === 0
          ? `${sessionPrefix}${randomSessionSuffix()}`
          : input.includes(":")
            ? input
            : `${sessionPrefix}${input}`;
      const existing = sessionOptions.some((entry) => entry.key === targetKey);
      if (existing && !state.sessionDialogConfirmOverwrite) {
        state.sessionDialogConfirmOverwrite = true;
        return;
      }
      const createdKey = await createSessionAndRefresh(state, targetKey);
      if (!createdKey) {
        state.sessionDialogError =
          state.sessionsError ?? `Failed to create session "${targetKey}".`;
        return;
      }
      switchActiveSession(createdKey);
      state.sessionDialogMode = null;
      return;
    }

    const resolved = resolveDeleteSessionSelection(
      deletableSessionOptions,
      state.sessionDialogInput,
    );
    if (!resolved.selectedKey) {
      state.sessionDialogError = resolved.error;
      return;
    }
    const deleted = await deleteSessionAndRefresh(state, resolved.selectedKey, {
      skipConfirm: true,
    });
    if (!deleted) {
      state.sessionDialogError =
        state.sessionsError ?? `Failed to delete session "${resolved.selectedKey}".`;
      return;
    }
    if (state.sessionKey === resolved.selectedKey) {
      const fallback = mainSessionKey ?? resolveSidebarChatSessionKey(state);
      if (fallback && fallback !== resolved.selectedKey) {
        switchActiveSession(fallback);
      }
    }
    state.sessionDialogMode = null;
  } finally {
    state.sessionDialogBusy = false;
  }
}

function renderSessionDialog(params: {
  state: AppViewState;
  sessionPrefix: string;
  sessionOptions: Array<{ key: string; displayName?: string }>;
  deletableSessionOptions: Array<{ key: string; displayName?: string }>;
  switchActiveSession: (next: string) => void;
  mainSessionKey: string | null;
}) {
  const { state } = params;
  if (!state.sessionDialogMode) {
    return nothing;
  }
  const isCreate = state.sessionDialogMode === "create";
  return renderSessionDialogView({
    mode: state.sessionDialogMode,
    title: isCreate ? "Create or reset session" : "Delete session",
    subtitle: isCreate
      ? `Prefix: ${params.sessionPrefix}. Enter suffix (xxx) or full key. Leave blank for random suffix.`
      : "Enter index, full key, or unique key tail.",
    primaryLabel: isCreate ? "Create or reset" : "Delete",
    placeholder: isCreate ? "e.g. test-01 or agent:main:test-01" : "e.g. 2 or test-01",
    input: state.sessionDialogInput,
    busy: state.sessionDialogBusy,
    connected: state.connected,
    error: state.sessionDialogError,
    confirmOverwrite: state.sessionDialogConfirmOverwrite,
    deletableSessionOptions: params.deletableSessionOptions,
    onInput: (value) => {
      state.sessionDialogInput = value;
      state.sessionDialogError = null;
      state.sessionDialogConfirmOverwrite = false;
    },
    onSubmit: () => submitSessionDialog(params),
    onCancel: () => {
      state.sessionDialogMode = null;
      state.sessionDialogError = null;
      state.sessionDialogConfirmOverwrite = false;
    },
  });
}

function resolveMainSessionKey(
  hello: AppViewState["hello"],
  sessions: SessionsListResult | null,
): string | null {
  const snapshot = hello?.snapshot as { sessionDefaults?: SessionDefaultsSnapshot } | undefined;
  const mainSessionKey = snapshot?.sessionDefaults?.mainSessionKey?.trim();
  if (mainSessionKey) {
    return mainSessionKey;
  }
  const mainKey = snapshot?.sessionDefaults?.mainKey?.trim();
  if (mainKey) {
    return mainKey;
  }
  if (sessions?.sessions?.some((row) => row.key === "main")) {
    return "main";
  }
  return null;
}

/* ── Channel display labels ────────────────────────────── */
const CHANNEL_LABELS: Record<string, string> = {
  bluebubbles: "iMessage",
  telegram: "Telegram",
  discord: "Discord",
  signal: "Signal",
  slack: "Slack",
  whatsapp: "WhatsApp",
  matrix: "Matrix",
  email: "Email",
  sms: "SMS",
};

const KNOWN_CHANNEL_KEYS = Object.keys(CHANNEL_LABELS);

/** Parsed type / context extracted from a session key. */
export type SessionKeyInfo = {
  /** Prefix for typed sessions (Subagent:/Cron:). Empty for others. */
  prefix: string;
  /** Human-readable fallback when no label / displayName is available. */
  fallbackName: string;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse a session key to extract type information and a human-readable
 * fallback display name.  Exported for testing.
 */
export function parseSessionKey(key: string): SessionKeyInfo {
  // ── Main session ─────────────────────────────────
  if (key === "main" || key === "agent:main:main") {
    return { prefix: "", fallbackName: "Main Session" };
  }

  // ── Subagent ─────────────────────────────────────
  if (key.includes(":subagent:")) {
    return { prefix: "Subagent:", fallbackName: "Subagent:" };
  }

  // ── Cron job ─────────────────────────────────────
  if (key.includes(":cron:")) {
    return { prefix: "Cron:", fallbackName: "Cron Job:" };
  }

  // ── Direct chat  (agent:<x>:<channel>:direct:<id>) ──
  const directMatch = key.match(/^agent:[^:]+:([^:]+):direct:(.+)$/);
  if (directMatch) {
    const channel = directMatch[1];
    const identifier = directMatch[2];
    const channelLabel = CHANNEL_LABELS[channel] ?? capitalize(channel);
    return { prefix: "", fallbackName: `${channelLabel} · ${identifier}` };
  }

  // ── Group chat  (agent:<x>:<channel>:group:<id>) ────
  const groupMatch = key.match(/^agent:[^:]+:([^:]+):group:(.+)$/);
  if (groupMatch) {
    const channel = groupMatch[1];
    const channelLabel = CHANNEL_LABELS[channel] ?? capitalize(channel);
    return { prefix: "", fallbackName: `${channelLabel} Group` };
  }

  // ── Channel-prefixed legacy keys (e.g. "bluebubbles:g-…") ──
  for (const ch of KNOWN_CHANNEL_KEYS) {
    if (key === ch || key.startsWith(`${ch}:`)) {
      return { prefix: "", fallbackName: `${CHANNEL_LABELS[ch]} Session` };
    }
  }

  // ── Unknown — return key as-is ───────────────────
  return { prefix: "", fallbackName: key };
}

export function resolveSessionDisplayName(
  key: string,
  row?: SessionsListResult["sessions"][number],
): string {
  const label = row?.label?.trim() || "";
  const displayName = row?.displayName?.trim() || "";
  const { prefix, fallbackName } = parseSessionKey(key);

  const applyTypedPrefix = (name: string): string => {
    if (!prefix) {
      return name;
    }
    const prefixPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*`, "i");
    return prefixPattern.test(name) ? name : `${prefix} ${name}`;
  };

  if (label && label !== key) {
    return applyTypedPrefix(label);
  }
  if (displayName && displayName !== key) {
    return applyTypedPrefix(displayName);
  }
  return fallbackName;
}

function resolveSessionOptions(
  sessionKey: string,
  sessions: SessionsListResult | null,
  mainSessionKey?: string | null,
) {
  const seen = new Set<string>();
  const options: Array<{ key: string; displayName?: string }> = [];

  const resolvedMain = mainSessionKey && sessions?.sessions?.find((s) => s.key === mainSessionKey);
  const resolvedCurrent = sessions?.sessions?.find((s) => s.key === sessionKey);

  // Add main session key first
  if (mainSessionKey) {
    seen.add(mainSessionKey);
    options.push({
      key: mainSessionKey,
      displayName: resolveSessionDisplayName(mainSessionKey, resolvedMain || undefined),
    });
  }

  // Add current session key next
  if (!seen.has(sessionKey)) {
    seen.add(sessionKey);
    options.push({
      key: sessionKey,
      displayName: resolveSessionDisplayName(sessionKey, resolvedCurrent),
    });
  }

  // Add sessions from the result
  if (sessions?.sessions) {
    for (const s of sessions.sessions) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        options.push({
          key: s.key,
          displayName: resolveSessionDisplayName(s.key, s),
        });
      }
    }
  }

  return options;
}

const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

export function renderThemeToggle(state: AppViewState) {
  const index = Math.max(0, THEME_ORDER.indexOf(state.theme));
  const applyTheme = (next: ThemeMode) => (event: MouseEvent) => {
    const element = event.currentTarget as HTMLElement;
    const context: ThemeTransitionContext = { element };
    if (event.clientX || event.clientY) {
      context.pointerClientX = event.clientX;
      context.pointerClientY = event.clientY;
    }
    state.setTheme(next, context);
  };

  return html`
    <div class="theme-toggle" style="--theme-index: ${index};">
      <div class="theme-toggle__track" role="group" aria-label="Theme">
        <span class="theme-toggle__indicator"></span>
        <button
          class="theme-toggle__button ${state.theme === "system" ? "active" : ""}"
          @click=${applyTheme("system")}
          aria-pressed=${state.theme === "system"}
          aria-label="System theme"
          title="System"
        >
          ${renderMonitorIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "light" ? "active" : ""}"
          @click=${applyTheme("light")}
          aria-pressed=${state.theme === "light"}
          aria-label="Light theme"
          title="Light"
        >
          ${renderSunIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "dark" ? "active" : ""}"
          @click=${applyTheme("dark")}
          aria-pressed=${state.theme === "dark"}
          aria-label="Dark theme"
          title="Dark"
        >
          ${renderMoonIcon()}
        </button>
      </div>
    </div>
  `;
}

function renderSunIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path>
      <path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path>
      <path d="m19.07 4.93-1.41 1.41"></path>
    </svg>
  `;
}

function renderMoonIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
      ></path>
    </svg>
  `;
}

function renderMonitorIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2"></rect>
      <line x1="8" x2="16" y1="21" y2="21"></line>
      <line x1="12" x2="12" y1="17" y2="21"></line>
    </svg>
  `;
}
