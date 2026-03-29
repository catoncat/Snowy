import "fake-indexeddb/auto";
import { openDB, type DBSchema } from "idb";
import {
  BrowserVfs,
  IndexedDbVfsStore,
  INDEXED_DB_VFS_SCHEMA_VERSION,
  PACKAGE_MARKER,
  resolveMemUri,
  snapshotInfoToSkillVersionRef
} from "@bbl-next/browser-vfs";
import {
  createSkillLifecycleVersionSurface,
  DEFAULT_SKILL_VERSION_RETENTION,
  skillVersionRootUri,
  skillVersionUri
} from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

interface LegacyVfsDbSchema extends DBSchema {
  nodes: {
    key: string;
    value: Record<string, unknown>;
  };
}

interface MigratedVfsDbSchema extends DBSchema {
  nodes: {
    key: string;
    value: Record<string, unknown>;
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: number;
      updatedAt: string;
    };
  };
}

function textSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function seedLegacyV1Database(dbName: string, versionId: string): Promise<void> {
  const db = await openDB<LegacyVfsDbSchema>(dbName, 1, {
    upgrade(database) {
      database.createObjectStore("nodes", { keyPath: "key" });
    }
  });

  const runnerSource = "exports.default = async () => 1;";
  const sourceUri = "/skills/twitter";
  const snapshotRoot = `${sourceUri}/@versions/${versionId}`;

  await db.put("nodes", {
    key: "library:/skills/twitter",
    scope: "library",
    path: sourceUri,
    kind: "dir",
    size: 0,
    updatedAt: versionId
  });
  await db.put("nodes", {
    key: "library:/skills/twitter/SKILL.md",
    scope: "library",
    path: "/skills/twitter/SKILL.md",
    kind: "file",
    content: "# twitter",
    size: textSize("# twitter"),
    updatedAt: versionId
  });
  await db.put("nodes", {
    key: "library:/skills/twitter/site/runner.js",
    scope: "library",
    path: "/skills/twitter/site/runner.js",
    kind: "file",
    content: runnerSource,
    size: textSize(runnerSource),
    updatedAt: versionId
  });
  await db.put("nodes", {
    key: `library:${snapshotRoot}`,
    scope: "library",
    path: snapshotRoot,
    kind: "dir",
    size: 0,
    updatedAt: versionId,
    snapshot: {
      versionId,
      createdAt: versionId,
      trusted: true,
      sourceUri: "mem://library/skills/twitter"
    }
  });
  await db.put("nodes", {
    key: `library:${snapshotRoot}/SKILL.md`,
    scope: "library",
    path: `${snapshotRoot}/SKILL.md`,
    kind: "file",
    content: "# twitter",
    size: textSize("# twitter"),
    updatedAt: versionId
  });
  await db.put("nodes", {
    key: `library:${snapshotRoot}/site/runner.js`,
    scope: "library",
    path: `${snapshotRoot}/site/runner.js`,
    kind: "file",
    content: runnerSource,
    size: textSize(runnerSource),
    updatedAt: versionId
  });

  db.close();
}

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

  it("keeps canonical skill URIs in stat, list, and snapshot outputs", async () => {
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1"
    });
    const versionId = "2026-03-29T00:00:00.000Z";

    await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
    await vfs.snapshot(
      "mem://skills/twitter",
      `mem://skills/twitter/@versions/${versionId}`,
      { trusted: true }
    );

    await expect(vfs.stat("mem://skills/twitter")).resolves.toMatchObject({
      uri: "mem://skills/twitter"
    });
    await expect(vfs.list("mem://skills")).resolves.toEqual([
      {
        uri: "mem://skills/twitter",
        name: "twitter",
        kind: "dir",
        size: 0
      }
    ]);
    await expect(vfs.listSnapshots("mem://skills/twitter")).resolves.toEqual([
      expect.objectContaining({
        uri: `mem://skills/twitter/@versions/${versionId}`,
        sourceUri: "mem://skills/twitter",
        trusted: true
      })
    ]);
  });

  it("bridges snapshot primitives into the lifecycle/version engine surface", async () => {
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1"
    });
    const versionId = "2026-03-29T00:00:00.000Z";

    await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
    await vfs.snapshot("mem://skills/twitter", skillVersionUri("twitter", versionId), {
      trusted: true
    });

    const [snapshot] = await vfs.listSnapshots("mem://skills/twitter");
    const version = snapshotInfoToSkillVersionRef(snapshot);
    const surface = createSkillLifecycleVersionSurface({
      skillId: "twitter",
      lifecycle: {
        status: "installed",
        trusted: false
      },
      activeVersion: version,
      versions: [version]
    });

    expect(skillVersionRootUri("twitter")).toBe("mem://skills/twitter/@versions");
    expect(version).toEqual({
      versionId,
      uri: `mem://skills/twitter/@versions/${versionId}`,
      createdAt: versionId,
      trusted: true
    });
    expect(surface.policy.retention).toBe(DEFAULT_SKILL_VERSION_RETENTION);
    expect(surface.rollbackTarget).toEqual(version);
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
      sourceUri: "mem://skills/twitter"
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

  it("migrates legacy v1 IndexedDB data without losing canonical snapshot or rollback behavior", async () => {
    const dbName = `vfs-legacy-migration-${Date.now()}`;
    const versionId = "2026-03-29T00:00:00.000Z";
    await seedLegacyV1Database(dbName, versionId);

    const store = new IndexedDbVfsStore(dbName);
    const vfs = await BrowserVfs.create({
      workspaceId: "conversation-1",
      store
    });

    await expect(vfs.listSnapshots("mem://skills/twitter")).resolves.toEqual([
      expect.objectContaining({
        uri: `mem://skills/twitter/@versions/${versionId}`,
        versionId,
        trusted: true,
        sourceUri: "mem://skills/twitter"
      })
    ]);
    await expect(vfs.selectRollbackTarget("mem://skills/twitter")).resolves.toMatchObject({
      versionId,
      trusted: true
    });

    await vfs.rm("mem://skills/twitter/site/runner.js");
    await vfs.rehydrate(`mem://skills/twitter/@versions/${versionId}`, "mem://skills/twitter");
    await expect(vfs.read("mem://skills/twitter/site/runner.js")).resolves.toBe(
      "exports.default = async () => 1;"
    );

    const migratedDb = await openDB<MigratedVfsDbSchema>(dbName);
    await expect(migratedDb.get("meta", "schemaVersion")).resolves.toMatchObject({
      key: "schemaVersion",
      value: INDEXED_DB_VFS_SCHEMA_VERSION
    });
    await expect(
      migratedDb.get("nodes", `library:/skills/twitter/@versions/${versionId}`)
    ).resolves.toMatchObject({
      snapshot: expect.objectContaining({
        sourceUri: "mem://skills/twitter"
      })
    });
    migratedDb.close();
  });

  describe("package discovery", () => {
    it("discovers skill packages with and without SKILL.md marker", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
      await vfs.write("mem://skills/twitter/scripts/run.js", "1");
      await vfs.write("mem://skills/github/SKILL.md", "# github");
      await vfs.write("mem://skills/drafty/notes.md", "wip");

      const packages = await vfs.discoverPackages();
      expect(packages).toEqual([
        { id: "drafty", uri: "mem://skills/drafty", hasMarker: false },
        { id: "github", uri: "mem://skills/github", hasMarker: true },
        { id: "twitter", uri: "mem://skills/twitter", hasMarker: true }
      ]);
    });

    it("excludes @versions directories from discovery", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
      await vfs.snapshot(
        "mem://skills/twitter",
        "mem://skills/twitter/@versions/2026-03-29T00:00:00.000Z"
      );

      const packages = await vfs.discoverPackages();
      expect(packages).toEqual([
        { id: "twitter", uri: "mem://skills/twitter", hasMarker: true }
      ]);
    });

    it("discovers packages under a custom root URI", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://workspace/plugins/alpha/SKILL.md", "# alpha");
      await vfs.write("mem://workspace/plugins/beta/readme.md", "# beta");

      const packages = await vfs.discoverPackages("mem://workspace/plugins");
      expect(packages).toEqual([
        { id: "alpha", uri: "mem://workspace/plugins/alpha", hasMarker: true },
        { id: "beta", uri: "mem://workspace/plugins/beta", hasMarker: false }
      ]);
    });

    it("returns empty array when no packages exist", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await expect(vfs.discoverPackages()).resolves.toEqual([]);
    });

    it("isPackageRoot returns true only when SKILL.md file exists", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://skills/twitter/SKILL.md", "# twitter");
      await vfs.mkdir("mem://skills/empty");

      expect(await vfs.isPackageRoot("mem://skills/twitter")).toBe(true);
      expect(await vfs.isPackageRoot("mem://skills/empty")).toBe(false);
      expect(await vfs.isPackageRoot("mem://skills/nonexistent")).toBe(false);
    });

    it("PACKAGE_MARKER constant equals SKILL.md", () => {
      expect(PACKAGE_MARKER).toBe("SKILL.md");
    });
  });

  describe("resolveMemUri error paths", () => {
    it("throws E_BAD_INPUT for non-mem:// URI", () => {
      expect(() => resolveMemUri("https://example.com")).toThrow("Invalid mem uri");
      expect(() => resolveMemUri("file:///tmp")).toThrow("Invalid mem uri");
      expect(() => resolveMemUri("")).toThrow("Invalid mem uri");
    });

    it("throws E_BAD_INPUT for unknown scope", () => {
      expect(() => resolveMemUri("mem://custom/foo")).toThrow("Unknown mem scope");
      expect(() => resolveMemUri("mem://temp/bar")).toThrow("Unknown mem scope");
    });

    it("throws E_BAD_INPUT for dot segments in path", () => {
      expect(() => resolveMemUri("mem://workspace/../etc")).toThrow("Invalid path segment: ..");
      expect(() => resolveMemUri("mem://workspace/./foo")).toThrow("Invalid path segment: .");
    });

    it("maps mem://skills/ shorthand to library scope", () => {
      const result = resolveMemUri("mem://skills/twitter");
      expect(result.scope).toBe("library");
      expect(result.path).toBe("/skills/twitter");
    });

    it("resolves all three explicit scopes", () => {
      expect(resolveMemUri("mem://ephemeral/tmp").scope).toBe("ephemeral");
      expect(resolveMemUri("mem://workspace/data").scope).toBe("workspace");
      expect(resolveMemUri("mem://library/pkg").scope).toBe("library");
    });
  });

  describe("VFS read error paths", () => {
    it("throws E_BAD_INPUT when reading a directory as file", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.mkdir("mem://workspace/mydir");
      await expect(vfs.read("mem://workspace/mydir")).rejects.toThrow("Path is not a file");
    });
  });

  describe("VFS operation round-trips", () => {
    it("edit: write → edit → read preserves changes", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://workspace/file.txt", "hello");
      await vfs.edit("mem://workspace/file.txt", (c) => c.toUpperCase());
      const result = await vfs.read("mem://workspace/file.txt");
      expect(result).toBe("HELLO");
    });

    it("mv: write → mv → stat(old) fails, read(new) succeeds", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://workspace/a.txt", "data");
      await vfs.mv("mem://workspace/a.txt", "mem://workspace/b.txt");

      await expect(vfs.stat("mem://workspace/a.txt")).rejects.toThrow();
      const content = await vfs.read("mem://workspace/b.txt");
      expect(content).toBe("data");
    });

    it("copy: source and target are independent", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://workspace/src.txt", "original");
      await vfs.copy("mem://workspace/src.txt", "mem://workspace/dst.txt");

      // Modify source after copy
      await vfs.write("mem://workspace/src.txt", "modified");
      const dst = await vfs.read("mem://workspace/dst.txt");
      expect(dst).toBe("original");
    });

    it("mkdir → list round-trip", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.mkdir("mem://workspace/parent");
      await vfs.write("mem://workspace/parent/child.txt", "ok");

      const entries = await vfs.list("mem://workspace/parent");
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("child.txt");
    });
  });

  describe("ephemeral scope", () => {
    it("write → read → stat round-trip in ephemeral scope", async () => {
      const vfs = await BrowserVfs.create({ workspaceId: "conv-1" });
      await vfs.write("mem://ephemeral/tmp.txt", "temp data");

      const content = await vfs.read("mem://ephemeral/tmp.txt");
      expect(content).toBe("temp data");

      const info = await vfs.stat("mem://ephemeral/tmp.txt");
      expect(info.kind).toBe("file");
    });
  });
});
