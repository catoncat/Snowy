import { describe, expect, it } from "vitest";
import { renderMessageRichText, renderToolTrace } from "../src/sidepanel/renderers";
import {
  applyBootstrapState,
  applyChatEvent,
  createInitialChatState,
  filterChatItemsForToolHistory,
  filterRunActivityItems,
  shouldAlwaysShowRunActivityItem,
  shouldAlwaysShowToolItem,
  toggleRunActivityExpanded,
  toggleSystemMessageExpanded,
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
    expect(state.items).toEqual([
      { id: "m-user", kind: "message", role: "user", text: "hello", state: "complete" },
    ]);
    expect(state.runActivity.items).toEqual([
      expect.objectContaining({
        id: "activity:tool:m-tool",
        kind: "tool",
        title: "runtime.bootstrap",
        status: "done",
        expanded: false,
      }),
    ]);
  });

  it("dedupes bootstrap run activity projected from persisted tool messages", () => {
    const state = applyBootstrapState(createInitialChatState(), {
      sessionId: "s-1",
      runState: { status: "idle" },
      messages: [
        {
          id: "tool-1",
          kind: "tool",
          toolName: "page.info",
          summary: "Collected DOM snapshot",
          detail: '{"ok":true}',
          expanded: false,
        },
      ],
      runActivity: {
        items: [
          {
            id: "activity:tool:tool-1",
            kind: "tool",
            title: "page.info",
            summary: "Persisted activity summary",
            detail: '{"source":"persisted"}',
            expanded: true,
            status: "done",
            severity: "info",
            visibility: "default",
            toolCallId: "tool-1",
            toolName: "page.info",
          },
        ],
      },
    });

    expect(state.runActivity.items).toHaveLength(1);
    expect(state.runActivity.items[0]).toMatchObject({
      id: "activity:tool:tool-1",
      summary: "Persisted activity summary",
      detail: '{"source":"persisted"}',
      expanded: true,
    });
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

  it("does not project blank non-done assistant completion as normal success", () => {
    const state = applyChatEvent(createInitialChatState(), {
      type: "assistant.done",
      sessionId: "s-1",
      messageId: "m-assistant",
      text: "",
      phase: "finalizing",
      terminalStatus: "max_steps",
      stepCount: 12,
    } as Parameters<typeof applyChatEvent>[1]);

    expect(state.items).toEqual([
      expect.objectContaining({
        id: "m-assistant",
        kind: "message",
        role: "assistant",
        text: "",
        state: "stopped",
      }),
    ]);
    expect(state.runActivity.current).toMatchObject({
      status: "stopped",
      phase: "stopped",
      label: "已停止",
      summary: "terminalStatus=max_steps; stepCount=12",
      severity: "warning",
    });
  });

  it("projects tool result cards into run activity collapsed by default", () => {
    const state = applyChatEvent(createInitialChatState(), {
      type: "tool.result",
      sessionId: "s-1",
      messageId: "tool-1",
      toolName: "runtime.bootstrap",
      summary: "Runtime is healthy",
      detail: '{"status":"healthy"}',
    });

    expect(state.items).toEqual([]);
    expect(state.runActivity.items).toEqual([
      expect.objectContaining({
        id: "activity:tool:tool-1",
        kind: "tool",
        toolName: "runtime.bootstrap",
        title: "runtime.bootstrap",
        summary: "Runtime is healthy",
        expanded: false,
        status: "done",
      }),
    ]);
  });

  it("tracks tool lifecycle in activity while transcript absorbs final assistant content", () => {
    let state = applyChatEvent(createInitialChatState(), {
      type: "tool.call",
      sessionId: "s-1",
      messageId: "tc-1",
      toolCallId: "tc-1",
      toolName: "tabs_navigate",
      detail: '{"url":"https://example.com"}',
    });

    expect(state.items).toEqual([]);
    expect(state.runActivity.current).toMatchObject({
      phase: "tool_running",
      status: "running",
    });
    expect(state.runActivity.items).toEqual([
      expect.objectContaining({
        id: "activity:tool:tc-1",
        kind: "tool",
        toolName: "tabs_navigate",
        summary: "执行中 · tabs_navigate",
        status: "running",
        expanded: false,
      }),
    ]);
    expect(filterRunActivityItems(state.runActivity.items, false)).toHaveLength(1);

    state = applyChatEvent(state, {
      type: "tool.result",
      sessionId: "s-1",
      messageId: "tc-1",
      toolCallId: "tc-1",
      toolName: "tabs_navigate",
      summary: "已打开标签页",
      detail: '{"ok":true}',
    });
    expect(state.runActivity.items[0]).toMatchObject({
      id: "activity:tool:tc-1",
      kind: "tool",
      status: "done",
      summary: "已打开标签页",
    });

    state = applyChatEvent(state, {
      type: "assistant.done",
      sessionId: "s-1",
      messageId: "assistant-1",
      text: "Navigation complete.",
      contentBlocks: [
        {
          type: "toolCall",
          id: "tc-1",
          name: "tabs_navigate",
          arguments: '{"url":"https://example.com"}',
        },
        { type: "text", text: "Navigation complete." },
      ],
      toolResults: { "tc-1": '{"ok":true}' },
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: "assistant-1",
      kind: "message",
      role: "assistant",
    });
    expect(state.runActivity.items).toHaveLength(1);
  });

  it("toggles old-product system summary expansion state", () => {
    const state = applyBootstrapState(createInitialChatState(), {
      sessionId: "s-1",
      runState: { status: "idle" },
      messages: [
        {
          id: "summary:cmp-1",
          kind: "message",
          role: "system",
          text: "Earlier turns compacted",
          state: "complete",
          systemKind: "compactionSummary",
          expanded: false,
        },
      ],
    });

    const expanded = toggleSystemMessageExpanded(state, "summary:cmp-1");
    expect(expanded.items[0]).toMatchObject({
      id: "summary:cmp-1",
      role: "system",
      expanded: true,
    });
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

  it("formats activity trace details into readable sections and toggles expansion", () => {
    let state = applyChatEvent(createInitialChatState(), {
      type: "tool.result",
      sessionId: "s-1",
      messageId: "tool-2",
      toolName: "page.info",
      summary: "Collected DOM snapshot",
      detail: JSON.stringify({
        status: "ok",
        durationMs: 42,
        input: { selector: "main article" },
        output: { nodes: 3, title: "Overview" },
      }),
    });

    state = toggleRunActivityExpanded(state, "activity:tool:tool-2");
    const toolItem = state.runActivity.items.find((item) => item.id === "activity:tool:tool-2");
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
        toolName: "page.info",
        summary: "Collected DOM snapshot",
        detail: '{"status":"ok","output":{"count":2}}',
        expanded: false,
      },
      {
        id: "tool-error",
        kind: "tool",
        toolName: "page.click_xy",
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

  it("filters routine run activity while keeping running, failed, and intervention visible", () => {
    const items = [
      {
        id: "activity:tool:ok",
        kind: "tool",
        title: "page.info",
        summary: "Collected DOM snapshot",
        detail: '{"ok":true}',
        expanded: false,
        status: "done",
        severity: "info",
        visibility: "default",
      },
      {
        id: "activity:tool:running",
        kind: "tool",
        title: "page.click_xy",
        summary: "Clicking submit",
        detail: '{"selector":"button"}',
        expanded: false,
        status: "running",
        severity: "info",
        visibility: "always",
      },
      {
        id: "activity:error:blocked",
        kind: "intervention",
        title: "需要人工确认",
        summary: "Permission required",
        detail: "",
        expanded: true,
        status: "intervention",
        severity: "warning",
        visibility: "always",
      },
    ] as const;

    expect(shouldAlwaysShowRunActivityItem(items[0])).toBe(false);
    expect(shouldAlwaysShowRunActivityItem(items[1])).toBe(true);
    expect(shouldAlwaysShowRunActivityItem(items[2])).toBe(true);
    expect(filterRunActivityItems(items, false).map((item) => item.id)).toEqual([
      "activity:tool:running",
      "activity:error:blocked",
    ]);
  });
});
