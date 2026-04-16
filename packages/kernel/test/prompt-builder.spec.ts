import type { ToolContract } from "@bbl-next/contracts";
import { describe, expect, it } from "vitest";

import {
  type PromptSkillMetadata,
  buildAvailableSkillsPrompt,
  buildSharedTabsContextMessage,
  buildSystemPromptBase,
  buildSystemPromptMessages,
  buildTaskProgressMessage,
} from "../src/prompt-builder.js";

const BASE_TOOL_ANNOTATIONS = {
  audiences: ["chat", "skill", "system"] as const,
  defaultExposed: true,
  confirmPolicy: "inherit-risk" as const,
  executionTarget: "browser" as const,
};

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
      ...BASE_TOOL_ANNOTATIONS,
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

describe("shared tabs prompt context", () => {
  it("formats shared tabs metadata into an independent system message", () => {
    const message = buildSharedTabsContextMessage([
      {
        tabId: 12,
        title: "Docs",
        url: "https://docs.example.test",
      },
      {
        tabId: 28,
        url: "https://app.example.test/dashboard",
      },
    ]);

    expect(message).toContain("Shared Tabs Context");
    expect(message).toContain("tab 12");
    expect(message).toContain("Docs");
    expect(message).toContain("https://docs.example.test");
    expect(message).toContain("tab 28");
    expect(message).toContain("https://app.example.test/dashboard");
  });

  it("emits shared tabs as a separate system message from the base prompt", () => {
    const messages = buildSystemPromptMessages(TEST_TOOLS, {
      sharedTabs: [
        {
          tabId: 3,
          title: "Inbox",
          url: "https://mail.example.test",
        },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("## Available Tools");
    expect(messages[1]).toContain("Shared Tabs Context");
    expect(messages[1]).toContain("tab 3");
    expect(messages[0]).not.toContain("tab 3");
  });
});
