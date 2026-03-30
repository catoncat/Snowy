import type {
  CompactionDraft,
  CompactionPayload,
  CompactionReason,
  KernelLlmAdapter,
  MessagePayload,
  SessionEntry,
} from "@bbl-next/contracts";
import type { SessionStore } from "./session-store.js";

export interface CompactionOptions {
  /** Threshold ratio: compact when tokens > contextWindow * (1 - reserveRatio). Default 0.8 */
  thresholdRatio?: number;
  /** Minimum tokens to keep after compaction (recent messages). Default 4000 */
  keepRecentTokens?: number;
}

export interface CompactionPreparation {
  sessionId: string;
  reason: CompactionReason;
  messagesToSummarize: SessionEntry[];
  keptEntries: SessionEntry[];
  firstKeptEntryId: string;
  previousSummary: string | undefined;
  tokensBefore: number;
}

const DEFAULT_THRESHOLD_RATIO = 0.8;
const DEFAULT_KEEP_RECENT_TOKENS = 4000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const CJK_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

const SUMMARIZATION_SYSTEM_PROMPT =
  "You are a context summarization assistant. Produce a concise, structured summary of the conversation that preserves all key facts, decisions, code changes, file paths, and action items. Use bullet points and group by topic.";

function isMessagePayload(payload: unknown): payload is MessagePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const maybe = payload as Partial<MessagePayload>;
  const roleValid = maybe.role === "user" || maybe.role === "assistant" || maybe.role === "system";
  const textValid = typeof maybe.text === "string";
  return roleValid && textValid;
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

function estimateTextTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const cjkCount = (text.match(CJK_CHAR_REGEX) ?? []).length;
  const nonCjkCount = text.length - cjkCount;
  return cjkCount + Math.ceil(nonCjkCount / CHARS_PER_TOKEN_ESTIMATE);
}

function escapeXmlLike(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function estimateTokens(entries: SessionEntry[]): number {
  let tokens = 0;
  for (const entry of entries) {
    if (entry.type === "message") {
      if (isMessagePayload(entry.payload)) {
        tokens += estimateTextTokens(entry.payload.text);
      }
    } else if (entry.type === "compaction") {
      if (isCompactionPayload(entry.payload)) {
        tokens += estimateTextTokens(entry.payload.summary);
      }
    }
  }
  return tokens;
}

export class CompactionManager {
  readonly #store: SessionStore;
  readonly #llm: KernelLlmAdapter;
  readonly #thresholdRatio: number;
  readonly #keepRecentTokens: number;

  constructor(store: SessionStore, llm: KernelLlmAdapter, opts?: CompactionOptions) {
    this.#store = store;
    this.#llm = llm;
    this.#thresholdRatio = opts?.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
    this.#keepRecentTokens = opts?.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS;
  }

  async shouldCompact(
    sessionId: string,
    contextWindow: number,
    currentTokens?: number,
  ): Promise<boolean> {
    const tokens = currentTokens ?? estimateTokens(await this.#store.getEntries(sessionId));
    const threshold = contextWindow * this.#thresholdRatio;
    return tokens > threshold;
  }

  async prepare(sessionId: string, reason: CompactionReason): Promise<CompactionPreparation> {
    const entries = await this.#store.getEntries(sessionId);
    if (entries.length === 0) {
      throw new Error(`Cannot compact an empty session: ${sessionId}`);
    }

    const tokensBefore = estimateTokens(entries);

    // Find previous compaction summary for iterative update
    let previousSummary: string | undefined;
    let postCompactionStart = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].type === "compaction") {
        const payload = entries[i].payload;
        if (isCompactionPayload(payload)) {
          previousSummary = payload.summary;
        }
        postCompactionStart = i + 1;
        break;
      }
    }

    // Find cut point: keep recent entries worth keepRecentTokens
    const entriesToConsider = entries.slice(postCompactionStart);
    let keptTokens = 0;
    let cutIdx = entriesToConsider.length;
    for (let i = entriesToConsider.length - 1; i >= 0; i--) {
      const entryTokens = estimateTokens([entriesToConsider[i]]);
      if (keptTokens + entryTokens > this.#keepRecentTokens) {
        cutIdx = i + 1;
        break;
      }
      keptTokens += entryTokens;
      if (i === 0) cutIdx = 0;
    }

    const messagesToSummarize = entriesToConsider.slice(0, cutIdx);
    const keptEntries = entriesToConsider.slice(cutIdx);
    const firstKeptEntryId =
      keptEntries.length > 0 ? keptEntries[0].entryId : entries[entries.length - 1].entryId;

    return {
      sessionId,
      reason,
      messagesToSummarize,
      keptEntries,
      firstKeptEntryId,
      previousSummary,
      tokensBefore,
    };
  }

  async execute(preparation: CompactionPreparation): Promise<CompactionDraft> {
    const { messagesToSummarize, previousSummary, tokensBefore } = preparation;

    if (messagesToSummarize.length === 0) {
      const summary = (previousSummary ?? "").trim();
      const tokensAfter = estimateTokens(preparation.keptEntries) + estimateTextTokens(summary);
      return {
        reason: preparation.reason,
        summary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        previousSummary,
        tokensBefore,
        tokensAfter,
      };
    }

    // Serialize messages for LLM
    const conversationText = messagesToSummarize
      .filter((e) => e.type === "message")
      .map((e) => {
        if (!isMessagePayload(e.payload)) {
          return null;
        }
        const role = escapeXmlLike(e.payload.role);
        const text = escapeXmlLike(e.payload.text);
        return `[${role}]: ${text}`;
      })
      .filter((line): line is string => line !== null)
      .join("\n\n");

    if (!conversationText && !previousSummary) {
      const tokensAfter = estimateTokens(preparation.keptEntries);
      return {
        reason: preparation.reason,
        summary: "",
        firstKeptEntryId: preparation.firstKeptEntryId,
        previousSummary,
        tokensBefore,
        tokensAfter,
      };
    }

    const escapedPreviousSummary = previousSummary ? escapeXmlLike(previousSummary) : undefined;

    const userPrompt = escapedPreviousSummary
      ? `<previous-summary>\n${escapedPreviousSummary}\n</previous-summary>\n\n<conversation>\n${conversationText}\n</conversation>\n\nUpdate the previous summary to incorporate the new conversation. Keep it concise and structured.`
      : `<conversation>\n${conversationText}\n</conversation>\n\nSummarize this conversation. Keep it concise and structured.`;

    const summary = await this.#llm.complete({
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const tokensAfter = estimateTextTokens(summary) + estimateTokens(preparation.keptEntries);

    return {
      reason: preparation.reason,
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      previousSummary,
      tokensBefore,
      tokensAfter,
    };
  }

  async apply(sessionId: string, draft: CompactionDraft): Promise<void> {
    const payload: CompactionPayload = {
      reason: draft.reason,
      summary: draft.summary,
      firstKeptEntryId: draft.firstKeptEntryId,
      previousSummary: draft.previousSummary,
      tokensBefore: draft.tokensBefore,
      tokensAfter: draft.tokensAfter,
    };
    await this.#store.appendEntry(sessionId, "compaction", payload);
  }
}
