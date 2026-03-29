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

  it("persists snapshot metadata, retention, and rollback selection", async () => {
    const store = new IndexedDbVfsStore("vfs-snapshot-metadata");
    const first = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });
    const skillUri = "mem://skills/twitter";
    const versions = [
      "2026-03-29T00:00:00.000Z",
      "2026-03-29T00:01:00.000Z",
      "2026-03-29T00:02:00.000Z",
      "2026-03-29T00:03:00.000Z"
    ];

    await first.write(`${skillUri}/SKILL.md`, "# twitter v1");
    await first.snapshot(`${skillUri}`, `${skillUri}/@versions/${versions[0]}`, {
      trusted: true
    });
    await first.write(`${skillUri}/SKILL.md`, "# twitter v2");
    await first.snapshot(`${skillUri}`, `${skillUri}/@versions/${versions[1]}`);
    await first.write(`${skillUri}/SKILL.md`, "# twitter v3");
    await first.snapshot(`${skillUri}`, `${skillUri}/@versions/${versions[2]}`, {
      trusted: true
    });
    await first.write(`${skillUri}/SKILL.md`, "# twitter v4");
    await first.snapshot(`${skillUri}`, `${skillUri}/@versions/${versions[3]}`);

    const second = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });
    const snapshots = await second.listSnapshots(skillUri);

    expect(snapshots.map((snapshot) => snapshot.versionId)).toEqual([
      versions[3],
      versions[2],
      versions[1]
    ]);
    expect(snapshots.map((snapshot) => snapshot.createdAt)).toEqual([
      versions[3],
      versions[2],
      versions[1]
    ]);
    expect(snapshots.find((snapshot) => snapshot.versionId === versions[2])).toMatchObject({
      trusted: true,
      sourceUri: "mem://library/skills/twitter"
    });
    await expect(second.selectRollbackTarget(skillUri)).resolves.toMatchObject({
      versionId: versions[2],
      trusted: true
    });
  });

  it("supports configurable retention and legacy rollback fallback", async () => {
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1"
    });
    const skillUri = "mem://skills/twitter";
    const legacyVersion = "2026-03-28T23:59:00.000Z";
    const recentVersion = "2026-03-29T00:00:00.000Z";
    const newestVersion = "2026-03-29T00:01:00.000Z";

    await vfs.write(`${skillUri}/SKILL.md`, "# twitter");
    await vfs.copy(skillUri, `${skillUri}/@versions/${legacyVersion}`);
    await expect(vfs.listSnapshots(skillUri)).resolves.toEqual([
      expect.objectContaining({
        versionId: legacyVersion,
        createdAt: legacyVersion,
        trusted: false
      })
    ]);
    await expect(vfs.selectRollbackTarget(skillUri)).resolves.toBeNull();
    await expect(
      vfs.selectRollbackTarget(skillUri, { allowUntrustedFallback: true })
    ).resolves.toMatchObject({
      versionId: legacyVersion
    });
    await vfs.snapshot(skillUri, `${skillUri}/@versions/${recentVersion}`);
    await vfs.snapshot(skillUri, `${skillUri}/@versions/${newestVersion}`, {
      retention: 2
    });

    const snapshots = await vfs.listSnapshots(skillUri);
    expect(snapshots.map((snapshot) => snapshot.versionId)).toEqual([
      newestVersion,
      recentVersion
    ]);
    expect(snapshots[1]).toMatchObject({
      createdAt: recentVersion,
      trusted: false
    });
    await expect(vfs.selectRollbackTarget(skillUri)).resolves.toBeNull();
    await expect(
      vfs.selectRollbackTarget(skillUri, { allowUntrustedFallback: true })
    ).resolves.toMatchObject({
      versionId: newestVersion
    });
    await expect(
      vfs.stat(`${skillUri}/@versions/${newestVersion}/@versions/${legacyVersion}/SKILL.md`)
    ).rejects.toMatchObject({
      code: "E_BAD_INPUT"
    });
  });

  it("rehydrates by replacing live files while preserving version history", async () => {
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1"
    });
    const skillUri = "mem://skills/twitter";
    const trustedVersion = "2026-03-29T00:00:00.000Z";

    await vfs.write(`${skillUri}/SKILL.md`, "# twitter");
    await vfs.write(`${skillUri}/site/runner.js`, "exports.default = async () => 1;");
    await vfs.snapshot(skillUri, `${skillUri}/@versions/${trustedVersion}`, {
      trusted: true
    });

    await vfs.rm(`${skillUri}/site/runner.js`);
    await vfs.write(`${skillUri}/notes.txt`, "stray");
    await vfs.rehydrate(`${skillUri}/@versions/${trustedVersion}`, skillUri);

    await expect(vfs.read(`${skillUri}/site/runner.js`)).resolves.toBe(
      "exports.default = async () => 1;"
    );
    await expect(vfs.read(`${skillUri}/notes.txt`)).rejects.toMatchObject({
      code: "E_BAD_INPUT"
    });
    await expect(vfs.listSnapshots(skillUri)).resolves.toEqual([
      expect.objectContaining({
        versionId: trustedVersion,
        trusted: true
      })
    ]);
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
