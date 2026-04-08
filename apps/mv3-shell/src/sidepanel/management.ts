import type {
  ConfigSummaryResource,
  HostsSummaryResource,
  RuntimeSummaryResource,
  SkillsSummaryResource,
} from "@bbl-next/contracts";

import {
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  isSidepanelManagementActionKind,
} from "../sidepanel-management-contract.js";

export {
  SIDEPANEL_MANAGEMENT_ACTION_KINDS,
  SIDEPANEL_MANAGEMENT_RESOURCE_IDS,
  isSidepanelManagementActionKind,
} from "../sidepanel-management-contract.js";

type ManagementResourceDocument =
  | RuntimeSummaryResource
  | ConfigSummaryResource
  | SkillsSummaryResource
  | HostsSummaryResource;

type RuntimeDiagnosticsAction = {
  kind: "runtime.capture_diagnostics";
  world?: "main" | "content";
  tabId?: number;
};

type RuntimeClearErrorAction = {
  kind: "runtime.clear_error";
};

type ConfigUpdateAction = {
  kind: "config.update";
  patch: Record<string, unknown>;
};

type SkillAction = {
  kind: "skills.install" | "skills.enable" | "skills.disable" | "skills.uninstall";
  skillId: string;
};

type HostAction = {
  kind: "hosts.connect" | "hosts.disconnect" | "hosts.set_default";
  hostId: string;
};

export type ManagementActionMessage =
  | RuntimeDiagnosticsAction
  | RuntimeClearErrorAction
  | ConfigUpdateAction
  | SkillAction
  | HostAction;

export interface ManagementState {
  runtime: RuntimeSummaryResource | null;
  config: ConfigSummaryResource | null;
  skills: SkillsSummaryResource | null;
  hosts: HostsSummaryResource | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }
  return value.trim();
}

export function createInitialManagementState(): ManagementState {
  return {
    runtime: null,
    config: null,
    skills: null,
    hosts: null,
  };
}

export function buildManagementBootstrapRequests(world: "main" | "content" = "main") {
  return SIDEPANEL_MANAGEMENT_RESOURCE_IDS.map((resourceId) => ({
    kind: "resource.read" as const,
    resourceId,
    world,
  }));
}

export function applyManagementResourceDocument(
  state: ManagementState,
  resource: ManagementResourceDocument,
): ManagementState {
  switch (resource.id) {
    case "runtime.summary":
      return { ...state, runtime: resource };
    case "config.summary":
      return { ...state, config: resource };
    case "skills.summary":
      return { ...state, skills: resource };
    case "hosts.summary":
      return { ...state, hosts: resource };
    default:
      return state;
  }
}

export function createManagementActionMessage(
  kind: string,
  payload: Record<string, unknown> = {},
): ManagementActionMessage {
  if (!isSidepanelManagementActionKind(kind)) {
    throw new Error(`Unsupported management action: ${kind}`);
  }

  switch (kind) {
    case "runtime.capture_diagnostics":
      return {
        kind,
        ...(payload.world === "content"
          ? { world: "content" as const }
          : { world: "main" as const }),
        ...(typeof payload.tabId === "number" ? { tabId: payload.tabId } : {}),
      };
    case "runtime.clear_error":
      return { kind };
    case "config.update": {
      const patch = isPlainObject(payload.patch) ? payload.patch : {};
      return {
        kind,
        patch,
      };
    }
    case "skills.install":
    case "skills.enable":
    case "skills.disable":
    case "skills.uninstall":
      return {
        kind,
        skillId: requireNonEmptyString(payload.skillId, `${kind} requires skillId`),
      };
    case "hosts.connect":
    case "hosts.disconnect":
    case "hosts.set_default":
      return {
        kind,
        hostId: requireNonEmptyString(payload.hostId, `${kind} requires hostId`),
      };
    default:
      throw new Error(`Unsupported management action: ${kind}`);
  }
}
