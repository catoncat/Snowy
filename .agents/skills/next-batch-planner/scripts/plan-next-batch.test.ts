import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function writeIssue(repoRoot: string, filename: string, frontmatter: string, body = "body\n") {
  writeFileSync(
    path.join(repoRoot, "docs", "backlog", filename),
    `${frontmatter}\n${body}`,
    "utf8"
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
  it("builds a new planning document from open issues", () => {
    const repoRoot = makeRepo();
    writeIssue(
      repoRoot,
      "2026-03-29-alpha.md",
      `---
id: ISSUE-011
title: "Review: ctx permission and trace contract drift"
status: open
priority: p0
source: review
created: 2026-03-29
assignee: unassigned
tags: [review, core]
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`
    );
    writeIssue(
      repoRoot,
      "2026-03-29-beta.md",
      `---
id: ISSUE-014
title: "Review: BrowserVFS canonical skill URI drift"
status: open
priority: p1
source: review
created: 2026-03-29
assignee: unassigned
tags: [review, browser-vfs]
kind: slice
epic: EPIC-browser-vfs
parallel_group: browser-vfs
depends_on:
  - ISSUE-004
write_scope:
  - packages/browser-vfs/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false
    });

    expect(result.kind).toBe("preview");
    expect(result.issueCount).toBe(2);
    expect(result.outputPath).toBe("docs/next-development-slices-2026-03-30.md");
    expect(result.markdown).toContain("Batch 1");
    expect(result.markdown).toContain("ISSUE-011");
    expect(result.markdown).toContain("contracts-core");
    expect(result.markdown).toContain("browser-vfs");
  });

  it("refuses to plan a new batch while issues are still in progress", () => {
    const repoRoot = makeRepo();
    writeIssue(
      repoRoot,
      "2026-03-29-active.md",
      `---
id: ISSUE-012
title: "Review: site runtime active-tab boundary regression"
status: in-progress
priority: p0
source: review
created: 2026-03-29
assignee: agent
tags: [review, site-runtime]
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/index.ts
acceptance_ref: project_plan.md
check_cmd: bun run check
---`
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false
    });

    expect(result.kind).toBe("blocked");
    expect(result.reason).toContain("in-progress");
    expect(result.inProgress.map((item) => item.id)).toEqual(["ISSUE-012"]);
  });

  it("writes the planning document when not in dry-run mode", () => {
    const repoRoot = makeRepo();
    writeIssue(
      repoRoot,
      "2026-03-29-gamma.md",
      `---
id: ISSUE-013
title: "Review: phase 4 real injection chain is still mocked"
status: open
priority: p1
source: review
created: 2026-03-29
assignee: unassigned
tags: [review, mv3-shell]
kind: slice
epic: EPIC-site-runtime
parallel_group: mv3-shell
depends_on:
  - ISSUE-012
write_scope:
  - apps/mv3-shell/src/page-hook.js
acceptance_ref: project_plan.md
check_cmd: bun run check
---`
    );

    const result = planNextBatch({
      repoRoot,
      date: "2026-03-30",
      dryRun: false,
      json: false
    });

    expect(result.kind).toBe("planned");
    const outputFile = path.join(repoRoot, "docs", "next-development-slices-2026-03-30.md");
    expect(readFileSync(outputFile, "utf8")).toContain("ISSUE-013");
  });
});
