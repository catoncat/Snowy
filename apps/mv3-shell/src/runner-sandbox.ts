// This file intentionally avoids imports so Vite emits a standalone sandbox entry.

const SANDBOX_TARGET = "bbl-next.runner.sandbox";
const SANDBOX_RESULT_TARGET = "bbl-next.runner.sandbox.result";
const OFFSCREEN_TARGET = "bbl-next.runner.offscreen";

type SandboxInvocation = {
  module: {
    id: string;
    source: string;
    exportName?: string;
  };
  input: unknown;
  ctx?: Record<string, unknown>;
  gatewayId?: string | null;
};

type PendingCapabilityCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const pendingCapabilityCalls = new Map<string, PendingCapabilityCall>();
let capabilityCallSequence = 0;

function normalizeError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return {
      code: String((error as { code: unknown }).code),
      message: String((error as { message: unknown }).message),
      details: "details" in error ? (error as { details?: unknown }).details : undefined,
    };
  }
  if (error instanceof Error) {
    return {
      code: "E_RUNTIME",
      message: error.message,
    };
  }
  return {
    code: "E_RUNTIME",
    message: "Unknown sandbox runner error",
    details: error,
  };
}

function loadModule(module: SandboxInvocation["module"]) {
  const exportsObject: Record<string, unknown> = {};
  const moduleObject = { exports: exportsObject };
  const factory = new Function(
    "exports",
    "module",
    `"use strict";\n${module.source}\nreturn module.exports;`,
  );
  return factory(exportsObject, moduleObject) as Record<string, unknown>;
}

function requestCapability(
  gatewayId: string | null | undefined,
  capabilityId: string,
  input: unknown,
) {
  if (!gatewayId) {
    return Promise.reject(
      new Error(`Sandbox capability gateway is not available: ${capabilityId}`),
    );
  }
  const callId = `sandbox-call-${++capabilityCallSequence}`;
  return new Promise((resolve, reject) => {
    pendingCapabilityCalls.set(callId, { resolve, reject });
    window.parent.postMessage(
      {
        target: OFFSCREEN_TARGET,
        kind: "runner.capability_call",
        callId,
        gatewayId,
        capabilityId,
        input,
      },
      "*",
    );
  });
}

function createCapabilityProxy(call: (capabilityId: string, input: unknown) => Promise<unknown>) {
  const build = (parts: string[]): unknown =>
    new Proxy(
      function capability(input: unknown) {
        return call(parts.join("."), input);
      },
      {
        get(_target, property) {
          if (property === "then") {
            return undefined;
          }
          return build([...parts, String(property)]);
        },
        apply(_target, _thisArg, args) {
          return call(parts.join("."), args[0]);
        },
      },
    );
  return build([]) as Record<string, unknown>;
}

function createSandboxContext(invocation: SandboxInvocation) {
  const base = invocation.ctx && typeof invocation.ctx === "object" ? invocation.ctx : {};
  const call = (capabilityId: string, input: unknown) =>
    requestCapability(invocation.gatewayId, capabilityId, input);
  return {
    ...base,
    call,
    capabilities: createCapabilityProxy(call),
    skills: {
      invoke: (skillId: string, action: string, args: unknown) =>
        call("skills.invoke", { skillId, action, args }),
      install: (skillId: string, input: Record<string, unknown> = {}) =>
        call("skills.install", { ...input, skillId }),
      enable: (skillId: string) => call("skills.enable", { skillId }),
      disable: (skillId: string) => call("skills.disable", { skillId }),
      uninstall: (skillId: string) => call("skills.uninstall", { skillId }),
      rollback: (skillId: string, input: Record<string, unknown> = {}) =>
        call("skills.rollback", { ...input, skillId }),
    },
  };
}

async function invoke(_requestId: string, invocation: SandboxInvocation) {
  const startedAt = Date.now();
  const loaded = loadModule(invocation.module);
  const exportName = invocation.module.exportName ?? "default";
  const handler = loaded[exportName];
  if (typeof handler !== "function") {
    throw new Error(`Runner export is not callable: ${invocation.module.id}#${exportName}`);
  }
  const result = await handler({
    ctx: createSandboxContext(invocation),
    input: invocation.input,
  });
  return {
    result,
    durationMs: Date.now() - startedAt,
  };
}

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object" || message.target !== SANDBOX_TARGET) {
    return;
  }

  if (message.kind === "runner.capability_result") {
    const pending = pendingCapabilityCalls.get(message.callId);
    if (!pending) {
      return;
    }
    pendingCapabilityCalls.delete(message.callId);
    const response = message.response;
    if (response?.ok === true) {
      pending.resolve(response.data);
    } else {
      const error = new Error(response?.error?.message ?? "Capability call failed");
      Object.assign(error, {
        code: response?.error?.code ?? "E_RUNTIME",
        details: response?.error?.details,
      });
      pending.reject(error);
    }
    return;
  }

  if (message.kind !== "runner.invoke") {
    return;
  }

  void invoke(message.requestId, {
    ...message.invocation,
    gatewayId: message.gatewayId ?? null,
  })
    .then((result) => {
      (event.source as Window | null)?.postMessage(
        {
          target: SANDBOX_RESULT_TARGET,
          requestId: message.requestId,
          ok: true,
          result,
        },
        event.origin || "*",
      );
    })
    .catch((error) => {
      (event.source as Window | null)?.postMessage(
        {
          target: SANDBOX_RESULT_TARGET,
          requestId: message.requestId,
          ok: false,
          error: normalizeError(error),
        },
        event.origin || "*",
      );
    });
});
