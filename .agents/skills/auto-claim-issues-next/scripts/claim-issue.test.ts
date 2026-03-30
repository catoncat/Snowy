import { describe, expect, it } from "vitest";

import {
  chooseIssue,
  dependenciesSatisfied,
  isNamedAgentAssignee,
  parseFrontmatter,
  type IssueFile
} from "./claim-issue";
import type { ModuleLedger } from "./module-ledger";

function issueFromFrontmatter(frontmatterBlock: string): IssueFile {
  const parsed = parseFrontmatter(`${frontmatterBlock}\nbody\n`);
  return {
    path: "/tmp/issue.md",
    filename: "issue.md",
    body: parsed.body,
    frontmatter: parsed.frontmatter
  };
}

describe("auto-claim-issues-next", () => {
  const moduleLedger: ModuleLedger = {
    schema_version: 1,
    updated_at: "2026-03-29",
    modules: [
      {
        module_id: "kernel",
        title: "Kernel",
        summary: "mainline",
        tracking_order: 10,
        stage: "mainline",
        status: "partial",
        depends_on_modules: [],
        code_roots: ["packages/kernel/"],
        source_docs: ["docs/kernel-skeleton-design.md"],
        cutover_gate: null,
        default_parallel_group: "kernel"
      },
      {
        module_id: "repo-workflow-dx",
        title: "DX",
        summary: "deferred",
        tracking_order: 100,
        stage: "deferred",
        status: "partial",
        depends_on_modules: [],
        code_roots: ["docs/"],
        source_docs: ["docs/source-of-truth-map.md"],
        cutover_gate: null,
        default_parallel_group: "sdk-docs"
      }
    ]
  };

  it("requires a real agent name for a persisted claim", () => {
    expect(isNamedAgentAssignee("atlas")).toBe(true);
    expect(isNamedAgentAssignee(" agent ")).toBe(false);
    expect(isNamedAgentAssignee("unassigned")).toBe(false);
    expect(isNamedAgentAssignee("")).toBe(false);
  });

  it("parses inline arrays with comments", () => {
    const issue = issueFromFrontmatter(`---
id: ISSUE-002
title: Example
status: open
priority: p0
module_id: kernel
module_stage: mainline
tracking_kind: gap
depends_on: [ISSUE-001] # single-writer
write_scope:
  - packages/core/src/index.ts
---`);

    expect(issue.frontmatter.data.depends_on).toEqual(["ISSUE-001"]);
  });

  it("treats missing dependency as unsatisfied", () => {
    const issue = issueFromFrontmatter(`---
id: ISSUE-003
title: Missing dep
status: open
priority: p0
module_id: kernel
module_stage: mainline
tracking_kind: gap
depends_on: [ISSUE-999]
write_scope: []
---`);

    expect(dependenciesSatisfied(issue, [issue])).toBe(false);
  });

  it("blocks claim when another issue owns the same write scope", () => {
    const active = issueFromFrontmatter(`---
id: ISSUE-001
title: Active
status: in-progress
priority: p0
module_id: kernel
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
  - packages/core/src/index.ts
---`);
    const candidate = issueFromFrontmatter(`---
id: ISSUE-002
title: Candidate
status: open
priority: p0
module_id: kernel
module_stage: mainline
tracking_kind: gap
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/contracts/src/index.ts
---`);

    const result = chooseIssue([active, candidate], {
      assignee: "atlas",
      dryRun: true,
      json: false,
      allowConflicts: false
    }, { moduleLedger });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.blockedByConflicts.map((item) => item.id)).toEqual(["ISSUE-002"]);
    }
  });

  it("prefers a mainline module over a deferred module before issue priority", () => {
    const deferred = issueFromFrontmatter(`---
id: ISSUE-100
title: Deferred
status: open
priority: p0
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: doc-debt
depends_on: []
write_scope:
  - docs/
---`);
    const mainline = issueFromFrontmatter(`---
id: ISSUE-101
title: Mainline
status: open
priority: p1
module_id: kernel
module_stage: mainline
tracking_kind: mainline
depends_on: []
write_scope:
  - packages/kernel/src/
---`);

    const result = chooseIssue([deferred, mainline], {
      assignee: "atlas",
      dryRun: true,
      json: false,
      allowConflicts: false
    }, { moduleLedger });

    expect(result.kind).toBe("preview");
    if (result.kind === "preview") {
      expect(result.issue.id).toBe("ISSUE-101");
      expect(result.issue.module_id).toBe("kernel");
    }
  });
});
