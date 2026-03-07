import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, registerAppMountHooks } from "../test-helpers/app-mount.ts";

registerAppMountHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAssistantImage(url: string) {
  return {
    role: "assistant",
    content: [{ type: "image_url", image_url: { url } }],
    timestamp: Date.now(),
  };
}

describe("chat image open safety", () => {
  it("renders assistant local workspace image references as preview images", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    app.basePath = "";
    app.assistantAgentId = "main";
    app.chatMessages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Here is `world-map.png:1` for preview." }],
        timestamp: Date.now(),
      },
    ];
    await app.updateComplete;

    const image = app.querySelector<HTMLImageElement>(".chat-message-image");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("/__openclaw/workspace-image/main?path=world-map.png");
  });

  it("opens safe image URLs in a hardened new tab", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    app.chatMessages = [renderAssistantImage("https://example.com/cat.png")];
    await app.updateComplete;

    const image = app.querySelector<HTMLImageElement>(".chat-message-image");
    expect(image).not.toBeNull();
    image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/cat.png",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not open unsafe image URLs", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    app.chatMessages = [renderAssistantImage("javascript:alert(1)")];
    await app.updateComplete;

    const image = app.querySelector<HTMLImageElement>(".chat-message-image");
    expect(image).not.toBeNull();
    image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does not open SVG data image URLs", async () => {
    const app = mountApp("/chat");
    await app.updateComplete;

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    app.chatMessages = [
      renderAssistantImage("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' />"),
    ];
    await app.updateComplete;

    const image = app.querySelector<HTMLImageElement>(".chat-message-image");
    expect(image).not.toBeNull();
    image?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(openSpy).not.toHaveBeenCalled();
  });
});
