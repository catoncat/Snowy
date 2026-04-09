/**
 * Local execution host adapter for browser-side (offscreen) context.
 *
 * Provides in-memory workspace storage for read/write/edit operations.
 * exec is not supported in the browser-only local adapter.
 */

import type { CapabilityErrorCode } from "@bbl-next/contracts";
import type {
  RunnerHostAdapter,
  RunnerHostEditRequest,
  RunnerHostErrorResponse,
  RunnerHostReadRequest,
  RunnerHostWriteRequest,
} from "@bbl-next/js-runner";

function hostAdapterError(
  code: CapabilityErrorCode,
  message: string,
  details: Record<string, unknown>,
): RunnerHostErrorResponse {
  return {
    ok: false,
    error: { code, message, details },
  };
}

export function createLocalHostAdapter(): RunnerHostAdapter {
  const files = new Map<string, string>();

  function read(request: RunnerHostReadRequest) {
    const content = files.get(request.path) ?? null;
    return {
      hostId: request.hostId,
      path: request.path,
      content,
    };
  }

  function write(request: RunnerHostWriteRequest) {
    if (typeof request.path !== "string" || !request.path) {
      return hostAdapterError("E_BAD_INPUT", "write requires a non-empty path", {
        kind: "write",
        hostId: request.hostId,
        reason: "execution_failed",
      });
    }
    const content = request.content ?? "";
    files.set(request.path, content);
    return {
      hostId: request.hostId,
      path: request.path,
      content,
    };
  }

  function edit(request: RunnerHostEditRequest) {
    if (typeof request.path !== "string" || !request.path) {
      return hostAdapterError("E_BAD_INPUT", "edit requires a non-empty path", {
        kind: "edit",
        hostId: request.hostId,
        reason: "execution_failed",
      });
    }
    const existing = files.get(request.path) ?? "";
    const content = existing + (request.patch ?? "");
    files.set(request.path, content);
    return {
      hostId: request.hostId,
      path: request.path,
      content,
    };
  }

  return { read, write, edit };
}
