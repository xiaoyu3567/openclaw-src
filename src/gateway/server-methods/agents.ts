import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
} from "../../agents/agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
  ensureAgentWorkspace,
  isWorkspaceOnboardingCompleted,
} from "../../agents/workspace.js";
import { movePathToTrash } from "../../browser/trash.js";
import {
  applyAgentConfig,
  findAgentEntryIndex,
  listAgentEntries,
  pruneAgentConfig,
} from "../../commands/agents.config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveSessionTranscriptsDirForAgent } from "../../config/sessions/paths.js";
import { sameFileIdentity } from "../../infra/file-identity.js";
import { SafeOpenError, readLocalFileSafely, writeFileWithinRoot } from "../../infra/fs-safe.js";
import { assertNoPathAliasEscape } from "../../infra/path-alias-guards.js";
import { isNotFoundPathError } from "../../infra/path-guards.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveUserPath } from "../../utils.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAgentsCreateParams,
  validateAgentsDeleteParams,
  validateAgentsFilesGetParams,
  validateAgentsFilesListParams,
  validateAgentsFilesSetParams,
  validateAgentsListParams,
  validateAgentsUpdateParams,
} from "../protocol/index.js";
import { listAgentsForGateway } from "../session-utils.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

const BOOTSTRAP_FILE_NAMES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_USER_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_BOOTSTRAP_FILENAME,
] as const;
const BOOTSTRAP_FILE_NAMES_POST_ONBOARDING = BOOTSTRAP_FILE_NAMES.filter(
  (name) => name !== DEFAULT_BOOTSTRAP_FILENAME,
);

const MEMORY_FILE_NAMES = [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME] as const;
const WORKSPACE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const WORKSPACE_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024;
const WORKSPACE_PREVIEW_TEXT_MAX_BYTES = 300 * 1024;
const WORKSPACE_PREVIEW_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const WORKSPACE_FILES_UI_STATE_RELATIVE_PATH = path.join(".openclaw", "files-ui.json");
const WORKSPACE_PREVIEW_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
  ".py",
  ".sh",
  ".yaml",
  ".yml",
  ".rs",
  ".go",
  ".java",
  ".md",
]);
const WORKSPACE_PREVIEW_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);

const ALLOWED_FILE_NAMES = new Set<string>([...BOOTSTRAP_FILE_NAMES, ...MEMORY_FILE_NAMES]);

function resolveAgentWorkspaceFileOrRespondError(
  params: Record<string, unknown>,
  respond: RespondFn,
): {
  cfg: ReturnType<typeof loadConfig>;
  agentId: string;
  workspaceDir: string;
  name: string;
} | null {
  const cfg = loadConfig();
  const rawAgentId = params.agentId;
  const agentId = resolveAgentIdOrError(
    typeof rawAgentId === "string" || typeof rawAgentId === "number" ? String(rawAgentId) : "",
    cfg,
  );
  if (!agentId) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
    return null;
  }
  const rawName = params.name;
  const name = (
    typeof rawName === "string" || typeof rawName === "number" ? String(rawName) : ""
  ).trim();
  if (!ALLOWED_FILE_NAMES.has(name)) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `unsupported file "${name}"`));
    return null;
  }
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return { cfg, agentId, workspaceDir, name };
}

function resolveAgentIdFromSessionKey(sessionKey: string): string {
  const match = /^agent:([^:]+):/i.exec(sessionKey.trim());
  const candidate = match?.[1]?.trim();
  return candidate || DEFAULT_AGENT_ID;
}

function sanitizeUploadFileName(name: string): string {
  const baseName = path.basename(name || "").trim();
  const withoutUnsafe = Array.from(baseName)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code <= 0x1f || '<>:"/\\|?*'.includes(char)) {
        return "_";
      }
      return char;
    })
    .join("");
  const safe = withoutUnsafe.replace(/\s+/g, " ");
  return safe || "upload.bin";
}

async function resolveUniqueUploadRelativePath(
  workspaceDir: string,
  relativePath: string,
): Promise<string> {
  const parsed = path.parse(relativePath);
  let candidate = relativePath;
  let index = 1;
  while (true) {
    const candidatePath = path.resolve(workspaceDir, candidate);
    const exists = await fs
      .access(candidatePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      return candidate;
    }
    candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
}

function resolveAgentForWorkspaceRpc(
  body: Record<string, unknown>,
  cfg: ReturnType<typeof loadConfig>,
): string | null {
  const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const requestedAgentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const sessionAgentId = sessionKey ? resolveAgentIdFromSessionKey(sessionKey) : "";
  return resolveAgentIdOrError(requestedAgentId || sessionAgentId || DEFAULT_AGENT_ID, cfg);
}

async function readWorkspaceFilesUiState(workspaceDir: string): Promise<{ selectedDir: string }> {
  const filePath = path.resolve(workspaceDir, WORKSPACE_FILES_UI_STATE_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { selectedDir?: unknown };
    const selectedDir =
      typeof parsed.selectedDir === "string" && parsed.selectedDir.trim()
        ? parsed.selectedDir.trim()
        : "/";
    return { selectedDir };
  } catch {
    return { selectedDir: "/" };
  }
}

async function writeWorkspaceFilesUiState(
  workspaceDir: string,
  next: { selectedDir: string },
): Promise<void> {
  const selectedDir = next.selectedDir.trim() || "/";
  const payload = `${JSON.stringify({ selectedDir }, null, 2)}\n`;
  await writeFileWithinRoot({
    rootDir: workspaceDir,
    relativePath: WORKSPACE_FILES_UI_STATE_RELATIVE_PATH,
    data: payload,
    encoding: "utf8",
  });
}

function resolveWorkspacePreviewMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".yaml":
    case ".yml":
      return "application/yaml; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/plain; charset=utf-8";
  }
}

function classifyWorkspacePreviewKind(
  filePath: string,
): "text" | "markdown" | "image" | "unsupported" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md") {
    return "markdown";
  }
  if (WORKSPACE_PREVIEW_IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (WORKSPACE_PREVIEW_TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return "unsupported";
}

type FileMeta = {
  size: number;
  updatedAtMs: number;
};

type ResolvedAgentWorkspaceFilePath =
  | {
      kind: "ready";
      requestPath: string;
      ioPath: string;
      workspaceReal: string;
    }
  | {
      kind: "missing";
      requestPath: string;
      ioPath: string;
      workspaceReal: string;
    }
  | {
      kind: "invalid";
      requestPath: string;
      reason: string;
    };

async function resolveWorkspaceRealPath(workspaceDir: string): Promise<string> {
  try {
    return await fs.realpath(workspaceDir);
  } catch {
    return path.resolve(workspaceDir);
  }
}

async function resolveAgentWorkspaceFilePath(params: {
  workspaceDir: string;
  name: string;
  allowMissing: boolean;
}): Promise<ResolvedAgentWorkspaceFilePath> {
  const requestPath = path.join(params.workspaceDir, params.name);
  const workspaceReal = await resolveWorkspaceRealPath(params.workspaceDir);
  const candidatePath = path.resolve(workspaceReal, params.name);

  try {
    await assertNoPathAliasEscape({
      absolutePath: candidatePath,
      rootPath: workspaceReal,
      boundaryLabel: "workspace root",
    });
  } catch (error) {
    return {
      kind: "invalid",
      requestPath,
      reason: error instanceof Error ? error.message : "path escapes workspace root",
    };
  }

  let candidateLstat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    candidateLstat = await fs.lstat(candidatePath);
  } catch (err) {
    if (isNotFoundPathError(err)) {
      if (params.allowMissing) {
        return { kind: "missing", requestPath, ioPath: candidatePath, workspaceReal };
      }
      return { kind: "invalid", requestPath, reason: "file not found" };
    }
    throw err;
  }

  if (candidateLstat.isSymbolicLink()) {
    let targetReal: string;
    try {
      targetReal = await fs.realpath(candidatePath);
    } catch (err) {
      if (isNotFoundPathError(err)) {
        if (params.allowMissing) {
          return { kind: "missing", requestPath, ioPath: candidatePath, workspaceReal };
        }
        return { kind: "invalid", requestPath, reason: "file not found" };
      }
      throw err;
    }
    let targetStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      targetStat = await fs.stat(targetReal);
    } catch (err) {
      if (isNotFoundPathError(err)) {
        if (params.allowMissing) {
          return { kind: "missing", requestPath, ioPath: targetReal, workspaceReal };
        }
        return { kind: "invalid", requestPath, reason: "file not found" };
      }
      throw err;
    }
    if (!targetStat.isFile()) {
      return { kind: "invalid", requestPath, reason: "path is not a regular file" };
    }
    if (targetStat.nlink > 1) {
      return { kind: "invalid", requestPath, reason: "hardlinked file path not allowed" };
    }
    return { kind: "ready", requestPath, ioPath: targetReal, workspaceReal };
  }

  if (!candidateLstat.isFile()) {
    return { kind: "invalid", requestPath, reason: "path is not a regular file" };
  }
  if (candidateLstat.nlink > 1) {
    return { kind: "invalid", requestPath, reason: "hardlinked file path not allowed" };
  }

  const targetReal = await fs.realpath(candidatePath).catch(() => candidatePath);
  return { kind: "ready", requestPath, ioPath: targetReal, workspaceReal };
}

async function statFileSafely(filePath: string): Promise<FileMeta | null> {
  try {
    const [stat, lstat] = await Promise.all([fs.stat(filePath), fs.lstat(filePath)]);
    if (lstat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    if (stat.nlink > 1) {
      return null;
    }
    if (!sameFileIdentity(stat, lstat)) {
      return null;
    }
    return {
      size: stat.size,
      updatedAtMs: Math.floor(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

async function listAgentFiles(workspaceDir: string, options?: { hideBootstrap?: boolean }) {
  const files: Array<{
    name: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
  }> = [];

  const bootstrapFileNames = options?.hideBootstrap
    ? BOOTSTRAP_FILE_NAMES_POST_ONBOARDING
    : BOOTSTRAP_FILE_NAMES;
  for (const name of bootstrapFileNames) {
    const resolved = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name,
      allowMissing: true,
    });
    const filePath = resolved.requestPath;
    const meta =
      resolved.kind === "ready"
        ? await statFileSafely(resolved.ioPath)
        : resolved.kind === "missing"
          ? null
          : null;
    if (meta) {
      files.push({
        name,
        path: filePath,
        missing: false,
        size: meta.size,
        updatedAtMs: meta.updatedAtMs,
      });
    } else {
      files.push({ name, path: filePath, missing: true });
    }
  }

  const primaryResolved = await resolveAgentWorkspaceFilePath({
    workspaceDir,
    name: DEFAULT_MEMORY_FILENAME,
    allowMissing: true,
  });
  const primaryMeta =
    primaryResolved.kind === "ready" ? await statFileSafely(primaryResolved.ioPath) : null;
  if (primaryMeta) {
    files.push({
      name: DEFAULT_MEMORY_FILENAME,
      path: primaryResolved.requestPath,
      missing: false,
      size: primaryMeta.size,
      updatedAtMs: primaryMeta.updatedAtMs,
    });
  } else {
    const altMemoryResolved = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name: DEFAULT_MEMORY_ALT_FILENAME,
      allowMissing: true,
    });
    const altMeta =
      altMemoryResolved.kind === "ready" ? await statFileSafely(altMemoryResolved.ioPath) : null;
    if (altMeta) {
      files.push({
        name: DEFAULT_MEMORY_ALT_FILENAME,
        path: altMemoryResolved.requestPath,
        missing: false,
        size: altMeta.size,
        updatedAtMs: altMeta.updatedAtMs,
      });
    } else {
      files.push({
        name: DEFAULT_MEMORY_FILENAME,
        path: primaryResolved.requestPath,
        missing: true,
      });
    }
  }

  return files;
}

function resolveAgentIdOrError(agentIdRaw: string, cfg: ReturnType<typeof loadConfig>) {
  const agentId = normalizeAgentId(agentIdRaw);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(agentId)) {
    return null;
  }
  return agentId;
}

function sanitizeIdentityLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveOptionalStringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function moveToTrashBestEffort(pathname: string): Promise<void> {
  if (!pathname) {
    return;
  }
  try {
    await fs.access(pathname);
  } catch {
    return;
  }
  try {
    await movePathToTrash(pathname);
  } catch {
    // Best-effort: path may already be gone or trash unavailable.
  }
}

export const agentsHandlers: GatewayRequestHandlers = {
  "agents.list": ({ params, respond }) => {
    if (!validateAgentsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.list params: ${formatValidationErrors(validateAgentsListParams.errors)}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const result = listAgentsForGateway(cfg);
    respond(true, result, undefined);
  },
  "agents.create": async ({ params, respond }) => {
    if (!validateAgentsCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.create params: ${formatValidationErrors(
            validateAgentsCreateParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const rawName = String(params.name ?? "").trim();
    const agentId = normalizeAgentId(rawName);
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" is reserved`),
      );
      return;
    }

    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" already exists`),
      );
      return;
    }

    const workspaceDir = resolveUserPath(String(params.workspace ?? "").trim());

    // Resolve agentDir against the config we're about to persist (vs the pre-write config),
    // so subsequent resolutions can't disagree about the agent's directory.
    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: rawName,
      workspace: workspaceDir,
    });
    const agentDir = resolveAgentDir(nextConfig, agentId);
    nextConfig = applyAgentConfig(nextConfig, { agentId, agentDir });

    // Ensure workspace & transcripts exist BEFORE writing config so a failure
    // here does not leave a broken config entry behind.
    const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
    await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap });
    await fs.mkdir(resolveSessionTranscriptsDirForAgent(agentId), { recursive: true });

    await writeConfigFile(nextConfig);

    // Always write Name to IDENTITY.md; optionally include emoji/avatar.
    const safeName = sanitizeIdentityLine(rawName);
    const emoji = resolveOptionalStringParam(params.emoji);
    const avatar = resolveOptionalStringParam(params.avatar);
    const identityPath = path.join(workspaceDir, DEFAULT_IDENTITY_FILENAME);
    const lines = [
      "",
      `- Name: ${safeName}`,
      ...(emoji ? [`- Emoji: ${sanitizeIdentityLine(emoji)}`] : []),
      ...(avatar ? [`- Avatar: ${sanitizeIdentityLine(avatar)}`] : []),
      "",
    ];
    await fs.appendFile(identityPath, lines.join("\n"), "utf-8");

    respond(true, { ok: true, agentId, name: rawName, workspace: workspaceDir }, undefined);
  },
  "agents.update": async ({ params, respond }) => {
    if (!validateAgentsUpdateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.update params: ${formatValidationErrors(
            validateAgentsUpdateParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(String(params.agentId ?? ""));
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
      );
      return;
    }

    const workspaceDir =
      typeof params.workspace === "string" && params.workspace.trim()
        ? resolveUserPath(params.workspace.trim())
        : undefined;

    const model = resolveOptionalStringParam(params.model);
    const avatar = resolveOptionalStringParam(params.avatar);

    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      ...(typeof params.name === "string" && params.name.trim()
        ? { name: params.name.trim() }
        : {}),
      ...(workspaceDir ? { workspace: workspaceDir } : {}),
      ...(model ? { model } : {}),
    });

    await writeConfigFile(nextConfig);

    if (workspaceDir) {
      const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
      await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: !skipBootstrap });
    }

    if (avatar) {
      const workspace = workspaceDir ?? resolveAgentWorkspaceDir(nextConfig, agentId);
      await fs.mkdir(workspace, { recursive: true });
      const identityPath = path.join(workspace, DEFAULT_IDENTITY_FILENAME);
      await fs.appendFile(identityPath, `\n- Avatar: ${sanitizeIdentityLine(avatar)}\n`, "utf-8");
    }

    respond(true, { ok: true, agentId }, undefined);
  },
  "agents.delete": async ({ params, respond }) => {
    if (!validateAgentsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.delete params: ${formatValidationErrors(
            validateAgentsDeleteParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(String(params.agentId ?? ""));
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" cannot be deleted`),
      );
      return;
    }
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
      );
      return;
    }

    const deleteFiles = typeof params.deleteFiles === "boolean" ? params.deleteFiles : true;
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const agentDir = resolveAgentDir(cfg, agentId);
    const sessionsDir = resolveSessionTranscriptsDirForAgent(agentId);

    const result = pruneAgentConfig(cfg, agentId);
    await writeConfigFile(result.config);

    if (deleteFiles) {
      await Promise.all([
        moveToTrashBestEffort(workspaceDir),
        moveToTrashBestEffort(agentDir),
        moveToTrashBestEffort(sessionsDir),
      ]);
    }

    respond(true, { ok: true, agentId, removedBindings: result.removedBindings }, undefined);
  },
  "agents.files.list": async ({ params, respond }) => {
    if (!validateAgentsFilesListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.list params: ${formatValidationErrors(
            validateAgentsFilesListParams.errors,
          )}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const agentId = resolveAgentIdOrError(String(params.agentId ?? ""), cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    let hideBootstrap = false;
    try {
      hideBootstrap = await isWorkspaceOnboardingCompleted(workspaceDir);
    } catch {
      // Fall back to showing BOOTSTRAP if workspace state cannot be read.
    }
    const files = await listAgentFiles(workspaceDir, { hideBootstrap });
    respond(true, { agentId, workspace: workspaceDir, files }, undefined);
  },
  "agents.files.get": async ({ params, respond }) => {
    if (!validateAgentsFilesGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.get params: ${formatValidationErrors(
            validateAgentsFilesGetParams.errors,
          )}`,
        ),
      );
      return;
    }
    const resolved = resolveAgentWorkspaceFileOrRespondError(params, respond);
    if (!resolved) {
      return;
    }
    const { agentId, workspaceDir, name } = resolved;
    const filePath = path.join(workspaceDir, name);
    const resolvedPath = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name,
      allowMissing: true,
    });
    if (resolvedPath.kind === "invalid") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `unsafe workspace file "${name}" (${resolvedPath.reason})`,
        ),
      );
      return;
    }
    if (resolvedPath.kind === "missing") {
      respond(
        true,
        {
          agentId,
          workspace: workspaceDir,
          file: { name, path: filePath, missing: true },
        },
        undefined,
      );
      return;
    }
    let safeRead: Awaited<ReturnType<typeof readLocalFileSafely>>;
    try {
      safeRead = await readLocalFileSafely({ filePath: resolvedPath.ioPath });
    } catch (err) {
      if (err instanceof SafeOpenError && err.code === "not-found") {
        respond(
          true,
          {
            agentId,
            workspace: workspaceDir,
            file: { name, path: filePath, missing: true },
          },
          undefined,
        );
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe workspace file "${name}"`),
      );
      return;
    }
    respond(
      true,
      {
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: safeRead.stat.size,
          updatedAtMs: Math.floor(safeRead.stat.mtimeMs),
          content: safeRead.buffer.toString("utf-8"),
        },
      },
      undefined,
    );
  },
  "agents.files.set": async ({ params, respond }) => {
    if (!validateAgentsFilesSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.set params: ${formatValidationErrors(
            validateAgentsFilesSetParams.errors,
          )}`,
        ),
      );
      return;
    }
    const resolved = resolveAgentWorkspaceFileOrRespondError(params, respond);
    if (!resolved) {
      return;
    }
    const { agentId, workspaceDir, name } = resolved;
    await fs.mkdir(workspaceDir, { recursive: true });
    const filePath = path.join(workspaceDir, name);
    const resolvedPath = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name,
      allowMissing: true,
    });
    if (resolvedPath.kind === "invalid") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `unsafe workspace file "${name}" (${resolvedPath.reason})`,
        ),
      );
      return;
    }
    const content = String(params.content ?? "");
    try {
      await writeFileWithinRoot({
        rootDir: workspaceDir,
        relativePath: name,
        data: content,
        encoding: "utf8",
      });
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe workspace file "${name}"`),
      );
      return;
    }
    const meta = await statFileSafely(resolvedPath.ioPath);
    respond(
      true,
      {
        ok: true,
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: meta?.size,
          updatedAtMs: meta?.updatedAtMs,
          content,
        },
      },
      undefined,
    );
  },
  "workspace.files.list": async ({ params, respond }) => {
    const agentIdRaw =
      params &&
      typeof params === "object" &&
      typeof (params as { agentId?: unknown }).agentId === "string"
        ? ((params as { agentId?: string }).agentId ?? "")
        : "main";
    const queryRaw =
      params &&
      typeof params === "object" &&
      typeof (params as { query?: unknown }).query === "string"
        ? ((params as { query?: string }).query ?? "")
        : "";
    const cfg = loadConfig();
    const agentId = resolveAgentIdOrError(agentIdRaw, cfg) ?? "main";
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const normalizedQuery = queryRaw.replaceAll("\\", "/").trim();
    const includeHidden =
      typeof (params as { includeHidden?: unknown }).includeHidden === "boolean"
        ? Boolean((params as { includeHidden?: boolean }).includeHidden)
        : true;
    const isAbsoluteQuery = normalizedQuery.startsWith("/");
    const baseDir = normalizedQuery.includes("/")
      ? normalizedQuery.slice(0, normalizedQuery.lastIndexOf("/") + 1)
      : "";
    const needle = normalizedQuery.includes("/")
      ? normalizedQuery.slice(normalizedQuery.lastIndexOf("/") + 1).toLowerCase()
      : normalizedQuery.toLowerCase();

    const candidateDir = isAbsoluteQuery
      ? path.resolve(baseDir || normalizedQuery || "/")
      : path.resolve(workspaceDir, baseDir || ".");
    const candidateReal = await fs.realpath(candidateDir).catch(() => candidateDir);
    if (!isAbsoluteQuery) {
      const workspaceReal = await fs.realpath(workspaceDir).catch(() => workspaceDir);
      if (!candidateReal.startsWith(workspaceReal)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path escapes workspace"));
        return;
      }
    }

    const pathPrefix = isAbsoluteQuery ? baseDir || "/" : baseDir;
    let entries: string[] = [];
    try {
      const dirents = await fs.readdir(candidateReal, { withFileTypes: true });
      entries = dirents
        .filter((entry) => (includeHidden ? true : !entry.name.startsWith(".")))
        .filter((entry) => (needle ? entry.name.toLowerCase().includes(needle) : true))
        .slice(0, 80)
        .map((entry) => `${pathPrefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);
    } catch {
      entries = [];
    }

    respond(true, { agentId, baseDir, query: normalizedQuery, entries }, undefined);
  },
  "workspace.files.upload": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const sessionKey = typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey is required"));
      return;
    }
    const fileNameRaw = typeof body.fileName === "string" ? body.fileName : "";
    const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
    if (!contentBase64) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "contentBase64 is required"),
      );
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(contentBase64, "base64");
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid base64 content"));
      return;
    }
    if (!fileBuffer.length) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "empty file content"));
      return;
    }
    if (fileBuffer.length > WORKSPACE_UPLOAD_MAX_BYTES) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file too large"));
      return;
    }

    const cfg = loadConfig();
    const agentId = resolveAgentForWorkspaceRpc(body, cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }

    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const safeFileName = sanitizeUploadFileName(fileNameRaw);
    const date = new Date().toISOString().slice(0, 10);
    const relativePath = await resolveUniqueUploadRelativePath(
      workspaceDir,
      path.join("uploads", date, safeFileName),
    );

    try {
      await writeFileWithinRoot({
        rootDir: workspaceDir,
        relativePath,
        data: fileBuffer,
      });
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "failed to write upload file"),
      );
      return;
    }

    const savedPath = path.join(workspaceDir, relativePath);
    respond(
      true,
      {
        ok: true,
        agentId,
        workspace: workspaceDir,
        fileName: path.basename(relativePath),
        savedPath,
        relativePath,
        size: fileBuffer.length,
      },
      undefined,
    );
  },
  "workspace.files.download": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const filePathRaw = typeof body.path === "string" ? body.path.trim() : "";
    if (!filePathRaw) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    const filePath = path.resolve(filePathRaw);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    if (!stat.isFile()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is not a file"));
      return;
    }
    if (stat.size > WORKSPACE_DOWNLOAD_MAX_BYTES) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file too large"));
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "failed to read file"));
      return;
    }
    respond(
      true,
      {
        ok: true,
        path: filePath,
        fileName: path.basename(filePath),
        size: fileBuffer.length,
        contentBase64: fileBuffer.toString("base64"),
      },
      undefined,
    );
  },
  "workspace.files.preview": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const filePathRaw = typeof body.path === "string" ? body.path.trim() : "";
    if (!filePathRaw) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }

    const filePath = path.resolve(filePathRaw);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    if (!stat.isFile()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is not a file"));
      return;
    }

    const kind = classifyWorkspacePreviewKind(filePath);
    const mimeType = resolveWorkspacePreviewMimeType(filePath);
    if (kind === "unsupported") {
      respond(
        true,
        {
          ok: true,
          path: filePath,
          fileName: path.basename(filePath),
          size: stat.size,
          mimeType,
          kind,
        },
        undefined,
      );
      return;
    }

    const maxBytes =
      kind === "image" ? WORKSPACE_PREVIEW_IMAGE_MAX_BYTES : WORKSPACE_PREVIEW_TEXT_MAX_BYTES;
    if (stat.size > maxBytes) {
      respond(
        true,
        {
          ok: true,
          path: filePath,
          fileName: path.basename(filePath),
          size: stat.size,
          mimeType,
          kind: "too_large",
        },
        undefined,
      );
      return;
    }

    try {
      if (kind === "image") {
        const buffer = await fs.readFile(filePath);
        respond(
          true,
          {
            ok: true,
            path: filePath,
            fileName: path.basename(filePath),
            size: buffer.length,
            mimeType,
            kind,
            contentBase64: buffer.toString("base64"),
          },
          undefined,
        );
        return;
      }

      const text = await fs.readFile(filePath, "utf8");
      respond(
        true,
        {
          ok: true,
          path: filePath,
          fileName: path.basename(filePath),
          size: stat.size,
          mimeType,
          kind,
          text,
        },
        undefined,
      );
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "failed to read file"));
    }
  },
  "workspace.files.delete": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const filePathRaw = typeof body.path === "string" ? body.path.trim() : "";
    if (!filePathRaw) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }

    const filePath = path.resolve(filePathRaw);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    if (!stat.isFile()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is not a file"));
      return;
    }

    try {
      await movePathToTrash(filePath);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "failed to delete file"));
      return;
    }

    respond(
      true,
      {
        ok: true,
        path: filePath,
        deletedPath: filePath,
      },
      undefined,
    );
  },
  "workspace.files.state.get": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const cfg = loadConfig();
    const agentId = resolveAgentForWorkspaceRpc(body, cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const state = await readWorkspaceFilesUiState(workspaceDir);
    respond(true, { ok: true, agentId, selectedDir: state.selectedDir }, undefined);
  },
  "workspace.files.state.set": async ({ params, respond }) => {
    const body = params && typeof params === "object" ? params : {};
    const selectedDirRaw = typeof body.selectedDir === "string" ? body.selectedDir.trim() : "";
    if (!selectedDirRaw) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "selectedDir is required"));
      return;
    }
    const selectedDir = path.resolve(selectedDirRaw);
    const cfg = loadConfig();
    const agentId = resolveAgentForWorkspaceRpc(body, cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    await writeWorkspaceFilesUiState(workspaceDir, { selectedDir });
    respond(true, { ok: true, agentId, selectedDir }, undefined);
  },
};
