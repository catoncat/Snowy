import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildLiveQueue } from "./build-live-queue";
import { loadIssueFile, readString } from "./claim-issue";
import { completeIssue, resolveCommitRefs } from "./complete-issue";
import { activeLeases, takeTicket } from "./ticket-machine";

const tempDirs: string[] = [];

function makeRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "bbl-complete-issue-"));
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
        updated_at: "2026-04-08",
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
        ],
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

describe("complete-issue", () => {
  it("marks the leased issue done, writes summary, releases lease, and rebuilds queue", async () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot);
    writeIssue(
      repoRoot,
      "issue-087.md",
      `---
id: ISSUE-087
title: "LLM closure"
status: open
priority: p1
source: test
created: 2026-04-08
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/llm-message-model.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );
    writeIssue(
      repoRoot,
      "issue-088.md",
      `---
id: ISSUE-088
title: "Prompt skills injection"
status: open
priority: p2
source: test
created: 2026-04-08
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/prompt-builder.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );

    buildLiveQueue({ repoRoot, dryRun: false, json: false });
    await takeTicket({
      repoRoot,
      leaseRootDir: path.join(repoRoot, ".leases"),
      sessionId: "cli:atlas",
      agentName: "atlas",
      issueId: "ISSUE-087",
    });

    const result = await completeIssue({
      repoRoot,
      leaseRootDir: path.join(repoRoot, ".leases"),
      assignee: "atlas",
      commits: [{ hash: "abc1234", subject: "feat: finish issue" }],
      implemented: ["补齐 LLM message 持久化闭环"],
      checks: ["bun run typecheck"],
      risks: ["无"],
    });

    expect(result.issueId).toBe("ISSUE-087");
    expect(result.releasedLease).toBe(true);

    const issue = loadIssueFile(path.join(repoRoot, "docs", "backlog", "issue-087.md"));
    expect(readString(issue, "status")).toBe("done");
    expect(issue.body).toContain("## 工作总结");
    expect(issue.body).toContain("补齐 LLM message 持久化闭环");
    expect(issue.body).toContain("## 相关 commits");
    expect(issue.body).toContain("`abc1234` feat: finish issue");

    expect(activeLeases(repoRoot, { leaseRootDir: path.join(repoRoot, ".leases") })).toEqual([]);
    const queue = JSON.parse(
      readFileSync(path.join(repoRoot, "docs", "workflow", "live-queue.json"), "utf8"),
    ) as { entries: Array<{ issue_id: string }> };
    expect(queue.entries.map((entry) => entry.issue_id)).toEqual(["ISSUE-088"]);
  });

  it("finds and releases a non-cli session lease by agent name", async () => {
    const repoRoot = makeRepo();
    writeModuleLedger(repoRoot);
    writeIssue(
      repoRoot,
      "issue-087.md",
      `---
id: ISSUE-087
title: "LLM closure"
status: open
priority: p1
source: test
created: 2026-04-08
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: follow-up
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/llm-message-model.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );
    writeIssue(
      repoRoot,
      "issue-088.md",
      `---
id: ISSUE-088
title: "Prompt skills injection"
status: open
priority: p2
source: test
created: 2026-04-08
assignee: unassigned
tags: [kernel]
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: kernel
depends_on: []
write_scope:
  - packages/kernel/src/prompt-builder.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: bun run check
---`,
    );

    buildLiveQueue({ repoRoot, dryRun: false, json: false });
    await takeTicket({
      repoRoot,
      leaseRootDir: path.join(repoRoot, ".leases"),
      sessionId: "019d700a-2fa7-7bc0-9108-6827355ec091",
      agentName: "codex-019d700a",
      issueId: "ISSUE-087",
    });

    const result = await completeIssue({
      repoRoot,
      leaseRootDir: path.join(repoRoot, ".leases"),
      assignee: "codex-019d700a",
      commits: [{ hash: "abc1234", subject: "feat: finish issue" }],
      implemented: ["补齐非 cli lease session 的 workflow done closeout"],
      checks: ["bun run workflow:done -- --issue=ISSUE-087"],
      risks: ["无"],
    });

    expect(result.issueId).toBe("ISSUE-087");
    expect(result.releasedLease).toBe(true);
    expect(activeLeases(repoRoot, { leaseRootDir: path.join(repoRoot, ".leases") })).toEqual([]);
  });

  it("requires at least one commit ref", () => {
    const repoRoot = makeRepo();

    expect(() => resolveCommitRefs(repoRoot, [])).toThrow(
      "workflow:done requires at least one --commit",
    );
  });
});
