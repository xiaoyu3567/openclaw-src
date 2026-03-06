import { html } from "lit";

export type FilesViewProps = {
  path: string;
  entries: string[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenDir: (path: string) => void;
  onOpenParent: () => void;
  onDownload: (path: string) => void;
};

function joinPath(baseDir: string, name: string): string {
  if (!baseDir || baseDir === "/") {
    return `/${name}`;
  }
  return `${baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir}/${name}`;
}

function renderRow(entry: string, props: FilesViewProps) {
  const isDir = entry.endsWith("/");
  const normalized = entry.startsWith("/") ? entry : joinPath(props.path, entry);
  const label = normalized.split("/").filter(Boolean).pop() || (isDir ? "/" : normalized);
  return html`<div class="files-row">
    <div class="files-row__name" title=${normalized}>${isDir ? "📁" : "📄"} ${label}</div>
    <div class="files-row__path">${normalized}</div>
    <div class="files-row__actions">
      ${
        isDir
          ? html`<button class="btn btn--sm" @click=${() => props.onOpenDir(normalized)}>Open</button>`
          : html`<button class="btn btn--sm" @click=${() => props.onDownload(normalized)}>
              Download
            </button>`
      }
    </div>
  </div>`;
}

export function renderFiles(props: FilesViewProps) {
  return html`<section class="panel files-panel">
    <div class="files-toolbar">
      <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onOpenParent}>Up</button>
      <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>Refresh</button>
      <span class="files-path">${props.path}</span>
    </div>
    ${props.error ? html`<div class="callout danger">${props.error}</div>` : ""}
    ${
      props.loading
        ? html`
            <div class="files-empty">Loading…</div>
          `
        : props.entries.length
          ? html`<div class="files-list">${props.entries.map((entry) => renderRow(entry, props))}</div>`
          : html`
              <div class="files-empty">No files</div>
            `
    }
  </section>`;
}
