import "fake-indexeddb/auto";
import { BrowserVfs, IndexedDbVfsStore } from "@bbl-next/browser-vfs";
import { describe, expect, it } from "vitest";

describe("browser-vfs", () => {
  it("persists workspace and library writes with write-through semantics", async () => {
    const store = new IndexedDbVfsStore("vfs-write-through");
    const first = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });
    await first.write("mem://workspace/notes/todo.md", "ship it");
    await first.write("mem://library/skills/demo/SKILL.md", "# demo");

    const second = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });

    await expect(second.read("mem://workspace/notes/todo.md")).resolves.toBe("ship it");
    await expect(second.read("mem://library/skills/demo/SKILL.md")).resolves.toBe("# demo");
  });

  it("supports skill version snapshots and rehydrate", async () => {
    const store = new IndexedDbVfsStore("vfs-snapshot");
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });
    await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
    await vfs.write("mem://skills/twitter/site/runner.js", "exports.default = async () => 1;");

    await vfs.snapshot(
      "mem://skills/twitter",
      "mem://skills/twitter/@versions/2026-03-29T00:00:00.000Z"
    );
    await vfs.rm("mem://skills/twitter/site/runner.js");
    await vfs.rehydrate(
      "mem://skills/twitter/@versions/2026-03-29T00:00:00.000Z",
      "mem://skills/twitter"
    );

    await expect(vfs.read("mem://skills/twitter/site/runner.js")).resolves.toBe(
      "exports.default = async () => 1;"
    );
  });

  it("rejects writes above the configured quota", async () => {
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1",
      quotas: {
        workspace: 4
      }
    });

    await expect(vfs.write("mem://workspace/too-large.txt", "12345")).rejects.toMatchObject({
      code: "E_VFS_QUOTA_EXCEEDED"
    });
  });
});
