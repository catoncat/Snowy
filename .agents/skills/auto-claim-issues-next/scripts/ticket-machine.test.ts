import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type LiveQueue,
  activeLeases,
  leaseStatePath,
  loadLeaseState,
  releaseTicket,
  takeTicket,
} from "./ticket-machine";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-ticket-machine-"));
  tempDirs.push(repoRoot);
  mkdirSync(path.join(repoRoot, "docs", "workflow"), { recursive: true });
  return repoRoot;
}

function writeQueue(repoRoot: string, queue: LiveQueue) {
  writeFileSync(
    path.join(repoRoot, "docs", "workflow", "live-queue.json"),
    `${JSON.stringify(queue, null, 2)}\n`,
  );
  for (const entry of queue.entries) {
    const issueFile = path.join(repoRoot, entry.issue_path);
    mkdirSync(path.dirname(issueFile), { recursive: true });
    try {
      statSync(issueFile);
    } catch {
      writeFileSync(issueFile, `# ${entry.issue_id}\n`);
    }
  }
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
  it("uses the canonical repo id when running from a worktree path", () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    const canonicalRepoRoot = path.join(path.dirname(repoRoot), "browser-brain-loop-next");
    const worktreeGitDir = path.join(canonicalRepoRoot, ".git", "worktrees", "sable");

    mkdirSync(worktreeGitDir, { recursive: true });
    writeFileSync(path.join(repoRoot, ".git"), `gitdir: ${worktreeGitDir}\n`, "utf8");

    expect(leaseStatePath(repoRoot, { leaseRootDir })).toBe(
      path.join(leaseRootDir, "browser-brain-loop-next.json"),
    );
  });

  it("returns queue_empty when the live queue file is missing", async () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");

    await expect(
      takeTicket({
        repoRoot,
        leaseRootDir,
        sessionId: "session-a",
        agentName: "atlas",
      }),
    ).resolves.toEqual({
      kind: "queue_empty",
      reason: "live queue file is missing; run bun run workflow:queue:build",
    });
  });

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
          write_scope: ["docs/"],
        },
      ],
    });

    const first = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
    });
    const second = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
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
          write_scope: ["docs/"],
        },
      ],
    });

    const first = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
    });
    const second = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-b",
      agentName: "mercury",
    });

    expect(first.kind).toBe("ticket");
    expect(second).toEqual({
      kind: "queue_empty",
      reason: "all live queue entries are already leased",
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
          write_scope: ["docs/"],
        },
      ],
    });

    await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
    });
    expect(await releaseTicket(repoRoot, "session-a", { leaseRootDir })).toBe(true);

    const next = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-b",
      agentName: "mercury",
    });

    expect(next.kind).toBe("ticket");
    if (next.kind !== "ticket") {
      throw new Error("expected ticket");
    }
    expect(next.entry.issue_id).toBe("ISSUE-036");
  });

  it("drops stale leases after the queue changes", async () => {
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
          write_scope: ["docs/"],
        },
      ],
    });

    await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
    });

    writeQueue(repoRoot, {
      schema_version: 1,
      generated_at: "2026-03-30T01:00:00.000Z",
      repo_root: repoRoot,
      entries: [],
    });

    expect(activeLeases(repoRoot, { leaseRootDir })).toEqual([]);
    expect(
      readFileSync(path.join(leaseRootDir, `${path.basename(repoRoot)}.json`), "utf8"),
    ).toContain('"leases_by_session": {}');
  });

  it("skips queue entries whose issue file is missing", async () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    mkdirSync(path.join(repoRoot, "docs", "backlog"), { recursive: true });
    const validIssuePath = path.join("docs", "backlog", "issue-037.md");
    writeFileSync(path.join(repoRoot, validIssuePath), "# issue 037\n");

    writeQueue(repoRoot, {
      schema_version: 1,
      generated_at: "2026-03-30T00:00:00.000Z",
      repo_root: repoRoot,
      entries: [
        {
          issue_id: "ISSUE-036",
          issue_path: "docs/backlog/issue-036.md",
          title: "Missing issue",
          parallel_group: "contracts-core",
          module_id: "provider-profile-routing",
          module_stage: "mainline",
          tracking_kind: "follow-up",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"],
        },
        {
          issue_id: "ISSUE-037",
          issue_path: "docs/backlog/issue-037.md",
          title: "Valid issue",
          parallel_group: "contracts-core",
          module_id: "provider-profile-routing",
          module_stage: "mainline",
          tracking_kind: "mainline",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"],
        },
      ],
    });

    rmSync(path.join(repoRoot, "docs", "backlog", "issue-036.md"), {
      force: true,
    });

    const result = await takeTicket({
      repoRoot,
      leaseRootDir,
      sessionId: "session-a",
      agentName: "atlas",
    });

    expect(result.kind).toBe("ticket");
    if (result.kind === "ticket") {
      expect(result.entry.issue_id).toBe("ISSUE-037");
    }
  });

  it("reports missing issue file when requesting that issue", async () => {
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
          title: "Missing issue",
          parallel_group: "contracts-core",
          module_id: "provider-profile-routing",
          module_stage: "mainline",
          tracking_kind: "follow-up",
          check_cmd: "bun run check",
          depends_on: [],
          write_scope: ["docs/"],
        },
      ],
    });

    rmSync(path.join(repoRoot, "docs", "backlog", "issue-036.md"), { force: true });

    await expect(
      takeTicket({
        repoRoot,
        leaseRootDir,
        sessionId: "session-a",
        agentName: "atlas",
        issueId: "ISSUE-036",
      }),
    ).resolves.toEqual({
      kind: "queue_empty",
      reason:
        "issue ISSUE-036 file docs/backlog/issue-036.md is missing; run bun run workflow:queue:build",
    });
  });
});
