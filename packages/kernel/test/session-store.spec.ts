import { describe, expect, it, beforeEach } from "vitest";
import { SessionStore, InMemorySessionStorage } from "@bbl-next/kernel";
import type { MessagePayload, CompactionPayload } from "@bbl-next/contracts";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(new InMemorySessionStorage());
  });

  describe("session lifecycle", () => {
    it("creates a session with auto-generated id", async () => {
      const header = await store.createSession({ title: "Test" });

      expect(header.id).toMatch(/^s-/);
      expect(header.title).toBe("Test");
      expect(header.createdAt).toBeTruthy();
    });

    it("creates sessions with unique ids", async () => {
      const h1 = await store.createSession();
      const h2 = await store.createSession();

      expect(h1.id).not.toBe(h2.id);
      expect(h1.id).toMatch(/^s-/);
      expect(h2.id).toMatch(/^s-/);
    });

    it("lists all sessions", async () => {
      await store.createSession({ title: "A" });
      await store.createSession({ title: "B" });

      const sessions = await store.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.title)).toEqual(["A", "B"]);
    });

    it("deletes a session", async () => {
      const header = await store.createSession();
      await store.deleteSession(header.id);

      const sessions = await store.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it("throws when deleting a nonexistent session", async () => {
      await expect(store.deleteSession("s-not-found")).rejects.toThrow("Session not found");
    });
  });

  describe("entry append", () => {
    it("appends message entries with parentId chain", async () => {
      const session = await store.createSession();

      const e1 = await store.appendEntry(session.id, "message", {
        role: "user",
        text: "Hello"
      } satisfies MessagePayload);

      const e2 = await store.appendEntry(session.id, "message", {
        role: "assistant",
        text: "Hi there"
      } satisfies MessagePayload);

      expect(e1.parentId).toBeUndefined();
      expect(e2.parentId).toBe(e1.entryId);
    });

    it("retrieves entries in order", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "user", text: "A"
      } satisfies MessagePayload);
      await store.appendEntry(session.id, "message", {
        role: "assistant", text: "B"
      } satisfies MessagePayload);
      await store.appendEntry(session.id, "label", { label: "checkpoint" });

      const entries = await store.getEntries(session.id);
      expect(entries).toHaveLength(3);
      expect(entries[0].type).toBe("message");
      expect(entries[1].type).toBe("message");
      expect(entries[2].type).toBe("label");
    });

    it("throws on append to nonexistent session", async () => {
      await expect(
        store.appendEntry("nonexistent", "message", { role: "user", text: "X" })
      ).rejects.toThrow("Session not found");
    });

    it("isolates stored payload from caller mutation", async () => {
      const session = await store.createSession();
      const payload: MessagePayload = { role: "user", text: "before" };

      await store.appendEntry(session.id, "message", payload);
      payload.text = "after";

      const entries = await store.getEntries(session.id);
      const first = entries[0].payload as MessagePayload;
      expect(first.text).toBe("before");
    });
  });

  describe("context build — no compaction", () => {
    it("builds context with all message entries", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "user", text: "Hello"
      } satisfies MessagePayload);
      await store.appendEntry(session.id, "message", {
        role: "assistant", text: "Hi"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);

      expect(ctx.sessionId).toBe(session.id);
      expect(ctx.messages).toHaveLength(2);
      expect(ctx.messages[0].role).toBe("user");
      expect(ctx.messages[0].content).toBe("Hello");
      expect(ctx.messages[1].role).toBe("assistant");
      expect(ctx.messages[1].content).toBe("Hi");
    });

    it("skips non-message entries in context messages", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "user", text: "Hello"
      } satisfies MessagePayload);
      await store.appendEntry(session.id, "label", { label: "mark" });
      await store.appendEntry(session.id, "message", {
        role: "assistant", text: "Hi"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);

      expect(ctx.messages).toHaveLength(2);
      expect(ctx.entries).toHaveLength(3); // all entries retained
    });

    it("preserves toolName and toolCallId in context messages", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "assistant",
        text: "result",
        toolName: "page_click",
        toolCallId: "tc-001"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);
      expect(ctx.messages[0].toolName).toBe("page_click");
      expect(ctx.messages[0].toolCallId).toBe("tc-001");
    });
  });

  describe("context build — with compaction", () => {
    it("rebuilds context from compaction entry", async () => {
      const session = await store.createSession();

      // Pre-compaction messages
      const e1 = await store.appendEntry(session.id, "message", {
        role: "user", text: "old message 1"
      } satisfies MessagePayload);
      await store.appendEntry(session.id, "message", {
        role: "assistant", text: "old message 2"
      } satisfies MessagePayload);

      // Compaction entry (firstKeptEntryId = e1 means e1 is kept)
      await store.appendEntry(session.id, "compaction", {
        reason: "threshold",
        summary: "Previous conversation about setup.",
        firstKeptEntryId: e1.entryId,
        tokensBefore: 10000,
        tokensAfter: 2000
      } satisfies CompactionPayload);

      // Post-compaction messages
      await store.appendEntry(session.id, "message", {
        role: "user", text: "new message"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);

      // Messages: compactionSummary + kept messages before compaction + post-compaction
      expect(ctx.messages[0].role).toBe("compactionSummary");
      expect(ctx.messages[0].content).toBe("Previous conversation about setup.");
      // e1 is kept (between firstKeptEntryId and compaction entry)
      expect(ctx.messages[1].role).toBe("user");
      expect(ctx.messages[1].content).toBe("old message 1");
      expect(ctx.messages[2].role).toBe("assistant");
      expect(ctx.messages[2].content).toBe("old message 2");
      // Post-compaction message
      expect(ctx.messages[3].role).toBe("user");
      expect(ctx.messages[3].content).toBe("new message");
      expect(ctx.messages).toHaveLength(4);
    });

    it("handles compaction where all pre-compaction entries are dropped", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "user", text: "dropped"
      } satisfies MessagePayload);

      // Compaction with firstKeptEntryId that doesn't match any entry
      // → starts from after the compaction entry
      await store.appendEntry(session.id, "compaction", {
        reason: "overflow",
        summary: "Context was summarized.",
        firstKeptEntryId: "nonexistent",
        tokensBefore: 20000,
        tokensAfter: 1000
      } satisfies CompactionPayload);

      await store.appendEntry(session.id, "message", {
        role: "user", text: "fresh start"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);

      expect(ctx.messages).toHaveLength(2);
      expect(ctx.messages[0].role).toBe("compactionSummary");
      expect(ctx.messages[1].content).toBe("fresh start");
    });

    it("uses the latest compaction when multiple exist", async () => {
      const session = await store.createSession();

      await store.appendEntry(session.id, "message", {
        role: "user", text: "very old"
      } satisfies MessagePayload);

      await store.appendEntry(session.id, "compaction", {
        reason: "threshold",
        summary: "First compaction.",
        firstKeptEntryId: "nonexistent",
        tokensBefore: 10000,
        tokensAfter: 2000
      } satisfies CompactionPayload);

      await store.appendEntry(session.id, "message", {
        role: "user", text: "middle"
      } satisfies MessagePayload);

      await store.appendEntry(session.id, "compaction", {
        reason: "threshold",
        summary: "Second compaction (iterative update).",
        firstKeptEntryId: "nonexistent",
        previousSummary: "First compaction.",
        tokensBefore: 8000,
        tokensAfter: 1500
      } satisfies CompactionPayload);

      await store.appendEntry(session.id, "message", {
        role: "user", text: "latest"
      } satisfies MessagePayload);

      const ctx = await store.buildContext(session.id);

      expect(ctx.messages[0].role).toBe("compactionSummary");
      expect(ctx.messages[0].content).toBe("Second compaction (iterative update).");
      expect(ctx.messages[1].content).toBe("latest");
      expect(ctx.messages).toHaveLength(2);
    });
  });
});
