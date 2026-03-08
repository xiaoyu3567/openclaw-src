import { html, nothing } from "lit";

function stopDeleteConfirmEvent(event: Event) {
  event.stopPropagation();
}

export type FilesDeleteConfirmProps = {
  open: boolean;
  path: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function renderFilesDeleteConfirm(props: FilesDeleteConfirmProps) {
  if (!props.open || !props.path) {
    return nothing;
  }

  return html`
    <div
      class="files-delete-confirm-backdrop"
      style="position: fixed; inset: 0; background: rgba(0,0,0,.28); z-index: 29;"
      @click=${props.busy ? undefined : props.onCancel}
    ></div>
    <div
      class="files-delete-confirm card"
      style="position: fixed; inset: auto 24px 24px auto; width: min(440px, calc(100vw - 48px)); z-index: 30;"
      role="alertdialog"
      aria-modal="true"
      aria-label="Delete file confirmation"
      @click=${stopDeleteConfirmEvent}
    >
      <div style="display:flex; flex-direction:column; gap:12px;">
        <strong>Delete this file?</strong>
        <div>
          <div style="font-weight: 600;">${props.path.split("/").filter(Boolean).pop() ?? props.path}</div>
          <div class="muted mono" style="margin-top: 4px;">${props.path}</div>
        </div>
        <div class="callout danger">
          This will move the file to your system trash / recycle bin. Double-check the path before
          you delete it.
        </div>
        ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button class="btn btn--sm" ?disabled=${props.busy} @click=${props.onCancel}>Cancel</button>
          <button class="btn btn--sm danger" ?disabled=${props.busy} @click=${props.onConfirm}>
            ${props.busy ? "Deleting…" : "Move to trash"}
          </button>
        </div>
      </div>
    </div>
  `;
}
