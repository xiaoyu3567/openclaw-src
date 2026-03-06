import type {
  WorkspaceFilesDownloadResult,
  WorkspaceFilesListResult,
  WorkspaceFilesStateResult,
} from "./types.ts";

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

function decodeBase64ToBytes(contentBase64: string): Uint8Array {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
    const list = await host.client.request<WorkspaceFilesListResult>("workspace.files.list", {
      agentId,
      query: host.filesPath,
    });
    host.filesEntries = list.entries ?? [];
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
    const list = await host.client.request<WorkspaceFilesListResult>("workspace.files.list", {
      agentId,
      query: nextPath,
    });
    host.filesEntries = list.entries ?? [];
  } catch (err) {
    host.filesError = `Failed to open directory: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    host.filesLoading = false;
  }
}

export async function downloadFile(host: FilesHost, filePath: string) {
  if (!host.connected || !host.client) {
    return;
  }
  host.filesError = null;
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
