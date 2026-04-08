import { LoopEngine, type StepRequest, type StepResult } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";

describe("LoopEngine", () => {
  let engine: LoopEngine;
  const sid = "s-loop-001";

  beforeEach(() => {
    engine = new LoopEngine({ maxSteps: 5 });
  });

  describe("turn creation", () => {
    it("creates a turn with unique ids and step index", () => {
      const step: StepRequest = { capabilityId: "page.click" };

      const t1 = engine.createTurn(sid, step);
      expect(t1.turnId).toMatch(/^t-/);
      expect(t1.stepIndex).toBe(0);
      expect(t1.status).toBe("pending");
      expect(t1.capabilityId).toBe("page.click");

      const t2 = engine.createTurn(sid, {});
      expect(t2.turnId).toMatch(/^t-/);
      expect(t2.turnId).not.toBe(t1.turnId);
      expect(t2.stepIndex).toBe(1);
    });

    it("derives a synthetic capability id for runner and site steps", () => {
      const runnerTurn = engine.createTurn(sid, {
        kind: "runner",
        module: {
          id: "runner.demo",
          source: "exports.default = async () => 'ok';",
        },
      });
      const siteTurn = engine.createTurn(sid, {
        kind: "site",
        skillId: "fixture.site",
        action: "echo",
        tab: {
          tabId: 1,
          url: "https://fixture.test/demo",
          active: true,
        },
      });

      expect(runnerTurn.capabilityId).toBe("runner.invoke");
      expect(siteTurn.capabilityId).toBe("site.invoke:fixture.site.echo");
    });
  });

  describe("turn execution", () => {
    it("executes a step through the injected executor and records the result", async () => {
      const executingEngine = new LoopEngine({
        executor: async ({ sessionId, turn, step }) => ({
          ok: true,
          data: {
            sessionId,
            turnId: turn.turnId,
            kind: step.kind ?? "capability",
          },
        }),
      });

      const executed = await executingEngine.executeTurn(sid, {
        kind: "runner",
        module: {
          id: "runner.demo",
          source: "exports.default = async () => 'ok';",
        },
      });

      expect(executed.turn.status).toBe("succeeded");
      expect(executed.result).toEqual({
        ok: true,
        data: {
          sessionId: sid,
          turnId: executed.turn.turnId,
          kind: "runner",
        },
      });
    });

    it("records a failed turn when the executor throws", async () => {
      const executingEngine = new LoopEngine({
        executor: async () => {
          throw new Error("runner unavailable");
        },
      });

      const executed = await executingEngine.executeTurn(sid, {
        kind: "site",
        skillId: "fixture.site",
        action: "echo",
        tab: {
          tabId: 1,
          url: "https://fixture.test/demo",
          active: true,
        },
      });

      expect(executed.turn.status).toBe("failed");
      expect(executed.turn.lastError).toBe("runner unavailable");
      expect(executed.result).toEqual({
        ok: false,
        error: "runner unavailable",
      });
    });
  });

  describe("turn result recording", () => {
    it("marks a succeeded turn", () => {
      const turn = engine.createTurn(sid, { capabilityId: "host.read" });
      const result: StepResult = { ok: true, data: { content: "file" } };

      const updated = engine.recordTurnResult(turn, result);
      expect(updated.status).toBe("succeeded");
      expect(updated.endedAt).toBeTruthy();
    });

    it("marks a failed turn", () => {
      const turn = engine.createTurn(sid, {});
      const result: StepResult = { ok: false, error: "timeout" };

      const updated = engine.recordTurnResult(turn, result);
      expect(updated.status).toBe("failed");
    });
  });

  describe("terminal condition checking", () => {
    it("returns failed_execute for a failed turn", () => {
      const turn = engine.createTurn(sid, {});
      const failed = engine.recordTurnResult(turn, { ok: false, error: "boom" });

      expect(engine.checkTerminal(sid, failed)).toBe("failed_execute");
    });

    it("returns null for retryable failed turn", () => {
      const turn = engine.createTurn(sid, {});
      const failed = engine.recordTurnResult(turn, { ok: false, error: "boom", retryable: true });

      expect(engine.checkTerminal(sid, failed)).toBeNull();
    });

    it("returns timeout for timeout failures", () => {
      const turn = engine.createTurn(sid, {});
      const failed = engine.recordTurnResult(turn, { ok: false, error: "request timeout" });

      expect(engine.checkTerminal(sid, failed)).toBe("timeout");
    });

    it("returns done for verified success", () => {
      const turn = engine.createTurn(sid, {});
      const succeeded = engine.recordTurnResult(turn, { ok: true, verified: true });

      expect(engine.checkTerminal(sid, succeeded)).toBe("done");
    });

    it("returns failed_verify for unverified success", () => {
      const turn = engine.createTurn(sid, {});
      const succeeded = engine.recordTurnResult(turn, { ok: true, verified: false });

      expect(engine.checkTerminal(sid, succeeded)).toBe("failed_verify");
    });

    it("returns stopped when caller marks run stopped", () => {
      const turn = engine.createTurn(sid, {});
      const succeeded = engine.recordTurnResult(turn, { ok: true });

      expect(engine.checkTerminal(sid, succeeded, { stopped: true })).toBe("stopped");
    });

    it("returns max_steps when step limit is reached", () => {
      for (let i = 0; i < 5; i++) {
        const turn = engine.createTurn(sid, { capabilityId: "host.exec" });
        engine.recordTurnResult(turn, { ok: true, data: `result-${i}` });
      }

      const lastTurn = engine.createTurn(sid, {});
      const succeeded = engine.recordTurnResult(lastTurn, { ok: true });

      // After 5 creates (0-4) + 1 more (5), stepCount = 6, but we check at 5 (maxSteps)
      // Actually stepCount increments on createTurn, so after 5 createTurns, count = 5
      expect(engine.getStepCount(sid)).toBe(6);
      expect(engine.checkTerminal(sid, succeeded)).toBe("max_steps");
    });

    it("returns null for a healthy succeeded turn", () => {
      const turn = engine.createTurn(sid, {});
      const succeeded = engine.recordTurnResult(turn, { ok: true });

      expect(engine.checkTerminal(sid, succeeded)).toBeNull();
    });

    it("returns progress_uncertain when no-progress budget is exhausted", () => {
      const engine2 = new LoopEngine({
        noProgressContinueBudget: { repeat_signature: 0 },
      });

      for (let i = 0; i < 3; i++) {
        const turn = engine2.createTurn(sid, { capabilityId: "page.click" });
        engine2.recordTurnResult(turn, { ok: true, data: "same" });
      }

      const turn = engine2.createTurn(sid, { capabilityId: "page.click" });
      const succeeded = engine2.recordTurnResult(turn, { ok: true, data: "same" });

      expect(engine2.checkTerminal(sid, succeeded)).toBe("progress_uncertain");
    });
  });

  describe("no-progress detection", () => {
    it("returns null when history is too short", () => {
      expect(engine.checkNoProgress(sid)).toBeNull();
    });

    it("detects repeat_signature after budget exhaustion with old-repo-aligned threshold", () => {
      // Default threshold = 2, budget = 1:
      // third identical result should terminate (2 repeats after the first turn)
      for (let i = 0; i < 2; i++) {
        const turn = engine.createTurn(sid, { capabilityId: "page.click" });
        engine.recordTurnResult(turn, { ok: true, data: "same" });
      }

      expect(engine.checkNoProgress(sid)).toBeNull();

      const turn = engine.createTurn(sid, { capabilityId: "page.click" });
      engine.recordTurnResult(turn, { ok: true, data: "same" });

      expect(engine.checkNoProgress(sid)).toBe("repeat_signature");
    });

    it("allows overriding repeat_signature threshold through LoopEngineOptions", () => {
      const engine2 = new LoopEngine({
        maxSteps: 50,
        noProgressRepeatSignatureThreshold: 3,
      });

      for (let i = 0; i < 3; i++) {
        const turn = engine2.createTurn(sid, { capabilityId: "page.click" });
        engine2.recordTurnResult(turn, { ok: true, data: "same" });
      }

      expect(engine2.checkNoProgress(sid)).toBeNull();

      const turn = engine2.createTurn(sid, { capabilityId: "page.click" });
      engine2.recordTurnResult(turn, { ok: true, data: "same" });

      expect(engine2.checkNoProgress(sid)).toBe("repeat_signature");
    });

    it("does not treat non-consecutive matches as repeat_signature", () => {
      const results = ["A", "B", "A"];
      for (const result of results) {
        const turn = engine.createTurn(sid, { capabilityId: "page.click" });
        engine.recordTurnResult(turn, { ok: true, data: result });
      }

      expect(engine.checkNoProgress(sid)).toBeNull();
    });

    it("detects ping_pong pattern with zero budget", () => {
      // Zero budget for ping_pong means immediate detection
      const engine2 = new LoopEngine({
        maxSteps: 50,
        noProgressContinueBudget: { ping_pong: 0 },
      });

      const actions = ["page.click", "page.fill", "page.click", "page.fill"];
      for (const cap of actions) {
        const turn = engine2.createTurn(sid, { capabilityId: cap });
        engine2.recordTurnResult(turn, { ok: true, data: cap === "page.click" ? "A" : "B" });
      }

      expect(engine2.checkNoProgress(sid)).toBe("ping_pong");
    });

    it("returns null for varied signatures", () => {
      for (let i = 0; i < 6; i++) {
        const turn = engine.createTurn(sid, { capabilityId: `cap.${i}` });
        engine.recordTurnResult(turn, { ok: true, data: `result-${i}` });
      }

      expect(engine.checkNoProgress(sid)).toBeNull();
    });
  });

  describe("session reset", () => {
    it("resets step count and signature history", () => {
      const turn = engine.createTurn(sid, {});
      engine.recordTurnResult(turn, { ok: true });
      expect(engine.getStepCount(sid)).toBe(1);

      engine.resetSession(sid);
      expect(engine.getStepCount(sid)).toBe(0);
    });
  });
});
