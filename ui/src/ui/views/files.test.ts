import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
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

  it("selects file rows on click and previews them on double click", () => {
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
    row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

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

  it("renders richer file type icons", () => {
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

    const names = [...container.querySelectorAll(".files-row__name")].map(
      (el) => el.textContent ?? "",
    );
    expect(names[0]).toContain("🖼️");
    expect(names[1]).toContain("📝");
    expect(names[2]).toContain("💻");
    expect(names[3]).toContain("📄");
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
    expect(menu?.getAttribute("style")).toContain("left: 832px");
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

  it("renders plain text preview content inside floating overlay", () => {
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
          previewPanelWidth: 760,
          previewPanelHeight: 540,
        }),
      ),
      container,
    );

    const preview = container.querySelector<HTMLElement>(".files-preview[role='dialog']");
    expect(container.querySelector(".files-preview-overlay")).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("style")).toContain("width: 760px");
    expect(preview?.getAttribute("style")).toContain("height: 540px");
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("console.log('ok');");
  });

  it("closes preview from overlay clicks but not from dialog clicks", () => {
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
    expect(container.textContent).toContain("Center");
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

  it("renders image preview content with fit controls", () => {
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
          previewImageMode: "actual",
          previewImageBackground: "dark",
          previewDockMode: "center",
        }),
      ),
      container,
    );

    const preview = container.querySelector<HTMLElement>(".files-preview");
    const imageWrap = container.querySelector<HTMLElement>(".files-preview__image-wrap");
    const image = container.querySelector<HTMLImageElement>(".files-preview__image-wrap img");
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,ZmFrZQ==");
    expect(container.textContent).toContain("Fit");
    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("Checker");
    expect(container.textContent).toContain("Dark");
    expect(container.textContent).toContain("Light");
    expect(preview?.className).toContain("files-preview--center");
    expect(preview?.getAttribute("style")).toContain(
      "transform: translate(calc(-50% + 0px), calc(-50% + 0px))",
    );
    expect(imageWrap?.className).toContain("files-preview__image-wrap--bg-dark");
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
