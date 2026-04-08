import type { LlmProviderAdapter } from "@bbl-next/contracts";
import { LlmProviderRegistry } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";

function stubProvider(id: string): LlmProviderAdapter {
  return {
    id,
    resolveRequestUrl: () => `https://stub/${id}`,
    send: async () => new Response("ok"),
  };
}

describe("LlmProviderRegistry", () => {
  let registry: LlmProviderRegistry;

  beforeEach(() => {
    registry = new LlmProviderRegistry();
  });

  it("registers and retrieves a provider", () => {
    const p = stubProvider("openai");
    registry.register(p);

    expect(registry.has("openai")).toBe(true);
    expect(registry.get("openai")).toBe(p);
  });

  it("lists registered providers", () => {
    registry.register(stubProvider("a"));
    registry.register(stubProvider("b"));

    expect(registry.list()).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("throws on duplicate registration without replace", () => {
    registry.register(stubProvider("openai"));

    expect(() => registry.register(stubProvider("openai"))).toThrow(
      "llm provider already registered: openai",
    );
  });

  it("allows replacing a provider with replace option", () => {
    registry.register(stubProvider("openai"));
    const replacement = stubProvider("openai");
    registry.register(replacement, { replace: true });

    expect(registry.get("openai")).toBe(replacement);
  });

  it("throws on empty id", () => {
    expect(() => registry.register(stubProvider(""))).toThrow("llm provider id must not be empty");
  });

  it("throws on whitespace-only id", () => {
    expect(() => registry.register(stubProvider("  "))).toThrow(
      "llm provider id must not be empty",
    );
  });

  it("unregisters a provider", () => {
    registry.register(stubProvider("openai"));

    expect(registry.unregister("openai")).toBe(true);
    expect(registry.has("openai")).toBe(false);
    expect(registry.get("openai")).toBeUndefined();
  });

  it("unregister returns false for unknown id", () => {
    expect(registry.unregister("unknown")).toBe(false);
  });

  it("has returns false for unknown id", () => {
    expect(registry.has("unknown")).toBe(false);
  });

  it("get returns undefined for unknown id", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("list returns empty array when no providers registered", () => {
    expect(registry.list()).toEqual([]);
  });
});
