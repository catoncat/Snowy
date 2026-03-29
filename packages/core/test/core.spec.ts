import {
  BUILTIN_CAPABILITIES,
  BUILTIN_CATALOG,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createSkillRuntimeContext,
  getBuiltinsByNamespace,
  hasPublicNamespaceCoverage
} from "@bbl-next/core";
import {
  assertCapabilityDescriptor,
  CapabilityError,
  capabilityNamespace,
  MAX_SKILL_CALL_DEPTH,
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

  describe("SkillInvocationService", () => {
    function buildService() {
      const registry = new CapabilityRegistry([
        descriptor(),
        descriptor({
          id: "memfs.read",
          risk: "low",
          sideEffects: "reads",
          permissions: ["memfs.read"],
          executionBinding: { family: "memfs", operation: "read" }
        })
      ]);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "page",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });
      providers.register({
        family: "memfs",
        invoke: ({ input }) => ({ content: "hello", input })
      });
      const service = new SkillInvocationService({ registry, providers });
      return { registry, providers, service };
    }

    it("invokes a registered skill and returns result with trace", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.greet",
        permissions: ["page.*"],
        handler: async (ctx, action, args) => {
          const clicked = await ctx.call("page.click", { uid: "btn1" });
          return { action, args, clicked };
        }
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.greet",
        action: "run",
        args: { name: "world" }
      });

      expect(result.result).toMatchObject({
        action: "run",
        args: { name: "world" },
        clicked: { operation: "click", input: { uid: "btn1" } }
      });
      expect(result.trace).toHaveLength(1);
      expect(result.trace[0]).toMatchObject({
        capabilityId: "page.click",
        status: "succeeded"
      });
      expect(result.depth).toBe(1);
    });

    it("throws on unknown skill", async () => {
      const { service } = buildService();

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.nonexistent",
          action: "run",
          args: {}
        })
      ).rejects.toMatchObject({ code: "E_CAPABILITY_NOT_FOUND" });
    });

    it("enforces skill permission isolation", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.readonly",
        permissions: ["memfs.read"],
        handler: async (ctx) => {
          await ctx.call("page.click", { uid: "u1" });
          return "should not reach";
        }
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.readonly",
          action: "run",
          args: {}
        })
      ).rejects.toMatchObject({ code: "E_PERMISSION_DENIED" });
    });

    it("supports nested skill invocation with depth tracking", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.outer",
        permissions: ["page.*", "skills.*"],
        handler: async (ctx) => {
          const inner = await ctx.skills.invoke("skill.inner", "run", {});
          return { inner };
        }
      });
      service.register({
        id: "skill.inner",
        permissions: ["page.*"],
        handler: async (ctx, action) => {
          return { action, depth: ctx.depth };
        }
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.outer",
        action: "run",
        args: {}
      });

      expect(result.result).toMatchObject({
        inner: { action: "run", depth: 2 }
      });
      expect(result.depth).toBe(1);
    });

    it("blocks skill invocation beyond MAX_SKILL_CALL_DEPTH", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.recursive",
        permissions: ["skills.*"],
        handler: async (ctx) => {
          return ctx.skills.invoke("skill.recursive", "run", {});
        }
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.recursive",
          action: "run",
          args: {}
        })
      ).rejects.toMatchObject({ code: "E_REENTRANCY_BLOCKED" });
    });

    it("registers, gets, and lists skills", () => {
      const { service } = buildService();
      service.register({
        id: "skill.a",
        permissions: [],
        handler: async () => null
      });
      service.register({
        id: "skill.b",
        permissions: [],
        handler: async () => null
      });

      expect(service.get("skill.a")).toBeDefined();
      expect(service.get("skill.a")!.id).toBe("skill.a");
      expect(service.get("skill.nonexistent")).toBeUndefined();
      expect(service.list()).toHaveLength(2);
    });

    it("each skill invocation gets its own isolated trace", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.parent",
        permissions: ["page.*", "skills.*"],
        handler: async (ctx) => {
          await ctx.call("page.click", { uid: "p1" });
          await ctx.skills.invoke("skill.child", "run", {});
          return "done";
        }
      });
      service.register({
        id: "skill.child",
        permissions: ["page.*"],
        handler: async (ctx) => {
          await ctx.call("page.click", { uid: "c1" });
          return "child done";
        }
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.parent",
        action: "run",
        args: {}
      });

      expect(result.trace).toHaveLength(1);
      expect(result.trace[0]).toMatchObject({
        capabilityId: "page.click",
        input: { uid: "p1" }
      });
    });
  });
});
