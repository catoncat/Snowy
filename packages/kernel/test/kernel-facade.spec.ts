import type {
  CapabilityDescriptor,
  KernelLlmAdapter,
  LlmProfileConfig,
  ResolveLlmRouteResult,
} from "@bbl-next/contracts";
import {
  type CapabilityProviderRequest,
  CapabilityRegistry,
  FamilyProviderRegistry,
} from "@bbl-next/core";
import { InMemorySessionStorage, LlmProviderRegistry, createKernel } from "@bbl-next/kernel";
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

const TEST_PROFILE_CONFIG: LlmProfileConfig = {
  defaultProfile: "default",
  fallbackProfile: "fallback",
  profiles: [
    {
      id: "default",
      providerId: "openai_compatible",
      llmBase: "https://llm.example.com",
      llmKey: "test-key",
      llmModel: "gpt-4.1-mini",
    },
    {
      id: "fallback",
      providerId: "openai_compatible",
      llmBase: "https://llm.example.com",
      llmKey: "test-key",
      llmModel: "gpt-4.1",
    },
  ],
};

function callKernelMethod<Args extends unknown[], Result>(
  target: object,
  method: string,
  ...args: Args
): Result {
  const fn = Reflect.get(target, method);
  if (typeof fn !== "function") {
    throw new Error(`Kernel method not available: ${method}`);
  }
  return Reflect.apply(fn, target, args) as Result;
}

function createKernelWithFacadeOptions(
  options: Parameters<typeof createKernel>[0] & {
    providerRegistry?: LlmProviderRegistry;
    profileConfig?: LlmProfileConfig;
  },
): Kernel {
  return createKernel(options as Parameters<typeof createKernel>[0]);
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

  describe("loop introspection", () => {
    it("getMaxSteps returns the configured maximum", () => {
      expect(kernel.getMaxSteps()).toBe(50);
    });

    it("getMaxSteps returns custom value when configured", () => {
      const custom = createKernel({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        loop: { maxSteps: 10 },
      });
      expect(custom.getMaxSteps()).toBe(10);
    });

    it("checkTerminal returns null for a successful non-terminal turn", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      const turn = kernel.createTurn(session.id, { capabilityId: "test.op" });
      const updated = kernel.recordTurnResult(turn, { ok: true, data: {} });
      expect(kernel.checkTerminal(session.id, updated)).toBeNull();
    });

    it("checkTerminal returns failed_execute for a non-retryable failure", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      const turn = kernel.createTurn(session.id, { capabilityId: "test.op" });
      const updated = kernel.recordTurnResult(turn, { ok: false, error: "boom" });
      expect(kernel.checkTerminal(session.id, updated)).toBe("failed_execute");
    });

    it("checkTerminal returns stopped when opts.stopped is true", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      const turn = kernel.createTurn(session.id, { capabilityId: "test.op" });
      expect(kernel.checkTerminal(session.id, turn, { stopped: true })).toBe("stopped");
    });

    it("checkNoProgress returns null initially", async () => {
      const session = await kernel.createSession();
      expect(kernel.checkNoProgress(session.id)).toBeNull();
    });

    it("resetLoopState clears step count and progress tracking", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      const turn = kernel.createTurn(session.id, { capabilityId: "test.op" });
      kernel.recordTurnResult(turn, { ok: true, data: {} });
      expect(kernel.getStepCount(session.id)).toBe(1);

      kernel.resetLoopState(session.id);
      expect(kernel.getStepCount(session.id)).toBe(0);
    });
  });

  describe("runtime summary facade", () => {
    it("returns idle runtime summary for a fresh session", async () => {
      const session = await kernel.createSession();

      const summary = callKernelMethod<[string], any>(kernel, "getRuntimeSummary", session.id);

      expect(summary).toMatchObject({
        sessionId: session.id,
        run: {
          phase: "idle",
          queuedPrompts: {
            steer: 0,
            followUp: 0,
          },
          retry: {
            active: false,
            attempt: 0,
            maxAttempts: 2,
          },
        },
        loop: {
          stepCount: 0,
          noProgress: null,
        },
        interventions: {
          status: "empty",
          totalCount: 0,
          activeCount: 0,
          recentCount: 0,
          active: [],
        },
      });
    });

    it("returns queued prompt counts from the run facade state", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      kernel.enqueue(session.id, "steer", "do this first");
      kernel.enqueue(session.id, "followUp", "then do this");

      const summary = callKernelMethod<[string], any>(kernel, "getRuntimeSummary", session.id);

      expect(summary.run).toMatchObject({
        phase: "running",
        queuedPrompts: {
          steer: 1,
          followUp: 1,
        },
      });
    });

    it("returns running loop progress in runtime summary", async () => {
      const session = await kernel.createSession();
      kernel.startRun(session.id);
      const turn = kernel.createTurn(session.id, { capabilityId: "test.op" });
      kernel.recordTurnResult(turn, { ok: true, data: { ok: true } });

      const summary = callKernelMethod<[string], any>(kernel, "getRuntimeSummary", session.id);

      expect(summary).toMatchObject({
        sessionId: session.id,
        run: {
          phase: "running",
        },
        loop: {
          stepCount: 1,
          noProgress: null,
        },
      });
    });

    it("returns intervention summary through the facade runtime summary", async () => {
      const session = await kernel.createSession();
      kernel.requestIntervention(session.id, {
        id: "ivr-runtime-summary",
        kind: "confirm",
        trigger: "verify_failed",
        title: "Need confirmation",
        message: "Confirm the next action.",
      });

      const summary = callKernelMethod<[string], any>(kernel, "getRuntimeSummary", session.id);

      expect(summary.interventions).toMatchObject({
        status: "requested",
        totalCount: 1,
        activeCount: 1,
        recentCount: 1,
        active: [
          expect.objectContaining({
            id: "ivr-runtime-summary",
            status: "requested",
          }),
        ],
      });
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

  describe("provider/profile management", () => {
    it("returns null profile/provider management when kernel was created without them", () => {
      expect(
        callKernelMethod<[], ResolveLlmRouteResult | null>(kernel, "getActiveProfile"),
      ).toBeNull();
      expect(
        callKernelMethod<[], LlmProviderRegistry | null>(kernel, "getProviderRegistry"),
      ).toBeNull();
    });

    it("exposes the managed provider registry for external orchestrators", () => {
      const providerRegistry = new LlmProviderRegistry();
      const wiredKernel = createKernelWithFacadeOptions({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        providerRegistry,
        profileConfig: TEST_PROFILE_CONFIG,
      });

      expect(
        callKernelMethod<[], LlmProviderRegistry | null>(wiredKernel, "getProviderRegistry"),
      ).toBe(providerRegistry);
    });

    it("resolves the active profile and updates it when profile config changes", () => {
      const wiredKernel = createKernelWithFacadeOptions({
        storage: new InMemorySessionStorage(),
        llm: createMockLlm(),
        profileConfig: TEST_PROFILE_CONFIG,
      });

      const initial = callKernelMethod<[], ResolveLlmRouteResult | null>(
        wiredKernel,
        "getActiveProfile",
      );

      expect(initial).not.toBeNull();
      expect(initial?.ok).toBe(true);
      if (!initial || !initial.ok) {
        throw new Error("expected initial active profile route");
      }
      expect(initial.route.profile).toBe("default");
      expect(initial.route.llmModel).toBe("gpt-4.1-mini");

      callKernelMethod<[LlmProfileConfig], void>(wiredKernel, "setProfileConfig", {
        ...TEST_PROFILE_CONFIG,
        defaultProfile: "fallback",
      });

      const updated = callKernelMethod<[], ResolveLlmRouteResult | null>(
        wiredKernel,
        "getActiveProfile",
      );

      expect(updated).not.toBeNull();
      expect(updated?.ok).toBe(true);
      if (!updated || !updated.ok) {
        throw new Error("expected updated active profile route");
      }
      expect(updated.route.profile).toBe("fallback");
      expect(updated.route.llmModel).toBe("gpt-4.1");
      expect(updated.route.orderedProfiles).toEqual(["fallback"]);
    });
  });
});
