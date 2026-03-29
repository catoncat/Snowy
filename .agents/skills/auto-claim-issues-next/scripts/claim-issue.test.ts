import { describe, expect, it } from "vitest";

import {
  chooseIssue,
  dependenciesSatisfied,
  parseFrontmatter,
  type IssueFile
} from "./claim-issue";

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
  it("parses inline arrays with comments", () => {
    const issue = issueFromFrontmatter(`---
id: ISSUE-002
title: Example
status: open
priority: p0
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
depends_on: []
write_scope:
  - packages/core/src/index.ts
---`);
    const candidate = issueFromFrontmatter(`---
id: ISSUE-002
title: Candidate
status: open
priority: p0
depends_on: []
write_scope:
  - packages/core/src/index.ts
  - packages/contracts/src/index.ts
---`);

    const result = chooseIssue([active, candidate], {
      assignee: "agent",
      dryRun: true,
      json: false,
      allowConflicts: false
    });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.blockedByConflicts.map((item) => item.id)).toEqual(["ISSUE-002"]);
    }
  });
});

