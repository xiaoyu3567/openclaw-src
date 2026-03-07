import { describe, expect, it } from "vitest";
import {
  buildControlUiWorkspaceImageUrl,
  extractLocalImagePreviews,
} from "./local-image-previews.ts";

describe("local image previews", () => {
  it("builds workspace image urls with base path", () => {
    expect(
      buildControlUiWorkspaceImageUrl({
        basePath: "/openclaw",
        agentId: "main",
        path: "world-map.png",
      }),
    ).toBe("/openclaw/__openclaw/workspace-image/main?path=world-map.png");
  });

  it("extracts backticked local image paths and strips file references", () => {
    const previews = extractLocalImagePreviews("See `world-map.png:1` please.", {
      basePath: "",
      agentId: "main",
    });

    expect(previews).toEqual([
      {
        path: "world-map.png",
        url: "/__openclaw/workspace-image/main?path=world-map.png",
        alt: "world-map.png",
      },
    ]);
  });

  it("ignores remote image urls", () => {
    const previews = extractLocalImagePreviews("![cat](https://example.com/cat.png)", {
      basePath: "",
      agentId: "main",
    });

    expect(previews).toEqual([]);
  });
});
