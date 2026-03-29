import { JsRunnerHost } from "@bbl-next/js-runner";
import { describe, expect, it } from "vitest";

describe("js-runner", () => {
  it("executes a runner module with ctx and input", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.invoke({
        module: {
          id: "demo",
          source: 'exports.default = async ({ ctx, input }) => `${ctx.prefix}:${input}`;'
        },
        ctx: { prefix: "ok" },
        input: "run"
      })
    ).resolves.toMatchObject({
      result: "ok:run"
    });
  });

  it("returns structured invoke responses through dispatch", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "invoke",
        requestId: "req-1",
        invocation: {
          module: {
            id: "demo",
            source: 'exports.default = async ({ ctx, input }) => `${ctx.prefix}:${input}`;'
          },
          ctx: { prefix: "rpc" },
          input: "call"
        }
      })
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-1",
      ok: true,
      result: {
        result: "rpc:call"
      }
    });
  });

  it("isolates module state per invocation", async () => {
    const host = new JsRunnerHost();
    const module = {
      id: "counter",
      source: "let counter = 0; exports.default = async () => ++counter;"
    };

    const first = await host.invoke({ module, ctx: {}, input: null });
    const second = await host.invoke({ module, ctx: {}, input: null });

    expect(first.result).toBe(1);
    expect(second.result).toBe(1);
  });

  it("times out slow invocations", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.invoke({
        module: {
          id: "slow",
          source:
            "exports.default = async () => new Promise((resolve) => setTimeout(() => resolve('done'), 50));"
        },
        ctx: {},
        input: null,
        timeoutMs: 5
      })
    ).rejects.toMatchObject({
      code: "E_TIMEOUT"
    });
  });

  it("reports idle health when no invocations are running", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "health",
        requestId: "health-1"
      })
    ).resolves.toMatchObject({
      kind: "health_result",
      ok: true,
      health: {
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0
      }
    });
  });

  it("reports busy health while an invocation is inflight", async () => {
    const host = new JsRunnerHost();
    const inflight = host.dispatch({
      kind: "invoke",
      requestId: "req-busy",
      invocation: {
        module: {
          id: "slow",
          source:
            "exports.default = async () => new Promise((resolve) => setTimeout(() => resolve('done'), 50));"
        },
        ctx: {},
        input: null
      }
    });

    expect(host.getHealth()).toMatchObject({
      status: "busy",
      inflightCount: 1
    });

    await inflight;
  });

  it("marks timeout failures with deadline_exceeded details", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "invoke",
        requestId: "req-timeout",
        invocation: {
          module: {
            id: "slow",
            source:
              "exports.default = async () => new Promise((resolve) => setTimeout(() => resolve('done'), 50));"
          },
          ctx: {},
          input: null,
          timeoutMs: 5
        }
      })
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-timeout",
      ok: false,
      error: {
        code: "E_TIMEOUT",
        details: {
          reason: "deadline_exceeded"
        }
      }
    });
  });

  it("cancels inflight invocations by request id", async () => {
    const host = new JsRunnerHost();
    const inflight = host.dispatch({
      kind: "invoke",
      requestId: "req-cancel",
      invocation: {
        module: {
          id: "slow",
          source:
            "exports.default = async () => new Promise((resolve) => setTimeout(() => resolve('done'), 50));"
        },
        ctx: {},
        input: null,
        timeoutMs: 100
      }
    });

    await expect(host.cancel("req-cancel")).resolves.toEqual({ cancelled: true });
    await expect(inflight).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-cancel",
      ok: false,
      error: {
        code: "E_TIMEOUT",
        details: {
          reason: "cancelled"
        }
      }
    });
  });

  it("treats cancelling an unknown request as a no-op", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "cancel",
        requestId: "cancel-unknown",
        targetRequestId: "missing"
      })
    ).resolves.toEqual({
      kind: "cancel_result",
      requestId: "cancel-unknown",
      ok: true,
      targetRequestId: "missing",
      cancelled: false
    });
  });

  it("marks health as degraded after a failure and resets after success", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "invoke",
        requestId: "req-fail",
        invocation: {
          module: {
            id: "boom",
            source: "exports.default = async () => { throw new Error('boom'); };"
          },
          ctx: {},
          input: null
        }
      })
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-fail",
      ok: false,
      error: {
        code: "E_RUNTIME",
        message: "boom"
      }
    });

    expect(host.getHealth()).toMatchObject({
      status: "degraded",
      inflightCount: 0,
      consecutiveFailures: 1
    });

    await expect(
      host.invoke({
        module: {
          id: "ok",
          source: "exports.default = async () => 'ok';"
        },
        ctx: {},
        input: null
      })
    ).resolves.toMatchObject({
      result: "ok"
    });

    expect(host.getHealth()).toMatchObject({
      status: "idle",
      inflightCount: 0,
      consecutiveFailures: 0
    });
  });
});
