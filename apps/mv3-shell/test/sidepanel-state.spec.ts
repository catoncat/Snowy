import { describe, expect, it } from "vitest";
import {
  applyBootstrapState,
  applyChatEvent,
  createInitialChatState,
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
});
