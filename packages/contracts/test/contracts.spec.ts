import {
  AI_SURFACE_BOUNDARY,
  AI_SURFACE_PRIMITIVES,
  BOOTSTRAP_RESOURCE_KEYS,
  HOST_CONTROL_PLANE_ACTIONS,
  HOST_SUBSTRATE_ACTIONS,
  assertCapabilityDescriptor,
  allowedActorsForSkillTransition,
  canActorGrantSkillTrusted,
  canActorTransitionSkillState,
  canTransitionSkillState,
  capabilityNamespace,
  createSkillLifecycleVersionSurface,
  descriptorToToolContract,
  DEFAULT_SKILL_VERSION_RETENTION,
  grantSkillTrusted,
  isPublicCapabilityNamespace,
  PUBLIC_CAPABILITY_NAMESPACES,
  selectLatestTrustedSkillVersion,
  skillVersionRootUri,
  skillVersionUri,
  transitionSkillState,
  type CapabilityTraceEntry,
  type CapabilityDescriptor
} from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

function buildDescriptor(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    id: "page.click",
    version: 1,
    description: "Click an element on the page",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "medium",
    sideEffects: "writes",
    permissions: ["page.*"],
    supportsVerify: true,
    supportsStreaming: false,
    exportable: false,
    executionBinding: {
      family: "page",
      operation: "click"
    },
    ...overrides
  };
}

describe("contracts", () => {
  it("accepts a valid capability descriptor", () => {
    const descriptor = buildDescriptor();

    expect(assertCapabilityDescriptor(descriptor)).toEqual(descriptor);
  });

  it("rejects invalid capability ids", () => {
    expect(() =>
      assertCapabilityDescriptor(buildDescriptor({ id: "page-click" }))
    ).toThrow("Invalid capability id");
  });

  it("projects a tool contract from a descriptor", () => {
    const tool = descriptorToToolContract(buildDescriptor());

    expect(tool).toMatchObject({
      name: "page_click",
      capabilityId: "page.click",
      annotations: {
        risk: "medium",
        sideEffects: "writes",
        supportsVerify: true,
        supportsStreaming: false
      }
    });
  });

  it("locks CapabilityDescriptor and ToolContract to the action primitive", () => {
    expect(AI_SURFACE_PRIMITIVES).toEqual(["action", "resource", "workflow"]);
    expect(BOOTSTRAP_RESOURCE_KEYS).toEqual(["runtime", "config", "skills", "hosts"]);
    expect(AI_SURFACE_BOUNDARY).toEqual({
      actions: {
        primitive: "action",
        descriptorModel: "CapabilityDescriptor",
        toolProjection: "ToolContract"
      },
      bootstrapResources: ["runtime", "config", "skills", "hosts"],
      workflows: {
        primitive: "workflow",
        packaging: "skill-package",
        invocation: "skills.invoke"
      }
    });
  });

  it("locks the minimal execution host control plane action set", () => {
    expect(HOST_CONTROL_PLANE_ACTIONS).toEqual([
      "hosts.list",
      "hosts.get",
      "hosts.connect",
      "hosts.disconnect",
      "hosts.set_default",
      "hosts.health"
    ]);
  });

  it("locks the minimal execution host substrate action set", () => {
    expect(HOST_SUBSTRATE_ACTIONS).toEqual([
      "host.read",
      "host.write",
      "host.edit",
      "host.exec"
    ]);
  });

  it("enforces the lifecycle state machine", () => {
    expect(canTransitionSkillState("draft", "staged")).toBe(true);
    expect(canTransitionSkillState("draft", "enabled")).toBe(false);

    expect(
      transitionSkillState({ status: "installed", trusted: false }, "enabled")
    ).toEqual({ status: "enabled", trusted: false });
  });

  it("keeps trusted as an enabled-only flag", () => {
    const trusted = grantSkillTrusted({ status: "enabled", trusted: false });

    expect(trusted).toEqual({ status: "enabled", trusted: true });
    expect(() => grantSkillTrusted({ status: "installed", trusted: false })).toThrow(
      "Trusted flag can only be granted while enabled"
    );
  });

  it("rejects descriptors whose inputSchema lacks a type declaration", () => {
    expect(() =>
      assertCapabilityDescriptor(buildDescriptor({ inputSchema: {} }))
    ).toThrow("inputSchema must declare a type");
  });

  it("rejects descriptors whose outputSchema lacks a type declaration", () => {
    expect(() =>
      assertCapabilityDescriptor(buildDescriptor({ outputSchema: {} }))
    ).toThrow("outputSchema must declare a type");
  });

  it("accepts schemas using $ref or combinators instead of type", () => {
    expect(() =>
      assertCapabilityDescriptor(
        buildDescriptor({ inputSchema: { $ref: "#/definitions/Foo" } })
      )
    ).not.toThrow();
    expect(() =>
      assertCapabilityDescriptor(
        buildDescriptor({ outputSchema: { oneOf: [{ type: "string" }, { type: "number" }] } })
      )
    ).not.toThrow();
  });

  it("extracts the namespace from a capability id", () => {
    expect(capabilityNamespace("page.click")).toBe("page");
    expect(capabilityNamespace("memfs.read")).toBe("memfs");
    expect(capabilityNamespace("runtime.list_capabilities")).toBe("runtime");
  });

  it("validates public namespace membership", () => {
    expect(isPublicCapabilityNamespace("memfs")).toBe(true);
    expect(isPublicCapabilityNamespace("page")).toBe(true);
    expect(isPublicCapabilityNamespace("unknown")).toBe(false);
  });

  it("exports all expected public namespaces", () => {
    expect(PUBLIC_CAPABILITY_NAMESPACES).toEqual([
      "memfs", "page", "site", "tabs", "runner", "skills", "runtime", "host", "hosts"
    ]);
  });

  it("allows trace entries to link parent and child skill invocations", () => {
    const entry: CapabilityTraceEntry = {
      traceId: "trace-root",
      parentTraceId: "trace-parent",
      childTraceId: "trace-child",
      capabilityId: "skills.invoke",
      startedAt: "2026-03-29T00:00:00.000Z",
      status: "started",
      input: {
        skillId: "skill.child",
        action: "run"
      }
    };

    expect(entry.traceId).toBe("trace-root");
    expect(entry.parentTraceId).toBe("trace-parent");
    expect(entry.childTraceId).toBe("trace-child");
  });

  it("limits lifecycle transitions by actor according to the engine boundary", () => {
    expect(allowedActorsForSkillTransition("draft", "staged")).toEqual(["agent"]);
    expect(canActorTransitionSkillState("agent", "draft", "staged")).toBe(true);
    expect(canActorTransitionSkillState("user", "draft", "staged")).toBe(false);

    expect(canActorTransitionSkillState("user", "installed", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("system", "installed", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("agent", "installed", "enabled")).toBe(false);

    expect(canActorTransitionSkillState("user", "enabled", "disabled")).toBe(true);
    expect(canActorTransitionSkillState("system", "disabled", "enabled")).toBe(true);
    expect(canActorTransitionSkillState("agent", "enabled", "archived")).toBe(false);
    expect(canActorTransitionSkillState("system", "enabled", "archived")).toBe(true);

    expect(canActorGrantSkillTrusted("user")).toBe(true);
    expect(canActorGrantSkillTrusted("system")).toBe(false);
  });

  it("builds a lifecycle/version surface with canonical version policy and latest trusted rollback", () => {
    const trustedVersion = {
      versionId: "2026-03-29T00:00:00.000Z",
      uri: skillVersionUri("twitter", "2026-03-29T00:00:00.000Z"),
      createdAt: "2026-03-29T00:00:00.000Z",
      trusted: true
    };
    const untrustedVersion = {
      versionId: "2026-03-29T00:01:00.000Z",
      uri: skillVersionUri("twitter", "2026-03-29T00:01:00.000Z"),
      createdAt: "2026-03-29T00:01:00.000Z",
      trusted: false
    };

    expect(selectLatestTrustedSkillVersion([untrustedVersion, trustedVersion])).toEqual(
      trustedVersion
    );

    const surface = createSkillLifecycleVersionSurface({
      skillId: "twitter",
      lifecycle: { status: "enabled", trusted: true },
      activeVersion: untrustedVersion,
      versions: [untrustedVersion, trustedVersion]
    });

    expect(surface).toEqual({
      skillId: "twitter",
      lifecycle: { status: "enabled", trusted: true },
      activeVersion: untrustedVersion,
      rollbackTarget: trustedVersion,
      policy: {
        snapshotRootUri: skillVersionRootUri("twitter"),
        versionFormat: "iso-timestamp",
        retention: DEFAULT_SKILL_VERSION_RETENTION,
        rollbackTarget: "latest_trusted",
        rollbackTriggers: [
          "verifier_failed_with_confirmation",
          "release_gate_failed"
        ]
      }
    });
  });
});
