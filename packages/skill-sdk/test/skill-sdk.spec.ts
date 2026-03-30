import {
  SKILL_SETUP_PHASES,
  type SkillDeclaration,
  defineSkill,
  runSkillSetupHooks,
} from "@bbl-next/skill-sdk";
import { describe, expect, it } from "vitest";

describe("skill-sdk", () => {
  describe("defineSkill", () => {
    const validDeclaration: SkillDeclaration = {
      id: "skill.test",
      permissions: ["memfs.*"],
      handler: async (_ctx, _action, _args) => ({ ok: true }),
    };

    it("returns a valid SkillDefinition from a declaration", () => {
      const skill = defineSkill(validDeclaration);
      expect(skill).toMatchObject({
        id: "skill.test",
        permissions: ["memfs.*"],
      });
      expect(skill.handler).not.toBe(validDeclaration.handler);
    });

    it("throws on empty id", () => {
      expect(() => defineSkill({ ...validDeclaration, id: "" })).toThrow(
        "id must be a non-empty string",
      );
    });

    it("throws on non-array permissions", () => {
      expect(() =>
        defineSkill({ ...validDeclaration, permissions: "memfs.*" as unknown as string[] }),
      ).toThrow("permissions must be an array");
    });

    it("throws on non-function handler", () => {
      expect(() =>
        defineSkill({
          ...validDeclaration,
          handler: "not a function" as unknown as SkillDeclaration["handler"],
        }),
      ).toThrow("handler must be a function");
    });

    it("locks setup hooks to the install phase only", () => {
      expect(SKILL_SETUP_PHASES).toEqual(["install"]);
    });

    it("normalizes install setup hooks into executable metadata", () => {
      const hook = async () => {};
      const skill = defineSkill({
        ...validDeclaration,
        setup: {
          install: hook,
        },
      });

      expect(skill.setupHooks.install).toEqual([hook]);
    });

    it("rejects unsupported setup phases", () => {
      expect(() =>
        defineSkill({
          ...validDeclaration,
          setup: {
            enable: async () => {},
          } as unknown as SkillDeclaration["setup"],
        }),
      ).toThrow("unsupported setup phase enable");
    });

    it("rejects non-function setup hooks", () => {
      expect(() =>
        defineSkill({
          ...validDeclaration,
          setup: {
            install: "nope" as unknown as never,
          },
        }),
      ).toThrow("setup hooks for install must be functions");
    });

    it("produced skill can be registered in SkillInvocationService", async () => {
      const {
        SkillInvocationService,
        CapabilityRegistry,
        FamilyProviderRegistry,
        BUILTIN_CAPABILITIES,
      } = await import("@bbl-next/core");

      const skill = defineSkill({
        id: "skill.echo",
        permissions: ["memfs.*"],
        handler: async (_ctx, action, args) => ({ action, args }),
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.echo",
        action: "ping",
        args: { msg: "hello" },
      });

      expect(result.result).toEqual({ action: "ping", args: { msg: "hello" } });
    });

    it("gives the handler a typed capability facade by default", async () => {
      const {
        SkillInvocationService,
        CapabilityRegistry,
        FamilyProviderRegistry,
        BUILTIN_CAPABILITIES,
      } = await import("@bbl-next/core");

      const skill = defineSkill({
        id: "skill.read",
        permissions: ["memfs.read", "site.fetch_with_session"],
        handler: async (ctx) => {
          const read: (input: unknown) => Promise<unknown> = ctx.capabilities.memfs.read;
          const fetchWithSession: (input: unknown) => Promise<unknown> =
            ctx.capabilities.site.fetchWithSession;

          const file = await read({ uri: "mem://library/skills/demo/SKILL.md" });
          const siteResult = await fetchWithSession({
            url: "https://example.com/api/me",
          });
          return { file, siteResult };
        },
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({
          family: binding.family,
          operation: binding.operation,
          input,
        }),
      });
      providers.register({
        family: "site",
        invoke: ({ binding, input }) => ({
          family: binding.family,
          operation: binding.operation,
          input,
        }),
      });
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.read",
        action: "run",
        args: {},
      });

      expect(result.result).toEqual({
        file: {
          family: "memfs",
          operation: "read",
          input: { uri: "mem://library/skills/demo/SKILL.md" },
        },
        siteResult: {
          family: "site",
          operation: "fetch_with_session",
          input: { url: "https://example.com/api/me" },
        },
      });
    });

    it("exposes memfs edit/stat/stage through the typed facade", async () => {
      const {
        SkillInvocationService,
        CapabilityRegistry,
        FamilyProviderRegistry,
        BUILTIN_CAPABILITIES,
      } = await import("@bbl-next/core");

      const skill = defineSkill({
        id: "skill.memfs.extra",
        permissions: ["memfs.edit", "memfs.stat", "memfs.stage"],
        handler: async (ctx) => {
          const edit: (input: unknown) => Promise<unknown> = ctx.capabilities.memfs.edit;
          const stat: (input: unknown) => Promise<unknown> = ctx.capabilities.memfs.stat;
          const stage: (input: unknown) => Promise<unknown> = ctx.capabilities.memfs.stage;

          return {
            edit: await edit({ uri: "mem://workspace/demo.txt", patch: "next" }),
            stat: await stat({ uri: "mem://workspace/demo.txt" }),
            stage: await stage({
              entries: [{ uri: "mem://workspace/demo.txt", content: "next" }],
            }),
          };
        },
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({
          family: binding.family,
          operation: binding.operation,
          input,
        }),
      });
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.memfs.extra",
        action: "run",
        args: {},
      });

      expect(result.result).toEqual({
        edit: {
          family: "memfs",
          operation: "edit",
          input: { uri: "mem://workspace/demo.txt", patch: "next" },
        },
        stat: {
          family: "memfs",
          operation: "stat",
          input: { uri: "mem://workspace/demo.txt" },
        },
        stage: {
          family: "memfs",
          operation: "stage",
          input: {
            entries: [{ uri: "mem://workspace/demo.txt", content: "next" }],
          },
        },
      });
    });

    it("can build an install-time setup plan under the canonical skill package root", async () => {
      const skill = defineSkill({
        id: "skill.setup",
        permissions: ["memfs.write"],
        setup: {
          install: async (ctx) => {
            ctx.writeFile("SKILL.md", "# Demo");
            ctx.writeFile("scripts/bootstrap.js", "export const ok = true;");
            ctx.note(`phase:${ctx.phase}`);
          },
        },
        handler: async () => ({ ok: true }),
      });

      await expect(
        runSkillSetupHooks(skill, {
          phase: "install",
          input: { reason: "test" },
        }),
      ).resolves.toEqual({
        skillId: "skill.setup",
        phase: "install",
        baseUri: "mem://skills/skill.setup",
        writes: [
          {
            uri: "mem://skills/skill.setup/SKILL.md",
            content: "# Demo",
          },
          {
            uri: "mem://skills/skill.setup/scripts/bootstrap.js",
            content: "export const ok = true;",
          },
        ],
        notes: ["phase:install"],
      });
    });

    it("rejects setup writes that escape the canonical skill package root", async () => {
      const skill = defineSkill({
        id: "skill.escape",
        permissions: [],
        setup: {
          install: async (ctx) => {
            ctx.writeFile("../outside.txt", "bad");
          },
        },
        handler: async () => ({ ok: true }),
      });

      await expect(
        runSkillSetupHooks(skill, {
          phase: "install",
        }),
      ).rejects.toThrow("setup hooks must stay within the skill package root");
    });

    it("does not execute setup hooks during normal runtime invocation", async () => {
      const {
        SkillInvocationService,
        CapabilityRegistry,
        FamilyProviderRegistry,
        BUILTIN_CAPABILITIES,
      } = await import("@bbl-next/core");

      let setupCalls = 0;
      const skill = defineSkill({
        id: "skill.runtime.only",
        permissions: [],
        setup: {
          install: async () => {
            setupCalls += 1;
          },
        },
        handler: async () => ({ ok: true }),
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.runtime.only",
        action: "run",
        args: {},
      });

      expect(result.result).toEqual({ ok: true });
      expect(setupCalls).toBe(0);
    });
  });
});
