import {
  type ManagementState,
  applyManagementResourceDocument,
  buildManagementBootstrapRequests,
  createInitialManagementState,
  createManagementActionMessage,
} from "./management";

export type SidepanelRuntimeCaller = (
  kind: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

export interface SidepanelControlPlaneActionResult<T = unknown> {
  kind: string;
  result: T;
  refresh: boolean;
  notice: string;
  counts?: Record<string, unknown>;
  diagnosticsSnapshot?: T;
}

export interface SidepanelControlPlaneClient {
  bootstrap(): Promise<ManagementState>;
  runAction<T = unknown>(
    kind: string,
    payload?: Record<string, unknown>,
  ): Promise<SidepanelControlPlaneActionResult<T>>;
}

function stripKind(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).filter(([key]) => key !== "kind"));
}

function readCounts(result: unknown): Record<string, unknown> | undefined {
  const counts = (result as { counts?: unknown } | null)?.counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return undefined;
  }
  return counts as Record<string, unknown>;
}

function shouldRefreshAfterAction(kind: string): boolean {
  return kind !== "runtime.capture_diagnostics";
}

function formatDiscoverNotice(counts: Record<string, unknown> | undefined): string {
  return `扫描 ${counts?.scanned ?? 0} 个，发现 ${counts?.discovered ?? 0} 个，安装 ${counts?.installed ?? 0} 个，跳过 ${counts?.skipped ?? 0} 个`;
}

function describeActionNotice(kind: string, counts: Record<string, unknown> | undefined): string {
  if (kind === "runtime.capture_diagnostics") {
    return "Diagnostics captured.";
  }
  if (kind === "skills.discover") {
    return formatDiscoverNotice(counts);
  }
  return `${kind} complete.`;
}

export function createSidepanelControlPlaneClient(
  callRuntime: SidepanelRuntimeCaller,
): SidepanelControlPlaneClient {
  return {
    async bootstrap() {
      let nextState = createInitialManagementState();
      for (const request of buildManagementBootstrapRequests()) {
        const resource = await callRuntime(request.kind, {
          resourceId: request.resourceId,
          world: request.world,
        });
        nextState = applyManagementResourceDocument(nextState, resource as never);
      }
      return nextState;
    },
    async runAction<T = unknown>(kind: string, payload: Record<string, unknown> = {}) {
      const message = createManagementActionMessage(kind, payload) as Record<string, unknown>;
      const result = (await callRuntime(kind, stripKind(message))) as T;
      const counts = readCounts(result);
      const actionResult: SidepanelControlPlaneActionResult<T> = {
        kind,
        result,
        refresh: shouldRefreshAfterAction(kind),
        notice: describeActionNotice(kind, counts),
      };
      if (kind === "skills.discover" && counts) {
        actionResult.counts = counts;
      }
      if (kind === "runtime.capture_diagnostics") {
        actionResult.diagnosticsSnapshot = result;
      }
      return actionResult;
    },
  };
}
