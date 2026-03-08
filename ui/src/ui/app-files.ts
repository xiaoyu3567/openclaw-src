import type {
  WorkspaceFilesDeleteResult,
  WorkspaceFilesDownloadResult,
  WorkspaceFilesListResult,
  WorkspaceFilesPreviewResult,
  WorkspaceFilesStateResult,
} from "./types.ts";

export type FilesMenuPosition = {
  x: number;
  y: number;
};

export type FilesHost = {
  connected: boolean;
  client: {
    request<T>(method: string, params?: unknown): Promise<T>;
  } | null;
  sessionKey: string;
  filesPath: string;
  filesEntries: string[];
  filesLoading: boolean;
  filesError: string | null;
  filesSelectedPath: string | null;
  filesContextMenuOpen: boolean;
  filesContextMenuTargetPath: string | null;
  filesContextMenuPosition: FilesMenuPosition | null;
  filesPreviewOpen: boolean;
  filesPreviewPath: string | null;
  filesPreviewKind: "text" | "markdown" | "image" | "unsupported" | "too_large" | null;
  filesPreviewLoading: boolean;
  filesPreviewError: string | null;
  filesPreviewText: string | null;
  filesPreviewImageDataUrl: string | null;
  filesPreviewMimeType: string | null;
  filesPreviewMarkdownMode: "render" | "source";
  filesPreviewImageBackground: "checker" | "dark" | "light";
  filesPreviewOffsetX: number;
  filesPreviewOffsetY: number;
  filesDeleteConfirmOpen: boolean;
  filesDeletePendingPath: string | null;
  filesDeleteBusy: boolean;
  filesDeleteError: string | null;
};

function resolveAgentId(sessionKey: string): string {
  const match = /^agent:([^:]+):/i.exec(sessionKey.trim());
  return match?.[1]?.trim() || "main";
}

function normalizeDirPath(input: string): string {
  const value = (input || "/").trim();
  const raw = value.startsWith("/") ? value : `/${value}`;
  const parts = raw.split("/").filter(Boolean);
  const normalized = `/${parts.join("/")}`;
  return normalized === "/" ? "/" : `${normalized}/`;
}

function joinPath(baseDir: string, name: string): string {
  if (!baseDir || baseDir === "/") {
    return `/${name}`;
  }
  return `${baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir}/${name}`;
}

function decodeBase64ToBytes(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function resolveNextSelectedPath(host: FilesHost, entries: string[]): string | null {
  if (entries.length === 0) {
    return null;
  }
  if (host.filesSelectedPath) {
    const normalizedCurrent = host.filesSelectedPath;
    const stillExists = entries.some((entry) => {
      const resolved = entry.startsWith("/") ? entry : joinPath(host.filesPath, entry);
      return resolved === normalizedCurrent;
    });
    if (stillExists) {
      return normalizedCurrent;
    }
  }
  const first = entries[0] ?? "";
  return first ? (first.startsWith("/") ? first : joinPath(host.filesPath, first)) : null;
}

async function reloadFilesEntries(host: FilesHost, pathOverride?: string) {
  if (!host.connected || !host.client) {
    return;
  }
  const agentId = resolveAgentId(host.sessionKey);
  const list = await host.client.request<WorkspaceFilesListResult>("workspace.files.list", {
    agentId,
    query: pathOverride ?? host.filesPath,
  });
  host.filesEntries = list.entries ?? [];
  host.filesSelectedPath = resolveNextSelectedPath(host, host.filesEntries);
}

export async function loadFilesView(host: FilesHost) {
  if (!host.connected || !host.client) {
    return;
  }
  host.filesLoading = true;
  host.filesError = null;
  const agentId = resolveAgentId(host.sessionKey);
  try {
    const state = await host.client.request<WorkspaceFilesStateResult>(
      "workspace.files.state.get",
      {
        sessionKey: host.sessionKey,
        agentId,
      },
    );
    host.filesPath = normalizeDirPath(state.selectedDir || "/");
  } catch {
    host.filesPath = "/";
  }

  try {
    await reloadFilesEntries(host);
  } catch (err) {
    host.filesEntries = [];
    host.filesError = `Failed to load files: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    host.filesLoading = false;
  }
}

export async function openFilesDirectory(host: FilesHost, path: string) {
  if (!host.connected || !host.client) {
    return;
  }
  host.filesLoading = true;
  host.filesError = null;
  const agentId = resolveAgentId(host.sessionKey);
  const nextPath = normalizeDirPath(path);
  try {
    await host.client.request<WorkspaceFilesStateResult>("workspace.files.state.set", {
      sessionKey: host.sessionKey,
      agentId,
      selectedDir: nextPath,
    });
    host.filesPath = nextPath;
    await reloadFilesEntries(host, nextPath);
  } catch (err) {
    host.filesError = `Failed to open directory: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    host.filesLoading = false;
  }
}

export function selectFilesPath(host: FilesHost, filePath: string | null) {
  host.filesSelectedPath = filePath;
}

export function openFilesContextMenu(
  host: FilesHost,
  filePath: string,
  position: FilesMenuPosition,
) {
  host.filesSelectedPath = filePath;
  host.filesContextMenuOpen = true;
  host.filesContextMenuTargetPath = filePath;
  host.filesContextMenuPosition = position;
}

export function closeFilesContextMenu(host: FilesHost) {
  host.filesContextMenuOpen = false;
  host.filesContextMenuTargetPath = null;
  host.filesContextMenuPosition = null;
}

export function closeFilesPreview(host: FilesHost) {
  host.filesPreviewOpen = false;
  host.filesPreviewPath = null;
  host.filesPreviewKind = null;
  host.filesPreviewLoading = false;
  host.filesPreviewError = null;
  host.filesPreviewText = null;
  host.filesPreviewImageDataUrl = null;
  host.filesPreviewMimeType = null;
  host.filesPreviewMarkdownMode = "render";
  host.filesPreviewOffsetX = 0;
  host.filesPreviewOffsetY = 0;
}

export function setFilesPreviewMarkdownMode(host: FilesHost, mode: "render" | "source") {
  host.filesPreviewMarkdownMode = mode;
}

export function setFilesPreviewImageBackground(
  host: FilesHost,
  mode: "checker" | "dark" | "light",
) {
  host.filesPreviewImageBackground = mode;
}

export function setFilesPreviewOffset(host: FilesHost, x: number, y: number) {
  host.filesPreviewOffsetX = x;
  host.filesPreviewOffsetY = y;
}

export async function previewFile(host: FilesHost, filePath: string) {
  if (!host.connected || !host.client) {
    return;
  }
  closeFilesContextMenu(host);
  host.filesSelectedPath = filePath;
  host.filesPreviewOpen = true;
  host.filesPreviewPath = filePath;
  host.filesPreviewLoading = true;
  host.filesPreviewError = null;
  host.filesPreviewText = null;
  host.filesPreviewImageDataUrl = null;
  host.filesPreviewMimeType = null;

  try {
    const result = await host.client.request<WorkspaceFilesPreviewResult>(
      "workspace.files.preview",
      {
        sessionKey: host.sessionKey,
        agentId: resolveAgentId(host.sessionKey),
        path: filePath,
      },
    );
    host.filesPreviewKind = result.kind;
    host.filesPreviewMimeType = result.mimeType;
    host.filesPreviewText =
      result.kind === "text" || result.kind === "markdown" ? (result.text ?? "") : null;
    host.filesPreviewImageDataUrl =
      result.kind === "image" && result.contentBase64
        ? `data:${result.mimeType};base64,${result.contentBase64}`
        : null;
    if (result.kind !== "text" && result.kind !== "markdown" && result.kind !== "image") {
      host.filesPreviewError =
        result.kind === "too_large"
          ? "Preview is too large. Download the file instead."
          : result.kind === "unsupported"
            ? "Preview is not supported for this file type yet."
            : "Preview is not available yet for this file type.";
    }
  } catch (err) {
    host.filesPreviewKind = null;
    host.filesPreviewError = `Failed to preview file: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    host.filesPreviewLoading = false;
  }
}

export function requestDeleteFile(host: FilesHost, filePath: string) {
  closeFilesContextMenu(host);
  host.filesSelectedPath = filePath;
  host.filesDeleteConfirmOpen = true;
  host.filesDeletePendingPath = filePath;
  host.filesDeleteBusy = false;
  host.filesDeleteError = null;
}

export function cancelDeleteFile(host: FilesHost) {
  host.filesDeleteConfirmOpen = false;
  host.filesDeletePendingPath = null;
  host.filesDeleteBusy = false;
  host.filesDeleteError = null;
}

export async function confirmDeleteFile(host: FilesHost) {
  if (!host.connected || !host.client || !host.filesDeletePendingPath) {
    return;
  }
  host.filesDeleteBusy = true;
  host.filesDeleteError = null;
  const pendingPath = host.filesDeletePendingPath;
  try {
    await host.client.request<WorkspaceFilesDeleteResult>("workspace.files.delete", {
      sessionKey: host.sessionKey,
      agentId: resolveAgentId(host.sessionKey),
      path: pendingPath,
    });
    if (host.filesPreviewPath === pendingPath) {
      closeFilesPreview(host);
    }
    cancelDeleteFile(host);
    await reloadFilesEntries(host);
  } catch (err) {
    host.filesDeleteError = `Failed to delete file: ${err instanceof Error ? err.message : String(err)}`;
    host.filesDeleteBusy = false;
  }
}

export async function downloadFile(host: FilesHost, filePath: string) {
  if (!host.connected || !host.client) {
    return;
  }
  host.filesError = null;
  closeFilesContextMenu(host);
  try {
    const result = await host.client.request<WorkspaceFilesDownloadResult>(
      "workspace.files.download",
      {
        sessionKey: host.sessionKey,
        agentId: resolveAgentId(host.sessionKey),
        path: filePath,
      },
    );
    const bytes = decodeBase64ToBytes(result.contentBase64);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = result.fileName || filePath.split("/").pop() || "download.bin";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    host.filesError = `Failed to download file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function resolveParentDir(path: string): string {
  const current = normalizeDirPath(path);
  if (current === "/") {
    return "/";
  }
  const segments = current.split("/").filter(Boolean);
  segments.pop();
  if (!segments.length) {
    return "/";
  }
  return `/${segments.join("/")}/`;
}
