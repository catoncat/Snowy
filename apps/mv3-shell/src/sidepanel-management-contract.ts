import type {
  AiSurfaceResourceId,
  ConfigControlPlaneAction,
  HostControlPlaneAction,
  InterventionControlPlaneAction,
  RuntimeControlPlaneAction,
  SkillControlPlaneAction,
} from "@bbl-next/contracts";

type SidepanelManagementControlPlaneAction =
  | ConfigControlPlaneAction
  | HostControlPlaneAction
  | Extract<InterventionControlPlaneAction, "intervention.resolve" | "intervention.cancel">
  | RuntimeControlPlaneAction
  | SkillControlPlaneAction;

export const SIDEPANEL_MANAGEMENT_RESOURCE_IDS = [
  "runtime.summary",
  "runtime.history",
  "audit.tail",
  "observability.replay",
  "config.summary",
  "skills.summary",
  "hosts.summary",
] as const satisfies readonly AiSurfaceResourceId[];

export const SIDEPANEL_MANAGEMENT_ACTION_KINDS = [
  "runtime.capture_diagnostics",
  "runtime.clear_error",
  "config.update",
  "intervention.resolve",
  "intervention.cancel",
  "skills.discover",
  "skills.install",
  "skills.enable",
  "skills.disable",
  "skills.uninstall",
  "skills.rollback",
  "hosts.connect",
  "hosts.disconnect",
  "hosts.set_default",
] as const satisfies readonly SidepanelManagementControlPlaneAction[];

export type SidepanelManagementResourceId = (typeof SIDEPANEL_MANAGEMENT_RESOURCE_IDS)[number];
export type SidepanelManagementActionKind = (typeof SIDEPANEL_MANAGEMENT_ACTION_KINDS)[number];

const SIDEPANEL_MANAGEMENT_RESOURCE_ID_SET = new Set(SIDEPANEL_MANAGEMENT_RESOURCE_IDS);
const SIDEPANEL_MANAGEMENT_ACTION_KIND_SET = new Set(SIDEPANEL_MANAGEMENT_ACTION_KINDS);

export function isSidepanelManagementResourceId(
  value: string,
): value is SidepanelManagementResourceId {
  return SIDEPANEL_MANAGEMENT_RESOURCE_ID_SET.has(value as SidepanelManagementResourceId);
}

export function isSidepanelManagementActionKind(
  value: string,
): value is SidepanelManagementActionKind {
  return SIDEPANEL_MANAGEMENT_ACTION_KIND_SET.has(value as SidepanelManagementActionKind);
}
