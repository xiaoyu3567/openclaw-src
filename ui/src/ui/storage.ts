const KEY = "openclaw.control.settings.v1";

import { isSupportedLocale } from "../i18n/index.ts";
import type { ThemeMode } from "./theme.ts";

export type PreviewDockMode = "corner" | "center";
export type PreviewImageMode = "fit" | "actual";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
  filesPreviewPanelWidth: number;
  filesPreviewPanelHeight: number;
  filesPreviewDockMode: PreviewDockMode;
  filesPreviewImageMode: PreviewImageMode;
  locale?: string;
};

export function loadSettings(): UiSettings {
  const defaultUrl = (() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
    filesPreviewPanelWidth: 820,
    filesPreviewPanelHeight: 620,
    filesPreviewDockMode: "corner",
    filesPreviewImageMode: "fit",
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
      filesPreviewPanelWidth:
        typeof parsed.filesPreviewPanelWidth === "number" &&
        parsed.filesPreviewPanelWidth >= 420 &&
        parsed.filesPreviewPanelWidth <= 1400
          ? parsed.filesPreviewPanelWidth
          : defaults.filesPreviewPanelWidth,
      filesPreviewPanelHeight:
        typeof parsed.filesPreviewPanelHeight === "number" &&
        parsed.filesPreviewPanelHeight >= 320 &&
        parsed.filesPreviewPanelHeight <= 1000
          ? parsed.filesPreviewPanelHeight
          : defaults.filesPreviewPanelHeight,
      filesPreviewDockMode:
        parsed.filesPreviewDockMode === "center" || parsed.filesPreviewDockMode === "corner"
          ? parsed.filesPreviewDockMode
          : defaults.filesPreviewDockMode,
      filesPreviewImageMode:
        parsed.filesPreviewImageMode === "actual" || parsed.filesPreviewImageMode === "fit"
          ? parsed.filesPreviewImageMode
          : defaults.filesPreviewImageMode,
      locale: isSupportedLocale(parsed.locale) ? parsed.locale : undefined,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
