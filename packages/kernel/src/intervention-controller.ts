import { CapabilityError, type InterventionRequest } from "@bbl-next/contracts";

export type InterventionLifecycleStatus =
  | InterventionRequest["status"]
  | "resolved"
  | "cancelled"
  | "timed_out";

export interface KernelInterventionRecord extends Omit<InterventionRequest, "status"> {
  status: InterventionLifecycleStatus;
  sessionId: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  resolution?: Record<string, unknown>;
}

export interface KernelInterventionEvent {
  eventId: string;
  interventionId: string;
  sessionId: string | null;
  status: InterventionLifecycleStatus;
  timestamp: string;
  kind: KernelInterventionRecord["kind"];
  trigger: KernelInterventionRecord["trigger"];
  details?: Record<string, unknown>;
}

export interface KernelInterventionSummary {
  status: "empty" | "requested" | "settled";
  totalCount: number;
  activeCount: number;
  recentCount: number;
  active: KernelInterventionRecord[];
}

interface StoredInterventionRecord extends KernelInterventionRecord {
  resolution?: Record<string, unknown>;
}

function isoNow(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString();
}

function cloneRecord(record: StoredInterventionRecord): KernelInterventionRecord {
  return {
    ...record,
    ...(record.payload ? { payload: { ...record.payload } } : {}),
    ...(record.resolution ? { resolution: { ...record.resolution } } : {}),
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
      now?: number;
    },
  ): KernelInterventionRecord {
    this.expire(opts?.now);
    const timestamp = isoNow(opts?.now);
    const timeoutMs =
      typeof opts?.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : null;
    const record: StoredInterventionRecord = {
      ...request,
      ...(request.payload ? { payload: { ...request.payload } } : {}),
      sessionId: request.sessionId ?? sessionId ?? null,
      status: "requested",
      requestedAt: timestamp,
      updatedAt: timestamp,
      expiresAt: timeoutMs == null ? null : isoNow((opts?.now ?? Date.now()) + timeoutMs),
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
      if (
        record.status === "requested" &&
        typeof record.expiresAt === "string" &&
        Date.parse(record.expiresAt) <= now
      ) {
        const updated: StoredInterventionRecord = {
          ...record,
          status: "timed_out",
          updatedAt: isoNow(now),
        };
        this.#records.set(record.id, updated);
        this.#appendEvent(updated, "timed_out", updated.updatedAt);
        expired.push(cloneRecord(updated));
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
    return filtered.slice(-limit).map((entry) => ({
      ...entry,
      ...(entry.details ? { details: { ...entry.details } } : {}),
    }));
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
}
