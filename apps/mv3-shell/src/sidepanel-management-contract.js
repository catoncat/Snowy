const SIDEPANEL_MANAGEMENT_RESOURCE_IDS_VALUE = [
  "runtime.summary",
  "config.summary",
  "skills.summary",
  "hosts.summary",
];

const SIDEPANEL_MANAGEMENT_ACTION_KINDS_VALUE = [
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
];

export const SIDEPANEL_MANAGEMENT_RESOURCE_IDS = Object.freeze([
  ...SIDEPANEL_MANAGEMENT_RESOURCE_IDS_VALUE,
]);

export const SIDEPANEL_MANAGEMENT_ACTION_KINDS = Object.freeze([
  ...SIDEPANEL_MANAGEMENT_ACTION_KINDS_VALUE,
]);

const SIDEPANEL_MANAGEMENT_RESOURCE_ID_SET = new Set(SIDEPANEL_MANAGEMENT_RESOURCE_IDS);
const SIDEPANEL_MANAGEMENT_ACTION_KIND_SET = new Set(SIDEPANEL_MANAGEMENT_ACTION_KINDS);

export function isSidepanelManagementResourceId(value) {
  return typeof value === "string" && SIDEPANEL_MANAGEMENT_RESOURCE_ID_SET.has(value);
}

export function isSidepanelManagementActionKind(value) {
  return typeof value === "string" && SIDEPANEL_MANAGEMENT_ACTION_KIND_SET.has(value);
}
