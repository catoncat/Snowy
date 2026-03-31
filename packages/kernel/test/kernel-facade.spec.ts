import type { CapabilityDescriptor, KernelLlmAdapter } from "@bbl-next/contracts";
import {
  type CapabilityProviderRequest,
  CapabilityRegistry,
  FamilyProviderRegistry,
} from "@bbl-next/core";
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

    it("dispatches runner steps through an explicit kernel-owned runner executor", async () => {
      const wiredKernel = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        executeRunnerStep: async ({ step, turn }) => ({
          ok: true,
          data: {
            turnId: turn.turnId,
            moduleId: step.module.id,
            echoed: step.input,
          },
        }),
      });
      const s = await wiredKernel.createSession();

      const executed = await wiredKernel.executeStep(s.id, {
        kind: "runner",
        capabilityId: "runtime.runner.echo",
        module: {
          id: "fixture.runner",
          source: "exports.default = async () => ({ ok: true });",
        },
        input: { value: "hello" },
      });

      expect(executed.result).toEqual({
        ok: true,
        data: {
          turnId: executed.turn.turnId,
          moduleId: "fixture.runner",
          echoed: { value: "hello" },
        },
      });
      expect(executed.turn.status).toBe("succeeded");
      expect(executed.turn.capabilityId).toBe("runtime.runner.echo");
      expect(wiredKernel.getStepCount(s.id)).toBe(1);
    });

    it("dispatches site steps through an explicit kernel-owned site executor", async () => {
      const wiredKernel = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        executeSiteStep: async ({ step }) => ({
          ok: true,
          verified: true,
          data: {
            skillId: step.skillId,
            action: step.action,
            tabId: step.tab.tabId,
          },
        }),
      });
      const s = await wiredKernel.createSession();

      const executed = await wiredKernel.executeStep(s.id, {
        kind: "site",
        capabilityId: "site.runtime.invoke",
        skillId: "fixture.site",
        action: "run_fixture",
        tab: {
          tabId: 7,
          url: "https://fixture.test/demo",
          active: true,
        },
      });

      expect(executed.result).toEqual({
        ok: true,
        verified: true,
        data: {
          skillId: "fixture.site",
          action: "run_fixture",
          tabId: 7,
        },
      });
      expect(executed.turn.status).toBe("succeeded");
      expect(executed.turn.verified).toBe(true);
      expect(executed.turn.capabilityId).toBe("site.runtime.invoke");
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

  describe("interventions", () => {
    it("tracks intervention request, resolve, cancel, and audit state", async () => {
      const s = await kernel.createSession();

      const requested = kernel.requestIntervention(s.id, {
        id: "ivr:test:resolve",
        kind: "takeover",
        trigger: "verify_failed",
        status: "requested",
        title: "Manual verify required",
        message: "Complete the step manually",
        skillId: "fixture.site",
        action: "login",
        tabId: 9,
      });

      expect(requested.status).toBe("requested");
      expect(requested.sessionId).toBe(s.id);
      expect(kernel.getInterventionSummary({ sessionId: s.id })).toMatchObject({
        status: "requested",
        totalCount: 1,
        activeCount: 1,
      });

      const resolved = kernel.resolveIntervention("ivr:test:resolve", {
        resolution: "resume",
      });
      expect(resolved.status).toBe("resolved");

      kernel.requestIntervention(s.id, {
        id: "ivr:test:cancel",
        kind: "input",
        trigger: "runtime_blocked",
        status: "requested",
        title: "Need code",
        message: "Input a verification code",
      });
      const cancelled = kernel.cancelIntervention("ivr:test:cancel", {
        reason: "user_declined",
      });
      expect(cancelled.status).toBe("cancelled");

      expect(kernel.listInterventions({ sessionId: s.id })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "ivr:test:resolve",
            status: "resolved",
          }),
          expect.objectContaining({
            id: "ivr:test:cancel",
            status: "cancelled",
          }),
        ]),
      );

      expect(kernel.readInterventionAudit({ sessionId: s.id })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            interventionId: "ivr:test:resolve",
            status: "requested",
          }),
          expect.objectContaining({
            interventionId: "ivr:test:resolve",
            status: "resolved",
          }),
          expect.objectContaining({
            interventionId: "ivr:test:cancel",
            status: "requested",
          }),
          expect.objectContaining({
            interventionId: "ivr:test:cancel",
            status: "cancelled",
          }),
        ]),
      );
    });

    it("marks pending interventions as timed_out on read", async () => {
      const s = await kernel.createSession();

      kernel.requestIntervention(
        s.id,
        {
          id: "ivr:test:timeout",
          kind: "input",
          trigger: "runtime_blocked",
          status: "requested",
          title: "Need input",
          message: "Timed request",
        },
        {
          now: 10,
          timeoutMs: 5,
        },
      );

      expect(
        kernel.listInterventions({
          sessionId: s.id,
          now: 20,
        }),
      ).toEqual([
        expect.objectContaining({
          id: "ivr:test:timeout",
          status: "timed_out",
        }),
      ]);
      expect(kernel.getInterventionSummary({ sessionId: s.id, now: 20 })).toMatchObject({
        status: "settled",
        activeCount: 0,
      });
      expect(kernel.readInterventionAudit({ sessionId: s.id, now: 20 })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            interventionId: "ivr:test:timeout",
            status: "timed_out",
          }),
        ]),
      );
    });

    it("rehydrates persisted interventions and audit into a new kernel instance", async () => {
      const storage = new InMemorySessionStorage();
      const firstKernel = createKernel({
        storage,
        llm: createMockLlm(),
      });
      const session = await firstKernel.createSession({ title: "persisted" });

      firstKernel.requestIntervention(session.id, {
        id: "ivr:test:rehydrate",
        kind: "takeover",
        trigger: "verify_failed",
        status: "requested",
        title: "Manual verify required",
        message: "Finish the step manually",
        tabId: 9,
      });
      await firstKernel.persistInterventions(session.id);

      const secondKernel = createKernel({
        storage,
        llm: createMockLlm(),
      });
      await secondKernel.rehydrateInterventions(session.id);

      expect(secondKernel.getInterventionSummary({ sessionId: session.id })).toMatchObject({
        status: "requested",
        totalCount: 1,
        activeCount: 1,
      });
      expect(secondKernel.listInterventions({ sessionId: session.id })).toEqual([
        expect.objectContaining({
          id: "ivr:test:rehydrate",
          status: "requested",
        }),
      ]);
      expect(secondKernel.readInterventionAudit({ sessionId: session.id })).toEqual([
        expect.objectContaining({
          interventionId: "ivr:test:rehydrate",
          status: "requested",
        }),
      ]);

      const resolved = secondKernel.resolveIntervention("ivr:test:rehydrate", {
        resolution: "resume",
      });
      expect(resolved.status).toBe("resolved");
      await secondKernel.persistInterventions(session.id);

      const thirdKernel = createKernel({
        storage,
        llm: createMockLlm(),
      });
      await thirdKernel.rehydrateInterventions(session.id);

      expect(thirdKernel.listInterventions({ sessionId: session.id })).toEqual([
        expect.objectContaining({
          id: "ivr:test:rehydrate",
          status: "resolved",
        }),
      ]);
      expect(thirdKernel.readInterventionAudit({ sessionId: session.id })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            interventionId: "ivr:test:rehydrate",
            status: "requested",
          }),
          expect.objectContaining({
            interventionId: "ivr:test:rehydrate",
            status: "resolved",
          }),
        ]),
      );
    });
  });

  describe("subsystem access", () => {
    it("exposes all five subsystems", () => {
      expect(kernel.sessions).toBeDefined();
      expect(kernel.runs).toBeDefined();
      expect(kernel.loop).toBeDefined();
      expect(kernel.compaction).toBeDefined();
      expect(kernel.interventions).toBeDefined();
    });
  });
});
