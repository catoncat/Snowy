import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildLiveQueue } from "./build-live-queue";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-live-queue-"));
  tempDirs.push(repoRoot);
  mkdirSync(path.join(repoRoot, "docs", "backlog"), { recursive: true });
  writeFileSync(path.join(repoRoot, "docs", "backlog", "README.md"), "# backlog\n", "utf8");
  return repoRoot;
}

function writeModuleLedger(repoRoot: string) {
  writeFileSync(
    path.join(repoRoot, "docs", "module-tracking-ledger.json"),
    JSON.stringify(
      {
        schema_version: 1,
        updated_at: "2026-03-30",
        modules: [
          {
            module_id: "kernel",
            title: "Kernel",
            summary: "Kernel",
            tracking_order: 10,
            stage: "mainline",
            status: "partial",
            depends_on_modules: [],
            code_roots: ["packages/kernel/"],
            source_docs: ["docs/kernel-skeleton-design.md"],
            cutover_gate: null,
            default_parallel_group: "kernel",
          },
          {
            module_id: "site-runtime-browser-automation",
            title: "Automation",
            summary: "Automation",
            tracking_order: 50,
            stage: "secondary",
            status: "partial",
            depends_on_modules: [],
            code_roots: ["packages/site-runtime/"],
            source_docs: ["docs/cutover-readiness-criteria.md"],
            cutover_gate: null,
            default_parallel_group: "site-runtime",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

function writeIssue(repoRoot: string, filename: string, frontmatter: string) {
  writeFileSync(path.join(repoRoot, "docs", "backlog", filename), `${frontmatter}\nbody\n`, "utf8");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("build-live-queue", () => {
  it("keeps only ready issues and removes conflicting entries from the live queue", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot);
    writeIssue(
      repoRoot,
      "issue-036.md",
      `---
id: ISSUE-036
title: "Automation cutover"
status: open
priority: p1
source: planning
created: 2026-03-30
assignee: unassigned
tags: [review]
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - docs/
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: bun run check
---`,
    );
    writeIssue(
      repoRoot,
      "issue-041.md",
      `---
id: ISSUE-041
title: "Intervention"
status: open
priority: p1
source: planning
created: 2026-03-30
assignee: unassigned
tags: [review]
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: site-runtime
depends_on:
  - ISSUE-036
write_scope:
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );
    writeIssue(
      repoRoot,
      "issue-042.md",
      `---
id: ISSUE-042
title: "Kernel docs"
status: open
priority: p0
source: planning
created: 2026-03-30
assignee: unassigned
tags: [review]
module_id: kernel
module_stage: mainline
tracking_kind: mainline
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - docs/
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );

    const result = buildLiveQueue({
      repoRoot,
      dryRun: true,
      json: false,
    });

    expect(result.kind).toBe("preview");
    expect(result.entryCount).toBe(1);
    expect(result.queue.entries.map((entry) => entry.issue_id)).toEqual(["ISSUE-042"]);
  });

  it("writes the queue file when not in dry-run mode", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot);
    writeIssue(
      repoRoot,
      "issue-036.md",
      `---
id: ISSUE-036
title: "Automation cutover"
status: open
priority: p1
source: planning
created: 2026-03-30
assignee: unassigned
tags: [review]
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
acceptance_ref: docs/cutover-readiness-criteria.md
check_cmd: bun run check
---`,
    );

    const result = buildLiveQueue({
      repoRoot,
      dryRun: false,
      json: false,
    });

    expect(result.kind).toBe("built");
    const written = JSON.parse(
      readFileSync(path.join(repoRoot, "docs", "workflow", "live-queue.json"), "utf8"),
    ) as { entries: Array<{ issue_id: string }> };
    expect(written.entries.map((entry) => entry.issue_id)).toEqual(["ISSUE-036"]);
  });
});
