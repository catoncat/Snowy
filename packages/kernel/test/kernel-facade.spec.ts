import type { CapabilityDescriptor, KernelLlmAdapter } from "@bbl-next/contracts";
import {
  type CapabilityProviderRequest,
  CapabilityRegistry,
  FamilyProviderRegistry,
} from "@bbl-next/core";
import { JsRunnerHost } from "../../js-runner/src/index.js";
import { SiteSkillRegistry, SiteSkillRuntime } from "../../site-runtime/src/index.js";
import { InMemorySessionStorage, createKernel } from "@bbl-next/kernel";
import type { Kernel } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";

function createMockLlm(response = "Compacted summary."): KernelLlmAdapter {
  return { complete: async () => response };
}

function createDescriptor(id: string): CapabilityDescriptor {
  const [, operation = "invoke"] = id.split(".");
  return {
    id,
    version: 1,
    description: `Test descriptor for ${id}`,
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "low",
    sideEffects: "reads",
    permissions: [id],
    supportsVerify: false,
    supportsStreaming: false,
    exportable: false,
    executionBinding: {
      family: "test",
      operation,
    },
  };
}

describe("KernelFacade (createKernel)", () => {
  let kernel: Kernel;

  beforeEach(() => {
    kernel = createKernel({
      storage: new InMemorySessionStorage(),
      llm: createMockLlm(),
    });
  });

  describe("session lifecycle", () => {
    it("creates and lists sessions", async () => {
      const s = await kernel.createSession({ title: "test" });
      expect(s.id).toBeDefined();
      expect(s.title).toBe("test");

      const list = await kernel.listSessions();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(s.id);
    });

    it("deletes a session", async () => {
      const s = await kernel.createSession();
      await kernel.deleteSession(s.id);
      const list = await kernel.listSessions();
      expect(list).toHaveLength(0);
    });

    it("appends messages and builds context", async () => {
      const s = await kernel.createSession();
      await kernel.appendMessage(s.id, { role: "user", text: "Hello" });
      await kernel.appendMessage(s.id, { role: "assistant", text: "Hi there" });

      const ctx = await kernel.buildContext(s.id);
      expect(ctx.messages).toHaveLength(2);
      expect(ctx.messages[0].role).toBe("user");
      expect(ctx.messages[1].role).toBe("assistant");
    });
  });

  describe("run lifecycle", () => {
    it("transitions through run phases", async () => {
      const s = await kernel.createSession();
      const r1 = kernel.startRun(s.id);
      expect(r1.phase).toBe("running");

      const r2 = kernel.pause(s.id);
      expect(r2.phase).toBe("paused");

      const r3 = kernel.resume(s.id);
      expect(r3.phase).toBe("running");

      const r4 = kernel.stop(s.id);
      expect(r4.phase).toBe("stopped");
    });

    it("returns current run state", async () => {
      const s = await kernel.createSession();
      kernel.startRun(s.id);
      const state = kernel.getRunState(s.id);
      expect(state.phase).toBe("running");
    });
  });

  describe("queue", () => {
    it("enqueues and dequeues prompts", async () => {
      const s = await kernel.createSession();
      kernel.startRun(s.id);

      kernel.enqueue(s.id, "steer", "Do this instead");
      const dequeued = kernel.dequeue(s.id, "steer");
      expect(dequeued).toHaveLength(1);
      expect(dequeued[0].text).toBe("Do this instead");
    });
  });

  describe("loop turns", () => {
    it("creates turns and records results", async () => {
      const s = await kernel.createSession();
      const turn = kernel.createTurn(s.id, { capabilityId: "test.action" });
      expect(turn.status).toBe("pending");

      const updated = kernel.recordTurnResult(turn, {
        ok: true,
        data: { result: "abc" },
      });
      expect(updated.status).toBe("succeeded");
      expect(kernel.getStepCount(s.id)).toBe(1);
    });

    it("dispatches a registered capability through injected registry/provider wiring", async () => {
      const registry = new CapabilityRegistry([createDescriptor("runtime.echo")]);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "test",
        invoke: async ({ descriptor, input }: CapabilityProviderRequest) => ({
          capabilityId: descriptor.id,
          echoed: input,
        }),
      });

      const wiredKernel = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        registry,
        providers,
      });
      const s = await wiredKernel.createSession();

      const executed = await wiredKernel.executeStep(s.id, {
        capabilityId: "runtime.echo",
        input: { value: "hello" },
      });

      expect(executed.result).toEqual({
        ok: true,
        data: {
          capabilityId: "runtime.echo",
          echoed: { value: "hello" },
        },
      });
      expect(executed.turn.status).toBe("succeeded");
      expect(executed.turn.capabilityId).toBe("runtime.echo");
      expect(wiredKernel.getStepCount(s.id)).toBe(1);
    });

    it("records a failed turn when kernel is not wired with registry/providers", async () => {
      const s = await kernel.createSession();

      const executed = await kernel.executeStep(s.id, {
        capabilityId: "runtime.echo",
        input: { value: "hello" },
      });

      expect(executed.result).toEqual({
        ok: false,
        error: "Kernel is not wired with capability registry/providers",
      });
      expect(executed.turn.status).toBe("failed");
      expect(executed.turn.lastError).toBe(
        "Kernel is not wired with capability registry/providers",
      );
    });

    it("runs a real js-runner invocation through kernel loop orchestration", async () => {
      const wiredKernel = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        runnerHost: new JsRunnerHost(),
      });
      const s = await wiredKernel.createSession({ title: "runner session" });

      const executed = await wiredKernel.executeStep(s.id, {
        kind: "runner",
        module: {
          id: "runner.greeter",
          source: 'exports.default = async ({ ctx, input }) => `${ctx.prefix}:${input.name}`;',
        },
        ctx: { prefix: "hello" },
        input: { name: "kernel" },
      });

      expect(executed.turn.status).toBe("succeeded");
      expect(executed.turn.capabilityId).toBe("runner.invoke");
      expect(executed.result).toEqual({
        ok: true,
        data: "hello:kernel",
      });
    });

    it("runs a real site-runtime invocation through kernel loop orchestration", async () => {
      const siteRuntime = new SiteSkillRuntime({
        registry: new SiteSkillRegistry([
          {
            skillId: "fixture.site",
            matches: ["https://fixture.test/*"],
            actions: [
              {
                name: "echo",
                module: {
                  id: "fixture.site.echo",
                  source:
                    'exports.default = async ({ ctx, input }) => ({ query: input.query, tabUrl: ctx.tab.url });',
                },
              },
            ],
          },
        ]),
        runnerHost: new JsRunnerHost(),
      });

      const wiredKernel = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        siteRuntime,
      });
      const s = await wiredKernel.createSession({ title: "site session" });

      const executed = await wiredKernel.executeStep(s.id, {
        kind: "site",
        skillId: "fixture.site",
        action: "echo",
        tab: {
          tabId: 7,
          url: "https://fixture.test/demo",
          active: true,
          title: "Fixture",
        },
        input: { query: "loop" },
      });

      expect(executed.turn.status).toBe("succeeded");
      expect(executed.turn.capabilityId).toBe("site.invoke:fixture.site.echo");
      expect(executed.result).toEqual({
        ok: true,
        data: {
          result: {
            query: "loop",
            tabUrl: "https://fixture.test/demo",
          },
          verified: true,
          trace: ["match:fixture.site", "invoke:echo"],
        },
        verified: true,
      });
    });
  });

  describe("compaction", () => {
    it("reports whether compaction is needed", async () => {
      const s = await kernel.createSession();
      // Low token count → no compaction
      expect(await kernel.shouldCompact(s.id, 1000, 100)).toBe(false);
      // High token count → compaction needed
      expect(await kernel.shouldCompact(s.id, 1000, 900)).toBe(true);
    });

    it("runs triggerCompaction end-to-end", async () => {
      const compactingKernel = createKernel({
        storage: new InMemorySessionStorage(),
        compaction: { keepRecentTokens: 1 },
        llm: createMockLlm(),
      });
      const s = await compactingKernel.createSession();
      compactingKernel.startRun(s.id);

      // Add messages
      for (let i = 0; i < 3; i++) {
        await compactingKernel.appendMessage(s.id, {
          role: i % 2 === 0 ? "user" : "assistant",
          text: `Message ${i}: ${"x".repeat(200)}`,
        });
      }

      const draft = await compactingKernel.triggerCompaction(s.id, "threshold");
      expect(draft.summary).toBe("Compacted summary.");
      expect(draft.reason).toBe("threshold");

      // Run state should return to running after successful compaction
      const state = compactingKernel.getRunState(s.id);
      expect(state.phase).toBe("running");

      // Context should include compaction summary
      const ctx = await compactingKernel.buildContext(s.id);
      const summaryMsg = ctx.messages.find((m) => m.role === "compactionSummary");
      expect(summaryMsg).toBeDefined();
      expect(summaryMsg!.content).toBe("Compacted summary.");
    });

    it("returns run phase to idle when compaction execution fails", async () => {
      const failingKernel = createKernel({
        storage: new InMemorySessionStorage(),
        compaction: { keepRecentTokens: 1 },
        llm: {
          complete: async () => {
            throw new Error("LLM unavailable");
          },
        },
      });

      const s = await failingKernel.createSession();
      failingKernel.startRun(s.id);
      await failingKernel.appendMessage(s.id, {
        role: "user",
        text: `Needs compaction ${"x".repeat(120)}`,
      });

      await expect(failingKernel.triggerCompaction(s.id, "threshold")).rejects.toThrow(
        "LLM unavailable",
      );
      expect(failingKernel.getRunState(s.id).phase).toBe("idle");
    });
  });

  describe("subsystem access", () => {
    it("exposes all four subsystems", () => {
      expect(kernel.sessions).toBeDefined();
      expect(kernel.runs).toBeDefined();
      expect(kernel.loop).toBeDefined();
      expect(kernel.compaction).toBeDefined();
    });
  });
});
