import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  activeLeases,
  loadLeaseState,
  releaseTicket,
  takeTicket,
  type LiveQueue
} from "./ticket-machine";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-ticket-machine-"));
  tempDirs.push(repoRoot);
  mkdirSync(path.join(repoRoot, "docs", "workflow"), { recursive: true });
  return repoRoot;
}

function writeQueue(repoRoot: string, queue: LiveQueue) {
  writeFileSync(path.join(repoRoot, "docs", "workflow", "live-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("ticket-machine", () => {
  it("reuses the same lease for the same session", async () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    writeQueue(repoRoot, {
      schema_version: 1,
      generated_at: "2026-03-30T00:00:00.000Z",
      repo_root: repoRoot,
      entries: [
        {
          issue_id: "ISSUE-036",
          issue_path: "docs/backlog/issue-036.md",
          title: "Automation cutover",
          parallel_group: "site-runtime",
          module_id: "site-runtime-browser-automation",
          module_stage: "secondary",
          tracking_kind: "gap",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"]
        }
      ]
    });

    const first = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas"
    });
    const second = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas"
    });

    expect(first.kind).toBe("ticket");
    expect(second.kind).toBe("ticket");
    if (first.kind !== "ticket" || second.kind !== "ticket") {
      throw new Error("expected ticket");
    }
    expect(first.entry.issue_id).toBe("ISSUE-036");
    expect(second.reused).toBe(true);
    expect(activeLeases(repoRoot, { leaseRootDir })).toHaveLength(1);
  });

  it("does not assign the same queue entry to two sessions", async () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    writeQueue(repoRoot, {
      schema_version: 1,
      generated_at: "2026-03-30T00:00:00.000Z",
      repo_root: repoRoot,
      entries: [
        {
          issue_id: "ISSUE-036",
          issue_path: "docs/backlog/issue-036.md",
          title: "Automation cutover",
          parallel_group: "site-runtime",
          module_id: "site-runtime-browser-automation",
          module_stage: "secondary",
          tracking_kind: "gap",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"]
        }
      ]
    });

    const first = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas"
    });
    const second = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-b",
      agentName: "mercury"
    });

    expect(first.kind).toBe("ticket");
    expect(second).toEqual({
      kind: "queue_empty",
      reason: "all live queue entries are already leased"
    });
    const leaseState = loadLeaseState(repoRoot, { leaseRootDir });
    expect(Object.keys(leaseState.leases_by_issue)).toEqual(["ISSUE-036"]);
  });

  it("releases a held queue entry", async () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    writeQueue(repoRoot, {
      schema_version: 1,
      generated_at: "2026-03-30T00:00:00.000Z",
      repo_root: repoRoot,
      entries: [
        {
          issue_id: "ISSUE-036",
          issue_path: "docs/backlog/issue-036.md",
          title: "Automation cutover",
          parallel_group: "site-runtime",
          module_id: "site-runtime-browser-automation",
          module_stage: "secondary",
          tracking_kind: "gap",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"]
        }
      ]
    });

    await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas"
    });
    expect(await releaseTicket(repoRoot, "session-a", { leaseRootDir })).toBe(true);

    const next = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-b",
      agentName: "mercury"
    });

    expect(next.kind).toBe("ticket");
    if (next.kind !== "ticket") {
      throw new Error("expected ticket");
    }
    expect(next.entry.issue_id).toBe("ISSUE-036");
  });
});
