import { describe, expect, it } from "vitest";

import {
  CLAIM_SKILLS,
  deriveAgentName,
  isWorkflowSkillPrompt,
  readExplicitIssueId,
} from "./workflow-ticket";

describe("workflow-ticket hook", () => {
  it("listens only to explicit workflow skill triggers", () => {
    expect(CLAIM_SKILLS).toEqual(["agent-workflow-next", "auto-claim-issues-next"]);
    expect(isWorkflowSkillPrompt("$agent-workflow-next")).toBe(true);
    expect(isWorkflowSkillPrompt("<skill><name>auto-claim-issues-next</name></skill>")).toBe(true);
  });

  it("does not ticket next-batch-planner prompts", () => {
    expect(isWorkflowSkillPrompt("$next-batch-planner")).toBe(false);
    expect(isWorkflowSkillPrompt("现在工作流是怎么样")).toBe(false);
  });

  it("supports dry-run verification mode", () => {
    expect(readExplicitIssueId("请处理 ISSUE-051")).toBe("ISSUE-051");
    expect(deriveAgentName("sess-12345678")).toBe("codex-sess1234");
  });
});
