import { SessionStore, VfsSessionStorage } from "@bbl-next/kernel";
import { beforeEach, describe, expect, it } from "vitest";
import { BrowserVfs } from "../../browser-vfs/src/index.js";

describe("VfsSessionStorage", () => {
  let vfs: BrowserVfs;
  let storage: VfsSessionStorage;

  beforeEach(async () => {
    vfs = await BrowserVfs.create({ workspaceId: "kernel-test-workspace" });
    storage = new VfsSessionStorage(vfs);
  });

  it("persists session headers and JSONL entries into BrowserVFS", async () => {
    await storage.createSession({
      id: "s-vfs-1",
      createdAt: "2026-03-30T00:00:00.000Z",
      title: "Kernel VFS",
    });

    await storage.appendEntry("s-vfs-1", {
      entryId: "e-1",
      type: "message",
      timestamp: "2026-03-30T00:00:01.000Z",
      payload: { role: "user", text: "hello" },
    });
    await storage.appendEntry("s-vfs-1", {
      entryId: "e-2",
      parentId: "e-1",
      type: "message",
      timestamp: "2026-03-30T00:00:02.000Z",
      payload: { role: "assistant", text: "hi" },
    });

    expect(await vfs.read("mem://workspace/kernel/sessions/s-vfs-1/header.json")).toContain(
      '"id":"s-vfs-1"',
    );
    expect(await vfs.read("mem://workspace/kernel/sessions/s-vfs-1/entries.jsonl")).toContain(
      '"entryId":"e-2"',
    );

    expect(await storage.getEntries("s-vfs-1")).toEqual([
      {
        entryId: "e-1",
        type: "message",
        timestamp: "2026-03-30T00:00:01.000Z",
        payload: { role: "user", text: "hello" },
      },
      {
        entryId: "e-2",
        parentId: "e-1",
        type: "message",
        timestamp: "2026-03-30T00:00:02.000Z",
        payload: { role: "assistant", text: "hi" },
      },
    ]);
  });

  it("lists and deletes sessions through the VFS subtree", async () => {
    await storage.createSession({ id: "s-a", createdAt: "2026-03-30T00:00:00.000Z", title: "A" });
    await storage.createSession({ id: "s-b", createdAt: "2026-03-30T00:00:01.000Z", title: "B" });

    expect((await storage.listSessions()).map((session) => session.id)).toEqual(["s-a", "s-b"]);

    await storage.deleteSession("s-a");

    expect((await storage.listSessions()).map((session) => session.id)).toEqual(["s-b"]);
    await expect(vfs.read("mem://workspace/kernel/sessions/s-a/header.json")).rejects.toThrow();
  });

  it("works with SessionStore as a drop-in SessionStorage implementation", async () => {
    const store = new SessionStore(storage);
    const session = await store.createSession({ title: "VFS-backed" });

    const first = await store.appendEntry(session.id, "message", {
      role: "user",
      text: "persist me",
    });
    const second = await store.appendEntry(session.id, "message", {
      role: "assistant",
      text: "persisted",
    });

    const context = await store.buildContext(session.id);

    expect(context.entries).toHaveLength(2);
    expect(context.entries[0]?.entryId).toBe(first.entryId);
    expect(context.entries[1]?.entryId).toBe(second.entryId);
    expect(context.messages.map((message) => message.content)).toEqual(["persist me", "persisted"]);
  });
});
