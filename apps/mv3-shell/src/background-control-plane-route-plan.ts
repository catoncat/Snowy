import type {
  ConfigControlPlaneAction,
  HostControlPlaneAction,
  InterventionControlPlaneAction,
  RuntimeControlPlaneAction,
  SkillControlPlaneAction,
} from "@bbl-next/contracts";
import {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
} from "./sidepanel-management-contract.js";

export const BACKGROUND_CONTROL_PLANE_RESOURCE_IDS = [
  ...SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
] as const;
export type BackgroundControlPlaneResourceId =
  (typeof BACKGROUND_CONTROL_PLANE_RESOURCE_IDS)[number];

export type BackgroundControlPlaneActionKind =
  | ConfigControlPlaneAction
  | HostControlPlaneAction
  | InterventionControlPlaneAction
  | RuntimeControlPlaneAction
  | SkillControlPlaneAction;

export const BACKGROUND_CONTROL_PLANE_ACTION_KINDS = [
  "runtime.capture_diagnostics",
  "runtime.clear_error",
  "config.update",
  "intervention.list",
  "intervention.resolve",
  "intervention.cancel",
  "skills.discover",
  "skills.install",
  "skills.enable",
  "skills.disable",
  "skills.uninstall",
  "skills.rollback",
  "hosts.list",
  "hosts.get",
  "hosts.connect",
  "hosts.disconnect",
  "hosts.set_default",
  "hosts.health",
] as const satisfies readonly BackgroundControlPlaneActionKind[];

export const BACKGROUND_CONTROL_PLANE_MESSAGE_KINDS = [
  "resource.read",
  "runtime.bootstrap",
  "runtime.diagnostics",
  "audit.tail",
  "audit.host",
  "audit.intervention",
  ...BACKGROUND_CONTROL_PLANE_ACTION_KINDS,
] as const;

type MaybePromise<T> = T | Promise<T>;

type BackgroundControlPlaneMessage = Record<string, unknown> & {
  kind?: string;
};

export interface BackgroundControlPlaneRoutePlanHandlers {
  readResource(input: {
    resourceId: unknown;
    world?: unknown;
    limit?: unknown;
  }): MaybePromise<unknown>;
  readAuditTail(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  readHostAudit(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  readInterventionAudit(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  bootstrap(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  runtimeDiagnostics(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  clearRuntimeError(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  updateConfig(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  listHosts(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  getHost(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  connectHost(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  disconnectHost(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  setDefaultHost(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  hostHealth(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  discoverSkills(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  manageSkillLifecycle(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  listInterventions(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  resolveIntervention(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
  cancelIntervention(message: BackgroundControlPlaneMessage): MaybePromise<unknown>;
}

export interface BackgroundControlPlaneRoutePlan {
  readonly routeKinds: readonly string[];
  canRoute(kind: unknown): boolean;
  route(message: unknown): MaybePromise<unknown> | undefined;
}

function isPlainObject(value: unknown): value is BackgroundControlPlaneMessage {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isBackgroundControlPlaneActionKind(
  value: string,
): value is (typeof BACKGROUND_CONTROL_PLANE_ACTION_KINDS)[number] {
  return BACKGROUND_CONTROL_PLANE_ACTION_KINDS.includes(
    value as (typeof BACKGROUND_CONTROL_PLANE_ACTION_KINDS)[number],
  );
}

export function hasSidepanelManagementActionCoverage(): boolean {
  return SIDEPANEL_MANAGEMENT_ACTION_KINDS.every((kind) =>
    isBackgroundControlPlaneActionKind(kind),
  );
}

export function createBackgroundControlPlaneRoutePlan(
  handlers: BackgroundControlPlaneRoutePlanHandlers,
): BackgroundControlPlaneRoutePlan {
  const routes = new Map<string, (message: BackgroundControlPlaneMessage) => MaybePromise<unknown>>(
    [
      [
        "resource.read",
        (message) =>
          handlers.readResource({
            resourceId: message.resourceId,
            world: message.world,
            limit: message.limit,
          }),
      ],
      ["audit.tail", (message) => handlers.readAuditTail(message)],
      ["audit.host", (message) => handlers.readHostAudit(message)],
      ["audit.intervention", (message) => handlers.readInterventionAudit(message)],
      ["runtime.bootstrap", (message) => handlers.bootstrap(message)],
      ["runtime.diagnostics", (message) => handlers.runtimeDiagnostics(message)],
      ["runtime.capture_diagnostics", (message) => handlers.runtimeDiagnostics(message)],
      ["runtime.clear_error", (message) => handlers.clearRuntimeError(message)],
      ["config.update", (message) => handlers.updateConfig(message)],
      ["intervention.list", (message) => handlers.listInterventions(message)],
      ["intervention.resolve", (message) => handlers.resolveIntervention(message)],
      ["intervention.cancel", (message) => handlers.cancelIntervention(message)],
      ["skills.discover", (message) => handlers.discoverSkills(message)],
      ["skills.install", (message) => handlers.manageSkillLifecycle(message)],
      ["skills.enable", (message) => handlers.manageSkillLifecycle(message)],
      ["skills.disable", (message) => handlers.manageSkillLifecycle(message)],
      ["skills.uninstall", (message) => handlers.manageSkillLifecycle(message)],
      ["skills.rollback", (message) => handlers.manageSkillLifecycle(message)],
      ["hosts.list", (message) => handlers.listHosts(message)],
      ["hosts.get", (message) => handlers.getHost(message)],
      ["hosts.connect", (message) => handlers.connectHost(message)],
      ["hosts.disconnect", (message) => handlers.disconnectHost(message)],
      ["hosts.set_default", (message) => handlers.setDefaultHost(message)],
      ["hosts.health", (message) => handlers.hostHealth(message)],
    ],
  );

  return {
    routeKinds: [...routes.keys()],
    canRoute(kind: unknown) {
      return typeof kind === "string" && routes.has(kind);
    },
    route(message: unknown) {
      if (!isPlainObject(message) || typeof message.kind !== "string") {
        return undefined;
      }
      const handler = routes.get(message.kind);
      return handler?.(message);
    },
  };
}
