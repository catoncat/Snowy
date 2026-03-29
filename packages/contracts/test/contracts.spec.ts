import {
  assertCapabilityDescriptor,
  canTransitionSkillState,
  capabilityNamespace,
  descriptorToToolContract,
  grantSkillTrusted,
  isPublicCapabilityNamespace,
  PUBLIC_CAPABILITY_NAMESPACES,
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
      "memfs", "page", "site", "tabs", "runner", "skills", "runtime", "host"
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
});
