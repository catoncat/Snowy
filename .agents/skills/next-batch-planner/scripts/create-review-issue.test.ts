import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createReviewIssue } from "./create-review-issue";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-next-review-"));
  tempDirs.push(repoRoot);
  mkdirSync(path.join(repoRoot, "docs", "backlog"), { recursive: true });
  writeFileSync(path.join(repoRoot, "docs", "backlog", "README.md"), "# backlog\n", "utf8");
  writeFileSync(
    path.join(repoRoot, "docs", "module-tracking-ledger.json"),
    JSON.stringify(
      {
        schema_version: 1,
        updated_at: "2026-03-29",
        modules: [
          {
            module_id: "ai-surface-control-plane",
            title: "AI Surface",
            summary: "AI Surface",
            tracking_order: 40,
            stage: "secondary",
            status: "partial",
            depends_on_modules: [],
            code_roots: ["packages/core/"],
            source_docs: ["docs/ai-native-capability-surface-design.md"],
            cutover_gate: "Gate G",
            default_parallel_group: "contracts-core",
          },
          {
            module_id: "execution-host-bridge",
            title: "Execution Host",
            summary: "Execution Host",
            tracking_order: 60,
            stage: "secondary",
            status: "partial",
            depends_on_modules: [],
            code_roots: ["packages/js-runner/"],
            source_docs: ["docs/migration-parity-dashboard.md"],
            cutover_gate: "Gate C",
            default_parallel_group: "js-runner",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  return repoRoot;
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

describe("create-review-issue", () => {
  it("allocates the next issue id and previews the file path", () => {
    const repoRoot = makeRepo();
    writeIssue(
      repoRoot,
      "2026-03-29-existing.md",
      `---
id: ISSUE-014
title: Existing
status: done
priority: p1
source: review
created: 2026-03-29
assignee: agent
tags: [review]
module_id: ai-surface-control-plane
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-core
parallel_group: contracts-core
depends_on: []
write_scope: []
acceptance_ref: project_plan.md
check_cmd: bun run check
---`,
    );

    const result = createReviewIssue({
      repoRoot,
      date: "2026-03-30",
      dryRun: true,
      json: false,
      moduleId: "ai-surface-control-plane",
      title: "Review: next permission hole",
      priority: "p0",
      epic: "EPIC-contracts-core",
      acceptanceRef: "project_plan.md",
      source: "review pass",
      tags: ["review", "core"],
      writeScope: ["packages/core/src/index.ts"],
      acceptance: ["permission gate is enforced"],
    });

    expect(result.kind).toBe("preview");
    expect(result.issue.id).toBe("ISSUE-015");
    expect(result.issue.path).toContain("2026-03-30-next-permission-hole.md");
    expect(result.issue.parallel_group).toBe("contracts-core");
    expect(result.issue.module_stage).toBe("secondary");
    expect(existsSync(path.join(repoRoot, result.issue.path))).toBe(false);
  });

  it("writes a new backlog issue file with module metadata and default group", () => {
    const repoRoot = makeRepo();

    const result = createReviewIssue({
      repoRoot,
      date: "2026-03-30",
      dryRun: false,
      json: false,
      moduleId: "execution-host-bridge",
      title: "Review: runner bridge health drift",
      priority: "p1",
      epic: "EPIC-js-runner",
      acceptanceRef: "project_plan.md",
      source: "review pass",
      tags: ["review", "js-runner"],
      writeScope: ["packages/js-runner/src/index.ts"],
      reviewFinding: ["health endpoint is not propagated end-to-end"],
      acceptance: [
        "health contract is covered by tests",
        "bridge reports host health consistently",
      ],
    });

    expect(result.kind).toBe("created");
    const fullPath = path.join(repoRoot, result.issue.path);
    const file = readFileSync(fullPath, "utf8");
    expect(file).toContain("id: ISSUE-001");
    expect(file).toContain("module_id: execution-host-bridge");
    expect(file).toContain("module_stage: secondary");
    expect(file).toContain("tracking_kind: gap");
    expect(file).toContain("parallel_group: js-runner");
    expect(file).toContain("## Goal");
    expect(file).toContain("## Review Finding");
    expect(file).toContain("health endpoint is not propagated end-to-end");
    expect(file).toContain("health contract is covered by tests");
  });
});
