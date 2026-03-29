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
      expect(skill).toEqual({
        id: "skill.test",
        permissions: ["memfs.*"],
        handler: validDeclaration.handler
      });
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
  });
});
