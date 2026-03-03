import { parseAgentSessionKey } from "../../../src/sessions/session-key-utils.js";
import { scheduleChatScroll } from "./app-scroll.ts";
import { setLastActiveSessionKey } from "./app-settings.ts";
import { resetToolStream } from "./app-tool-stream.ts";
import type { OpenClawApp } from "./app.ts";
import { abortChatRun, loadChatHistory, sendChatMessage } from "./controllers/chat.ts";
import { loadSessions } from "./controllers/sessions.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import { normalizeBasePath } from "./navigation.ts";
import type { PromptRefineHistoryEntry } from "./types.ts";
import type { ChatAttachment, ChatQueueItem } from "./ui-types.ts";
import { generateUUID } from "./uuid.ts";

export type ChatHost = {
  connected: boolean;
  client: GatewayBrowserClient | null;
  chatMessage: string;
  chatMessages: unknown[];
  chatAttachments: ChatAttachment[];
  chatQueue: ChatQueueItem[];
  chatRunId: string | null;
  chatSending: boolean;
  chatRefineLoading: boolean;
  chatRefineStage: "idle" | "checking_api" | "preparing_context" | "refining";
  chatRefineError: string | null;
  chatRefineLastOriginal: string | null;
  chatRefineLastAt: number | null;
  chatRefineRequestId: number;
  sessionKey: string;
  basePath: string;
  hello: GatewayHelloOk | null;
  chatAvatarUrl: string | null;
  refreshSessionsAfterChat: Set<string>;
};

export const CHAT_SESSIONS_ACTIVE_MINUTES = 120;

export function isChatBusy(host: ChatHost) {
  return host.chatSending || Boolean(host.chatRunId);
}

export function isChatStopCommand(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "/stop") {
    return true;
  }
  return (
    normalized === "stop" ||
    normalized === "esc" ||
    normalized === "abort" ||
    normalized === "wait" ||
    normalized === "exit"
  );
}

function isChatResetCommand(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "/new" || normalized === "/reset") {
    return true;
  }
  return normalized.startsWith("/new ") || normalized.startsWith("/reset ");
}

export async function handleAbortChat(host: ChatHost) {
  if (!host.connected) {
    return;
  }
  host.chatMessage = "";
  await abortChatRun(host as unknown as OpenClawApp);
}

function enqueueChatMessage(
  host: ChatHost,
  text: string,
  attachments?: ChatAttachment[],
  refreshSessions?: boolean,
) {
  const trimmed = text.trim();
  const hasAttachments = Boolean(attachments && attachments.length > 0);
  if (!trimmed && !hasAttachments) {
    return;
  }
  host.chatQueue = [
    ...host.chatQueue,
    {
      id: generateUUID(),
      text: trimmed,
      createdAt: Date.now(),
      attachments: hasAttachments ? attachments?.map((att) => ({ ...att })) : undefined,
      refreshSessions,
    },
  ];
}

async function sendChatMessageNow(
  host: ChatHost,
  message: string,
  opts?: {
    previousDraft?: string;
    restoreDraft?: boolean;
    attachments?: ChatAttachment[];
    previousAttachments?: ChatAttachment[];
    restoreAttachments?: boolean;
    refreshSessions?: boolean;
  },
) {
  resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
  const runId = await sendChatMessage(host as unknown as OpenClawApp, message, opts?.attachments);
  const ok = Boolean(runId);
  if (!ok && opts?.previousDraft != null) {
    host.chatMessage = opts.previousDraft;
  }
  if (!ok && opts?.previousAttachments) {
    host.chatAttachments = opts.previousAttachments;
  }
  if (ok) {
    setLastActiveSessionKey(
      host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
      host.sessionKey,
    );
    // Chat session switcher should include all sessions, not only recently active ones.
    void loadSessions(host as unknown as OpenClawApp, {
      activeMinutes: 0,
      limit: 0,
    });
  }
  if (ok && opts?.restoreDraft && opts.previousDraft?.trim()) {
    host.chatMessage = opts.previousDraft;
  }
  if (ok && opts?.restoreAttachments && opts.previousAttachments?.length) {
    host.chatAttachments = opts.previousAttachments;
  }
  scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0]);
  if (ok && !host.chatRunId) {
    void flushChatQueue(host);
  }
  if (ok && opts?.refreshSessions && runId) {
    host.refreshSessionsAfterChat.add(runId);
  }
  return ok;
}

async function flushChatQueue(host: ChatHost) {
  if (!host.connected || isChatBusy(host)) {
    return;
  }
  const [next, ...rest] = host.chatQueue;
  if (!next) {
    return;
  }
  host.chatQueue = rest;
  const ok = await sendChatMessageNow(host, next.text, {
    attachments: next.attachments,
    refreshSessions: next.refreshSessions,
  });
  if (!ok) {
    host.chatQueue = [next, ...host.chatQueue];
  }
}

export function removeQueuedMessage(host: ChatHost, id: string) {
  host.chatQueue = host.chatQueue.filter((item) => item.id !== id);
}

function messageTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function buildPromptRefineHistory(messages: unknown[]): PromptRefineHistoryEntry[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  const items: PromptRefineHistoryEntry[] = [];
  for (let i = Math.max(0, messages.length - 14); i < messages.length; i++) {
    const entry = messages[i];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const roleRaw = (entry as { role?: unknown }).role;
    const role = typeof roleRaw === "string" ? roleRaw : "unknown";
    if (role !== "user" && role !== "assistant" && role !== "system") {
      continue;
    }
    const text = messageTextFromContent((entry as { content?: unknown }).content).trim();
    if (!text) {
      continue;
    }
    items.push({ role, text });
  }
  return items;
}

function normalizeRefineError(message: string): string {
  if (message.includes("timed out")) {
    return "Refine failed: request timed out (20s).";
  }
  if (message.includes("gateway not connected")) {
    return "Refine failed: gateway not connected.";
  }
  if (message.includes("missing run id")) {
    return "Refine failed: backend did not return run id.";
  }
  if (message.includes("empty output")) {
    return "Refine failed: model returned empty text.";
  }
  if (message.includes("model error")) {
    return "Refine failed: model run error.";
  }
  return `Refine failed: ${message}`;
}

type PromptRefineResult = { refined?: string };

export async function handleRefineChatPrompt(host: ChatHost) {
  if (!host.connected || !host.client || host.chatRefineLoading) {
    return;
  }
  const draft = host.chatMessage.trim();
  if (!draft) {
    return;
  }
  const requestId = host.chatRefineRequestId + 1;
  host.chatRefineRequestId = requestId;
  host.chatRefineLoading = true;
  host.chatRefineStage = "checking_api";
  host.chatRefineError = null;
  const original = host.chatMessage;
  host.chatRefineLastOriginal = original;

  try {
    await host.client.request("status", {});
    if (host.chatRefineRequestId !== requestId) {
      return;
    }

    host.chatRefineStage = "preparing_context";
    const history = buildPromptRefineHistory(host.chatMessages);

    host.chatRefineStage = "refining";
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("timed out")), 20_000);
    });

    const refinePromise = host.client.request<PromptRefineResult>("prompt.refine", {
      sessionKey: host.sessionKey,
      draft,
      style: "balanced",
      history,
    });

    const refinedResult = await Promise.race([refinePromise, timeoutPromise]);
    const refined = typeof refinedResult?.refined === "string" ? refinedResult.refined.trim() : "";
    if (!refined) {
      throw new Error("empty output");
    }

    if (host.chatRefineRequestId !== requestId) {
      return;
    }
    if (host.chatMessage !== original) {
      return;
    }
    if (refined.trim() === draft.trim()) {
      host.chatRefineError = "Refine completed: no significant changes.";
      return;
    }
    host.chatMessage = refined;
    host.chatRefineLastAt = Date.now();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    host.chatRefineError = normalizeRefineError(message || "unknown error");
  } finally {
    if (host.chatRefineRequestId === requestId) {
      host.chatRefineLoading = false;
      host.chatRefineStage = "idle";
    }
  }
}

export function handleUndoRefineChatPrompt(host: ChatHost) {
  const previous = host.chatRefineLastOriginal;
  if (!previous) {
    return;
  }
  host.chatMessage = previous;
  host.chatRefineLastOriginal = null;
  host.chatRefineLastAt = null;
  host.chatRefineError = null;
}

export async function handleSendChat(
  host: ChatHost,
  messageOverride?: string,
  opts?: { restoreDraft?: boolean },
) {
  if (!host.connected) {
    return;
  }
  const previousDraft = host.chatMessage;
  const message = (messageOverride ?? host.chatMessage).trim();
  const attachments = host.chatAttachments ?? [];
  const attachmentsToSend = messageOverride == null ? attachments : [];
  const hasAttachments = attachmentsToSend.length > 0;

  // Allow sending with just attachments (no message text required)
  if (!message && !hasAttachments) {
    return;
  }

  if (isChatStopCommand(message)) {
    await handleAbortChat(host);
    return;
  }

  const refreshSessions = isChatResetCommand(message);
  if (messageOverride == null) {
    host.chatMessage = "";
    // Clear attachments when sending
    host.chatAttachments = [];
  }

  if (isChatBusy(host)) {
    enqueueChatMessage(host, message, attachmentsToSend, refreshSessions);
    return;
  }

  await sendChatMessageNow(host, message, {
    previousDraft: messageOverride == null ? previousDraft : undefined,
    restoreDraft: Boolean(messageOverride && opts?.restoreDraft),
    attachments: hasAttachments ? attachmentsToSend : undefined,
    previousAttachments: messageOverride == null ? attachments : undefined,
    restoreAttachments: Boolean(messageOverride && opts?.restoreDraft),
    refreshSessions,
  });
}

export async function refreshChat(host: ChatHost, opts?: { scheduleScroll?: boolean }) {
  await Promise.all([
    loadChatHistory(host as unknown as OpenClawApp),
    // Keep chat dropdown consistent by loading the full session list.
    loadSessions(host as unknown as OpenClawApp, {
      activeMinutes: 0,
      limit: 0,
    }),
    refreshChatAvatar(host),
  ]);
  if (opts?.scheduleScroll !== false) {
    scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0]);
  }
}

export const flushChatQueueForEvent = flushChatQueue;

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
};

function resolveAgentIdForSession(host: ChatHost): string | null {
  const parsed = parseAgentSessionKey(host.sessionKey);
  if (parsed?.agentId) {
    return parsed.agentId;
  }
  const snapshot = host.hello?.snapshot as
    | { sessionDefaults?: SessionDefaultsSnapshot }
    | undefined;
  const fallback = snapshot?.sessionDefaults?.defaultAgentId?.trim();
  return fallback || "main";
}

function buildAvatarMetaUrl(basePath: string, agentId: string): string {
  const base = normalizeBasePath(basePath);
  const encoded = encodeURIComponent(agentId);
  return base ? `${base}/avatar/${encoded}?meta=1` : `/avatar/${encoded}?meta=1`;
}

export async function refreshChatAvatar(host: ChatHost) {
  if (!host.connected) {
    host.chatAvatarUrl = null;
    return;
  }
  const agentId = resolveAgentIdForSession(host);
  if (!agentId) {
    host.chatAvatarUrl = null;
    return;
  }
  host.chatAvatarUrl = null;
  const url = buildAvatarMetaUrl(host.basePath, agentId);
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      host.chatAvatarUrl = null;
      return;
    }
    const data = (await res.json()) as { avatarUrl?: unknown };
    const avatarUrl = typeof data.avatarUrl === "string" ? data.avatarUrl.trim() : "";
    host.chatAvatarUrl = avatarUrl || null;
  } catch {
    host.chatAvatarUrl = null;
  }
}
