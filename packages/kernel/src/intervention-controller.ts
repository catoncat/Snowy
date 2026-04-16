import {
  CapabilityError,
  type InterventionAuditEntry,
  type InterventionEscalationMetadata,
  type InterventionLifecycleStatus,
  type InterventionRecord,
  type InterventionRequest,
  type InterventionSummary,
} from "@bbl-next/contracts";
export type { InterventionLifecycleStatus } from "@bbl-next/contracts";

export type KernelInterventionRecord = InterventionRecord;
export type KernelInterventionEvent = InterventionAuditEntry;
export type KernelInterventionSummary = InterventionSummary;

export interface KernelInterventionSnapshot {
  records: KernelInterventionRecord[];
  audit: KernelInterventionEvent[];
}

interface StoredInterventionRecord extends InterventionRecord {
  resolution?: Record<string, unknown>;
}

function isoNow(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString();
}

function cloneRecord(record: StoredInterventionRecord): KernelInterventionRecord {
  return {
    ...record,
    ...(record.escalation ? { escalation: { ...record.escalation } } : {}),
    ...(record.payload ? { payload: { ...record.payload } } : {}),
    ...(record.resolution ? { resolution: { ...record.resolution } } : {}),
  };
}

function cloneEvent(entry: KernelInterventionEvent): KernelInterventionEvent {
  return {
    ...entry,
    ...(entry.details
      ? {
          details: {
            ...entry.details,
            ...(entry.details.escalation &&
            typeof entry.details.escalation === "object" &&
            !Array.isArray(entry.details.escalation)
              ? { escalation: { ...entry.details.escalation } }
              : {}),
          },
        }
      : {}),
  };
}

export class InterventionController {
  readonly #records = new Map<string, StoredInterventionRecord>();
  readonly #events: KernelInterventionEvent[] = [];
  readonly #maxEvents: number;

  constructor(opts?: { maxEvents?: number }) {
    this.#maxEvents = opts?.maxEvents ?? 64;
  }

  request(
    sessionId: string | null,
    request: InterventionRequest,
    opts?: {
      timeoutMs?: number;
      escalationMs?: number;
      now?: number;
    },
  ): KernelInterventionRecord {
    this.expire(opts?.now);
    const now = opts?.now ?? Date.now();
    const timestamp = isoNow(now);
    const timeoutMs =
      typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : null;
    const escalationMs =
      typeof opts?.escalationMs === "number" && opts.escalationMs > 0
        ? opts.escalationMs
        : timeoutMs;
    const record: StoredInterventionRecord = {
      ...request,
      ...(request.payload ? { payload: { ...request.payload } } : {}),
      sessionId: request.sessionId ?? sessionId ?? null,
      status: "requested",
      requestedAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timeoutMs == null ? null : isoNow(now + timeoutMs),
      escalation:
        escalationMs == null
          ? null
          : {
              thresholdMs: escalationMs,
              escalatesAt: isoNow(now + escalationMs),
              escalatedAt: null,
            },
      resolution: undefined,
    };
    this.#records.set(record.id, record);
    this.#appendEvent(record, "requested", timestamp);
    return cloneRecord(record);
  }

  resolve(
    interventionId: string,
    resolution?: Record<string, unknown>,
    opts?: { now?: number },
  ): KernelInterventionRecord {
    this.expire(opts?.now);
    const record = this.#requirePending(interventionId);
    const timestamp = isoNow(opts?.now);
    const updated: StoredInterventionRecord = {
      ...record,
      status: "resolved",
      updatedAt: timestamp,
      resolution: resolution ? { ...resolution } : undefined,
    };
    this.#records.set(interventionId, updated);
    this.#appendEvent(updated, "resolved", timestamp, resolution);
    return cloneRecord(updated);
  }

  cancel(
    interventionId: string,
    details?: Record<string, unknown>,
    opts?: { now?: number },
  ): KernelInterventionRecord {
    this.expire(opts?.now);
    const record = this.#requirePending(interventionId);
    const timestamp = isoNow(opts?.now);
    const updated: StoredInterventionRecord = {
      ...record,
      status: "cancelled",
      updatedAt: timestamp,
      resolution: details ? { ...details } : undefined,
    };
    this.#records.set(interventionId, updated);
    this.#appendEvent(updated, "cancelled", timestamp, details);
    return cloneRecord(updated);
  }

  expire(now = Date.now()): KernelInterventionRecord[] {
    const expired: KernelInterventionRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.status !== "requested") {
        continue;
      }

      const timeoutAt =
        typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : Number.NaN;
      if (Number.isFinite(timeoutAt) && timeoutAt <= now) {
        const updated: StoredInterventionRecord = {
          ...record,
          status: "timed_out",
          updatedAt: isoNow(now),
          escalation:
            record.escalation == null
              ? null
              : {
                  ...record.escalation,
                  escalatedAt: record.escalation.escalatedAt ?? isoNow(now),
                },
        };
        this.#records.set(record.id, updated);
        this.#appendEvent(updated, "timed_out", updated.updatedAt, {
          escalation: this.#buildEscalationMetadata(
            updated,
            "timeout",
            now,
            typeof record.expiresAt === "string" ? timeoutAt : now,
            typeof record.expiresAt === "string"
              ? timeoutAt - Date.parse(record.requestedAt)
              : now - Date.parse(record.requestedAt),
          ),
        });
        expired.push(cloneRecord(updated));
        continue;
      }

      const escalationAt =
        record.escalation && typeof record.escalation.escalatesAt === "string"
          ? Date.parse(record.escalation.escalatesAt)
          : Number.NaN;
      if (
        record.escalation &&
        record.escalation.escalatedAt == null &&
        Number.isFinite(escalationAt) &&
        escalationAt <= now
      ) {
        const updated: StoredInterventionRecord = {
          ...record,
          updatedAt: isoNow(now),
          escalation: {
            ...record.escalation,
            escalatedAt: isoNow(now),
          },
        };
        this.#records.set(record.id, updated);
        this.#appendEvent(updated, "requested", updated.updatedAt, {
          escalation: this.#buildEscalationMetadata(
            updated,
            "stale",
            now,
            escalationAt,
            record.escalation.thresholdMs,
          ),
        });
      }
    }
    return expired;
  }

  list(opts?: {
    sessionId?: string | null;
    status?: InterventionLifecycleStatus;
    now?: number;
  }): KernelInterventionRecord[] {
    this.expire(opts?.now);
    return [...this.#records.values()]
      .filter((record) =>
        opts?.sessionId === undefined ? true : record.sessionId === (opts.sessionId ?? null),
      )
      .filter((record) => (opts?.status ? record.status === opts.status : true))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((record) => cloneRecord(record));
  }

  readAudit(opts?: {
    sessionId?: string | null;
    limit?: number;
    now?: number;
  }): KernelInterventionEvent[] {
    this.expire(opts?.now);
    const filtered = this.#events.filter((entry) =>
      opts?.sessionId === undefined ? true : entry.sessionId === (opts.sessionId ?? null),
    );
    const limit = typeof opts?.limit === "number" && opts.limit > 0 ? opts.limit : this.#maxEvents;
    return filtered.slice(-limit).map((entry) => cloneEvent(entry));
  }

  snapshot(opts?: {
    sessionId?: string | null;
    now?: number;
  }): KernelInterventionSnapshot {
    this.expire(opts?.now);
    return {
      records: this.list({
        sessionId: opts?.sessionId,
        now: opts?.now,
      }),
      audit: this.readAudit({
        sessionId: opts?.sessionId,
        limit: Number.MAX_SAFE_INTEGER,
        now: opts?.now,
      }),
    };
  }

  replaceSession(
    sessionId: string | null,
    snapshot: KernelInterventionSnapshot | null | undefined,
    opts?: { now?: number },
  ): void {
    this.expire(opts?.now);
    const normalizedSessionId = sessionId ?? null;
    for (const [interventionId, record] of this.#records.entries()) {
      if (record.sessionId === normalizedSessionId) {
        this.#records.delete(interventionId);
      }
    }

    if (this.#events.length > 0) {
      const retained = this.#events.filter((entry) => entry.sessionId !== normalizedSessionId);
      this.#events.splice(0, this.#events.length, ...retained);
    }

    for (const record of snapshot?.records ?? []) {
      this.#records.set(record.id, {
        ...cloneRecord(record),
      });
    }

    if (snapshot?.audit?.length) {
      const merged = [...this.#events, ...snapshot.audit.map((entry) => cloneEvent(entry))].sort(
        (left, right) => left.timestamp.localeCompare(right.timestamp),
      );
      this.#events.splice(
        0,
        this.#events.length,
        ...merged.slice(-this.#maxEvents).map((entry) => cloneEvent(entry)),
      );
    }
  }

  getSummary(opts?: {
    sessionId?: string | null;
    auditLimit?: number;
    now?: number;
  }): KernelInterventionSummary {
    const all = this.list({
      sessionId: opts?.sessionId,
      now: opts?.now,
    });
    const active = all.filter((record) => record.status === "requested");
    const recent = all.filter((record) => record.status !== "requested");
    const recentCount = this.readAudit({
      sessionId: opts?.sessionId,
      limit: opts?.auditLimit,
      now: opts?.now,
    }).length;
    return {
      status: all.length === 0 ? "empty" : active.length > 0 ? "requested" : "settled",
      totalCount: all.length,
      activeCount: active.length,
      recentCount,
      active,
      recent,
    };
  }

  #requirePending(interventionId: string): StoredInterventionRecord {
    const record = this.#records.get(interventionId);
    if (!record) {
      throw new CapabilityError("E_BAD_INPUT", `Unknown intervention request: ${interventionId}`);
    }
    if (record.status !== "requested") {
      throw new CapabilityError(
        "E_BAD_INPUT",
        `Intervention request is not pending: ${interventionId}`,
      );
    }
    return record;
  }

  #appendEvent(
    record: StoredInterventionRecord,
    status: InterventionLifecycleStatus,
    timestamp: string,
    details?: Record<string, unknown>,
  ): void {
    this.#events.push({
      eventId: `ive-${crypto.randomUUID()}`,
      interventionId: record.id,
      sessionId: record.sessionId ?? null,
      status,
      timestamp,
      kind: record.kind,
      trigger: record.trigger,
      ...(details ? { details: { ...details } } : {}),
    });
    if (this.#events.length > this.#maxEvents) {
      this.#events.splice(0, this.#events.length - this.#maxEvents);
    }
  }

  #buildEscalationMetadata(
    record: StoredInterventionRecord,
    reason: "stale" | "timeout",
    now: number,
    referenceTimestamp: number,
    thresholdMs: number,
  ): InterventionEscalationMetadata {
    return {
      reason,
      thresholdMs,
      overdueMs: Math.max(0, now - referenceTimestamp),
      expiresAt: record.expiresAt,
      tabId: record.tabId ?? null,
    };
  }
}
