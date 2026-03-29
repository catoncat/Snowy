export type JsonSchema = Record<string, unknown>;

export type CapabilityRisk = "low" | "medium" | "high";
export type CapabilitySideEffects = "none" | "reads" | "writes" | "external";
export type SkillStatus =
  | "draft"
  | "staged"
  | "installed"
  | "enabled"
  | "disabled"
  | "archived";

export type CapabilityErrorCode =
  | "E_BAD_INPUT"
  | "E_CAPABILITY_NOT_FOUND"
  | "E_PERMISSION_DENIED"
  | "E_REENTRANCY_BLOCKED"
  | "E_RUNTIME"
  | "E_TIMEOUT"
  | "E_VERIFY_FAILED"
  | "E_VFS_QUOTA_EXCEEDED";

export interface ExecutionBinding {
  family: string;
  operation: string;
  adapter?: string;
  options?: Record<string, unknown>;
}

export interface CapabilityDescriptor {
  id: string;
  version: number;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  risk: CapabilityRisk;
  sideEffects: CapabilitySideEffects;
  permissions: string[];
  supportsVerify: boolean;
  supportsStreaming: boolean;
  exportable: boolean;
  exportName?: string;
  exportRisk?: CapabilityRisk;
  executionBinding: ExecutionBinding;
}

export interface ToolContract {
  name: string;
  capabilityId: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    risk: CapabilityRisk;
    sideEffects: CapabilitySideEffects;
    supportsVerify: boolean;
    supportsStreaming: boolean;
  };
}

export interface SkillLifecycleState {
  status: SkillStatus;
  trusted: boolean;
}

export interface CapabilityTraceEntry {
  traceId?: string;
  parentTraceId?: string;
  childTraceId?: string;
  capabilityId: string;
  startedAt: string;
  endedAt?: string;
  status: "started" | "succeeded" | "failed";
  input: unknown;
  output?: unknown;
  errorCode?: CapabilityErrorCode;
}

export const MAX_SKILL_CALL_DEPTH = 3;

export const PUBLIC_CAPABILITY_NAMESPACES = [
  "memfs",
  "page",
  "site",
  "tabs",
  "runner",
  "skills",
  "runtime",
  "host"
] as const;

export type CapabilityNamespace = (typeof PUBLIC_CAPABILITY_NAMESPACES)[number];

const CAPABILITY_NAMESPACE_SET = new Set<string>(PUBLIC_CAPABILITY_NAMESPACES);

const CAPABILITY_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const SKILL_STATUS_TRANSITIONS: Record<SkillStatus, SkillStatus[]> = {
  draft: ["staged", "archived"],
  staged: ["installed", "archived"],
  installed: ["enabled", "archived"],
  enabled: ["disabled", "archived"],
  disabled: ["enabled", "archived"],
  archived: []
};

export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;
  readonly details?: unknown;

  constructor(code: CapabilityErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CapabilityError";
    this.code = code;
    this.details = details;
  }
}

export function capabilityNamespace(capabilityId: string): string {
  return capabilityId.split(".")[0];
}

export function isPublicCapabilityNamespace(namespace: string): boolean {
  return CAPABILITY_NAMESPACE_SET.has(namespace);
}

function assertJsonSchemaHasType(schema: JsonSchema, label: string): void {
  if (!schema.type && !schema.$ref && !schema.oneOf && !schema.anyOf && !schema.allOf) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      `${label} must declare a type, $ref, or combinator`
    );
  }
}

export function assertCapabilityDescriptor(
  value: CapabilityDescriptor
): CapabilityDescriptor {
  if (!CAPABILITY_ID_RE.test(value.id)) {
    throw new CapabilityError("E_BAD_INPUT", `Invalid capability id: ${value.id}`);
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    throw new CapabilityError("E_BAD_INPUT", "Descriptor version must be >= 1");
  }
  if (!value.description.trim()) {
    throw new CapabilityError("E_BAD_INPUT", "Descriptor description is required");
  }
  if (!value.executionBinding.family.trim() || !value.executionBinding.operation.trim()) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "Descriptor executionBinding family and operation are required"
    );
  }
  assertJsonSchemaHasType(value.inputSchema, "inputSchema");
  assertJsonSchemaHasType(value.outputSchema, "outputSchema");
  return value;
}

export function capabilityIdToToolName(capabilityId: string): string {
  return capabilityId.replace(/\./g, "_");
}

export function descriptorToToolContract(
  descriptor: CapabilityDescriptor
): ToolContract {
  assertCapabilityDescriptor(descriptor);
  return {
    name: capabilityIdToToolName(descriptor.id),
    capabilityId: descriptor.id,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    annotations: {
      risk: descriptor.risk,
      sideEffects: descriptor.sideEffects,
      supportsVerify: descriptor.supportsVerify,
      supportsStreaming: descriptor.supportsStreaming
    }
  };
}

export function canTransitionSkillState(
  from: SkillStatus,
  to: SkillStatus
): boolean {
  return SKILL_STATUS_TRANSITIONS[from].includes(to);
}

export function transitionSkillState(
  current: SkillLifecycleState,
  nextStatus: SkillStatus
): SkillLifecycleState {
  if (!canTransitionSkillState(current.status, nextStatus)) {
    throw new CapabilityError(
      "E_BAD_INPUT",
      `Illegal skill transition: ${current.status} -> ${nextStatus}`
    );
  }
  return {
    status: nextStatus,
    trusted: nextStatus === "enabled" ? current.trusted : false
  };
}

export function grantSkillTrusted(
  current: SkillLifecycleState
): SkillLifecycleState {
  if (current.status !== "enabled") {
    throw new CapabilityError(
      "E_BAD_INPUT",
      "Trusted flag can only be granted while enabled"
    );
  }
  return {
    ...current,
    trusted: true
  };
}

export function revokeSkillTrusted(
  current: SkillLifecycleState
): SkillLifecycleState {
  return {
    ...current,
    trusted: false
  };
}
