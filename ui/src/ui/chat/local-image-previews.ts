export type LocalImagePreview = {
  path: string;
  url: string;
  alt: string;
};

const LOCAL_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const CODE_SPAN_RE = /`([^`\n]+)`/g;
const GENERIC_PATH_RE =
  /(?:^|[\s([{"'])((?:[A-Za-z]:\\|\/|\.{1,2}\/)?[^\s`'"<>()[\]{}]+?\.(?:png|jpe?g|gif|webp|svg)(?:#L\d+(?::\d+)?|:\d+(?::\d+)?)?)(?=$|[\s)\]}'",.!?;:])/gi;

export function buildControlUiWorkspaceImageUrl(params: {
  basePath?: string | null;
  agentId?: string | null;
  path: string;
}): string {
  const basePath = normalizeBasePath(params.basePath);
  const agentId = (params.agentId ?? "main").trim() || "main";
  const rawPath = params.path.trim();
  const prefix = basePath
    ? `${basePath}/__openclaw/workspace-image/`
    : "/__openclaw/workspace-image/";
  return `${prefix}${encodeURIComponent(agentId)}?path=${encodeURIComponent(rawPath)}`;
}

export function extractLocalImagePreviews(
  markdown: string,
  params: { basePath?: string | null; agentId?: string | null },
): LocalImagePreview[] {
  const text = markdown.trim();
  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const previews: LocalImagePreview[] = [];
  for (const candidate of extractCandidatePaths(text)) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    previews.push({
      path: candidate,
      url: buildControlUiWorkspaceImageUrl({
        basePath: params.basePath,
        agentId: params.agentId,
        path: candidate,
      }),
      alt: extractAlt(candidate),
    });
  }
  return previews;
}

function extractCandidatePaths(text: string): string[] {
  const candidates: string[] = [];

  for (const match of text.matchAll(CODE_SPAN_RE)) {
    const normalized = normalizeCandidate(match[1] ?? "");
    if (normalized) {
      candidates.push(normalized);
    }
  }

  for (const match of text.matchAll(GENERIC_PATH_RE)) {
    const normalized = normalizeCandidate(match[1] ?? "");
    if (normalized) {
      candidates.push(normalized);
    }
  }

  return candidates;
}

function normalizeCandidate(raw: string): string | null {
  let value = raw.trim();
  if (!value) {
    return null;
  }

  value = value.replace(/^['"([]+/, "").replace(/[)'"\].,!?;:]+$/, "");
  value = value.replace(/(?:#L\d+(?::\d+)?|:\d+(?::\d+)?)$/, "");

  if (!value || isExternalUrl(value) || !LOCAL_IMAGE_EXT_RE.test(value)) {
    return null;
  }

  return value;
}

function extractAlt(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const base = normalized.split("/").filter(Boolean).pop() ?? normalized;
  return base || "Local image preview";
}

function isExternalUrl(value: string): boolean {
  return /^(https?:|data:|blob:)/i.test(value);
}

function normalizeBasePath(basePath?: string | null): string {
  const trimmed = (basePath ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
