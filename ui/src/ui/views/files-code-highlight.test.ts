import { describe, expect, it } from "vitest";
import { isCodePreviewPath, renderHighlightedCodeHtml } from "./files-code-highlight.ts";

describe("files code highlight", () => {
  it("detects common code preview paths", () => {
    expect(isCodePreviewPath("/src/index.ts")).toBe(true);
    expect(isCodePreviewPath("/notes.txt")).toBe(false);
  });

  it("highlights common script keywords safely", () => {
    const html = renderHighlightedCodeHtml("const value = 7;", "/src/index.ts");
    expect(html).toContain("files-code-token--keyword");
    expect(html).toContain("files-code-token--number");
  });

  it("escapes markup before highlighting html", () => {
    const html = renderHighlightedCodeHtml('<div class="x">hi</div>', "/index.html");
    expect(html).toContain("&lt;");
    expect(html).toContain("files-code-token--keyword");
  });
});
