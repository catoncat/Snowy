/**
 * Local execution host adapter for browser-side (offscreen) context.
 *
 * Provides in-memory workspace storage for read/write/edit operations.
 * exec is not supported in the browser-only local adapter.
 */

function hostAdapterError(code, message, details) {
  return {
    ok: false,
    error: { code, message, details }
  };
}

export function createLocalHostAdapter() {
  const files = new Map();

  function read(request) {
    const content = files.get(request.path) ?? null;
    return {
      hostId: request.hostId,
      path: request.path,
      content
    };
  }

  function write(request) {
    if (typeof request.path !== "string" || !request.path) {
      return hostAdapterError("E_BAD_INPUT", "write requires a non-empty path", {
        kind: "write",
        hostId: request.hostId,
        reason: "execution_failed"
      });
    }
    const content = request.content ?? "";
    files.set(request.path, content);
    return {
      hostId: request.hostId,
      path: request.path,
      content
    };
  }

  function edit(request) {
    if (typeof request.path !== "string" || !request.path) {
      return hostAdapterError("E_BAD_INPUT", "edit requires a non-empty path", {
        kind: "edit",
        hostId: request.hostId,
        reason: "execution_failed"
      });
    }
    const existing = files.get(request.path) ?? "";
    const content = existing + (request.patch ?? "");
    files.set(request.path, content);
    return {
      hostId: request.hostId,
      path: request.path,
      content
    };
  }

  return { read, write, edit };
}
