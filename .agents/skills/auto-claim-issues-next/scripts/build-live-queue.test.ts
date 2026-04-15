import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildLiveQueue } from "./build-live-queue";

const tempDirs: string[] = [];
const SCRIPT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const BIOME_CONFIG_PATH = path.join(SCRIPT_REPO_ROOT, "biome.json");
const BIOME_EXECUTABLE_PATH = path.join(
  SCRIPT_REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "biome.cmd" : "biome",
);

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

function formatLikeBiome(repoRoot: string, relativeFilePath: string, content: string): string {
  return execFileSync(
    BIOME_EXECUTABLE_PATH,
    ["format", `--config-path=${BIOME_CONFIG_PATH}`, `--stdin-file-path=${relativeFilePath}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: content,
    },
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

describe("build-live-queue", () => {
  it("keeps all ready issues in the live queue even when write scopes overlap", () => {
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
    expect(result.entryCount).toBe(2);
    expect(result.queue.entries.map((entry) => entry.issue_id)).toEqual(["ISSUE-042", "ISSUE-036"]);
  });

  it("writes the queue file when not in dry-run mode", () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot);
    writeIssue(
      repoRoot,
      "issue-010.md",
      `---
id: ISSUE-010
title: "Kernel baseline"
status: done
priority: p0
source: planning
created: 2026-03-29
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
  - packages/kernel/src/index.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );
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
depends_on:
  - ISSUE-010
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
    const filePath = path.join(repoRoot, "docs", "workflow", "live-queue.json");
    const written = readFileSync(filePath, "utf8");
    expect(JSON.parse(written)).toMatchObject({
      entries: [{ issue_id: "ISSUE-036", depends_on: ["ISSUE-010"] }],
    });
    expect(written).toContain('"depends_on": ["ISSUE-010"],');
    expect(written).toBe(formatLikeBiome(repoRoot, "docs/workflow/live-queue.json", written));
  });

  it("uses the canonical repo root in queue metadata when running from a worktree path", () => {
    const repoRoot = makeRepo();
    const canonicalRepoRoot = path.join(path.dirname(repoRoot), "browser-brain-loop-next");
    const worktreeGitDir = path.join(canonicalRepoRoot, ".git", "worktrees", "sable");

    mkdirSync(worktreeGitDir, { recursive: true });
    writeFileSync(path.join(repoRoot, ".git"), `gitdir: ${worktreeGitDir}\n`, "utf8");
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
      dryRun: true,
      json: false,
    });

    expect(result.queue.repo_root).toBe(canonicalRepoRoot);
  });
});
