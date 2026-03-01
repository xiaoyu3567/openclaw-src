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

const STORAGE_KEY = "openclaw.control.usage.providers.v1";

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

export function loadUsageProviderConfigs(): UsageProviderConfig[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is UsageProviderConfig => Boolean(entry && typeof entry === "object"))
      .map((entry) => ({
        id:
          typeof entry.id === "string"
            ? entry.id
            : `provider-${Math.random().toString(36).slice(2)}`,
        name: typeof entry.name === "string" ? entry.name : "",
        type: entry.type === "sub2api" ? "sub2api" : "sub2api",
        baseUrl: typeof entry.baseUrl === "string" ? normalizeBaseUrl(entry.baseUrl) : "",
        apiKey: typeof entry.apiKey === "string" ? entry.apiKey : "",
        enabled: entry.enabled,
        intervalSec:
          typeof entry.intervalSec === "number" && Number.isFinite(entry.intervalSec)
            ? Math.max(10, Math.floor(entry.intervalSec))
            : 60,
        timeoutMs:
          typeof entry.timeoutMs === "number" && Number.isFinite(entry.timeoutMs)
            ? Math.max(2000, Math.floor(entry.timeoutMs))
            : 12000,
      }))
      .filter((entry) => Boolean(entry.name && entry.baseUrl && entry.apiKey));
  } catch {
    return [];
  }
}

export function saveUsageProviderConfigs(configs: UsageProviderConfig[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
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
