import type {
  KernelSessionSnapshot,
  SessionEntry,
  SessionHeader,
  SessionStorage,
} from "@bbl-next/contracts";

/**
 * Minimal VFS API surface required by the adapter.
 * Matches the relevant methods of BrowserVfs without importing the package.
 */
export interface VfsLike {
  read(uri: string): Promise<string>;
  write(uri: string, content: string): Promise<void>;
  list(uri: string): Promise<Array<{ name: string; kind: string }>>;
  rm(uri: string): Promise<void>;
  mkdir(uri: string): Promise<void>;
}

const SESSIONS_ROOT = "mem://workspace/kernel/sessions";

function headerUri(sessionId: string): string {
  return `${SESSIONS_ROOT}/${sessionId}/header.json`;
}

function entriesUri(sessionId: string): string {
  return `${SESSIONS_ROOT}/${sessionId}/entries.jsonl`;
}

function sessionDir(sessionId: string): string {
  return `${SESSIONS_ROOT}/${sessionId}`;
}

function kernelSnapshotUri(sessionId: string): string {
  return `${sessionDir(sessionId)}/kernel.json`;
}

/**
 * SessionStorage adapter backed by BrowserVFS write-through.
 * Stores sessions under `mem://workspace/kernel/sessions/<id>/`.
 */
export class VfsSessionStorage implements SessionStorage {
  readonly #vfs: VfsLike;

  constructor(vfs: VfsLike) {
    this.#vfs = vfs;
  }

  async createSession(header: SessionHeader): Promise<void> {
    await this.#vfs.mkdir(sessionDir(header.id));
    await this.#vfs.write(headerUri(header.id), JSON.stringify(header));
    await this.#vfs.write(entriesUri(header.id), "");
    await this.#vfs.write(kernelSnapshotUri(header.id), JSON.stringify({}));
  }

  async appendEntry(sessionId: string, entry: SessionEntry): Promise<void> {
    const uri = entriesUri(sessionId);
    let current: string;
    try {
      current = await this.#vfs.read(uri);
    } catch {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const line = JSON.stringify(entry);
    const next = current.length > 0 ? `${current}\n${line}` : line;
    await this.#vfs.write(uri, next);
  }

  async getEntries(sessionId: string): Promise<SessionEntry[]> {
    let raw: string;
    try {
      raw = await this.#vfs.read(entriesUri(sessionId));
    } catch {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (raw.length === 0) return [];
    return raw.split("\n").map((line) => JSON.parse(line) as SessionEntry);
  }

  async listSessions(): Promise<SessionHeader[]> {
    let dirs: Array<{ name: string; kind: string }>;
    try {
      dirs = await this.#vfs.list(SESSIONS_ROOT);
    } catch {
      return [];
    }
    const headers: SessionHeader[] = [];
    for (const entry of dirs) {
      if (entry.kind !== "dir") continue;
      try {
        const raw = await this.#vfs.read(headerUri(entry.name));
        headers.push(JSON.parse(raw) as SessionHeader);
      } catch {
        // corrupted or partial session — skip
      }
    }
    return headers;
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.#vfs.read(headerUri(sessionId));
    } catch {
      throw new Error(`Session not found: ${sessionId}`);
    }
    await this.#vfs.rm(sessionDir(sessionId));
  }

  async readKernelSnapshot(sessionId: string): Promise<KernelSessionSnapshot | null> {
    try {
      const raw = await this.#vfs.read(kernelSnapshotUri(sessionId));
      return JSON.parse(raw) as KernelSessionSnapshot;
    } catch {
      try {
        await this.#vfs.read(headerUri(sessionId));
      } catch {
        throw new Error(`Session not found: ${sessionId}`);
      }
      return {};
    }
  }

  async writeKernelSnapshot(sessionId: string, snapshot: KernelSessionSnapshot): Promise<void> {
    try {
      await this.#vfs.read(headerUri(sessionId));
    } catch {
      throw new Error(`Session not found: ${sessionId}`);
    }
    await this.#vfs.write(kernelSnapshotUri(sessionId), JSON.stringify(snapshot));
  }
}
