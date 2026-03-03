export type ProviderKind = "sub2api";

export type UsageProviderConfig = {
  id: string;
  name: string;
  type: ProviderKind;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  intervalSec: number;
  timeoutMs: number;
};

export type UsageProviderConfigSnapshot = {
  items: UsageProviderConfig[];
  version: number;
  updatedAtMs: number;
};

export type UsageProviderResponse = {
  isValid?: boolean;
  planName?: string;
  remaining?: number;
  unit?: string;
  subscription?: {
    daily_limit_usd?: number;
    daily_usage_usd?: number;
    weekly_limit_usd?: number;
    weekly_usage_usd?: number;
    monthly_limit_usd?: number;
    monthly_usage_usd?: number;
    expires_at?: string;
  };
  usage?: {
    average_duration_ms?: number;
    rpm?: number;
    tpm?: number;
    today?: Record<string, unknown>;
    total?: Record<string, unknown>;
  };
  [key: string]: unknown;
};

export type UsageProviderCardState = {
  loading: boolean;
  error: string | null;
  status: "idle" | "ok" | "error";
  lastUpdatedAt: number | null;
  latencyMs: number | null;
  data: UsageProviderResponse | null;
};

const LEGACY_STORAGE_KEY = "openclaw.control.usage.providers.v1";

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveNumber(value: unknown, fallback: number, floor: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(floor, Math.floor(n));
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(Math.max(4, trimmed.length));
  }
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-4)}`;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function sanitizeUsageProviderConfig(
  entry: unknown,
  opts?: { allowMissingId?: boolean },
): UsageProviderConfig | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const parsed = entry as Record<string, unknown>;
  const idRaw = toTrimmedString(parsed.id);
  const id =
    idRaw || (opts?.allowMissingId ? `provider-${Math.random().toString(36).slice(2)}` : "");
  const name = toTrimmedString(parsed.name);
  const baseUrl = normalizeBaseUrl(toTrimmedString(parsed.baseUrl));
  const apiKey = toTrimmedString(parsed.apiKey);
  const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : true;
  const intervalSec = toPositiveNumber(parsed.intervalSec, 60, 10);
  const timeoutMs = toPositiveNumber(parsed.timeoutMs, 12000, 2000);

  if (!id || !name || !baseUrl || !apiKey) {
    return null;
  }

  return {
    id,
    name,
    type: "sub2api",
    baseUrl,
    apiKey,
    enabled,
    intervalSec,
    timeoutMs,
  };
}

export function sanitizeUsageProviderConfigs(raw: unknown): UsageProviderConfig[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => sanitizeUsageProviderConfig(entry, { allowMissingId: true }))
    .filter((entry): entry is UsageProviderConfig => Boolean(entry));
}

export function loadUsageProviderConfigs(): UsageProviderConfig[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return sanitizeUsageProviderConfigs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveUsageProviderConfigs(configs: UsageProviderConfig[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(configs));
}

export function clearUsageProviderConfigs() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export async function fetchSub2ApiUsage(
  config: UsageProviderConfig,
): Promise<UsageProviderResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${normalizeBaseUrl(config.baseUrl)}/usage`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const detail =
        payload && typeof payload === "object" && "message" in payload
          ? (payload as { message?: unknown }).message
          : null;
      const message = typeof detail === "string" && detail.trim() ? detail : `HTTP ${res.status}`;
      throw new Error(message);
    }
    return (payload as UsageProviderResponse) ?? {};
  } finally {
    window.clearTimeout(timeout);
  }
}
