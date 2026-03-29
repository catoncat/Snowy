import {
  BUILTIN_CAPABILITIES,
  BUILTIN_CATALOG,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createSkillRuntimeContext,
  getBuiltinsByNamespace,
  hasPublicNamespaceCoverage
} from "@bbl-next/core";
import {
  assertCapabilityDescriptor,
  CapabilityError,
  capabilityNamespace,
  PUBLIC_CAPABILITY_NAMESPACES,
  type CapabilityDescriptor
} from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

function descriptor(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    id: "page.click",
    version: 1,
    description: "Click",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "medium",
    sideEffects: "writes",
    permissions: ["page.click"],
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

describe("core", () => {
  it("covers every public capability namespace in the builtin catalog", () => {
    expect(hasPublicNamespaceCoverage(BUILTIN_CAPABILITIES)).toBe(true);
  });

  it("projects tools from the registry", () => {
    const registry = new CapabilityRegistry([descriptor()]);

    expect(registry.projectTools()).toMatchObject([
      {
        name: "page_click",
        capabilityId: "page.click"
      }
    ]);
  });

  it("dispatches by family provider", async () => {
    const registry = new CapabilityRegistry([
      descriptor(),
      descriptor({
        id: "page.query",
        sideEffects: "reads",
        permissions: ["page.query"],
        executionBinding: {
          family: "page",
          operation: "query"
        }
      })
    ]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ binding, input }) => ({ operation: binding.operation, input })
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"]
    });

    await expect(ctx.call("page.click", { uid: "u1" })).resolves.toEqual({
      operation: "click",
      input: { uid: "u1" }
    });
    await expect(
      (ctx.capabilities.page as { query(input: unknown): Promise<unknown> }).query({
        text: "Search"
      })
    ).resolves.toEqual({
      operation: "query",
      input: { text: "Search" }
    });
  });

  it("blocks capabilities outside the declared permission set", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: () => "ok"
    });
    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.query"]
    });

    await expect(ctx.call("page.click", { uid: "u1" })).rejects.toMatchObject({
      code: "E_PERMISSION_DENIED"
    });
  });

  it("blocks reentrancy deeper than the configured depth limit", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: () => "ok"
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"],
      depth: 3,
      invokeSkill: async () => "never"
    });

    await expect(ctx.skills.invoke("skill.child", "run", {})).rejects.toBeInstanceOf(
      CapabilityError
    );
    await expect(ctx.skills.invoke("skill.child", "run", {})).rejects.toMatchObject({
      code: "E_REENTRANCY_BLOCKED"
    });
  });

  it("records trace entries for capability calls", async () => {
    const registry = new CapabilityRegistry([descriptor()]);
    const providers = new FamilyProviderRegistry();
    providers.register({
      family: "page",
      invoke: ({ input }) => ({ ok: true, input })
    });

    const ctx = createSkillRuntimeContext({
      registry,
      providers,
      sessionId: "s1",
      skillId: "skill.page",
      permissions: ["page.*"]
    });

    await ctx.call("page.click", { uid: "u1" });

    expect(ctx.trace).toHaveLength(1);
    expect(ctx.trace[0]).toMatchObject({
      capabilityId: "page.click",
      status: "succeeded",
      output: { ok: true, input: { uid: "u1" } }
    });
  });

  describe("builtin catalog structure", () => {
    it("has an entry for every public namespace", () => {
      for (const ns of PUBLIC_CAPABILITY_NAMESPACES) {
        expect(BUILTIN_CATALOG[ns], `missing namespace: ${ns}`).toBeDefined();
        expect(BUILTIN_CATALOG[ns].length, `empty namespace: ${ns}`).toBeGreaterThan(0);
      }
    });

    it("every builtin passes assertCapabilityDescriptor", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        expect(() => assertCapabilityDescriptor(d)).not.toThrow();
      }
    });

    it("every builtin id starts with its catalog namespace key", () => {
      for (const [ns, descriptors] of Object.entries(BUILTIN_CATALOG)) {
        for (const d of descriptors) {
          expect(capabilityNamespace(d.id)).toBe(ns);
        }
      }
    });

    it("has no duplicate capability ids", () => {
      const ids = BUILTIN_CAPABILITIES.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every builtin has an inputSchema with a type declaration", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        expect(
          d.inputSchema.type || d.inputSchema.$ref || d.inputSchema.oneOf,
          `${d.id} inputSchema missing type`
        ).toBeTruthy();
      }
    });

    it("read-only capabilities are exportable", () => {
      for (const d of BUILTIN_CAPABILITIES) {
        if (d.sideEffects === "reads" || d.sideEffects === "none") {
          expect(d.exportable, `${d.id} should be exportable`).toBe(true);
        }
      }
    });

    it("getBuiltinsByNamespace returns correct descriptors", () => {
      const memfs = getBuiltinsByNamespace("memfs");
      expect(memfs.length).toBe(9);
      expect(memfs.every((d) => d.id.startsWith("memfs."))).toBe(true);

      expect(getBuiltinsByNamespace("nonexistent")).toEqual([]);
    });

    it("BUILTIN_CAPABILITIES is derived from BUILTIN_CATALOG", () => {
      const fromCatalog = Object.values(BUILTIN_CATALOG).flat();
      expect(BUILTIN_CAPABILITIES).toEqual(fromCatalog);
    });
  });
});
