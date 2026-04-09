import { RunController } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";

describe("RunController", () => {
  let ctrl: RunController;
  const sid = "s-test-001";

  beforeEach(() => {
    ctrl = new RunController();
  });

  describe("state initialization", () => {
    it("returns idle state for a new session", () => {
      const state = ctrl.getState(sid);

      expect(state.sessionId).toBe(sid);
      expect(state.phase).toBe("idle");
      expect(state.retry).toEqual({ active: false, attempt: 0, maxAttempts: 2 });
      expect(state.queue).toEqual({ steer: [], followUp: [] });
    });
  });

  describe("phase transitions", () => {
    it("transitions idle → running", () => {
      const state = ctrl.transition(sid, "start");
      expect(state.phase).toBe("running");
    });

    it("transitions running → paused → running", () => {
      ctrl.transition(sid, "start");
      const paused = ctrl.transition(sid, "pause");
      expect(paused.phase).toBe("paused");

      const resumed = ctrl.transition(sid, "resume");
      expect(resumed.phase).toBe("running");
    });

    it("transitions running → compacting → running (retry)", () => {
      ctrl.transition(sid, "start");
      const compacting = ctrl.transition(sid, "compact");
      expect(compacting.phase).toBe("compacting");

      const back = ctrl.transition(sid, "compact_done_retry");
      expect(back.phase).toBe("running");
    });

    it("transitions running → compacting → idle (no retry)", () => {
      ctrl.transition(sid, "start");
      ctrl.transition(sid, "compact");

      const idle = ctrl.transition(sid, "compact_done_idle");
      expect(idle.phase).toBe("idle");
    });

    it("transitions running → stopped → idle (reset)", () => {
      ctrl.transition(sid, "start");
      const stopped = ctrl.transition(sid, "stop");
      expect(stopped.phase).toBe("stopped");

      const reset = ctrl.transition(sid, "reset");
      expect(reset.phase).toBe("idle");
    });

    it("transitions running → stopped (done event)", () => {
      ctrl.transition(sid, "start");
      const done = ctrl.transition(sid, "done");
      expect(done.phase).toBe("stopped");
    });

    it("rejects transitions before run state exists", () => {
      expect(() => ctrl.transition(sid, "pause")).toThrow("Run state not found");
    });

    it("rejects running → idle (not a valid transition)", () => {
      ctrl.transition(sid, "start");
      expect(() => ctrl.transition(sid, "reset")).toThrow("Illegal run phase transition");
    });

    it("resets retry state on stop/done/reset", () => {
      ctrl.transition(sid, "start");
      ctrl.activateRetry(sid);
      ctrl.recordRetryAttempt(sid);
      expect(ctrl.getState(sid).retry.active).toBe(true);

      ctrl.transition(sid, "stop");
      expect(ctrl.getState(sid).retry).toEqual({
        active: false,
        attempt: 0,
        maxAttempts: 2,
      });
    });
  });

  describe("queue management", () => {
    it("enqueues and dequeues steer prompts", () => {
      ctrl.transition(sid, "start");
      ctrl.enqueue(sid, "steer", "do this first");
      ctrl.enqueue(sid, "steer", "then this");

      const items = ctrl.dequeue(sid, "steer");
      expect(items).toHaveLength(2);
      expect(items[0].text).toBe("do this first");
      expect(items[1].text).toBe("then this");
      expect(items[0].id).toBeTruthy();

      // Queue is now empty
      expect(ctrl.dequeue(sid, "steer")).toHaveLength(0);
    });

    it("keeps steer and followUp queues independent", () => {
      ctrl.transition(sid, "start");
      ctrl.enqueue(sid, "steer", "steer msg");
      ctrl.enqueue(sid, "followUp", "follow msg");

      expect(ctrl.dequeue(sid, "steer")).toHaveLength(1);
      expect(ctrl.dequeue(sid, "followUp")).toHaveLength(1);
    });

    it("throws for queue operations before run start", () => {
      expect(() => ctrl.enqueue(sid, "steer", "x")).toThrow("Run state not found");
      expect(() => ctrl.dequeue(sid, "steer")).toThrow("Run state not found");
    });
  });

  describe("child runs", () => {
    it("registers child runs outside the steer/followUp queue", () => {
      ctrl.transition(sid, "start");

      const child = ctrl.registerChildRun(sid, {
        childSessionId: "s-child-001",
        parentTurnId: "turn-001",
        title: "Research helper",
        task: "Check a secondary path",
      });

      expect(child.parentSessionId).toBe(sid);
      expect(child.childSessionId).toBe("s-child-001");
      expect(child.status).toBe("pending");
      expect(ctrl.getState(sid).queue).toEqual({ steer: [], followUp: [] });
      expect(ctrl.listChildRuns(sid)).toEqual([child]);
      expect(ctrl.getChildRunSummary(sid)).toMatchObject({
        totalCount: 1,
        activeCount: 1,
        items: [
          expect.objectContaining({
            id: child.id,
            childSessionId: "s-child-001",
            parentTurnId: "turn-001",
          }),
        ],
      });
    });

    it("transitions child runs through lifecycle states", () => {
      ctrl.transition(sid, "start");
      const child = ctrl.registerChildRun(sid, {
        childSessionId: "s-child-001",
      });

      const running = ctrl.updateChildRunStatus(sid, child.id, "running");
      expect(running.status).toBe("running");

      const completed = ctrl.updateChildRunStatus(sid, child.id, "completed");
      expect(completed.status).toBe("completed");
      expect(ctrl.getChildRunSummary(sid)).toMatchObject({
        totalCount: 1,
        activeCount: 0,
      });
    });

    it("rejects illegal child-run transitions", () => {
      ctrl.transition(sid, "start");
      const child = ctrl.registerChildRun(sid, {
        childSessionId: "s-child-001",
      });

      ctrl.updateChildRunStatus(sid, child.id, "completed");

      expect(() => ctrl.updateChildRunStatus(sid, child.id, "running")).toThrow(
        "Illegal child run status transition",
      );
    });
  });

  describe("retry management", () => {
    it("starts with retry inactive", () => {
      expect(ctrl.shouldRetry(sid)).toBe(false);
    });

    it("allows retry when active and under budget", () => {
      ctrl.transition(sid, "start");
      ctrl.activateRetry(sid);
      expect(ctrl.shouldRetry(sid)).toBe(true);

      ctrl.recordRetryAttempt(sid);
      expect(ctrl.shouldRetry(sid)).toBe(true); // attempt 1 < max 2

      ctrl.recordRetryAttempt(sid);
      expect(ctrl.shouldRetry(sid)).toBe(false); // attempt 2 = max 2
    });

    it("resets retry state", () => {
      ctrl.transition(sid, "start");
      ctrl.activateRetry(sid);
      ctrl.recordRetryAttempt(sid);
      ctrl.resetRetry(sid);

      const state = ctrl.getState(sid);
      expect(state.retry).toEqual({ active: false, attempt: 0, maxAttempts: 2 });
    });

    it("throws retry mutation calls before run start", () => {
      expect(() => ctrl.activateRetry(sid)).toThrow("Run state not found");
      expect(() => ctrl.recordRetryAttempt(sid)).toThrow("Run state not found");
      expect(() => ctrl.resetRetry(sid)).toThrow("Run state not found");
    });
  });
});
