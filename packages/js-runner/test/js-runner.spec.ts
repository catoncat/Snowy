import {
  JsRunnerHost,
  type RunnerRpcRequest,
  createCompositeHostAdapter,
  createRunnerHostCore,
} from "@bbl-next/js-runner";
import { describe, expect, it, vi } from "vitest";

describe("js-runner", () => {
  it("executes a runner module with ctx and input", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.invoke({
        module: {
          id: "demo",
          source: "exports.default = async ({ ctx, input }) => `${ctx.prefix}:${input}`;",
        },
        ctx: { prefix: "ok" },
        input: "run",
      }),
    ).resolves.toMatchObject({
      result: "ok:run",
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
            source: "exports.default = async ({ ctx, input }) => `${ctx.prefix}:${input}`;",
          },
          ctx: { prefix: "rpc" },
          input: "call",
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-1",
      ok: true,
      result: {
        result: "rpc:call",
      },
    });
  });

  it("isolates module state per invocation", async () => {
    const host = new JsRunnerHost();
    const module = {
      id: "counter",
      source: "let counter = 0; exports.default = async () => ++counter;",
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
          source: "exports.default = async () => new Promise(() => {});",
        },
        ctx: {},
        input: null,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({
      code: "E_TIMEOUT",
    });
  });

  it("reports idle health when no invocations are running", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "health",
        requestId: "health-1",
      }),
    ).resolves.toMatchObject({
      kind: "health_result",
      ok: true,
      health: {
        status: "idle",
        inflightCount: 0,
        consecutiveFailures: 0,
      },
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
          source: "exports.default = async () => new Promise(() => {});",
        },
        ctx: {},
        input: null,
        timeoutMs: 50,
      },
    });

    expect(host.getHealth()).toMatchObject({
      status: "busy",
      inflightCount: 1,
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
            source: "exports.default = async () => new Promise(() => {});",
          },
          ctx: {},
          input: null,
          timeoutMs: 5,
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-timeout",
      ok: false,
      error: {
        code: "E_TIMEOUT",
        details: {
          reason: "deadline_exceeded",
        },
      },
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
          source: "exports.default = async () => new Promise(() => {});",
        },
        ctx: {},
        input: null,
        timeoutMs: 100,
      },
    });

    await expect(host.cancel("req-cancel")).resolves.toEqual({ cancelled: true });
    await expect(inflight).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-cancel",
      ok: false,
      error: {
        code: "E_TIMEOUT",
        details: {
          reason: "cancelled",
        },
      },
    });
  });

  it("does not leak cancellation state into the next invocation", async () => {
    const core = createRunnerHostCore();
    const inflight = core.dispatch({
      kind: "invoke",
      requestId: "req-cancel-leak",
      invocation: {
        module: {
          id: "slow",
          source: "exports.default = async () => new Promise(() => {});",
        },
        ctx: {},
        input: null,
        timeoutMs: 100,
      },
    });

    await expect(
      core.dispatch({
        kind: "cancel",
        requestId: "cancel-cancel-leak",
        targetRequestId: "req-cancel-leak",
      }),
    ).resolves.toMatchObject({
      kind: "cancel_result",
      targetRequestId: "req-cancel-leak",
      cancelled: true,
    });

    await expect(inflight).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-cancel-leak",
      ok: false,
      error: {
        code: "E_TIMEOUT",
        details: {
          reason: "cancelled",
        },
      },
    });

    await expect(
      core.dispatch({
        kind: "invoke",
        requestId: "req-after-cancel",
        invocation: {
          module: {
            id: "after-cancel",
            source: "exports.default = async ({ signal }) => ({ aborted: signal.aborted });",
          },
          ctx: {},
          input: null,
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-after-cancel",
      ok: true,
      result: {
        result: {
          aborted: false,
        },
      },
    });
  });

  it("treats cancelling an unknown request as a no-op", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "cancel",
        requestId: "cancel-unknown",
        targetRequestId: "missing",
      }),
    ).resolves.toEqual({
      kind: "cancel_result",
      requestId: "cancel-unknown",
      ok: true,
      targetRequestId: "missing",
      cancelled: false,
    });
  });

  it("routes host substrate requests through an explicit host adapter", async () => {
    const hostAdapter = {
      read: vi.fn(async (request) => ({
        hostId: request.hostId,
        path: request.path,
        content: "hello",
      })),
      write: vi.fn(async (request) => ({
        hostId: request.hostId,
        path: request.path,
        content: request.content,
      })),
      edit: vi.fn(async (request) => ({
        hostId: request.hostId,
        path: request.path,
        content: `patched:${request.patch}`,
      })),
      exec: vi.fn(async (request) => ({
        hostId: request.hostId,
        command: request.command,
        exitCode: 0,
        stdout: `ran:${request.command}`,
        stderr: "",
      })),
    };
    const core = createRunnerHostCore({ hostAdapter });

    await expect(
      core.dispatch({
        kind: "read",
        requestId: "read-1",
        hostId: "local",
        path: "/workspace/demo.txt",
      }),
    ).resolves.toEqual({
      hostId: "local",
      path: "/workspace/demo.txt",
      content: "hello",
    });

    await expect(
      core.dispatch({
        kind: "write",
        requestId: "write-1",
        hostId: "local",
        path: "/workspace/demo.txt",
        content: "hello",
      }),
    ).resolves.toEqual({
      hostId: "local",
      path: "/workspace/demo.txt",
      content: "hello",
    });

    await expect(
      core.dispatch({
        kind: "edit",
        requestId: "edit-1",
        hostId: "local",
        path: "/workspace/demo.txt",
        patch: "\nworld",
      }),
    ).resolves.toEqual({
      hostId: "local",
      path: "/workspace/demo.txt",
      content: "patched:\nworld",
    });

    await expect(
      core.dispatch({
        kind: "exec",
        requestId: "exec-1",
        hostId: "local",
        command: "pwd",
        timeoutMs: 25,
      }),
    ).resolves.toEqual({
      hostId: "local",
      command: "pwd",
      exitCode: 0,
      stdout: "ran:pwd",
      stderr: "",
    });

    expect(hostAdapter.read).toHaveBeenCalledWith({
      kind: "read",
      requestId: "read-1",
      hostId: "local",
      path: "/workspace/demo.txt",
    });
    expect(hostAdapter.write).toHaveBeenCalledWith({
      kind: "write",
      requestId: "write-1",
      hostId: "local",
      path: "/workspace/demo.txt",
      content: "hello",
    });
    expect(hostAdapter.edit).toHaveBeenCalledWith({
      kind: "edit",
      requestId: "edit-1",
      hostId: "local",
      path: "/workspace/demo.txt",
      patch: "\nworld",
    });
    expect(hostAdapter.exec).toHaveBeenCalledWith({
      kind: "exec",
      requestId: "exec-1",
      hostId: "local",
      command: "pwd",
      timeoutMs: 25,
    });
  });

  it("exposes host substrate dispatch through the public JsRunnerHost API", async () => {
    const hostAdapter = {
      exec: vi.fn(async (request) => ({
        hostId: request.hostId,
        command: request.command,
        exitCode: 0,
        stdout: `ran:${request.command}`,
        stderr: "",
      })),
    };
    const host = new JsRunnerHost({ hostAdapter });

    await expect(
      host.dispatch({
        kind: "exec",
        requestId: "exec-public",
        hostId: "local",
        command: "pwd",
        timeoutMs: 25,
      }),
    ).resolves.toEqual({
      hostId: "local",
      command: "pwd",
      exitCode: 0,
      stdout: "ran:pwd",
      stderr: "",
    });

    expect(hostAdapter.exec).toHaveBeenCalledWith({
      kind: "exec",
      requestId: "exec-public",
      hostId: "local",
      command: "pwd",
      timeoutMs: 25,
    });
  });

  it("returns structured host substrate errors when no adapter is configured", async () => {
    const core = createRunnerHostCore();
    const requests: RunnerRpcRequest[] = [
      {
        kind: "read",
        requestId: "read-missing",
        hostId: "local",
        path: "/workspace/demo.txt",
      },
      {
        kind: "write",
        requestId: "write-missing",
        hostId: "local",
        path: "/workspace/demo.txt",
        content: "hello",
      },
      {
        kind: "edit",
        requestId: "edit-missing",
        hostId: "local",
        path: "/workspace/demo.txt",
        patch: "\nworld",
      },
      {
        kind: "exec",
        requestId: "exec-missing",
        hostId: "local",
        command: "pwd",
        timeoutMs: 25,
      },
    ];

    for (const request of requests) {
      await expect(core.dispatch(request)).resolves.toMatchObject({
        ok: false,
        error: {
          code: "E_RUNTIME",
          message: `Execution host adapter is not configured for ${request.kind}`,
          details: {
            kind: request.kind,
            hostId: "local",
            reason: "adapter_missing",
          },
        },
      });
    }
  });

  it("returns structured host substrate errors through the public JsRunnerHost API", async () => {
    const host = new JsRunnerHost();

    await expect(
      host.dispatch({
        kind: "exec",
        requestId: "exec-missing-public",
        hostId: "local",
        command: "pwd",
        timeoutMs: 25,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_RUNTIME",
        message: "Execution host adapter is not configured for exec",
        details: {
          kind: "exec",
          hostId: "local",
          reason: "adapter_missing",
        },
      },
    });
  });

  it("returns operation_not_supported when adapter lacks the requested operation", async () => {
    const hostAdapter = {
      read: vi.fn(async (request) => ({
        hostId: request.hostId,
        path: request.path,
        content: "data",
      })),
    };
    const host = new JsRunnerHost({ hostAdapter });

    await expect(
      host.dispatch({
        kind: "read",
        requestId: "read-partial",
        hostId: "local",
        path: "/demo.txt",
      }),
    ).resolves.toMatchObject({
      hostId: "local",
      path: "/demo.txt",
      content: "data",
    });

    await expect(
      host.dispatch({
        kind: "exec",
        requestId: "exec-partial",
        hostId: "local",
        command: "pwd",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "E_CAPABILITY_NOT_FOUND",
        message: "Execution host adapter does not implement exec",
        details: {
          kind: "exec",
          hostId: "local",
          reason: "operation_not_supported",
        },
      },
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
            source: "exports.default = async () => { throw new Error('boom'); };",
          },
          ctx: {},
          input: null,
        },
      }),
    ).resolves.toMatchObject({
      kind: "invoke_result",
      requestId: "req-fail",
      ok: false,
      error: {
        code: "E_RUNTIME",
        message: "boom",
      },
    });

    expect(host.getHealth()).toMatchObject({
      status: "degraded",
      inflightCount: 0,
      consecutiveFailures: 1,
    });

    await expect(
      host.invoke({
        module: {
          id: "ok",
          source: "exports.default = async () => 'ok';",
        },
        ctx: {},
        input: null,
      }),
    ).resolves.toMatchObject({
      result: "ok",
    });

    expect(host.getHealth()).toMatchObject({
      status: "idle",
      inflightCount: 0,
      consecutiveFailures: 0,
    });
  });

  describe("createCompositeHostAdapter", () => {
    it("routes read/write/edit to local and exec to remote", async () => {
      const local = {
        read: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: "local" })),
        write: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: req.content })),
        edit: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: req.patch })),
      };
      const remote = {
        exec: vi.fn(async (req) => ({
          hostId: req.hostId,
          command: req.command,
          exitCode: 0,
          stdout: `remote:${req.command}`,
          stderr: "",
        })),
      };
      const composite = createCompositeHostAdapter({ local, remote });
      const core = createRunnerHostCore({ hostAdapter: composite });

      await expect(
        core.dispatch({ kind: "read", requestId: "r1", hostId: "local", path: "/a.txt" }),
      ).resolves.toMatchObject({ hostId: "local", path: "/a.txt", content: "local" });

      await expect(
        core.dispatch({
          kind: "write",
          requestId: "w1",
          hostId: "local",
          path: "/a.txt",
          content: "data",
        }),
      ).resolves.toMatchObject({ content: "data" });

      await expect(
        core.dispatch({
          kind: "edit",
          requestId: "e1",
          hostId: "local",
          path: "/a.txt",
          patch: "patch",
        }),
      ).resolves.toMatchObject({ content: "patch" });

      await expect(
        core.dispatch({ kind: "exec", requestId: "x1", hostId: "local", command: "pwd" }),
      ).resolves.toMatchObject({
        hostId: "local",
        command: "pwd",
        exitCode: 0,
        stdout: "remote:pwd",
      });

      expect(local.read).toHaveBeenCalledTimes(1);
      expect(local.write).toHaveBeenCalledTimes(1);
      expect(local.edit).toHaveBeenCalledTimes(1);
      expect(remote.exec).toHaveBeenCalledTimes(1);
    });

    it("falls back to remote for read/write/edit when local is absent", async () => {
      const remote = {
        read: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: "remote" })),
        exec: vi.fn(async (req) => ({
          hostId: req.hostId,
          command: req.command,
          exitCode: 0,
          stdout: "",
          stderr: "",
        })),
      };
      const composite = createCompositeHostAdapter({ remote });
      const core = createRunnerHostCore({ hostAdapter: composite });

      await expect(
        core.dispatch({ kind: "read", requestId: "r1", hostId: "r", path: "/b.txt" }),
      ).resolves.toMatchObject({ content: "remote" });

      expect(remote.read).toHaveBeenCalledTimes(1);
    });

    it("falls back to local exec when remote has no exec", async () => {
      const local = {
        read: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: "local" })),
        exec: vi.fn(async (req) => ({
          hostId: req.hostId,
          command: req.command,
          exitCode: 0,
          stdout: "local-exec",
          stderr: "",
        })),
      };
      const composite = createCompositeHostAdapter({ local, remote: {} });
      const core = createRunnerHostCore({ hostAdapter: composite });

      await expect(
        core.dispatch({ kind: "exec", requestId: "x1", hostId: "local", command: "ls" }),
      ).resolves.toMatchObject({ stdout: "local-exec" });

      expect(local.exec).toHaveBeenCalledTimes(1);
    });

    it("returns operation_not_supported when neither adapter has exec", async () => {
      const local = {
        read: vi.fn(async (req) => ({ hostId: req.hostId, path: req.path, content: "ok" })),
      };
      const composite = createCompositeHostAdapter({ local });
      const core = createRunnerHostCore({ hostAdapter: composite });

      await expect(
        core.dispatch({ kind: "exec", requestId: "x1", hostId: "local", command: "pwd" }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "E_CAPABILITY_NOT_FOUND",
          message: "Execution host adapter does not implement exec",
          details: { kind: "exec", reason: "operation_not_supported" },
        },
      });
    });
  });
});
