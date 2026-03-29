import { defineSkill, type SkillDeclaration } from "@bbl-next/skill-sdk";
import { describe, expect, it } from "vitest";

describe("skill-sdk", () => {
  describe("defineSkill", () => {
    const validDeclaration: SkillDeclaration = {
      id: "skill.test",
      permissions: ["memfs.*"],
      handler: async (_ctx, _action, _args) => ({ ok: true })
    };

    it("returns a valid SkillDefinition from a declaration", () => {
      const skill = defineSkill(validDeclaration);
      expect(skill).toMatchObject({
        id: "skill.test",
        permissions: ["memfs.*"]
      });
      expect(skill.handler).not.toBe(validDeclaration.handler);
    });

    it("throws on empty id", () => {
      expect(() =>
        defineSkill({ ...validDeclaration, id: "" })
      ).toThrow("id must be a non-empty string");
    });

    it("throws on non-array permissions", () => {
      expect(() =>
        defineSkill({ ...validDeclaration, permissions: "memfs.*" as unknown as string[] })
      ).toThrow("permissions must be an array");
    });

    it("throws on non-function handler", () => {
      expect(() =>
        defineSkill({ ...validDeclaration, handler: "not a function" as unknown as SkillDeclaration["handler"] })
      ).toThrow("handler must be a function");
    });

    it("produced skill can be registered in SkillInvocationService", async () => {
      const { SkillInvocationService, CapabilityRegistry, FamilyProviderRegistry, BUILTIN_CAPABILITIES } = await import("@bbl-next/core");

      const skill = defineSkill({
        id: "skill.echo",
        permissions: ["memfs.*"],
        handler: async (_ctx, action, args) => ({ action, args })
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.echo",
        action: "ping",
        args: { msg: "hello" }
      });

      expect(result.result).toEqual({ action: "ping", args: { msg: "hello" } });
    });

    it("gives the handler a typed capability facade by default", async () => {
      const { SkillInvocationService, CapabilityRegistry, FamilyProviderRegistry, BUILTIN_CAPABILITIES } = await import("@bbl-next/core");

      const skill = defineSkill({
        id: "skill.read",
        permissions: ["memfs.read", "site.fetch_with_session"],
        handler: async (ctx) => {
          const read: (input: unknown) => Promise<unknown> = ctx.capabilities.memfs.read;
          const fetchWithSession: (input: unknown) => Promise<unknown> =
            ctx.capabilities.site.fetchWithSession;

          const file = await read({ uri: "mem://library/skills/demo/SKILL.md" });
          const siteResult = await fetchWithSession({
            url: "https://example.com/api/me"
          });
          return { file, siteResult };
        }
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({ family: binding.family, operation: binding.operation, input })
      });
      providers.register({
        family: "site",
        invoke: ({ binding, input }) => ({ family: binding.family, operation: binding.operation, input })
      });
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.read",
        action: "run",
        args: {}
      });

      expect(result.result).toEqual({
        file: {
          family: "memfs",
          operation: "read",
          input: { uri: "mem://library/skills/demo/SKILL.md" }
        },
        siteResult: {
          family: "site",
          operation: "fetch_with_session",
          input: { url: "https://example.com/api/me" }
        }
      });
    });

    it("exposes memfs edit/stat/stage through the typed facade", async () => {
      const {
        SkillInvocationService,
        CapabilityRegistry,
        FamilyProviderRegistry,
        BUILTIN_CAPABILITIES
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
              entries: [{ uri: "mem://workspace/demo.txt", content: "next" }]
            })
          };
        }
      });

      const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
      const providers = new FamilyProviderRegistry();
      providers.register({
        family: "memfs",
        invoke: ({ binding, input }) => ({
          family: binding.family,
          operation: binding.operation,
          input
        })
      });
      const service = new SkillInvocationService({ registry, providers });
      service.register(skill);

      const result = await service.invoke({
        sessionId: "s1",
        skillId: "skill.memfs.extra",
        action: "run",
        args: {}
      });

      expect(result.result).toEqual({
        edit: {
          family: "memfs",
          operation: "edit",
          input: { uri: "mem://workspace/demo.txt", patch: "next" }
        },
        stat: {
          family: "memfs",
          operation: "stat",
          input: { uri: "mem://workspace/demo.txt" }
        },
        stage: {
          family: "memfs",
          operation: "stage",
          input: {
            entries: [{ uri: "mem://workspace/demo.txt", content: "next" }]
          }
        }
      });
    });
  });
});
