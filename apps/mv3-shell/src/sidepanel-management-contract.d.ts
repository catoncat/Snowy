export const SIDEPANEL_MANAGEMENT_RESOURCE_IDS: readonly [
  "runtime.summary",
  "config.summary",
  "skills.summary",
  "hosts.summary",
];

export type SidepanelManagementResourceId = (typeof SIDEPANEL_MANAGEMENT_RESOURCE_IDS)[number];

export const SIDEPANEL_MANAGEMENT_ACTION_KINDS: readonly [
  "runtime.capture_diagnostics",
  "runtime.clear_error",
  "config.update",
  "intervention.resolve",
  "intervention.cancel",
  "skills.install",
  "skills.enable",
  "skills.disable",
  "skills.uninstall",
  "hosts.connect",
  "hosts.disconnect",
  "hosts.set_default",
];

export type SidepanelManagementActionKind = (typeof SIDEPANEL_MANAGEMENT_ACTION_KINDS)[number];

export function isSidepanelManagementResourceId(
  value: unknown,
): value is SidepanelManagementResourceId;

export function isSidepanelManagementActionKind(
  value: unknown,
): value is SidepanelManagementActionKind;
