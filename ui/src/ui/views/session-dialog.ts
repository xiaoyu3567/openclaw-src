import { html, nothing } from "lit";

type SessionOption = { key: string; displayName?: string };

export function renderSessionDialogView(params: {
  mode: "create" | "delete";
  title: string;
  subtitle: string;
  primaryLabel: string;
  placeholder: string;
  input: string;
  busy: boolean;
  connected: boolean;
  error: string | null;
  confirmOverwrite: boolean;
  deletableSessionOptions: SessionOption[];
  onInput: (value: string) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}) {
  const canSubmit = params.busy || !params.connected;
  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">${params.title}</div>
            <div class="exec-approval-sub">${params.subtitle}</div>
          </div>
        </div>
        ${
          params.mode === "delete"
            ? html`<div class="exec-approval-command mono">
                ${params.deletableSessionOptions.map(
                  (entry, index) =>
                    html`<div>${index + 1}. ${entry.displayName ?? entry.key} (${entry.key})</div>`,
                )}
              </div>`
            : nothing
        }
        <label class="field" style="margin-top: 12px;">
          <input
            .value=${params.input}
            placeholder=${params.placeholder}
            ?disabled=${params.busy}
            @input=${(event: Event) => params.onInput((event.target as HTMLInputElement).value)}
            @keydown=${async (event: KeyboardEvent) => {
              if (event.key === "Escape") {
                event.preventDefault();
                params.onCancel();
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                await params.onSubmit();
              }
            }}
          />
        </label>
        ${
          params.confirmOverwrite
            ? html`<div class="callout danger" style="margin-top: 12px;">
                Session already exists. Press ${params.primaryLabel} again to reset it.
              </div>`
            : nothing
        }
        ${params.error ? html`<div class="exec-approval-error">${params.error}</div>` : nothing}
        <div class="exec-approval-actions">
          <button
            class="btn ${params.mode === "create" ? "primary" : "danger"}"
            ?disabled=${canSubmit}
            @click=${() => params.onSubmit()}
          >
            ${params.primaryLabel}
          </button>
          <button
            class="btn"
            ?disabled=${params.busy}
            @click=${() => params.onCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;
}
