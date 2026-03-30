import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { planNextBatch } from "./plan-next-batch";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-next-plan-"));
  tempDirs.push(repoRoot);
  mkdirSync(path.join(repoRoot, "docs", "backlog"), { recursive: true });
  writeFileSync(path.join(repoRoot, "docs", "backlog", "README.md"), "# backlog\n", "utf8");
  return repoRoot;
}

function writeModuleLedger(
  repoRoot: string,
  modules: Array<{
    module_id: string;
    title: string;
    tracking_order: number;
    stage: "mainline" | "secondary" | "deferred";
    status?: "shipped" | "partial" | "not-started";
    default_parallel_group: string;
  }>,
) {
  writeFileSync(
    path.join(repoRoot, "docs", "module-tracking-ledger.json"),
    JSON.stringify(
      {
        schema_version: 1,
        updated_at: "2026-03-29",
        modules: modules.map((module) => ({
          ...module,
          status: module.status ?? "partial",
          summary: module.title,
          depends_on_modules: [],
          code_roots: ["packages/"],
          source_docs: ["docs/start-here.md"],
          cutover_gate: null,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function writeIssue(repoRoot: string, filename: string, frontmatter: string, body = "body\n") {
  writeFileSync(
    path.join(repoRoot, "docs", "backlog", filename),
    `${frontmatter}\n${body}`,
    "utf8",
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("plan-next-batch", () => {
  it("builds a planning document grouped by tracked modules", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot, [
      {
        module_id: "kernel",
        title: "Kernel",
        tracking_order: 10,
        stage: "mainline",
        default_parallel_group: "kernel",
      },
      {
        module_id: "browser-vfs",
        title: "BrowserVFS",
        tracking_order: 80,
        stage: "deferred",
        default_parallel_group: "browser-vfs",
      },
    ]);
    writeIssue(
      repoRoot,
      "2026-03-29-alpha.md",
      `---
id: ISSUE-011
title: "Kernel B-1"
status: open
priority: p0
source: review
created: 2026-03-29
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );
    writeIssue(
      repoRoot,
      "2026-03-29-beta.md",
      `---
id: ISSUE-014
title: "BrowserVFS gap"
status: open
priority: p1
source: review
created: 2026-03-29
assignee: unassigned
tags: [review, browser-vfs]
module_id: browser-vfs
module_stage: deferred
tracking_kind: follow-up
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on:
  - ISSUE-004
write_scope:
  - packages/browser-vfs/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false,
    });

    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") {
      throw new Error(`expected preview result, got ${result.kind}`);
    }
    expect(result.issueCount).toBe(2);
    expect(result.outputPath).toBe("docs/next-development-slices-2026-03-30-batch-1.md");
    expect(result.markdown).toContain("Kernel (`kernel`)");
    expect(result.markdown).toContain("BrowserVFS (`browser-vfs`)");
    expect(result.moduleCoverage).toHaveLength(2);
  });

  it("refuses to plan a new batch while issues are still in progress", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot, [
      {
        module_id: "kernel",
        title: "Kernel",
        tracking_order: 10,
        stage: "mainline",
        default_parallel_group: "kernel",
      },
    ]);
    writeIssue(
      repoRoot,
      "2026-03-29-active.md",
      `---
id: ISSUE-012
title: "Kernel B-2"
status: in-progress
priority: p0
source: review
created: 2026-03-29
assignee: atlas
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/run-controller.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") {
      throw new Error(`expected blocked result, got ${result.kind}`);
    }
    expect(result.reason).toContain("in-progress");
    expect(result.inProgress.map((item) => item.id)).toEqual(["ISSUE-012"]);
  });

  it("refuses to plan a new batch while workflow tickets are still leased", () => {
    const repoRoot = makeRepo();
    const leaseRootDir = path.join(repoRoot, ".leases");
    writeModuleLedger(repoRoot, [
      {
        module_id: "kernel",
        title: "Kernel",
        tracking_order: 10,
        stage: "mainline",
        default_parallel_group: "kernel",
      },
    ]);
    writeIssue(
      repoRoot,
      "2026-03-29-open.md",
      `---
id: ISSUE-021
title: "Kernel session cleanup"
status: open
priority: p0
source: review
created: 2026-03-29
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/session-store.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );
    mkdirSync(leaseRootDir, { recursive: true });
    writeFileSync(
      path.join(leaseRootDir, `${path.basename(repoRoot)}.json`),
      JSON.stringify(
        {
          schema_version: 1,
          repo_id: path.basename(repoRoot),
          updated_at: "2026-03-30T00:00:00.000Z",
          leases_by_session: {
            "session-a": {
              session_id: "session-a",
              agent_name: "atlas",
              issue_id: "ISSUE-021",
              issue_title: "Kernel session cleanup",
              parallel_group: "kernel",
              write_scope: ["packages/kernel/src/session-store.ts"],
              check_cmd: "bun run check",
              claimed_at: "2026-03-30T00:00:00.000Z",
            },
          },
          leases_by_issue: {
            "ISSUE-021": "session-a",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = planNextBatch({
      repoRoot,
      leaseRootDir,
      date: "2026-03-30",
      dryRun: true,
      json: false,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") {
      throw new Error(`expected blocked result, got ${result.kind}`);
    }
    expect(result.reason).toContain("workflow tickets");
    expect(result.activeLeases.map((item) => item.issue_id)).toEqual(["ISSUE-021"]);
  });

  it("writes the planning document when not in dry-run mode", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot, [
      {
        module_id: "execution-host-bridge",
        title: "Execution Host",
        tracking_order: 60,
        stage: "secondary",
        default_parallel_group: "js-runner",
      },
    ]);
    writeIssue(
      repoRoot,
      "2026-03-29-gamma.md",
      `---
id: ISSUE-013
title: "Host adapter follow-up"
status: open
priority: p1
source: review
created: 2026-03-29
assignee: unassigned
tags: [review, js-runner]
module_id: execution-host-bridge
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-js-runner
parallel_group: js-runner
depends_on:
  - ISSUE-012
write_scope:
  - packages/js-runner/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: false,
      json: false,
    });

    expect(result.kind).toBe("planned");
    if (result.kind !== "planned") {
      throw new Error(`expected planned result, got ${result.kind}`);
    }
    const outputFile = path.join(repoRoot, "docs", "next-development-slices-2026-03-30-batch-1.md");
    expect(readFileSync(outputFile, "utf8")).toContain("ISSUE-013");
  });

  it("returns a coverage gap when a tracked non-deferred module has no live issue", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot, [
      {
        module_id: "kernel",
        title: "Kernel",
        tracking_order: 10,
        stage: "mainline",
        default_parallel_group: "kernel",
      },
      {
        module_id: "observability-audit",
        title: "Observability",
        tracking_order: 20,
        stage: "mainline",
        default_parallel_group: "mv3-shell",
      },
    ]);
    writeIssue(
      repoRoot,
      "2026-03-29-kernel.md",
      `---
id: ISSUE-051
title: "Kernel B-1"
status: open
priority: p0
source: review
created: 2026-03-29
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false,
    });

    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") {
      throw new Error(`expected blocked result, got ${result.kind}`);
    }
    expect(result.reason).toContain("coverage");
    expect(result.missingModules.map((item) => item.moduleId)).toEqual(["observability-audit"]);
  });
});
