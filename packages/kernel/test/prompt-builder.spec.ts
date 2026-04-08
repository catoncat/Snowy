import type { ToolContract } from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

import {
  type PromptSkillMetadata,
  buildAvailableSkillsPrompt,
  buildSystemPromptBase,
  buildTaskProgressMessage,
} from "../src/prompt-builder.js";

const TEST_TOOLS: ToolContract[] = [
  {
    name: "page_query",
    capabilityId: "page.query",
    description: "Query page state",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    annotations: {
      risk: "low",
      sideEffects: "reads",
      supportsVerify: false,
      supportsStreaming: false,
    },
  },
];

describe("buildSystemPromptBase", () => {
  it("injects available skills as compact xml context", () => {
    const prompt = buildSystemPromptBase(TEST_TOOLS, {
      availableSkills: [
        {
          name: "agent-workflow-next",
          description: "Route to the right browser-brain-loop-next workflow.",
          path: ".agents/skills/agent-workflow-next/SKILL.md",
          triggers: ["issue", "claim"],
        },
        {
          name: "auto-claim-issues-next",
          description: "Claim the next issue from the live queue.",
          path: ".agents/skills/auto-claim-issues-next/SKILL.md",
          triggers: ["claim", "queue"],
        },
      ],
    });

    expect(prompt).toContain("## Available Skills");
    expect(prompt).toContain('<available_skills schema="compact-v1">');
    expect(prompt).toContain('<skill rank="1" name="agent-workflow-next"');
    expect(prompt).toContain('path=".agents/skills/agent-workflow-next/SKILL.md"');
    expect(prompt).toContain(
      "<description>Route to the right browser-brain-loop-next workflow.</description>",
    );
    expect(prompt).toContain("<triggers>issue, claim</triggers>");
    expect(prompt).toContain('<skill rank="2" name="auto-claim-issues-next"');
  });
});

describe("buildAvailableSkillsPrompt", () => {
  it("respects the character budget and appends truncation metadata", () => {
    const skills: PromptSkillMetadata[] = Array.from({ length: 4 }, (_, index) => ({
      name: `skill-${index + 1}`,
      description: `This is a long description for skill ${index + 1}. `.repeat(4).trim(),
      path: `.agents/skills/skill-${index + 1}/SKILL.md`,
      triggers: [`trigger-${index + 1}`, `fallback-${index + 1}`],
    }));

    const block = buildAvailableSkillsPrompt(skills, { characterBudget: 400 });

    expect(block.length).toBeLessThanOrEqual(400);
    expect(block).toContain('<available_skills schema="compact-v1">');
    expect(block).toContain('<skill rank="1" name="skill-1"');
    expect(block).toContain("<truncated remaining=");
    expect(block).not.toContain('name="skill-4"');
  });
});

describe("buildTaskProgressMessage", () => {
  it("includes strategy hints for repeated action failures", () => {
    const message = buildTaskProgressMessage({
      llmStep: 3,
      maxLoopSteps: 50,
      toolStep: 2,
      actionFailureHints: [
        {
          toolName: "page_click",
          capabilityId: "page.click",
          target: "uid submit-button",
          failureCount: 2,
        },
      ],
    });

    expect(message).toContain("STRATEGY HINT");
    expect(message).toContain("page_click");
    expect(message).toContain("uid submit-button");
    expect(message).toContain("failed 2 times");
  });
});
