import { describe, expect, it } from "vitest";
import { renderMessageRichText, renderToolTrace } from "../src/sidepanel/renderers";
import {
  applyBootstrapState,
  applyChatEvent,
  createInitialChatState,
  filterChatItemsForToolHistory,
  shouldAlwaysShowToolItem,
  toggleToolExpanded,
} from "../src/sidepanel/state";

describe("sidepanel chat state", () => {
  it("hydrates bootstrap transcript and run status", () => {
    const state = applyBootstrapState(createInitialChatState(), {
      sessionId: "s-1",
      runState: { status: "idle" },
      messages: [
        { id: "m-user", kind: "message", role: "user", text: "hello", state: "complete" },
        {
          id: "m-tool",
          kind: "tool",
          toolName: "runtime.bootstrap",
          summary: "ok",
          detail: "{}",
          expanded: false,
        },
      ],
    });

    expect(state.sessionId).toBe("s-1");
    expect(state.status).toBe("idle");
    expect(state.items).toHaveLength(2);
  });

  it("appends assistant deltas into one streaming message and completes it", () => {
    let state = createInitialChatState();
    state = applyChatEvent(state, {
      type: "assistant.delta",
      sessionId: "s-1",
      messageId: "m-assistant",
      chunk: "Hello",
    });
    state = applyChatEvent(state, {
      type: "assistant.delta",
      sessionId: "s-1",
      messageId: "m-assistant",
      chunk: " world",
    });
    state = applyChatEvent(state, {
      type: "assistant.done",
      sessionId: "s-1",
      messageId: "m-assistant",
      text: "Hello world",
    });

    expect(state.items).toEqual([
      expect.objectContaining({
        id: "m-assistant",
        kind: "message",
        role: "assistant",
        text: "Hello world",
        state: "complete",
      }),
    ]);
  });

  it("adds tool result cards collapsed by default", () => {
    const state = applyChatEvent(createInitialChatState(), {
      type: "tool.result",
      sessionId: "s-1",
      messageId: "tool-1",
      toolName: "runtime.bootstrap",
      summary: "Runtime is healthy",
      detail: '{"status":"healthy"}',
    });

    expect(state.items).toEqual([
      expect.objectContaining({
        id: "tool-1",
        kind: "tool",
        toolName: "runtime.bootstrap",
        summary: "Runtime is healthy",
        expanded: false,
      }),
    ]);
  });

  it("renders assistant markdown into rich text html", () => {
    const rendered = renderMessageRichText(
      [
        "Agent summary",
        "",
        "- first step",
        "- second step",
        "",
        "Use `ctx.call()` and read [docs](https://example.com/docs).",
        "",
        "```ts",
        "const answer = 42;",
        "```",
      ].join("\n"),
    );

    expect(rendered.mode).toBe("rich");
    expect(rendered.html).toContain("<ul>");
    expect(rendered.html).toContain("<code>");
    expect(rendered.html).toContain("<pre");
    expect(rendered.html).toContain('href="https://example.com/docs"');
  });

  it("falls back to plain text html when markdown syntax is absent", () => {
    const rendered = renderMessageRichText("Just a plain runtime update.");

    expect(rendered.mode).toBe("plain");
    expect(rendered.html).toContain("Just a plain runtime update.");
    expect(rendered.html).not.toContain("<ul>");
    expect(rendered.html).not.toContain("<pre");
  });

  it("formats tool trace details into readable sections and toggles expansion", () => {
    let state = applyChatEvent(createInitialChatState(), {
      type: "tool.result",
      sessionId: "s-1",
      messageId: "tool-2",
      toolName: "page.query",
      summary: "Collected DOM snapshot",
      detail: JSON.stringify({
        status: "ok",
        durationMs: 42,
        input: { selector: "main article" },
        output: { nodes: 3, title: "Overview" },
      }),
    });

    state = toggleToolExpanded(state, "tool-2");
    const toolItem = state.items.find((item) => item.kind === "tool" && item.id === "tool-2");
    const trace = renderToolTrace(
      "Collected DOM snapshot",
      toolItem?.kind === "tool" ? toolItem.detail : "",
    );

    expect(toolItem).toMatchObject({ expanded: true });
    expect(trace.structured).toBe(true);
    expect(trace.preview).toEqual(expect.arrayContaining(["status ok", "42 ms"]));
    expect(trace.html).toContain("Input");
    expect(trace.html).toContain("Output");
    expect(trace.html).toContain("main article");
  });

  it("filters normal tool traces while keeping error traces visible", () => {
    const items = [
      { id: "user-1", kind: "message", role: "user", text: "run it", state: "complete" },
      {
        id: "tool-ok",
        kind: "tool",
        toolName: "page.query",
        summary: "Collected DOM snapshot",
        detail: '{"status":"ok","output":{"count":2}}',
        expanded: false,
      },
      {
        id: "tool-error",
        kind: "tool",
        toolName: "page.click",
        summary: "Click failed",
        detail: '{"ok":false,"error":"element not found"}',
        expanded: false,
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "I could not click it.",
        state: "complete",
      },
    ] as const;

    expect(shouldAlwaysShowToolItem(items[1])).toBe(false);
    expect(shouldAlwaysShowToolItem(items[2])).toBe(true);
    expect(filterChatItemsForToolHistory(items, true).map((item) => item.id)).toEqual([
      "user-1",
      "tool-ok",
      "tool-error",
      "assistant-1",
    ]);
    expect(filterChatItemsForToolHistory(items, false).map((item) => item.id)).toEqual([
      "user-1",
      "tool-error",
      "assistant-1",
    ]);
  });
});
