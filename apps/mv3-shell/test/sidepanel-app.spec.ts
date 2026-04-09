import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sidepanel app entry", () => {
  it("keeps chat shell and shared control-plane consumer in the same app entry", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("Control Plane");
    expect(source).toContain("Chat Shell");
    expect(source).toContain("buildManagementBootstrapRequests");
    expect(source).toContain("createManagementActionMessage");
    expect(source).not.toContain('"runtime.bootstrap"');
    expect(source).not.toContain("runtime.bootstrap");
  });

  it("wires assistant rich rendering and readable tool trace helpers into the chat pane", () => {
    const source = readFileSync("apps/mv3-shell/src/sidepanel/App.vue", "utf8");

    expect(source).toContain("renderMessageRichText");
    expect(source).toContain("renderToolTrace");
    expect(source).toContain("renderedChatItems");
    expect(source).toContain('v-html="item.rendered.html"');
    expect(source).toContain("item.rendered.preview");
    expect(source).toContain("item.rendered.structured");
  });
});
