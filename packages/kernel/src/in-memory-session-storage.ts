import type { SessionEntry, SessionHeader, SessionStorage } from "@bbl-next/contracts";

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

  async createSession(header: SessionHeader): Promise<void> {
    this.#headers.set(header.id, cloneValue(header));
    this.#entries.set(header.id, []);
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
    if (!existedInHeaders || !existedInEntries) {
      throw new Error(`Session not found: ${sessionId}`);
    }
  }
}
