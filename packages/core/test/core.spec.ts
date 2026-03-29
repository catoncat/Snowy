import {
  BUILTIN_CAPABILITIES,
  BUILTIN_CATALOG,
  CapabilityRegistry,
  FamilyProviderRegistry,
  SkillInvocationService,
  createSkillRuntimeContext,
  getBuiltinsByNamespace,
  hasPublicNamespaceCoverage,
  typedCapabilities,
  typedCapabilitiesForPermissions,
  type BuiltinCapabilityMap
} from "@bbl-next/core";
import { BrowserVfs } from "../../browser-vfs/src/index";
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
    const registry = new CapabilityRegistry([
      descriptor(),
      descriptor({
        id: "skills.invoke",
        permissions: ["skills.invoke"],
        executionBinding: {
          family: "skills",
          operation: "invoke"
        }
      })
    ]);
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
      permissions: ["page.*", "skills.*"],
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
      traceId: ctx.traceId,
      capabilityId: "page.click",
      status: "succeeded",
      output: { ok: true, input: { uid: "u1" } }
    });
  });

  it("assigns a generated traceId to the runtime context and trace entries", async () => {
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

    expect(ctx.traceId).toMatch(/^trace-/);
    expect(ctx.trace[0]?.traceId).toBe(ctx.traceId);
  });

  it("reuses an explicit traceId for the runtime context and trace entries", async () => {
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
      permissions: ["page.*"],
      traceId: "trace-explicit"
    });

    await ctx.call("page.click", { uid: "u1" });

    expect(ctx.traceId).toBe("trace-explicit");
    expect(ctx.trace[0]?.traceId).toBe("trace-explicit");
  });

  describe("builtin catalog structure", () => {
    it("keeps memfs builtin surface aligned with the BrowserVfs public API", () => {
      const memfsOperations = BUILTIN_CATALOG.memfs
        .map((descriptor) => descriptor.id.replace("memfs.", ""))
        .sort();
      const browserVfsPublicMethods = Object.getOwnPropertyNames(BrowserVfs.prototype)
        .filter((name) => !name.startsWith("#") && name !== "constructor");

      expect(memfsOperations).toEqual(
        browserVfsPublicMethods
          .filter((name) =>
            [
              "read",
              "write",
              "edit",
              "stat",
              "list",
              "mkdir",
              "rm",
              "mv",
              "copy",
              "stage",
              "snapshot",
              "rehydrate"
            ].includes(name)
          )
          .sort()
      );
    });

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
      expect(memfs.length).toBe(12);
      expect(memfs.every((d) => d.id.startsWith("memfs."))).toBe(true);
      expect(memfs.map((d) => d.id)).toEqual(
        expect.arrayContaining(["memfs.edit", "memfs.stat", "memfs.stage"])
      );

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
        }),
        descriptor({
          id: "skills.invoke",
          permissions: ["skills.invoke"],
          executionBinding: { family: "skills", operation: "invoke" }
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
        traceId: result.traceId,
        capabilityId: "page.click",
        status: "succeeded"
      });
      expect(result.depth).toBe(1);
      expect(result.parentTraceId).toBeUndefined();
      expect(result.traceId).toMatch(/^trace-/);
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

    it("caps nested skill permissions to the caller grant set", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.parent",
        permissions: ["memfs.read", "skills.invoke"],
        handler: async (ctx) => ctx.skills.invoke("skill.child", "run", {})
      });
      service.register({
        id: "skill.child",
        permissions: ["memfs.read", "page.click"],
        handler: async (ctx) => ({
          permissions: ctx.permissions,
          canRead: typeof (ctx.capabilities.memfs as { read?: unknown } | undefined)?.read,
          canClick: typeof (ctx.capabilities.page as { click?: unknown } | undefined)?.click
        })
      });

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.parent",
        action: "run",
        args: {}
      });

      expect(result.result).toEqual({
        permissions: ["memfs.read"],
        canRead: "function",
        canClick: "undefined"
      });
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

    it("keeps child capability traces isolated while recording the parent skills.invoke call", async () => {
      const { service } = buildService();
      let childTraceId: string | undefined;
      let childParentTraceId: string | undefined;
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
          childTraceId = ctx.traceId;
          childParentTraceId = ctx.parentTraceId;
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

      expect(result.trace).toHaveLength(2);
      expect(result.trace[0]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "page.click",
        input: { uid: "p1" }
      });
      expect(result.trace[1]).toMatchObject({
        traceId: result.traceId,
        capabilityId: "skills.invoke",
        input: {
          skillId: "skill.child",
          action: "run",
          args: {}
        },
        childTraceId,
        output: "child done"
      });
      expect(childTraceId).toMatch(/^trace-/);
      expect(childTraceId).not.toBe(result.traceId);
      expect(childParentTraceId).toBe(result.traceId);
    });

    it("does not let a parent skill borrow a child skill's higher privilege", async () => {
      const { service } = buildService();
      service.register({
        id: "skill.parent",
        permissions: ["skills.invoke"],
        handler: async (ctx) => ctx.skills.invoke("skill.child", "run", {})
      });
      service.register({
        id: "skill.child",
        permissions: ["page.click"],
        handler: async (ctx) => ctx.call("page.click", { uid: "u1" })
      });

      await expect(
        service.invoke({
          sessionId: "s1",
          skillId: "skill.parent",
          action: "run",
          args: {}
        })
      ).rejects.toMatchObject({ code: "E_PERMISSION_DENIED" });
    });
  });

  describe("typedCapabilities", () => {
    it("returns typed accessors for known namespaces", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });
      providers.register({
        family: "page",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });

      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.test",
        permissions: ["*"]
      });

      const caps = typedCapabilities(ctx);

      // memfs namespace should have read, write, list, etc.
      expect(caps.memfs).toBeDefined();
      expect(typeof caps.memfs?.read).toBe("function");
      expect(typeof caps.memfs?.write).toBe("function");
      expect(typeof caps.memfs?.edit).toBe("function");
      expect(typeof caps.memfs?.stat).toBe("function");
      expect(typeof caps.memfs?.stage).toBe("function");

      // page namespace should have query, click, fill
      expect(caps.page).toBeDefined();
      expect(typeof caps.page?.click).toBe("function");

      // call through typed accessor should work
      const result = await caps.memfs!.read!({ uri: "mem://test" });
      expect(result).toEqual({ operation: "read", input: { uri: "mem://test" } });
    });

    it("reflects only permitted capabilities", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });

      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.limited",
        permissions: ["memfs.read"]
      });

      const caps = typedCapabilities(ctx);
      expect(caps.memfs).toBeDefined();
      expect(typeof caps.memfs?.read).toBe("function");
      // write is not permitted, so it won't be attached
      expect(caps.memfs?.write).toBeUndefined();
    });

    it("can narrow the facade using declared permissions", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });

      const permissions = ["memfs.read"] as const;
      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.narrowed",
        permissions: [...permissions]
      });

      const caps = typedCapabilitiesForPermissions(ctx, permissions);
      const read: BuiltinCapabilityMap["memfs"]["read"] = caps.memfs.read;
      const result = await read({ uri: "mem://narrowed" });

      expect(result).toEqual({
        operation: "read",
        input: { uri: "mem://narrowed" }
      });
    });

    it("narrowed memfs facade exposes edit/stat/stage when declared", async () => {
      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ operation: binding.operation, input })
      });

      const permissions = ["memfs.edit", "memfs.stat", "memfs.stage"] as const;
      const ctx = createSkillRuntimeContext({
        registry,
        providers,
        sessionId: "s1",
        skillId: "skill.memfs",
        permissions: [...permissions]
      });

      const caps = typedCapabilitiesForPermissions(ctx, permissions);
      const edit: BuiltinCapabilityMap["memfs"]["edit"] = caps.memfs.edit;
      const stat: BuiltinCapabilityMap["memfs"]["stat"] = caps.memfs.stat;
      const stage: BuiltinCapabilityMap["memfs"]["stage"] = caps.memfs.stage;

      await expect(edit({ uri: "mem://workspace/file.txt", patch: "next" })).resolves.toEqual({
        operation: "edit",
        input: { uri: "mem://workspace/file.txt", patch: "next" }
      });
      await expect(stat({ uri: "mem://workspace/file.txt" })).resolves.toEqual({
        operation: "stat",
        input: { uri: "mem://workspace/file.txt" }
      });
      await expect(
        stage({ entries: [{ uri: "mem://workspace/file.txt", content: "next" }] })
      ).resolves.toEqual({
        operation: "stage",
        input: { entries: [{ uri: "mem://workspace/file.txt", content: "next" }] }
      });
    });
  });
});
