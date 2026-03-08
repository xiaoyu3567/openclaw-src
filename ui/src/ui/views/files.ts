import { html, nothing } from "lit";
import type { FilesMenuPosition } from "../app-files.ts";
import { icon, type IconName } from "../icons.ts";
import type { PreviewDockMode, PreviewImageMode } from "../storage.ts";
import { renderFilesDeleteConfirm } from "./files-delete-confirm.ts";
import { renderFilesPreview } from "./files-preview.ts";

const FILE_LONG_PRESS_MS = 500;
let activeLongPressTimer: number | null = null;

export type FilesViewProps = {
  path: string;
  entries: string[];
  loading: boolean;
  error: string | null;
  selectedPath?: string | null;
  contextMenuOpen?: boolean;
  contextMenuTargetPath?: string | null;
  contextMenuPosition?: FilesMenuPosition | null;
  previewOpen?: boolean;
  previewPath?: string | null;
  previewKind?: "text" | "markdown" | "image" | "unsupported" | "too_large" | null;
  previewLoading?: boolean;
  previewError?: string | null;
  previewText?: string | null;
  previewImageDataUrl?: string | null;
  previewFileName?: string | null;
  previewFileSize?: number | null;
  previewMimeType?: string | null;
  previewPanelWidth?: number;
  previewPanelHeight?: number;
  previewDockMode?: PreviewDockMode;
  previewImageMode?: PreviewImageMode;
  previewMarkdownMode?: "render" | "source";
  previewImageBackground?: "checker" | "dark" | "light";
  previewOffsetX?: number;
  previewOffsetY?: number;
  editMode?: boolean;
  editDraft?: string;
  editDirty?: boolean;
  editSaving?: boolean;
  editError?: string | null;
  deleteConfirmOpen?: boolean;
  deletePendingPath?: string | null;
  deleteBusy?: boolean;
  deleteError?: string | null;
  onRefresh: () => void;
  onOpenDir: (path: string) => void;
  onOpenParent: () => void;
  onSelectPath?: (path: string | null) => void;
  onDownload: (path: string) => void;
  onPreview?: (path: string) => void;
  onDelete?: (path: string) => void;
  onClosePreview?: () => void;
  onSetPreviewDockMode?: (mode: PreviewDockMode) => void;
  onSetPreviewImageMode?: (mode: PreviewImageMode) => void;
  onSetPreviewMarkdownMode?: (mode: "render" | "source") => void;
  onSetPreviewImageBackground?: (mode: "checker" | "dark" | "light") => void;
  onSetPreviewPanelSize?: (width: number, height: number) => void;
  onSetPreviewOffset?: (x: number, y: number) => void;
  onStartEdit?: () => void;
  onEditDraftChange?: (next: string) => void;
  onDiscardEdit?: () => void;
  onSaveEdit?: () => void | Promise<void>;
  onCopyPreviewText?: () => void | Promise<void>;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
  onFileLongPress?: (path: string, position: FilesMenuPosition) => void;
  onCloseContextMenu?: () => void;
};

function joinPath(baseDir: string, name: string): string {
  if (!baseDir || baseDir === "/") {
    return `/${name}`;
  }
  return `${baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir}/${name}`;
}

function clearLongPressTimer() {
  if (activeLongPressTimer == null) {
    return;
  }
  window.clearTimeout(activeLongPressTimer);
  activeLongPressTimer = null;
}

function openFileContextMenu(
  event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">,
  filePath: string,
  props: FilesViewProps,
) {
  props.onFileLongPress?.(filePath, {
    x: event.clientX || window.innerWidth / 2,
    y: event.clientY || window.innerHeight / 2,
  });
}

function startFileLongPress(event: PointerEvent, filePath: string, props: FilesViewProps) {
  clearLongPressTimer();
  activeLongPressTimer = window.setTimeout(() => {
    activeLongPressTimer = null;
    openFileContextMenu(event, filePath, props);
  }, FILE_LONG_PRESS_MS);
}

const FILES_CONTEXT_MENU_MIN_WIDTH = 180;
const FILES_CONTEXT_MENU_ESTIMATED_HEIGHT = 156;
const FILES_CONTEXT_MENU_MARGIN = 12;

function stopEvent(event: Event) {
  event.stopPropagation();
}

function resolveContextMenuStyle(position?: FilesMenuPosition | null): string {
  const viewportWidth = window.innerWidth || 1024;
  const viewportHeight = window.innerHeight || 768;
  const rawX = position?.x ?? 24;
  const rawY = position?.y ?? 24;
  const maxX = Math.max(
    FILES_CONTEXT_MENU_MARGIN,
    viewportWidth - FILES_CONTEXT_MENU_MIN_WIDTH - FILES_CONTEXT_MENU_MARGIN,
  );
  const maxY = Math.max(
    FILES_CONTEXT_MENU_MARGIN,
    viewportHeight - FILES_CONTEXT_MENU_ESTIMATED_HEIGHT - FILES_CONTEXT_MENU_MARGIN,
  );
  const x = Math.min(Math.max(FILES_CONTEXT_MENU_MARGIN, rawX), maxX);
  const y = Math.min(Math.max(FILES_CONTEXT_MENU_MARGIN, rawY), maxY);
  return `position: fixed; left: ${x}px; top: ${y}px; z-index: 20; min-width: ${FILES_CONTEXT_MENU_MIN_WIDTH}px;`;
}

function renderFilesIcon(name: IconName, className: string, dataIcon?: string) {
  return html`<span class=${className} aria-hidden="true" data-icon=${dataIcon ?? name}>${icon(name)}</span>`;
}

function renderMenuButton(label: string, iconName: IconName, onClick: () => void, extraClass = "") {
  return html`<button
    class="btn btn--sm files-action-btn ${extraClass}"
    style="width: 100%; justify-content: flex-start; margin-bottom: 8px;"
    @click=${onClick}
  >
    ${renderFilesIcon(iconName, "files-icon files-icon--action", iconName)}
    <span>${label}</span>
  </button>`;
}

function renderContextMenu(props: FilesViewProps) {
  if (!props.contextMenuOpen || !props.contextMenuTargetPath) {
    return nothing;
  }

  const menuStyle = resolveContextMenuStyle(props.contextMenuPosition);

  return html`
    <div
      class="files-context-menu-backdrop"
      style="position: fixed; inset: 0; z-index: 19;"
      @click=${() => props.onCloseContextMenu?.()}
    ></div>
    <div class="files-context-menu card" style=${menuStyle} @click=${stopEvent}>
      ${renderMenuButton("Preview", "materialVisibility", () => props.onPreview?.(props.contextMenuTargetPath!))}
      ${renderMenuButton("Download", "materialDownload", () => props.onDownload(props.contextMenuTargetPath!))}
      ${renderMenuButton("Delete", "materialDelete", () => props.onDelete?.(props.contextMenuTargetPath!), "danger")}
    </div>
  `;
}

function openFileContextMenuFromTrigger(
  event: MouseEvent,
  filePath: string,
  props: FilesViewProps,
) {
  const trigger = event.currentTarget as HTMLElement | null;
  const rect = trigger?.getBoundingClientRect();
  openFileContextMenu(
    {
      clientX: rect ? rect.left + rect.width / 2 : event.clientX,
      clientY: rect ? rect.bottom + 8 : event.clientY,
    },
    filePath,
    props,
  );
}

function resolveFileIconName(entryPath: string, isDir: boolean): IconName {
  if (isDir) {
    return "materialFolder";
  }
  const lower = entryPath.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(lower)) {
    return "materialImage";
  }
  if (lower.endsWith(".md")) {
    return "materialDescription";
  }
  if (/\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|py|sh|ya?ml|rs|go|java|sql)$/.test(lower)) {
    return "materialCode";
  }
  return "materialDraft";
}

function isDesktopFilesLayout() {
  return window.innerWidth > 960;
}

function handleFileActivate(path: string, props: FilesViewProps) {
  props.onSelectPath?.(path);
  if (isDesktopFilesLayout()) {
    props.onPreview?.(path);
  }
}

function renderParentRow(props: FilesViewProps) {
  if (props.path === "/") {
    return nothing;
  }
  return html`<div
    class="files-row files-row--dir files-row--parent"
    role="button"
    tabindex="0"
    @click=${() => props.onOpenParent()}
    @keydown=${(event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      props.onOpenParent();
    }}
  >
    <div class="files-row__name" title="Go to parent directory">
      ${renderFilesIcon("materialFolder", "files-icon files-icon--row", "materialFolder")}
      <span>....</span>
    </div>
    <div class="files-row__path">Parent directory</div>
    <div class="files-row__actions"></div>
  </div>`;
}

function renderRow(entry: string, props: FilesViewProps) {
  const isDir = entry.endsWith("/");
  const normalized = entry.startsWith("/") ? entry : joinPath(props.path, entry);
  const label = normalized.split("/").filter(Boolean).pop() || (isDir ? "/" : normalized);
  const isContextTarget = props.contextMenuOpen && props.contextMenuTargetPath === normalized;
  const isSelected = props.selectedPath === normalized;
  const iconName = resolveFileIconName(normalized, isDir);
  return html`<div
    class="files-row ${isDir ? "files-row--dir" : "files-row--file"} ${isContextTarget ? "files-row--active" : ""} ${isSelected ? "files-row--selected" : ""}"
    role=${isDir ? "button" : nothing}
    tabindex=${isDir ? "0" : nothing}
    @click=${isDir ? () => props.onOpenDir(normalized) : () => handleFileActivate(normalized, props)}
    @keydown=${
      isDir
        ? (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            props.onOpenDir(normalized);
          }
        : undefined
    }
    @dblclick=${undefined}
    @pointerdown=${!isDir ? (event: PointerEvent) => startFileLongPress(event, normalized, props) : undefined}
    @pointerup=${!isDir ? () => clearLongPressTimer() : undefined}
    @pointercancel=${!isDir ? () => clearLongPressTimer() : undefined}
    @pointerleave=${!isDir ? () => clearLongPressTimer() : undefined}
    @contextmenu=${
      !isDir
        ? (event: MouseEvent) => {
            event.preventDefault();
            clearLongPressTimer();
            openFileContextMenu(event, normalized, props);
          }
        : undefined
    }
  >
    <div class="files-row__name" title=${normalized}>
      ${renderFilesIcon(iconName, "files-icon files-icon--row", iconName)}
      <span>${label}</span>
    </div>
    <div class="files-row__path">${normalized}</div>
    ${
      isDir
        ? nothing
        : html`<div class="files-row__actions">
            <button
              class="btn btn--sm files-row__menu-trigger"
              type="button"
              aria-label="More file actions"
              title="More file actions"
              @pointerdown=${stopEvent}
              @click=${(event: MouseEvent) => {
                stopEvent(event);
                clearLongPressTimer();
                openFileContextMenuFromTrigger(event, normalized, props);
              }}
            >
              ${renderFilesIcon("materialMoreVert", "files-icon files-icon--action", "materialMoreVert")}
            </button>
          </div>`
    }
  </div>`;
}

function resolveEntryPath(basePath: string, entry: string): string {
  return entry.startsWith("/") ? entry : joinPath(basePath, entry);
}

function handleFilesListKeydown(event: KeyboardEvent, props: FilesViewProps) {
  if (!props.entries.length) {
    return;
  }
  const resolvedEntries = props.entries.map((entry) => ({
    raw: entry,
    path: resolveEntryPath(props.path, entry),
    isDir: entry.endsWith("/"),
  }));
  const currentIndex = Math.max(
    0,
    resolvedEntries.findIndex((entry) => entry.path === props.selectedPath),
  );
  const current = resolvedEntries[currentIndex] ?? resolvedEntries[0];
  if (!current) {
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = Math.min(resolvedEntries.length - 1, Math.max(0, currentIndex + delta));
    props.onSelectPath?.(resolvedEntries[nextIndex]?.path ?? null);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    if (current.isDir) {
      props.onOpenDir(current.path);
    } else {
      props.onPreview?.(current.path);
    }
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && !current.isDir) {
    event.preventDefault();
    props.onDelete?.(current.path);
  }
}

export function renderFiles(props: FilesViewProps) {
  const desktopLayout = isDesktopFilesLayout();
  const previewTemplate = renderFilesPreview({
    open: Boolean(props.previewOpen),
    embedded: desktopLayout,
    path: props.previewPath ?? null,
    kind: props.previewKind ?? null,
    loading: Boolean(props.previewLoading),
    error: props.previewError ?? null,
    text: props.previewText ?? null,
    imageDataUrl: props.previewImageDataUrl ?? null,
    fileName: props.previewFileName ?? null,
    fileSize: props.previewFileSize ?? null,
    mimeType: props.previewMimeType ?? null,
    panelWidth: props.previewPanelWidth,
    panelHeight: props.previewPanelHeight,
    dockMode: props.previewDockMode ?? "corner",
    imageMode: props.previewImageMode ?? "fit",
    markdownMode: props.previewMarkdownMode ?? "render",
    imageBackground: props.previewImageBackground ?? "checker",
    offsetX: props.previewOffsetX ?? 0,
    offsetY: props.previewOffsetY ?? 0,
    editMode: props.editMode ?? false,
    editDraft: props.editDraft ?? "",
    editDirty: props.editDirty ?? false,
    editSaving: props.editSaving ?? false,
    editError: props.editError ?? null,
    onClose: () => props.onClosePreview?.(),
    onSetDockMode: (mode) => props.onSetPreviewDockMode?.(mode),
    onSetImageMode: (mode) => props.onSetPreviewImageMode?.(mode),
    onSetMarkdownMode: (mode) => props.onSetPreviewMarkdownMode?.(mode),
    onSetImageBackground: (mode) => props.onSetPreviewImageBackground?.(mode),
    onSetPanelSize: (width, height) => props.onSetPreviewPanelSize?.(width, height),
    onSetOffset: (x, y) => props.onSetPreviewOffset?.(x, y),
    onStartEdit: () => props.onStartEdit?.(),
    onEditDraftChange: (next) => props.onEditDraftChange?.(next),
    onDiscardEdit: () => props.onDiscardEdit?.(),
    onSaveEdit: () => props.onSaveEdit?.(),
    onCopyText: () => props.onCopyPreviewText?.(),
  });

  return html`<section class="panel files-panel">
    <div class="files-toolbar">
      <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onOpenParent}>Up</button>
      <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>Refresh</button>
      <span class="files-path">${props.path}</span>
    </div>
    ${props.error ? html`<div class="callout danger">${props.error}</div>` : ""}
    <div class="files-layout ${desktopLayout ? "files-layout--desktop" : "files-layout--mobile"}">
      ${
        props.loading
          ? html`
              <div class="files-empty">Loading…</div>
            `
          : html`<div class="files-list-pane">
              ${
                props.entries.length || props.path !== "/"
                  ? html`<div class="files-list" tabindex="0" @keydown=${(event: KeyboardEvent) => handleFilesListKeydown(event, props)}>
                      ${renderParentRow(props)}
                      ${props.entries.map((entry) => renderRow(entry, props))}
                    </div>`
                  : html`
                      <div class="files-empty">No files</div>
                    `
              }
            </div>`
      }
      ${desktopLayout ? html`<div class="files-detail-pane">${previewTemplate}</div>` : nothing}
    </div>
    ${renderContextMenu(props)}
    ${desktopLayout ? nothing : previewTemplate}
    ${renderFilesDeleteConfirm({
      open: Boolean(props.deleteConfirmOpen),
      path: props.deletePendingPath ?? null,
      busy: Boolean(props.deleteBusy),
      error: props.deleteError ?? null,
      onCancel: () => props.onCancelDelete?.(),
      onConfirm: () => props.onConfirmDelete?.(),
    })}
  </section>`;
}
