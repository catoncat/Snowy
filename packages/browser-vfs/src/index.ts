import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { CapabilityError } from "@bbl-next/contracts";

export type VfsScope = "ephemeral" | "workspace" | "library";
export type VfsNodeKind = "file" | "dir";

export interface VfsNodeRecord {
  key: string;
  scope: VfsScope;
  workspaceId?: string;
  path: string;
  kind: VfsNodeKind;
  content?: string;
  size: number;
  updatedAt: string;
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

function toUri(scope: VfsScope, path: string): string {
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

export function resolveMemUri(uri: string): {
  scope: VfsScope;
  path: string;
} {
  if (!uri.startsWith("mem://")) {
    throw new CapabilityError("E_BAD_INPUT", `Invalid mem uri: ${uri}`);
  }
  const raw = uri.slice("mem://".length);
  if (raw.startsWith("skills/")) {
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
      for (const record of records) {
        const nextPath = record.path.replace(from.path, to.path);
        this.#ensureParents(to.scope, draft, nextPath);
        draft.set(
          nextPath,
          this.#createRecord(to.scope, nextPath, record.kind, record.content)
        );
      }
    });
  }

  async mv(fromUri: string, toUriValue: string): Promise<void> {
    await this.copy(fromUri, toUriValue);
    await this.rm(fromUri);
  }

  async snapshot(sourceUri: string, targetUri: string): Promise<void> {
    await this.copy(sourceUri, targetUri);
  }

  async rehydrate(snapshotUri: string, targetUri: string): Promise<void> {
    await this.copy(snapshotUri, targetUri);
  }

  async stage(entries: Array<{ uri: string; content: string }>): Promise<void> {
    for (const entry of entries) {
      await this.write(entry.uri, entry.content);
    }
  }

  #syntheticDir(scope: VfsScope, path: string): VfsNodeRecord {
    return this.#createRecord(scope, path, "dir");
  }

  #collectTree(scope: VfsScope, rootPath: string): VfsNodeRecord[] {
    const map = this.#maps[scope];
    const records = [...map.values()].filter(
      (record) => record.path === rootPath || record.path.startsWith(`${rootPath}/`)
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
    content = ""
  ): VfsNodeRecord {
    return {
      key: encodeKey(scope, path, this.#workspaceId),
      scope,
      workspaceId: scope === "workspace" ? this.#workspaceId : undefined,
      path,
      kind,
      content: kind === "file" ? content : undefined,
      size: kind === "file" ? new TextEncoder().encode(content).byteLength : 0,
      updatedAt: new Date().toISOString()
    };
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
