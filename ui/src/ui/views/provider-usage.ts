import { html, nothing } from "lit";
import type { UsageProviderCardState, UsageProviderConfig } from "../provider-usage.ts";
import { maskApiKey } from "../provider-usage.ts";

type ProviderUsageViewProps = {
  configs: UsageProviderConfig[];
  cards: Record<string, UsageProviderCardState>;
  adding: boolean;
  autoRefresh: boolean;
  loading: boolean;
  error: string | null;
  form: {
    name: string;
    type: "sub2api";
    baseUrl: string;
    apiKey: string;
    intervalSec: string;
    timeoutMs: string;
  };
  onToggleAdd: () => void;
  onFormFieldChange: (key: string, value: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRefreshOne: (id: string) => void;
  onRefreshAll: () => void;
  onToggleAutoRefresh: (next: boolean) => void;
};

function toNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function progress(current?: number, total?: number): number {
  if (typeof current !== "number" || typeof total !== "number" || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function renderUsageRows(label: string, payload: Record<string, unknown> | undefined) {
  if (!payload) {
    return html`
      <div class="provider-usage-empty">暂无数据</div>
    `;
  }
  const entries = Object.entries(payload);
  return html`
    <details class="provider-usage-details">
      <summary>${label}</summary>
      <div class="provider-usage-grid">
        ${entries.map(
          ([key, value]) =>
            html`<div class="provider-usage-kv"><span>${key}</span><strong>${String(value)}</strong></div>`,
        )}
      </div>
    </details>
  `;
}

function renderProviderCard(
  config: UsageProviderConfig,
  card: UsageProviderCardState,
  props: ProviderUsageViewProps,
) {
  const data = card.data;
  const subscription = data?.subscription;
  const usage = data?.usage;
  const dailyProgress = progress(subscription?.daily_usage_usd, subscription?.daily_limit_usd);
  const weeklyProgress = progress(subscription?.weekly_usage_usd, subscription?.weekly_limit_usd);
  const monthlyProgress = progress(
    subscription?.monthly_usage_usd,
    subscription?.monthly_limit_usd,
  );

  return html`
    <section class="card provider-card">
      <div class="provider-card__header">
        <div>
          <div class="provider-card__title">${config.name}</div>
          <div class="provider-card__meta">类型: ${config.type} · API Key: ${maskApiKey(config.apiKey)}</div>
          <div class="provider-card__meta">${config.baseUrl}</div>
        </div>
        <div class="provider-card__actions">
          <span class="provider-status provider-status--${card.status}">${card.status}</span>
          <button class="btn btn-sm" @click=${() => props.onRefreshOne(config.id)} ?disabled=${card.loading}>刷新</button>
          <button class="btn btn-sm" @click=${() => props.onDelete(config.id)}>删除</button>
        </div>
      </div>

      ${card.error ? html`<div class="callout danger">${card.error}</div>` : nothing}

      <div class="provider-overview">
        <div>
          <div class="provider-overview__label">剩余额度</div>
          <div class="provider-overview__value">${toNumber(data?.remaining)} ${data?.unit ?? ""}</div>
        </div>
        <div>
          <div class="provider-overview__label">套餐</div>
          <div class="provider-overview__value provider-overview__value--small">${data?.planName ?? "-"}</div>
        </div>
        <div>
          <div class="provider-overview__label">到期时间</div>
          <div class="provider-overview__value provider-overview__value--small">${subscription?.expires_at ?? "-"}</div>
        </div>
      </div>

      <div class="provider-progress-list">
        <div class="provider-progress-item"><span>日额度 ${toNumber(subscription?.daily_usage_usd)} / ${toNumber(subscription?.daily_limit_usd)}</span><progress max="100" .value=${dailyProgress}></progress></div>
        <div class="provider-progress-item"><span>周额度 ${toNumber(subscription?.weekly_usage_usd)} / ${toNumber(subscription?.weekly_limit_usd)}</span><progress max="100" .value=${weeklyProgress}></progress></div>
        <div class="provider-progress-item"><span>月额度 ${toNumber(subscription?.monthly_usage_usd)} / ${toNumber(subscription?.monthly_limit_usd)}</span><progress max="100" .value=${monthlyProgress}></progress></div>
      </div>

      <div class="provider-metrics">
        <span>RPM: ${toNumber(usage?.rpm)}</span>
        <span>TPM: ${toNumber(usage?.tpm)}</span>
        <span>平均耗时: ${toNumber(usage?.average_duration_ms)} ms</span>
        <span>延迟: ${card.latencyMs ?? "-"} ms</span>
        <span>更新时间: ${card.lastUpdatedAt ? new Date(card.lastUpdatedAt).toLocaleString() : "-"}</span>
      </div>

      ${renderUsageRows("今日用量", usage?.today)}
      ${renderUsageRows("累计用量", usage?.total)}

      <details class="provider-usage-details">
        <summary>原始 JSON</summary>
        <pre class="provider-raw">${JSON.stringify(data, null, 2)}</pre>
      </details>
    </section>
  `;
}

export function renderProviderUsagePanel(props: ProviderUsageViewProps) {
  return html`
    <section class="card provider-panel">
      <div class="provider-panel__header">
        <div>
          <div class="card-title" style="margin:0;">用量监控（多 Provider）</div>
          <div class="muted">支持配置多个 Provider，并展示 usage 全量字段</div>
        </div>
        <div class="provider-panel__actions">
          <label class="provider-switch">
            <input
              type="checkbox"
              .checked=${props.autoRefresh}
              ?disabled=${props.loading}
              @change=${(e: Event) => props.onToggleAutoRefresh((e.target as HTMLInputElement).checked)}
            />
            自动刷新
          </label>
          <button class="btn btn-sm" @click=${props.onRefreshAll} ?disabled=${props.loading}>全部刷新</button>
          <button class="btn btn-sm" @click=${props.onToggleAdd} ?disabled=${props.loading}>${props.adding ? "收起" : "添加"}</button>
        </div>
      </div>

      ${
        props.loading
          ? html`
              <div class="muted">同步 Provider 配置中...</div>
            `
          : nothing
      }
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        props.adding
          ? html`
              <div class="provider-form">
                <input placeholder="名称" .value=${props.form.name} @input=${(e: Event) => props.onFormFieldChange("name", (e.target as HTMLInputElement).value)} />
                <select .value=${props.form.type} @change=${(e: Event) => props.onFormFieldChange("type", (e.target as HTMLSelectElement).value)}>
                  <option value="sub2api">sub2api</option>
                </select>
                <input placeholder="Base URL (例如 https://jp.code.respyun.com/v1)" .value=${props.form.baseUrl} @input=${(e: Event) => props.onFormFieldChange("baseUrl", (e.target as HTMLInputElement).value)} />
                <input placeholder="API Key" .value=${props.form.apiKey} @input=${(e: Event) => props.onFormFieldChange("apiKey", (e.target as HTMLInputElement).value)} />
                <input placeholder="刷新间隔秒（默认60）" .value=${props.form.intervalSec} @input=${(e: Event) => props.onFormFieldChange("intervalSec", (e.target as HTMLInputElement).value)} />
                <input placeholder="超时毫秒（默认12000）" .value=${props.form.timeoutMs} @input=${(e: Event) => props.onFormFieldChange("timeoutMs", (e.target as HTMLInputElement).value)} />
                <button class="btn btn-sm" @click=${props.onAdd} ?disabled=${props.loading}>保存并查询</button>
              </div>
            `
          : nothing
      }
    </section>

    ${
      props.configs.length === 0
        ? html`
            <section class="card"><div class="muted">还没有 Provider，点“添加”开始。</div></section>
          `
        : html`
            <div class="provider-cards-grid">
              ${props.configs.map((config) =>
                renderProviderCard(
                  config,
                  props.cards[config.id] ?? {
                    loading: false,
                    error: null,
                    status: "idle",
                    lastUpdatedAt: null,
                    latencyMs: null,
                    data: null,
                  },
                  props,
                ),
              )}
            </div>
          `
    }
  `;
}
