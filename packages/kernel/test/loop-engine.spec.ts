import { describe, expect, it, beforeEach } from "vitest";
import { LoopEngine, type StepRequest, type StepResult } from "@bbl-next/kernel";

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
        noProgressContinueBudget: { repeat_signature: 0 }
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

    it("detects repeat_signature after budget exhaustion", () => {
      // Default budget for repeat_signature = 1, so first detection is forgiven
      for (let i = 0; i < 4; i++) {
        const turn = engine.createTurn(sid, { capabilityId: "page.click" });
        engine.recordTurnResult(turn, { ok: true, data: "same" });
      }

      // First check: budget allows 1 continuation
      expect(engine.checkNoProgress(sid)).toBeNull();

      // Add more repeated signatures
      const turn = engine.createTurn(sid, { capabilityId: "page.click" });
      engine.recordTurnResult(turn, { ok: true, data: "same" });

      // Budget exhausted
      expect(engine.checkNoProgress(sid)).toBe("repeat_signature");
    });

    it("detects ping_pong pattern with zero budget", () => {
      // Zero budget for ping_pong means immediate detection
      const engine2 = new LoopEngine({
        maxSteps: 50,
        noProgressContinueBudget: { ping_pong: 0 }
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
