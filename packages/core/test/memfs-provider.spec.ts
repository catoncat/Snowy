import {
  BUILTIN_CAPABILITIES,
  CapabilityRegistry,
  FamilyProviderRegistry,
  createMemfsCapabilityProvider,
  dispatchCapabilityCall,
} from "@bbl-next/core";
import { describe, expect, it } from "vitest";
import { BrowserVfs } from "../../browser-vfs/src/index";

describe("memfs capability provider", () => {
  it("routes memfs.write and memfs.read through BrowserVfs", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    const vfs = await BrowserVfs.create({ workspaceId: "core-memfs-provider" });
    providers.register(createMemfsCapabilityProvider(vfs));

    await expect(
      dispatchCapabilityCall({
        registry,
        providers,
        sessionId: "s1",
        capabilityId: "memfs.write",
        input: {
          uri: "mem://workspace/note.txt",
          content: "hello from memfs provider",
        },
        permissions: ["memfs.write"],
      }),
    ).resolves.toBeUndefined();

    await expect(
      dispatchCapabilityCall({
        registry,
        providers,
        sessionId: "s1",
        capabilityId: "memfs.read",
        input: { uri: "mem://workspace/note.txt" },
        permissions: ["memfs.read"],
      }),
    ).resolves.toBe("hello from memfs provider");
  });

  it("surfaces memfs provider input and VFS errors", async () => {
    const registry = new CapabilityRegistry(BUILTIN_CAPABILITIES);
    const providers = new FamilyProviderRegistry();
    const vfs = await BrowserVfs.create({ workspaceId: "core-memfs-provider-errors" });
    providers.register(createMemfsCapabilityProvider(vfs));

    await expect(
      dispatchCapabilityCall({
        registry,
        providers,
        sessionId: "s1",
        capabilityId: "memfs.write",
        input: { content: "missing uri" },
        permissions: ["memfs.write"],
      }),
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "memfs.write requires a non-empty uri string",
    });

    await expect(
      dispatchCapabilityCall({
        registry,
        providers,
        sessionId: "s1",
        capabilityId: "memfs.read",
        input: { uri: "mem://workspace/missing.txt" },
        permissions: ["memfs.read"],
      }),
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT",
      message: "Path not found: mem://workspace/missing.txt",
    });
  });
});
