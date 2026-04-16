import { InterventionController } from "@bbl-next/kernel";
import { describe, expect, it } from "vitest";

const BASE_NOW = Date.parse("2026-04-16T00:00:00.000Z");

describe("InterventionController", () => {
  it("emits stale escalation metadata before timeout and timeout escalation metadata on expiry", () => {
    const controller = new InterventionController();

    controller.request(
      "session-1",
      {
        id: "ivr:session-1:verify",
        kind: "takeover",
        trigger: "verify_failed",
        status: "requested",
        title: "Manual verify required",
        message: "Finish the flow manually.",
        sessionId: "session-1",
        tabId: 11,
      },
      {
        now: BASE_NOW,
        timeoutMs: 120_000,
        escalationMs: 30_000,
      },
    );

    const staleRecords = controller.list({
      sessionId: "session-1",
      now: BASE_NOW + 45_000,
    });

    expect(staleRecords).toEqual([
      expect.objectContaining({
        id: "ivr:session-1:verify",
        status: "requested",
        escalation: expect.objectContaining({
          thresholdMs: 30_000,
          escalatedAt: new Date(BASE_NOW + 45_000).toISOString(),
        }),
      }),
    ]);

    expect(
      controller.readAudit({
        sessionId: "session-1",
        now: BASE_NOW + 45_000,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interventionId: "ivr:session-1:verify",
          status: "requested",
          details: {
            escalation: expect.objectContaining({
              reason: "stale",
              thresholdMs: 30_000,
              overdueMs: 15_000,
              tabId: 11,
            }),
          },
        }),
      ]),
    );

    const timedOutRecords = controller.list({
      sessionId: "session-1",
      now: BASE_NOW + 130_000,
    });

    expect(timedOutRecords).toEqual([
      expect.objectContaining({
        id: "ivr:session-1:verify",
        status: "timed_out",
        escalation: expect.objectContaining({
          thresholdMs: 30_000,
          escalatedAt: new Date(BASE_NOW + 45_000).toISOString(),
        }),
      }),
    ]);

    expect(
      controller.readAudit({
        sessionId: "session-1",
        now: BASE_NOW + 130_000,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interventionId: "ivr:session-1:verify",
          status: "timed_out",
          details: {
            escalation: expect.objectContaining({
              reason: "timeout",
              thresholdMs: 120_000,
              overdueMs: 10_000,
              tabId: 11,
            }),
          },
        }),
      ]),
    );
  });
});
