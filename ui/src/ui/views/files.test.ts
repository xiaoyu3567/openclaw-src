import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderFiles, type FilesViewProps } from "./files.ts";

function createProps(overrides: Partial<FilesViewProps> = {}): FilesViewProps {
  return {
    path: "/",
    entries: [],
    loading: false,
    error: null,
    onRefresh: () => undefined,
    onOpenDir: () => undefined,
    onOpenParent: () => undefined,
    onDownload: () => undefined,
    ...overrides,
  };
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

beforeEach(() => {
  setViewportWidth(1280);
});

afterEach(() => {
  vi.useRealTimers();
  setViewportWidth(1280);
});

describe("files view", () => {
  it("opens a directory when the row is clicked", () => {
    const container = document.createElement("div");
    const onOpenDir = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["docs/"],
          onOpenDir,
        }),
      ),
      container,
    );

    const row = container.querySelector<HTMLElement>(".files-row--dir");
    expect(row).not.toBeNull();
    row?.click();

    expect(onOpenDir).toHaveBeenCalledWith("/docs/");
  });

  it("selects file rows and previews them on single click for desktop", () => {
    const container = document.createElement("div");
    const onSelectPath = vi.fn();
    const onPreview = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          onSelectPath,
          onPreview,
        }),
      ),
      container,
    );

    const row = container.querySelector<HTMLElement>(".files-row--file");
    expect(row).not.toBeNull();
    row?.click();

    expect(onSelectPath).toHaveBeenCalledWith("/hello.txt");
    expect(onPreview).toHaveBeenCalledWith("/hello.txt");
  });

  it("does not render an Open button for directories", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["docs/"],
        }),
      ),
      container,
    );

    expect(container.textContent).not.toContain("Open");
  });

  it("renders a parent directory row as .... at the top when not at root", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/docs/notes/",
          entries: ["child.txt"],
        }),
      ),
      container,
    );

    const firstRow = container.querySelector<HTMLElement>(
      ".files-row--parent .files-row__name span:last-child",
    );
    expect(firstRow?.textContent).toBe("....");
  });

  it("renders material-style file type icons", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["cat.png", "README.md", "main.ts", "notes.txt"],
        }),
      ),
      container,
    );

    const icons = [...container.querySelectorAll<HTMLElement>(".files-row__name .files-icon")].map(
      (el) => el.dataset.icon ?? "",
    );
    expect(icons).toEqual([
      "materialImage",
      "materialDescription",
      "materialCode",
      "materialDraft",
    ]);
  });

  it("fires long press callback for file rows", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    const onFileLongPress = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          onFileLongPress,
        }),
      ),
      container,
    );

    const row = container.querySelector<HTMLElement>(".files-row--file");
    expect(row).not.toBeNull();
    row?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.advanceTimersByTime(500);

    expect(onFileLongPress).toHaveBeenCalledTimes(1);
    expect(onFileLongPress).toHaveBeenCalledWith(
      "/hello.txt",
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("opens the same menu on desktop right click", () => {
    const container = document.createElement("div");
    const onFileLongPress = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          onFileLongPress,
        }),
      ),
      container,
    );

    const row = container.querySelector<HTMLElement>(".files-row--file");
    expect(row).not.toBeNull();
    row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 80, clientY: 96 }));

    expect(onFileLongPress).toHaveBeenCalledWith("/hello.txt", { x: 80, y: 96 });
  });

  it("shows a visible desktop menu trigger for files", () => {
    const container = document.createElement("div");
    const onFileLongPress = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          onFileLongPress,
        }),
      ),
      container,
    );

    const trigger = container.querySelector<HTMLButtonElement>(".files-row__menu-trigger");
    expect(trigger).not.toBeNull();
    trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 120, clientY: 160 }));

    expect(onFileLongPress).toHaveBeenCalledTimes(1);
  });

  it("keeps download only in the context menu, not inline on file rows", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          contextMenuOpen: true,
          contextMenuTargetPath: "/hello.txt",
          contextMenuPosition: { x: 24, y: 36 },
        }),
      ),
      container,
    );

    expect(container.querySelectorAll(".files-row button")).toHaveLength(1);
    expect(container.querySelector(".files-row__menu-trigger")).not.toBeNull();
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("Download");
    expect(
      [...container.querySelectorAll<HTMLElement>(".files-context-menu .files-icon")].map(
        (el) => el.dataset.icon ?? "",
      ),
    ).toEqual(["materialVisibility", "materialDownload", "materialDelete"]);
  });

  it("keeps the context menu inside the viewport bounds", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          contextMenuOpen: true,
          contextMenuTargetPath: "/hello.txt",
          contextMenuPosition: { x: 5000, y: 5000 },
        }),
      ),
      container,
    );

    const menu = container.querySelector<HTMLElement>(".files-context-menu");
    expect(menu?.getAttribute("style")).toContain("left: 1088px");
    expect(menu?.getAttribute("style")).toContain("top: 600px");
  });

  it("supports keyboard navigation and actions in the files list", () => {
    const container = document.createElement("div");
    const onSelectPath = vi.fn();
    const onOpenDir = vi.fn();
    const onDelete = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["docs/", "hello.txt"],
          selectedPath: "/hello.txt",
          onSelectPath,
          onOpenDir,
          onDelete,
        }),
      ),
      container,
    );

    const list = container.querySelector<HTMLElement>(".files-list");
    expect(list).not.toBeNull();
    list?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }));
    expect(onSelectPath).toHaveBeenCalledWith("/docs/");

    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["docs/", "hello.txt"],
          selectedPath: "/docs/",
          onSelectPath,
          onOpenDir,
          onDelete,
        }),
      ),
      container,
    );
    container
      .querySelector<HTMLElement>(".files-list")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(onOpenDir).toHaveBeenCalledWith("/docs/");

    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["docs/", "hello.txt"],
          selectedPath: "/hello.txt",
          onSelectPath,
          onOpenDir,
          onDelete,
        }),
      ),
      container,
    );
    container
      .querySelector<HTMLElement>(".files-list")
      ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("/hello.txt");
  });

  it("renders desktop preview in the right detail pane", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          previewOpen: true,
          previewPath: "/hello.txt",
          previewKind: "text",
          previewText: "console.log('ok');",
          previewFileName: "hello.txt",
          previewFileSize: 21,
          previewMimeType: "text/plain",
          previewPanelWidth: 760,
          previewPanelHeight: 540,
        }),
      ),
      container,
    );

    const detailPane = container.querySelector(".files-detail-pane");
    const preview = container.querySelector<HTMLElement>(".files-detail-pane .files-preview");
    expect(detailPane).not.toBeNull();
    expect(container.querySelector(".files-preview-overlay")).toBeNull();
    expect(preview?.className).toContain("files-preview--embedded");
    expect(container.textContent).toContain("console.log('ok');");
    expect(container.textContent).toContain("hello.txt");
    expect(container.textContent).toContain("text/plain");
  });

  it("keeps mobile overlay preview behavior", () => {
    setViewportWidth(640);
    const container = document.createElement("div");
    const onClosePreview = vi.fn();
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.txt"],
          previewOpen: true,
          previewPath: "/hello.txt",
          previewKind: "text",
          previewText: "console.log('ok');",
          onClosePreview,
        }),
      ),
      container,
    );

    container.querySelector<HTMLElement>(".files-preview")?.click();
    expect(onClosePreview).not.toHaveBeenCalled();

    container.querySelector<HTMLElement>(".files-preview-overlay")?.click();
    expect(onClosePreview).toHaveBeenCalledTimes(1);
  });

  it("renders syntax highlighting for code previews", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.ts"],
          previewOpen: true,
          previewPath: "/hello.ts",
          previewKind: "text",
          previewText: "const answer = 42;",
        }),
      ),
      container,
    );

    expect(container.querySelector(".files-code-token--keyword")?.textContent).toContain("const");
    expect(container.querySelector(".files-code-token--number")?.textContent).toContain("42");
    expect(container.textContent).toContain("Copy");
    expect(
      [
        ...container.querySelectorAll<HTMLElement>(".files-preview__header-actions .files-icon"),
      ].map((el) => el.dataset.icon ?? ""),
    ).toEqual(["materialCode", "materialContentCopy"]);
  });

  it("renders markdown preview content", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["README.md"],
          previewOpen: true,
          previewPath: "/README.md",
          previewKind: "markdown",
          previewText: "# Hello\n\n**world**",
        }),
      ),
      container,
    );

    const heading = container.querySelector(".chat-text h1");
    expect(heading?.textContent).toBe("Hello");
    expect(container.querySelector(".chat-text strong")?.textContent).toBe("world");
    expect(container.textContent).toContain("Render");
    expect(container.textContent).toContain("Source");
    expect(
      [
        ...container.querySelectorAll<HTMLElement>(".files-preview__header-actions .files-icon"),
      ].map((el) => el.dataset.icon ?? ""),
    ).toEqual(["materialCode", "materialContentCopy", "materialVisibility", "materialCode"]);
  });

  it("renders markdown source mode when requested", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["README.md"],
          previewOpen: true,
          previewPath: "/README.md",
          previewKind: "markdown",
          previewMarkdownMode: "source",
          previewText: "# Hello\n\n**world**",
        }),
      ),
      container,
    );

    expect(container.querySelector(".chat-text h1")).toBeNull();
    expect(container.textContent).toContain("# Hello");
    expect(container.querySelector(".files-code-block")).not.toBeNull();
  });

  it("renders inline editing controls for editable files", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["hello.ts"],
          previewOpen: true,
          previewPath: "/hello.ts",
          previewKind: "text",
          editMode: true,
          editDraft: "const answer = 42;",
          previewText: "const answer = 42;",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Save");
    expect(container.textContent).toContain("Discard");
    expect(container.querySelector(".files-edit-textarea")).not.toBeNull();
  });

  it("renders image preview content with file info below it", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["cat.png"],
          previewOpen: true,
          previewPath: "/cat.png",
          previewKind: "image",
          previewImageDataUrl: "data:image/png;base64,ZmFrZQ==",
          previewFileName: "cat.png",
          previewFileSize: 2048,
          previewMimeType: "image/png",
          previewImageMode: "actual",
          previewImageBackground: "dark",
        }),
      ),
      container,
    );

    const imageWrap = container.querySelector<HTMLElement>(".files-preview__image-wrap");
    const image = container.querySelector<HTMLImageElement>(".files-preview__image-wrap img");
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,ZmFrZQ==");
    expect(container.textContent).toContain("Fit");
    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("Checker");
    expect(container.textContent).toContain("Dark");
    expect(container.textContent).toContain("Light");
    expect(container.textContent).toContain("cat.png");
    expect(container.textContent).toContain("image/png");
    expect(imageWrap?.className).toContain("files-preview__image-wrap--bg-dark");
  });

  it("shows file information when preview is unsupported", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["archive.bin"],
          previewOpen: true,
          previewPath: "/archive.bin",
          previewKind: "unsupported",
          previewFileName: "archive.bin",
          previewFileSize: 4096,
          previewMimeType: "application/octet-stream",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Preview is not available for this file type.");
    expect(container.textContent).toContain("archive.bin");
    expect(container.textContent).toContain("application/octet-stream");
  });

  it("renders stronger delete confirmation copy", () => {
    const container = document.createElement("div");
    render(
      renderFiles(
        createProps({
          path: "/",
          entries: ["cat.png"],
          deleteConfirmOpen: true,
          deletePendingPath: "/cat.png",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Delete this file?");
    expect(container.textContent).toContain("cat.png");
    expect(container.textContent).toContain("system trash / recycle bin");
    expect(container.textContent).toContain("Move to trash");
  });
});
