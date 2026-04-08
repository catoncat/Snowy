import { InMemorySessionStorage } from "@bbl-next/kernel";
import { describe, expect, it, vi } from "vitest";
// @ts-ignore JS source module has no declaration file yet
import { RUNNER_BACKGROUND_TARGET, createBackgroundRunnerBridge } from "../src/background.js";
// @ts-ignore JS source module has no declaration file yet
import { createBackgroundRuntimeServices } from "../src/runtime-services.js";

async function waitFor(predicate: () => boolean, timeoutMs = 250) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for async condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("mv3-shell runtime chat bridge", () => {
  it("streams assistant and tool events for a sent prompt", async () => {
    const sentMessages: unknown[] = [];
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
      },
    });

    const initial = await services.bootstrapChat();
    expect(initial.runState.status).toBe("idle");
    expect(initial.messages).toEqual([]);

    const accepted = await services.sendChatPrompt({ text: "Summarize the page" });
    expect(accepted).toMatchObject({ accepted: true });

    await waitFor(() =>
      sentMessages.some(
        (message) =>
          (message as { type?: string; event?: { type?: string } }).type ===
            "bbl-next.runtime.chat.event" &&
          (message as { event?: { type?: string } }).event?.type === "assistant.done",
      ),
    );

    const events = sentMessages
      .filter(
        (message): message is { type: string; event: { type: string } } =>
          (message as { type?: string }).type === "bbl-next.runtime.chat.event",
      )
      .map((message) => message.event.type);

    expect(events).toContain("run.state");
    expect(events).toContain("assistant.delta");
    expect(events).toContain("tool.result");
    expect(events).toContain("assistant.done");

    const finalState = await services.bootstrapChat();
    expect(finalState.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", text: "Summarize the page" }),
        expect.objectContaining({ role: "assistant" }),
        expect.objectContaining({ kind: "tool", toolName: "runtime.bootstrap" }),
      ]),
    );
    expect(finalState.runState.status).toBe("idle");
  });

  it("stops an active stream and emits stopped state", async () => {
    const sentMessages: unknown[] = [];
    const services = createBackgroundRuntimeServices({
      sessionStorage: new InMemorySessionStorage(),
      chromeApi: {
        runtime: {
          sendMessage: vi.fn(async (message) => {
            sentMessages.push(message);
            return undefined;
          }),
        },
      },
    });

    await services.sendChatPrompt({ text: "Stop me" });
    await waitFor(() =>
      sentMessages.some(
        (message) => (message as { event?: { type?: string } }).event?.type === "assistant.delta",
      ),
    );

    const stopped = await services.stopChatRun();
    expect(stopped.runState.status).toBe("stopped");

    await waitFor(() =>
      sentMessages.some(
        (message) =>
          (message as { event?: { type?: string; status?: string } }).event?.type === "run.state" &&
          (message as { event?: { status?: string } }).event?.status === "stopped",
      ),
    );
  });

  it("routes runtime.chat.* messages through runtime services", async () => {
    const runtimeServices = {
      bootstrapChat: vi.fn(async () => ({
        sessionId: "s-1",
        messages: [],
        runState: { status: "idle" },
      })),
      sendChatPrompt: vi.fn(async ({ text }) => ({
        sessionId: "s-1",
        accepted: true,
        echoedText: text,
      })),
      stopChatRun: vi.fn(async () => ({ sessionId: "s-1", runState: { status: "stopped" } })),
      getKernelRuntimeState: vi.fn(async () => ({
        session: { id: "s-1" },
        runState: { phase: "idle" },
      })),
    };

    const bridge = createBackgroundRunnerBridge({
      chromeApi: {
        runtime: { getURL: (path: string) => path },
        offscreen: {},
      },
      runtimeServices,
    });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.bootstrap" }),
    ).resolves.toMatchObject({ ok: true, data: { sessionId: "s-1" } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.send", text: "hello" }),
    ).resolves.toMatchObject({ ok: true, data: { accepted: true, echoedText: "hello" } });

    await expect(
      bridge.route({ target: RUNNER_BACKGROUND_TARGET, kind: "runtime.chat.stop" }),
    ).resolves.toMatchObject({ ok: true, data: { runState: { status: "stopped" } } });
  });
});
