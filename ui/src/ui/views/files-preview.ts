import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import type { PreviewDockMode, PreviewImageMode } from "../storage.ts";
import { isCodePreviewPath, renderHighlightedCodeHtml } from "./files-code-highlight.ts";

function stopPreviewEvent(event: Event) {
  event.stopPropagation();
}

let activePreviewDrag: {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  onSetOffset?: (x: number, y: number) => void;
} | null = null;

function clampPreviewOffset(value: number): number {
  return Math.max(-480, Math.min(480, Math.round(value)));
}

function stopPreviewDrag() {
  activePreviewDrag = null;
}

function updatePreviewDrag(event: PointerEvent) {
  if (!activePreviewDrag || event.pointerId !== activePreviewDrag.pointerId) {
    return;
  }
  activePreviewDrag.onSetOffset?.(
    clampPreviewOffset(activePreviewDrag.originX + (event.clientX - activePreviewDrag.startX)),
    clampPreviewOffset(activePreviewDrag.originY + (event.clientY - activePreviewDrag.startY)),
  );
}

window.addEventListener("pointermove", updatePreviewDrag);
window.addEventListener("pointerup", stopPreviewDrag);
window.addEventListener("pointercancel", stopPreviewDrag);

export type FilesPreviewProps = {
  open: boolean;
  path: string | null;
  kind: "text" | "markdown" | "image" | "unsupported" | "too_large" | null;
  loading: boolean;
  error: string | null;
  text: string | null;
  imageDataUrl?: string | null;
  panelWidth?: number;
  panelHeight?: number;
  dockMode: PreviewDockMode;
  imageMode: PreviewImageMode;
  markdownMode?: "render" | "source";
  imageBackground?: "checker" | "dark" | "light";
  offsetX?: number;
  offsetY?: number;
  onClose: () => void;
  onSetDockMode?: (mode: PreviewDockMode) => void;
  onSetImageMode?: (mode: PreviewImageMode) => void;
  onSetMarkdownMode?: (mode: "render" | "source") => void;
  onSetImageBackground?: (mode: "checker" | "dark" | "light") => void;
  onSetPanelSize?: (width: number, height: number) => void;
  onSetOffset?: (x: number, y: number) => void;
  onCopyText?: () => void | Promise<void>;
};

function resolvePreviewStyle(props: FilesPreviewProps): string {
  const isCompact = window.innerWidth <= 720;
  if (isCompact) {
    return "";
  }
  const width = Math.max(420, Math.min(1400, props.panelWidth ?? 820));
  const height = Math.max(320, Math.min(1000, props.panelHeight ?? 620));
  const offsetX = clampPreviewOffset(props.offsetX ?? 0);
  const offsetY = clampPreviewOffset(props.offsetY ?? 0);
  if (props.dockMode === "center") {
    return `width: ${width}px; height: ${height}px; left: 50%; top: 50%; right: auto; bottom: auto; transform: translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)); resize: both; overflow: hidden;`;
  }
  return `width: ${width}px; height: ${height}px; transform: translate(${offsetX}px, ${offsetY}px); resize: both; overflow: hidden;`;
}

function renderHeaderActions(props: FilesPreviewProps, isCodePreview: boolean) {
  return html`
    <div class="files-preview__header-actions">
      ${
        isCodePreview || props.kind === "markdown"
          ? html`<button class="btn btn--sm" @click=${() => props.onCopyText?.()}>Copy</button>`
          : nothing
      }
      ${
        props.kind === "markdown"
          ? html`
              <button
                class="btn btn--sm ${props.markdownMode !== "source" ? "active" : ""}"
                @click=${() => props.onSetMarkdownMode?.("render")}
              >
                Render
              </button>
              <button
                class="btn btn--sm ${props.markdownMode === "source" ? "active" : ""}"
                @click=${() => props.onSetMarkdownMode?.("source")}
              >
                Source
              </button>
            `
          : nothing
      }
      ${
        props.kind === "image"
          ? html`
              <button
                class="btn btn--sm ${props.imageMode === "fit" ? "active" : ""}"
                @click=${() => props.onSetImageMode?.("fit")}
              >
                Fit
              </button>
              <button
                class="btn btn--sm ${props.imageMode === "actual" ? "active" : ""}"
                @click=${() => props.onSetImageMode?.("actual")}
              >
                100%
              </button>
              <button
                class="btn btn--sm ${props.imageBackground === "checker" ? "active" : ""}"
                @click=${() => props.onSetImageBackground?.("checker")}
              >
                Checker
              </button>
              <button
                class="btn btn--sm ${props.imageBackground === "dark" ? "active" : ""}"
                @click=${() => props.onSetImageBackground?.("dark")}
              >
                Dark
              </button>
              <button
                class="btn btn--sm ${props.imageBackground === "light" ? "active" : ""}"
                @click=${() => props.onSetImageBackground?.("light")}
              >
                Light
              </button>
            `
          : nothing
      }
      <button
        class="btn btn--sm"
        @click=${() => props.onSetDockMode?.(props.dockMode === "corner" ? "center" : "corner")}
      >
        ${props.dockMode === "corner" ? "Center" : "Dock"}
      </button>
      <button class="btn btn--sm" @click=${props.onClose}>Close</button>
    </div>
  `;
}

export function renderFilesPreview(props: FilesPreviewProps) {
  if (!props.open) {
    return nothing;
  }

  const isCodePreview = props.kind === "text" && isCodePreviewPath(props.path);
  const previewStyle = resolvePreviewStyle(props);

  return html`
    <div class="files-preview-overlay" @click=${props.onClose}></div>
    <div
      class="files-preview card files-preview--${props.dockMode}"
      style=${previewStyle}
      role="dialog"
      aria-modal="true"
      aria-label="File preview"
      @click=${stopPreviewEvent}
      @mouseup=${(event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement | null;
        if (!target || !props.onSetPanelSize || window.innerWidth <= 720) {
          return;
        }
        props.onSetPanelSize(target.offsetWidth, target.offsetHeight);
      }}
    >
      <div
        class="files-preview__header"
        @pointerdown=${(event: PointerEvent) => {
          const target = event.target as HTMLElement | null;
          if (window.innerWidth <= 720 || !props.onSetOffset || target?.closest("button")) {
            return;
          }
          activePreviewDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: props.offsetX ?? 0,
            originY: props.offsetY ?? 0,
            onSetOffset: props.onSetOffset,
          };
        }}
      >
        <div>
          <strong>Preview</strong>
          <div class="muted mono">${props.path ?? ""}</div>
        </div>
        ${renderHeaderActions(props, isCodePreview)}
      </div>
      <div class="files-preview__body">
        ${
          props.loading
            ? html`
                <div class="files-empty">Loading preview…</div>
              `
            : props.error
              ? html`<div class="callout danger">${props.error}</div>`
              : props.kind === "text"
                ? isCodePreview
                  ? html`<pre class="code-block files-code-block"><code>${unsafeHTML(renderHighlightedCodeHtml(props.text ?? "", props.path))}</code></pre>`
                  : html`<pre class="code-block files-code-block"><code>${props.text ?? ""}</code></pre>`
                : props.kind === "markdown"
                  ? props.markdownMode === "source"
                    ? html`<pre class="code-block files-code-block"><code>${props.text ?? ""}</code></pre>`
                    : html`<div class="chat-text files-preview__markdown">${unsafeHTML(toSanitizedMarkdownHtml(props.text ?? ""))}</div>`
                  : props.kind === "image" && props.imageDataUrl
                    ? html`<div class="files-preview__image-wrap files-preview__image-wrap--${props.imageMode} files-preview__image-wrap--bg-${props.imageBackground ?? "checker"}"><img src=${props.imageDataUrl} alt=${props.path ?? "Image preview"} /></div>`
                    : html`
                        <div class="files-empty">Preview is not available.</div>
                      `
        }
      </div>
    </div>
  `;
}
