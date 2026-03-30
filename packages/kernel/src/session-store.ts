import type {
  CompactionPayload,
  MessagePayload,
  SessionContext,
  SessionContextMessage,
  SessionEntry,
  SessionHeader,
  SessionStorage,
} from "@bbl-next/contracts";

function generateSessionId(): string {
  return `s-${crypto.randomUUID()}`;
}

function generateEntryId(): string {
  return `e-${crypto.randomUUID()}`;
}

function isMessagePayload(payload: unknown): payload is MessagePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybe = payload as Partial<MessagePayload>;
  const roleValid = maybe.role === "user" || maybe.role === "assistant" || maybe.role === "system";
  const textValid = typeof maybe.text === "string";
  const toolNameValid = maybe.toolName === undefined || typeof maybe.toolName === "string";
  const toolCallIdValid = maybe.toolCallId === undefined || typeof maybe.toolCallId === "string";

  return roleValid && textValid && toolNameValid && toolCallIdValid;
}

function isCompactionPayload(payload: unknown): payload is CompactionPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybe = payload as Partial<CompactionPayload>;
  const reasonValid =
    maybe.reason === "overflow" || maybe.reason === "threshold" || maybe.reason === "manual";
  const summaryValid = typeof maybe.summary === "string";
  const firstKeptValid = typeof maybe.firstKeptEntryId === "string";
  const prevSummaryValid =
    maybe.previousSummary === undefined || typeof maybe.previousSummary === "string";
  const tokensBeforeValid = typeof maybe.tokensBefore === "number";
  const tokensAfterValid = typeof maybe.tokensAfter === "number";

  return (
    reasonValid &&
    summaryValid &&
    firstKeptValid &&
    prevSummaryValid &&
    tokensBeforeValid &&
    tokensAfterValid
  );
}

export class SessionStore {
  readonly #storage: SessionStorage;

  constructor(storage: SessionStorage) {
    this.#storage = storage;
  }

  async createSession(opts?: {
    parentSessionId?: string;
    title?: string;
    model?: string;
  }): Promise<SessionHeader> {
    const header: SessionHeader = {
      id: generateSessionId(),
      createdAt: new Date().toISOString(),
      ...opts,
    };
    await this.#storage.createSession(header);
    return header;
  }

  async listSessions(): Promise<SessionHeader[]> {
    return this.#storage.listSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.#storage.deleteSession(sessionId);
  }

  async appendEntry(
    sessionId: string,
    type: SessionEntry["type"],
    payload: unknown,
  ): Promise<SessionEntry> {
    const entries = await this.#storage.getEntries(sessionId);
    const lastEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;
    const entry: SessionEntry = {
      entryId: generateEntryId(),
      parentId: lastEntry?.entryId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
    await this.#storage.appendEntry(sessionId, entry);
    return entry;
  }

  async getEntries(sessionId: string): Promise<SessionEntry[]> {
    return this.#storage.getEntries(sessionId);
  }

  /**
   * Build the session context by replaying entries.
   *
   * If compaction entries exist, uses the latest one:
   * - Inserts a compactionSummary message
   * - Only includes entries from firstKeptEntryId onward
   */
  async buildContext(sessionId: string): Promise<SessionContext> {
    const entries = await this.#storage.getEntries(sessionId);

    // Find the latest compaction entry
    let lastCompactionIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].type === "compaction") {
        lastCompactionIdx = i;
        break;
      }
    }

    const messages: SessionContextMessage[] = [];

    if (lastCompactionIdx >= 0) {
      const compactionEntry = entries[lastCompactionIdx];
      const compactionPayload = isCompactionPayload(compactionEntry.payload)
        ? compactionEntry.payload
        : undefined;

      let startIdx = lastCompactionIdx + 1;
      if (compactionPayload) {
        // Insert compaction summary as first message
        messages.push({
          role: "compactionSummary",
          content: compactionPayload.summary,
          entryId: compactionEntry.entryId,
        });

        // Find the index of firstKeptEntryId
        const firstKeptIdx = entries.findIndex(
          (e) => e.entryId === compactionPayload.firstKeptEntryId,
        );
        startIdx = firstKeptIdx >= 0 ? firstKeptIdx : lastCompactionIdx + 1;

        // Include kept entries (between firstKeptEntryId and compaction entry)
        for (let i = startIdx; i < lastCompactionIdx; i++) {
          const msg = entryToContextMessage(entries[i]);
          if (msg) messages.push(msg);
        }
      }

      // Include all entries after the compaction entry
      for (let i = lastCompactionIdx + 1; i < entries.length; i++) {
        const msg = entryToContextMessage(entries[i]);
        if (msg) messages.push(msg);
      }
    } else {
      // No compaction: include all message entries
      for (const entry of entries) {
        const msg = entryToContextMessage(entry);
        if (msg) messages.push(msg);
      }
    }

    return { sessionId, entries, messages };
  }
}

function entryToContextMessage(entry: SessionEntry): SessionContextMessage | null {
  if (entry.type !== "message") return null;
  if (!isMessagePayload(entry.payload)) {
    return null;
  }

  const payload = entry.payload;
  return {
    role: payload.role,
    content: payload.text,
    entryId: entry.entryId,
    toolName: payload.toolName,
    toolCallId: payload.toolCallId,
  };
}
