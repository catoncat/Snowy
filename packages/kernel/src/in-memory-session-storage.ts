import type {
  KernelSessionSnapshot,
  SessionEntry,
  SessionHeader,
  SessionStorage,
} from "@bbl-next/contracts";

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory SessionStorage for tests and transient use.
 */
export class InMemorySessionStorage implements SessionStorage {
  readonly #headers = new Map<string, SessionHeader>();
  readonly #entries = new Map<string, SessionEntry[]>();
  readonly #kernelSnapshots = new Map<string, KernelSessionSnapshot>();

  async createSession(header: SessionHeader): Promise<void> {
    this.#headers.set(header.id, cloneValue(header));
    this.#entries.set(header.id, []);
    this.#kernelSnapshots.set(header.id, {});
  }

  async appendEntry(sessionId: string, entry: SessionEntry): Promise<void> {
    const list = this.#entries.get(sessionId);
    if (!list) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    list.push(cloneValue(entry));
  }

  async getEntries(sessionId: string): Promise<SessionEntry[]> {
    const list = this.#entries.get(sessionId);
    if (!list) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return cloneValue(list);
  }

  async listSessions(): Promise<SessionHeader[]> {
    return cloneValue([...this.#headers.values()]);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const existedInHeaders = this.#headers.delete(sessionId);
    const existedInEntries = this.#entries.delete(sessionId);
    const existedInSnapshots = this.#kernelSnapshots.delete(sessionId);
    if (!existedInHeaders || !existedInEntries || !existedInSnapshots) {
      throw new Error(`Session not found: ${sessionId}`);
    }
  }

  async readKernelSnapshot(sessionId: string): Promise<KernelSessionSnapshot | null> {
    if (!this.#headers.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return cloneValue(this.#kernelSnapshots.get(sessionId) ?? {});
  }

  async writeKernelSnapshot(sessionId: string, snapshot: KernelSessionSnapshot): Promise<void> {
    if (!this.#headers.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.#kernelSnapshots.set(sessionId, cloneValue(snapshot));
  }
}
