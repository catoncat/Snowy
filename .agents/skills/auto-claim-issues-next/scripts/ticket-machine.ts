import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface QueueEntry {
  issue_id: string;
  issue_path: string;
  title: string;
  parallel_group: string;
  module_id: string;
  module_stage: "mainline" | "secondary" | "deferred";
  tracking_kind: "mainline" | "gap" | "follow-up" | "doc-debt";
  check_cmd: string;
  depends_on: string[];
  write_scope: string[];
}

export interface LiveQueue {
  schema_version: 1;
  generated_at: string;
  repo_root: string;
  entries: QueueEntry[];
}

export interface TicketLease {
  session_id: string;
  agent_name: string;
  issue_id: string;
  issue_title: string;
  parallel_group: string;
  write_scope: string[];
  check_cmd: string;
  claimed_at: string;
}

export interface LeaseState {
  schema_version: 1;
  repo_id: string;
  updated_at: string;
  leases_by_session: Record<string, TicketLease>;
  leases_by_issue: Record<string, string>;
}

export interface TicketMachineOptions {
  leaseRootDir?: string;
}

export interface TakeTicketArgs extends TicketMachineOptions {
  repoRoot: string;
  sessionId: string;
  agentName: string;
  dryRun?: boolean;
  issueId?: string;
}

export type TakeTicketResult =
  | {
      kind: "ticket";
      reused: boolean;
      entry: QueueEntry;
      reason: string;
    }
  | {
      kind: "queue_empty";
      reason: string;
    };

const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 50;
const STALE_LOCK_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function liveQueuePath(repoRoot: string): string {
  return path.join(repoRoot, "docs", "workflow", "live-queue.json");
}

function repoId(repoRoot: string): string {
  return path.basename(repoRoot);
}

function leaseRootDir(opts?: TicketMachineOptions): string {
  return opts?.leaseRootDir ?? path.join(os.homedir(), ".codex", "workflow-leases");
}

export function leaseStatePath(repoRoot: string, opts?: TicketMachineOptions): string {
  return path.join(leaseRootDir(opts), `${repoId(repoRoot)}.json`);
}

function leaseLockPath(repoRoot: string, opts?: TicketMachineOptions): string {
  return `${leaseStatePath(repoRoot, opts)}.lock`;
}

export function loadLiveQueue(repoRoot: string): LiveQueue {
  const raw = JSON.parse(readFileSync(liveQueuePath(repoRoot), "utf8")) as Partial<LiveQueue>;
  if (raw.schema_version !== 1 || !Array.isArray(raw.entries)) {
    throw new Error("live queue schema_version must be 1 with entries");
  }

  const entries = raw.entries.map((entry, index) => {
    if (
      !entry ||
      typeof entry.issue_id !== "string" ||
      typeof entry.issue_path !== "string" ||
      typeof entry.title !== "string" ||
      typeof entry.parallel_group !== "string" ||
      typeof entry.module_id !== "string" ||
      (entry.module_stage !== "mainline" &&
        entry.module_stage !== "secondary" &&
        entry.module_stage !== "deferred") ||
      (entry.tracking_kind !== "mainline" &&
        entry.tracking_kind !== "gap" &&
        entry.tracking_kind !== "follow-up" &&
        entry.tracking_kind !== "doc-debt") ||
      typeof entry.check_cmd !== "string" ||
      !Array.isArray(entry.depends_on) ||
      !Array.isArray(entry.write_scope)
    ) {
      throw new Error(`invalid live queue entry at index ${index}`);
    }

    return {
      issue_id: entry.issue_id,
      issue_path: entry.issue_path,
      title: entry.title,
      parallel_group: entry.parallel_group,
      module_id: entry.module_id,
      module_stage: entry.module_stage,
      tracking_kind: entry.tracking_kind,
      check_cmd: entry.check_cmd,
      depends_on: entry.depends_on.map((item) => String(item)),
      write_scope: entry.write_scope.map((item) => String(item)),
    } satisfies QueueEntry;
  });

  return {
    schema_version: 1,
    generated_at: String(raw.generated_at || ""),
    repo_root: String(raw.repo_root || repoRoot),
    entries,
  };
}

function defaultLeaseState(repoRoot: string): LeaseState {
  return {
    schema_version: 1,
    repo_id: repoId(repoRoot),
    updated_at: new Date().toISOString(),
    leases_by_session: {},
    leases_by_issue: {},
  };
}

export function loadLeaseState(repoRoot: string, opts?: TicketMachineOptions): LeaseState {
  try {
    const raw = JSON.parse(
      readFileSync(leaseStatePath(repoRoot, opts), "utf8"),
    ) as Partial<LeaseState>;
    if (
      raw.schema_version === 1 &&
      raw.repo_id === repoId(repoRoot) &&
      raw.leases_by_session &&
      raw.leases_by_issue
    ) {
      return {
        schema_version: 1,
        repo_id: raw.repo_id,
        updated_at: String(raw.updated_at || new Date().toISOString()),
        leases_by_session: raw.leases_by_session as Record<string, TicketLease>,
        leases_by_issue: raw.leases_by_issue as Record<string, string>,
      };
    }
  } catch {}
  return defaultLeaseState(repoRoot);
}

function saveLeaseState(repoRoot: string, state: LeaseState, opts?: TicketMachineOptions): void {
  const filePath = leaseStatePath(repoRoot, opts);
  mkdirSync(path.dirname(filePath), { recursive: true });
  state.updated_at = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function cleanupLeaseState(queue: LiveQueue, state: LeaseState): boolean {
  let changed = false;
  const validIssueIds = new Set(queue.entries.map((entry) => entry.issue_id));

  for (const [sessionId, lease] of Object.entries(state.leases_by_session)) {
    if (!validIssueIds.has(lease.issue_id)) {
      delete state.leases_by_session[sessionId];
      changed = true;
    }
  }

  for (const [issueId, sessionId] of Object.entries(state.leases_by_issue)) {
    const sessionLease = state.leases_by_session[sessionId];
    if (!validIssueIds.has(issueId) || !sessionLease || sessionLease.issue_id !== issueId) {
      delete state.leases_by_issue[issueId];
      changed = true;
    }
  }

  return changed;
}

function entryByIssueId(queue: LiveQueue, issueId: string): QueueEntry | undefined {
  return queue.entries.find((entry) => entry.issue_id === issueId);
}

function sessionLeaseEntry(
  queue: LiveQueue,
  state: LeaseState,
  sessionId: string,
): { lease: TicketLease; entry: QueueEntry } | undefined {
  const lease = state.leases_by_session[sessionId];
  if (!lease) {
    return undefined;
  }
  const entry = entryByIssueId(queue, lease.issue_id);
  if (!entry) {
    delete state.leases_by_session[sessionId];
    return undefined;
  }
  if (state.leases_by_issue[lease.issue_id] !== sessionId) {
    delete state.leases_by_session[sessionId];
    return undefined;
  }
  return { lease, entry };
}

function persistLease(
  state: LeaseState,
  entry: QueueEntry,
  sessionId: string,
  agentName: string,
): TicketLease {
  const lease: TicketLease = {
    session_id: sessionId,
    agent_name: agentName,
    issue_id: entry.issue_id,
    issue_title: entry.title,
    parallel_group: entry.parallel_group,
    write_scope: entry.write_scope,
    check_cmd: entry.check_cmd,
    claimed_at: new Date().toISOString(),
  };
  state.leases_by_session[sessionId] = lease;
  state.leases_by_issue[entry.issue_id] = sessionId;
  return lease;
}

async function acquireLeaseLock(repoRoot: string, opts?: TicketMachineOptions): Promise<void> {
  const lockPath = leaseLockPath(repoRoot, opts);
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    try {
      mkdirSync(lockPath, { recursive: false });
      writeFileSync(
        path.join(lockPath, "owner.json"),
        `${JSON.stringify({ created_at: new Date().toISOString(), pid: process.pid })}\n`,
        "utf8",
      );
      return;
    } catch {
      try {
        const stats = statSync(lockPath);
        if (Date.now() - stats.mtimeMs >= STALE_LOCK_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (Date.now() - startedAt >= LOCK_WAIT_MS) {
        throw new Error(`workflow lease lock timeout: ${lockPath}`);
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

function releaseLeaseLock(repoRoot: string, opts?: TicketMachineOptions): void {
  rmSync(leaseLockPath(repoRoot, opts), { recursive: true, force: true });
}

async function withLeaseLock<T>(
  repoRoot: string,
  opts: TicketMachineOptions | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  await acquireLeaseLock(repoRoot, opts);
  try {
    return await fn();
  } finally {
    releaseLeaseLock(repoRoot, opts);
  }
}

export async function takeTicket(args: TakeTicketArgs): Promise<TakeTicketResult> {
  return withLeaseLock(args.repoRoot, args, async () => {
    let queue: LiveQueue;
    try {
      queue = loadLiveQueue(args.repoRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
        return {
          kind: "queue_empty",
          reason: "live queue file is missing; run bun run workflow:queue:build",
        };
      }
      throw error;
    }
    const state = loadLeaseState(args.repoRoot, args);
    cleanupLeaseState(queue, state);

    const current = sessionLeaseEntry(queue, state, args.sessionId);
    if (current && (!args.issueId || args.issueId === current.entry.issue_id)) {
      saveLeaseState(args.repoRoot, state, args);
      return {
        kind: "ticket",
        reused: true,
        entry: current.entry,
        reason: "existing session lease",
      };
    }

    if (args.issueId) {
      const requested = entryByIssueId(queue, args.issueId);
      if (!requested) {
        saveLeaseState(args.repoRoot, state, args);
        return {
          kind: "queue_empty",
          reason: `issue ${args.issueId} is not present in live queue`,
        };
      }
      const owner = state.leases_by_issue[requested.issue_id];
      if (owner && owner !== args.sessionId) {
        saveLeaseState(args.repoRoot, state, args);
        return {
          kind: "queue_empty",
          reason: `issue ${args.issueId} is already leased`,
        };
      }

      if (!args.dryRun) {
        persistLease(state, requested, args.sessionId, args.agentName);
      }
      saveLeaseState(args.repoRoot, state, args);
      return {
        kind: "ticket",
        reused: false,
        entry: requested,
        reason: "claimed requested queue entry",
      };
    }

    for (const entry of queue.entries) {
      if (state.leases_by_issue[entry.issue_id]) {
        continue;
      }

      if (!args.dryRun) {
        persistLease(state, entry, args.sessionId, args.agentName);
      }
      saveLeaseState(args.repoRoot, state, args);
      return {
        kind: "ticket",
        reused: false,
        entry,
        reason: "claimed next queue entry",
      };
    }

    saveLeaseState(args.repoRoot, state, args);
    return {
      kind: "queue_empty",
      reason:
        queue.entries.length === 0
          ? "live queue is empty"
          : "all live queue entries are already leased",
    };
  });
}

export async function releaseTicket(
  repoRoot: string,
  sessionId: string,
  opts?: TicketMachineOptions,
): Promise<boolean> {
  return withLeaseLock(repoRoot, opts, async () => {
    const state = loadLeaseState(repoRoot, opts);
    const lease = state.leases_by_session[sessionId];
    if (!lease) {
      return false;
    }
    delete state.leases_by_session[sessionId];
    if (state.leases_by_issue[lease.issue_id] === sessionId) {
      delete state.leases_by_issue[lease.issue_id];
    }
    saveLeaseState(repoRoot, state, opts);
    return true;
  });
}

export function activeLeases(repoRoot: string, opts?: TicketMachineOptions): TicketLease[] {
  const state = loadLeaseState(repoRoot, opts);
  try {
    const queue = loadLiveQueue(repoRoot);
    if (cleanupLeaseState(queue, state)) {
      saveLeaseState(repoRoot, state, opts);
    }
  } catch {}
  return Object.values(state.leases_by_session);
}
