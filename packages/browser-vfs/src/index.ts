import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { CapabilityError } from "@bbl-next/contracts";

export type VfsScope = "ephemeral" | "workspace" | "library";
export type VfsNodeKind = "file" | "dir";

export interface VfsSnapshotMetadata {
  versionId: string;
  createdAt: string;
  trusted: boolean;
  sourceUri: string;
}

export interface VfsNodeRecord {
  key: string;
  scope: VfsScope;
  workspaceId?: string;
  path: string;
  kind: VfsNodeKind;
  content?: string;
  size: number;
  updatedAt: string;
  snapshot?: VfsSnapshotMetadata;
}

export interface VfsEntry {
  uri: string;
  name: string;
  kind: VfsNodeKind;
  size: number;
}

export interface VfsStat {
  uri: string;
  kind: VfsNodeKind;
  size: number;
  updatedAt: string;
}

export interface VfsSnapshotInfo extends VfsSnapshotMetadata {
  uri: string;
}

export interface VfsSnapshotOptions {
  retention?: number;
  trusted?: boolean;
}

export interface VfsRollbackTargetOptions {
  allowUntrustedFallback?: boolean;
}

export const PACKAGE_MARKER = "SKILL.md";

export interface VfsPackageInfo {
  id: string;
  uri: string;
  hasMarker: boolean;
}

export interface PersistentVfsStore {
  load(scope: Extract<VfsScope, "workspace" | "library">, workspaceId?: string): Promise<VfsNodeRecord[]>;
  put(record: VfsNodeRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

interface VfsDbSchema extends DBSchema {
  nodes: {
    key: string;
    value: VfsNodeRecord;
  };
}

export class IndexedDbVfsStore implements PersistentVfsStore {
  readonly #dbName: string;
  #db?: Promise<IDBPDatabase<VfsDbSchema>>;

  constructor(dbName = "browser-brain-loop-next-vfs") {
    this.#dbName = dbName;
  }

  async load(
    scope: Extract<VfsScope, "workspace" | "library">,
    workspaceId?: string
  ): Promise<VfsNodeRecord[]> {
    const db = await this.#getDb();
    const all = await db.getAll("nodes");
    return all.filter(
      (record) =>
        record.scope === scope &&
        (scope === "library" || record.workspaceId === workspaceId)
    );
  }

  async put(record: VfsNodeRecord): Promise<void> {
    const db = await this.#getDb();
    await db.put("nodes", record);
  }

  async delete(key: string): Promise<void> {
    const db = await this.#getDb();
    await db.delete("nodes", key);
  }

  async #getDb(): Promise<IDBPDatabase<VfsDbSchema>> {
    this.#db ??= openDB<VfsDbSchema>(this.#dbName, 1, {
      upgrade(db) {
        db.createObjectStore("nodes", { keyPath: "key" });
      }
    });
    return this.#db;
  }
}

export interface BrowserVfsOptions {
  workspaceId: string;
  store?: PersistentVfsStore;
  quotas?: Partial<Record<VfsScope, number>>;
}

const DEFAULT_QUOTAS: Record<VfsScope, number> = {
  ephemeral: Number.POSITIVE_INFINITY,
  workspace: 50 * 1024 * 1024,
  library: 200 * 1024 * 1024
};

function storagePathFromRaw(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) {
    return "/";
  }
  const segments = trimmed
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment === "." || segment === "..") {
        throw new CapabilityError("E_BAD_INPUT", `Invalid path segment: ${segment}`);
      }
      return segment;
    });
  return `/${segments.join("/")}`;
}

function encodeKey(scope: VfsScope, path: string, workspaceId?: string): string {
  return scope === "workspace" ? `${scope}:${workspaceId ?? "default"}:${path}` : `${scope}:${path}`;
}

function isSkillLibraryPath(path: string): boolean {
  return path === "/skills" || path.startsWith("/skills/");
}

function canonicalizeSkillUri(uri: string): string {
  if (uri === "mem://library/skills") {
    return "mem://skills";
  }
  if (uri === "mem://library/skills/") {
    return "mem://skills/";
  }
  if (uri.startsWith("mem://library/skills/")) {
    return `mem://skills/${uri.slice("mem://library/skills/".length)}`;
  }
  return uri;
}

function toUri(scope: VfsScope, path: string): string {
  if (scope === "library" && isSkillLibraryPath(path)) {
    return path === "/skills" ? "mem://skills" : `mem://skills${path.slice("/skills".length)}`;
  }
  return path === "/" ? `mem://${scope}/` : `mem://${scope}${path}`;
}

function splitPath(path: string): string[] {
  return path === "/" ? [] : path.slice(1).split("/");
}

function parentPaths(path: string): string[] {
  const segments = splitPath(path);
  const parents: string[] = ["/"];
  for (let index = 0; index < segments.length - 1; index += 1) {
    parents.push(`/${segments.slice(0, index + 1).join("/")}`);
  }
  return [...new Set(parents)];
}

function isSameOrDescendant(path: string, rootPath: string): boolean {
  if (rootPath === "/") {
    return path.startsWith("/");
  }
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

function versionDirectoryPath(sourcePath: string): string {
  return sourcePath === "/" ? "/@versions" : `${sourcePath}/@versions`;
}

function parseSnapshotRootPath(path: string): { livePath: string; versionId: string } | null {
  const segments = splitPath(path);
  const versionsIndex = segments.lastIndexOf("@versions");
  if (versionsIndex < 0 || versionsIndex !== segments.length - 2) {
    return null;
  }
  const liveSegments = segments.slice(0, versionsIndex);
  return {
    livePath: liveSegments.length === 0 ? "/" : `/${liveSegments.join("/")}`,
    versionId: segments[versionsIndex + 1]
  };
}

function isIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function sortSnapshotsDesc(left: VfsSnapshotInfo, right: VfsSnapshotInfo): number {
  const createdAt = right.createdAt.localeCompare(left.createdAt);
  if (createdAt !== 0) {
    return createdAt;
  }
  return right.versionId.localeCompare(left.versionId);
}

function normalizeSnapshotRetention(value?: number): number {
  if (value == null) {
    return 3;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    throw new CapabilityError("E_BAD_INPUT", `Snapshot retention must be >= 1: ${value}`);
  }
  return normalized;
}

export function resolveMemUri(uri: string): {
  scope: VfsScope;
  path: string;
} {
  if (!uri.startsWith("mem://")) {
    throw new CapabilityError("E_BAD_INPUT", `Invalid mem uri: ${uri}`);
  }
  const raw = uri.slice("mem://".length);
  if (raw === "skills" || raw.startsWith("skills/")) {
    return {
      scope: "library",
      path: storagePathFromRaw(raw)
    };
  }
  const [scopeToken, ...rest] = raw.split("/");
  if (scopeToken !== "ephemeral" && scopeToken !== "workspace" && scopeToken !== "library") {
    throw new CapabilityError("E_BAD_INPUT", `Unknown mem scope: ${scopeToken}`);
  }
  return {
    scope: scopeToken,
    path: storagePathFromRaw(rest.join("/"))
  };
}

export class BrowserVfs {
  readonly #workspaceId: string;
  readonly #store?: PersistentVfsStore;
  readonly #quotas: Record<VfsScope, number>;
  readonly #maps: Record<VfsScope, Map<string, VfsNodeRecord>>;

  private constructor(options: BrowserVfsOptions, initial: Record<VfsScope, Map<string, VfsNodeRecord>>) {
    this.#workspaceId = options.workspaceId;
    this.#store = options.store;
    this.#quotas = {
      ...DEFAULT_QUOTAS,
      ...options.quotas
    };
    this.#maps = initial;
  }

  static async create(options: BrowserVfsOptions): Promise<BrowserVfs> {
    const workspace = new Map<string, VfsNodeRecord>();
    const library = new Map<string, VfsNodeRecord>();
    if (options.store) {
      for (const record of await options.store.load("workspace", options.workspaceId)) {
        workspace.set(record.path, record);
      }
      for (const record of await options.store.load("library")) {
        library.set(record.path, record);
      }
    }
    return new BrowserVfs(options, {
      ephemeral: new Map<string, VfsNodeRecord>(),
      workspace,
      library
    });
  }

  async read(uri: string): Promise<string> {
    const { scope, path } = resolveMemUri(uri);
    const record = this.#requireNode(scope, path);
    if (record.kind !== "file") {
      throw new CapabilityError("E_BAD_INPUT", `Path is not a file: ${uri}`);
    }
    return record.content ?? "";
  }

  async write(uri: string, content: string): Promise<void> {
    const { scope, path } = resolveMemUri(uri);
    await this.#mutateScope(scope, (draft) => {
      this.#ensureParents(scope, draft, path);
      draft.set(path, this.#createRecord(scope, path, "file", content));
    });
  }

  async edit(uri: string, editor: (current: string) => string): Promise<void> {
    const current = await this.read(uri);
    await this.write(uri, editor(current));
  }

  async mkdir(uri: string): Promise<void> {
    const { scope, path } = resolveMemUri(uri);
    await this.#mutateScope(scope, (draft) => {
      this.#ensureParents(scope, draft, path);
      draft.set(path, this.#createRecord(scope, path, "dir"));
    });
  }

  async stat(uri: string): Promise<VfsStat> {
    const { scope, path } = resolveMemUri(uri);
    const record = this.#requireNode(scope, path);
    return {
      uri: toUri(scope, path),
      kind: record.kind,
      size: record.size,
      updatedAt: record.updatedAt
    };
  }

  async list(uri: string): Promise<VfsEntry[]> {
    const { scope, path } = resolveMemUri(uri);
    const map = this.#maps[scope];
    const prefix = path === "/" ? "/" : `${path}/`;
    const seen = new Map<string, VfsEntry>();
    for (const record of map.values()) {
      if (record.path === path) {
        continue;
      }
      if (!record.path.startsWith(prefix)) {
        continue;
      }
      const rest = record.path.slice(prefix.length);
      const [child] = rest.split("/");
      const childPath = path === "/" ? `/${child}` : `${path}/${child}`;
      if (!seen.has(childPath)) {
        const childRecord = map.get(childPath) ?? this.#syntheticDir(scope, childPath);
        seen.set(childPath, {
          uri: toUri(scope, childPath),
          name: child,
          kind: childRecord.kind,
          size: childRecord.size
        });
      }
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async rm(uri: string): Promise<void> {
    const { scope, path } = resolveMemUri(uri);
    await this.#mutateScope(scope, (draft) => {
      for (const key of [...draft.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) {
          draft.delete(key);
        }
      }
    });
  }

  async copy(fromUri: string, toUriValue: string): Promise<void> {
    const from = resolveMemUri(fromUri);
    const to = resolveMemUri(toUriValue);
    const records = this.#collectTree(from.scope, from.path);
    await this.#mutateScope(to.scope, (draft) => {
      this.#writeTree(draft, to.scope, records, from.path, to.path);
    });
  }

  async mv(fromUri: string, toUriValue: string): Promise<void> {
    await this.copy(fromUri, toUriValue);
    await this.rm(fromUri);
  }

  async snapshot(
    sourceUri: string,
    targetUri: string,
    options: VfsSnapshotOptions = {}
  ): Promise<void> {
    const source = resolveMemUri(sourceUri);
    const target = resolveMemUri(targetUri);
    const targetSnapshot = parseSnapshotRootPath(target.path);
    const records = this.#collectTree(source.scope, source.path, {
      excludePaths: [versionDirectoryPath(source.path)]
    });
    const retention = normalizeSnapshotRetention(options.retention);
    const metadata =
      targetSnapshot == null
        ? undefined
        : {
            versionId: targetSnapshot.versionId,
            createdAt: isIsoTimestamp(targetSnapshot.versionId)
              ? targetSnapshot.versionId
              : new Date().toISOString(),
            trusted: options.trusted ?? false,
            sourceUri: toUri(source.scope, source.path)
          };

    await this.#mutateScope(target.scope, (draft) => {
      this.#removeTree(draft, target.path);
      this.#writeTree(draft, target.scope, records, source.path, target.path, {
        rootSnapshot: metadata
      });
      if (targetSnapshot) {
        this.#trimSnapshots(draft, target.scope, targetSnapshot.livePath, retention);
      }
    });
  }

  async rehydrate(snapshotUri: string, targetUri: string): Promise<void> {
    const snapshot = resolveMemUri(snapshotUri);
    const target = resolveMemUri(targetUri);
    const records = this.#collectTree(snapshot.scope, snapshot.path);
    await this.#mutateScope(target.scope, (draft) => {
      this.#removeTree(draft, target.path, [versionDirectoryPath(target.path)]);
      this.#writeTree(draft, target.scope, records, snapshot.path, target.path, {
        clearRootSnapshot: true
      });
    });
  }

  async listSnapshots(sourceUri: string): Promise<VfsSnapshotInfo[]> {
    const source = resolveMemUri(sourceUri);
    return this.#listSnapshotsFromMap(this.#maps[source.scope], source.scope, source.path);
  }

  async selectRollbackTarget(
    sourceUri: string,
    options: VfsRollbackTargetOptions = {}
  ): Promise<VfsSnapshotInfo | null> {
    const snapshots = await this.listSnapshots(sourceUri);
    const trusted = snapshots.find((snapshot) => snapshot.trusted);
    if (trusted) {
      return trusted;
    }
    return options.allowUntrustedFallback ? snapshots[0] ?? null : null;
  }

  async discoverPackages(rootUri = "mem://skills"): Promise<VfsPackageInfo[]> {
    const { scope, path: rootPath } = resolveMemUri(rootUri);
    const map = this.#maps[scope];
    const prefix = rootPath === "/" ? "/" : `${rootPath}/`;
    const children = new Set<string>();

    for (const record of map.values()) {
      if (!record.path.startsWith(prefix)) {
        continue;
      }
      const rest = record.path.slice(prefix.length);
      const [child] = rest.split("/");
      if (child && child !== "@versions") {
        children.add(child);
      }
    }

    return [...children]
      .sort()
      .map((child) => {
        const childPath = rootPath === "/" ? `/${child}` : `${rootPath}/${child}`;
        const markerPath = `${childPath}/${PACKAGE_MARKER}`;
        const marker = map.get(markerPath);
        return {
          id: child,
          uri: toUri(scope, childPath),
          hasMarker: marker?.kind === "file"
        };
      });
  }

  async isPackageRoot(uri: string): Promise<boolean> {
    const { scope, path } = resolveMemUri(uri);
    const markerPath = `${path}/${PACKAGE_MARKER}`;
    const record = this.#maps[scope].get(markerPath);
    return record?.kind === "file";
  }

  async stage(entries: Array<{ uri: string; content: string }>): Promise<void> {
    for (const entry of entries) {
      await this.write(entry.uri, entry.content);
    }
  }

  #syntheticDir(scope: VfsScope, path: string): VfsNodeRecord {
    return this.#createRecord(scope, path, "dir");
  }

  #collectTree(
    scope: VfsScope,
    rootPath: string,
    options: {
      excludePaths?: string[];
    } = {}
  ): VfsNodeRecord[] {
    const map = this.#maps[scope];
    const records = [...map.values()].filter(
      (record) =>
        isSameOrDescendant(record.path, rootPath) &&
        !(options.excludePaths ?? []).some((excludedPath) =>
          isSameOrDescendant(record.path, excludedPath)
        )
    );
    if (records.length === 0) {
      throw new CapabilityError("E_BAD_INPUT", `Path not found: ${toUri(scope, rootPath)}`);
    }
    return records.map((record) => ({ ...record }));
  }

  #requireNode(scope: VfsScope, path: string): VfsNodeRecord {
    const record = this.#maps[scope].get(path);
    if (!record) {
      throw new CapabilityError("E_BAD_INPUT", `Path not found: ${toUri(scope, path)}`);
    }
    return record;
  }

  #ensureParents(
    scope: VfsScope,
    draft: Map<string, VfsNodeRecord>,
    path: string
  ): void {
    for (const parent of parentPaths(path)) {
      if (!draft.has(parent)) {
        draft.set(parent, this.#createRecord(scope, parent, "dir"));
      }
    }
  }

  #createRecord(
    scope: VfsScope,
    path: string,
    kind: VfsNodeKind,
    content = "",
    snapshot?: VfsSnapshotMetadata
  ): VfsNodeRecord {
    return {
      key: encodeKey(scope, path, this.#workspaceId),
      scope,
      workspaceId: scope === "workspace" ? this.#workspaceId : undefined,
      path,
      kind,
      content: kind === "file" ? content : undefined,
      size: kind === "file" ? new TextEncoder().encode(content).byteLength : 0,
      updatedAt: new Date().toISOString(),
      snapshot
    };
  }

  #writeTree(
    draft: Map<string, VfsNodeRecord>,
    scope: VfsScope,
    records: VfsNodeRecord[],
    fromPath: string,
    toPath: string,
    options: {
      rootSnapshot?: VfsSnapshotMetadata;
      clearRootSnapshot?: boolean;
    } = {}
  ): void {
    for (const record of records) {
      const nextPath =
        record.path === fromPath ? toPath : `${toPath}${record.path.slice(fromPath.length)}`;
      const snapshot =
        record.path === fromPath
          ? options.clearRootSnapshot
            ? undefined
            : options.rootSnapshot ?? record.snapshot
          : record.snapshot;
      this.#ensureParents(scope, draft, nextPath);
      draft.set(
        nextPath,
        this.#createRecord(scope, nextPath, record.kind, record.content, snapshot)
      );
    }
  }

  #removeTree(
    draft: Map<string, VfsNodeRecord>,
    rootPath: string,
    keepRoots: string[] = []
  ): void {
    for (const key of [...draft.keys()]) {
      if (!isSameOrDescendant(key, rootPath)) {
        continue;
      }
      if (keepRoots.some((keepRoot) => isSameOrDescendant(key, keepRoot))) {
        continue;
      }
      draft.delete(key);
    }
  }

  #listSnapshotsFromMap(
    map: Map<string, VfsNodeRecord>,
    scope: VfsScope,
    sourcePath: string
  ): VfsSnapshotInfo[] {
    const versionsPath = versionDirectoryPath(sourcePath);
    const roots = new Map<string, VfsNodeRecord>();
    const prefix = versionsPath === "/" ? "/" : `${versionsPath}/`;

    for (const record of map.values()) {
      if (record.path === versionsPath || !isSameOrDescendant(record.path, versionsPath)) {
        continue;
      }
      const rest = record.path.slice(prefix.length);
      const [versionId] = rest.split("/");
      if (!versionId) {
        continue;
      }
      const rootPath = versionsPath === "/" ? `/${versionId}` : `${versionsPath}/${versionId}`;
      if (!roots.has(rootPath)) {
        roots.set(rootPath, map.get(rootPath) ?? this.#syntheticDir(scope, rootPath));
      }
    }

    return [...roots.entries()]
      .map(([rootPath, record]) => this.#toSnapshotInfo(scope, sourcePath, rootPath, record))
      .sort(sortSnapshotsDesc);
  }

  #toSnapshotInfo(
    scope: VfsScope,
    sourcePath: string,
    snapshotPath: string,
    record: VfsNodeRecord
  ): VfsSnapshotInfo {
    const parsed = parseSnapshotRootPath(snapshotPath);
    if (!parsed) {
      throw new CapabilityError("E_BAD_INPUT", `Invalid snapshot path: ${toUri(scope, snapshotPath)}`);
    }
    return {
      uri: toUri(scope, snapshotPath),
      versionId: parsed.versionId,
      createdAt:
        record.snapshot?.createdAt ??
        (isIsoTimestamp(parsed.versionId) ? parsed.versionId : record.updatedAt),
      trusted: record.snapshot?.trusted ?? false,
      sourceUri: canonicalizeSkillUri(record.snapshot?.sourceUri ?? toUri(scope, sourcePath))
    };
  }

  #trimSnapshots(
    draft: Map<string, VfsNodeRecord>,
    scope: VfsScope,
    sourcePath: string,
    retention: number
  ): void {
    const snapshots = this.#listSnapshotsFromMap(draft, scope, sourcePath);
    for (const snapshot of snapshots.slice(retention)) {
      const { path } = resolveMemUri(snapshot.uri);
      this.#removeTree(draft, path);
    }
  }

  async #mutateScope(
    scope: VfsScope,
    mutate: (draft: Map<string, VfsNodeRecord>) => void
  ): Promise<void> {
    const current = this.#maps[scope];
    const draft = new Map<string, VfsNodeRecord>();
    for (const [path, record] of current.entries()) {
      draft.set(path, { ...record });
    }
    mutate(draft);
    const bytes = [...draft.values()]
      .filter((record) => record.kind === "file")
      .reduce((sum, record) => sum + record.size, 0);
    if (bytes > this.#quotas[scope]) {
      throw new CapabilityError(
        "E_VFS_QUOTA_EXCEEDED",
        `Quota exceeded for ${scope}: ${bytes} > ${this.#quotas[scope]}`
      );
    }
    this.#maps[scope] = draft;
    if (scope === "workspace" || scope === "library") {
      await this.#persistScope(scope, current, draft);
    }
  }

  async #persistScope(
    scope: Extract<VfsScope, "workspace" | "library">,
    previous: Map<string, VfsNodeRecord>,
    next: Map<string, VfsNodeRecord>
  ): Promise<void> {
    if (!this.#store) {
      return;
    }
    for (const [path, record] of next.entries()) {
      const prev = previous.get(path);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(record)) {
        await this.#store.put(record);
      }
    }
    for (const path of previous.keys()) {
      if (!next.has(path)) {
        await this.#store.delete(encodeKey(scope, path, this.#workspaceId));
      }
    }
  }
}
