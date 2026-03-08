import { describe, expect, it, vi } from "vitest";
import {
  previewFile,
  saveEditedFile,
  startEditingFile,
  updateEditingDraft,
  type FilesHost,
} from "./app-files.ts";

function createHost(): FilesHost {
  return {
    connected: true,
    client: {
      request: vi.fn(async () => ({
        ok: true,
        path: "/hello.ts",
        fileName: "hello.ts",
        size: 18,
        mimeType: "text/plain; charset=utf-8",
        kind: "text",
        text: "const answer = 42;",
      })),
    },
    sessionKey: "agent:main:test",
    filesPath: "/",
    filesEntries: [],
    filesLoading: false,
    filesError: null,
    filesSelectedPath: null,
    filesContextMenuOpen: false,
    filesContextMenuTargetPath: null,
    filesContextMenuPosition: null,
    filesPreviewOpen: false,
    filesPreviewPath: null,
    filesPreviewKind: null,
    filesPreviewLoading: false,
    filesPreviewError: null,
    filesPreviewText: null,
    filesPreviewImageDataUrl: null,
    filesPreviewFileName: null,
    filesPreviewFileSize: null,
    filesPreviewMimeType: null,
    filesPreviewPanelWidth: 820,
    filesPreviewPanelHeight: 620,
    filesPreviewDockMode: "corner",
    filesPreviewImageMode: "fit",
    filesPreviewMarkdownMode: "source",
    filesPreviewImageBackground: "checker",
    filesPreviewOffsetX: 120,
    filesPreviewOffsetY: 80,
    filesDeleteConfirmOpen: false,
    filesDeletePendingPath: null,
    filesDeleteBusy: false,
    filesDeleteError: null,
  };
}

describe("app-files preview behavior", () => {
  it("opens desktop previews centered and resets drag offset", async () => {
    const host = createHost();
    host.filesPreviewDockMode = "corner" as never;
    Object.defineProperty(window, "innerWidth", {
      value: 1280,
      configurable: true,
    });

    await previewFile(host, "/hello.ts");

    expect(host.filesPreviewOpen).toBe(true);
    expect(host.filesPreviewDockMode).toBe("center");
    expect(host.filesPreviewOffsetX).toBe(0);
    expect(host.filesPreviewOffsetY).toBe(0);
    expect(host.filesPreviewText).toBe("const answer = 42;");
  });

  it("saves edited text content through workspace.files.write", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        path: "/hello.ts",
        fileName: "hello.ts",
        size: 18,
        mimeType: "text/plain; charset=utf-8",
        kind: "text",
        text: "const answer = 42;",
      })
      .mockResolvedValueOnce({ ok: true, path: "/hello.ts", size: 21, updatedAtMs: 999 });
    const host = createHost();
    host.client = { request };

    await previewFile(host, "/hello.ts");
    startEditingFile(host);
    updateEditingDraft(host, "const answer = 99;");
    await saveEditedFile(host);

    expect(request).toHaveBeenNthCalledWith(
      2,
      "workspace.files.write",
      expect.objectContaining({ path: "/hello.ts", content: "const answer = 99;" }),
    );
    expect(host.filesPreviewText).toBe("const answer = 99;");
    expect(host.filesPreviewFileSize).toBe(21);
    expect(host.filesEditMode).toBe(false);
    expect(host.filesEditDirty).toBe(false);
  });
});
