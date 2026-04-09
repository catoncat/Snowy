export const SIDEPANEL_MANAGEMENT_RESOURCE_IDS = [
  "runtime.summary",
  "config.summary",
  "skills.summary",
  "hosts.summary",
] as const;

export const SIDEPANEL_MANAGEMENT_ACTION_KINDS = [
  "runtime.capture_diagnostics",
  "runtime.clear_error",
  "config.update",
  "skills.install",
  "skills.enable",
  "skills.disable",
  "skills.uninstall",
  "hosts.connect",
  "hosts.disconnect",
  "hosts.set_default",
] as const;

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
