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
    name: "page_info",
    capabilityId: "page.info",
    description: "Read compact visible page state",
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
  it("does not advertise unlisted legacy or host tools in the default chat prompt", () => {
    const prompt = buildSystemPromptBase(TEST_TOOLS);

    expect(prompt).toContain("Available Tools");
    expect(prompt).toContain("page_info");
    expect(prompt).not.toContain("memfs");
    expect(prompt).not.toContain("host.*");
    expect(prompt).not.toContain("page_query");
    expect(prompt).not.toContain("WebSocket bridge");
    expect(prompt).not.toContain("read and write files");
  });

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
  it("includes completed tool calls as concrete progress evidence", () => {
    const message = buildTaskProgressMessage({
      llmStep: 2,
      maxLoopSteps: 50,
      toolStep: 1,
      completedToolCalls: [
        {
          toolName: "runtime_capture_diagnostics",
          capabilityId: "runtime.capture_diagnostics",
          ok: true,
          argsSummary: "{}",
          resultSummary:
            '{"schema":"bbl.runtimeDiagnosticsProjection.v1","debug":{"bundle":{"debugBundleId":"debug-bundle-1","resourceRefs":[{"resourceId":"observability.timeline"}]}}}',
        },
      ],
    } as Parameters<typeof buildTaskProgressMessage>[0]);

    expect(message).toContain("completed_tool_calls");
    expect(message).toContain("runtime_capture_diagnostics");
    expect(message).toContain("runtime.capture_diagnostics");
    expect(message).toContain("status=ok");
    expect(message).toContain("args={}");
    expect(message).toContain("debug-bundle-1");
    expect(message).toContain("observability.timeline");
    expect(message).toContain("Use completed tool results above");
  });

  it("includes repeated action failures as diagnostics only", () => {
    const message = buildTaskProgressMessage({
      llmStep: 3,
      maxLoopSteps: 50,
      toolStep: 2,
      actionFailureHints: [
        {
          toolName: "page_click_xy",
          capabilityId: "page.click_xy",
          target: "coordinates 420,240",
          failureCount: 2,
        },
      ],
    });

    expect(message).toContain("DIAGNOSTIC");
    expect(message).toContain("page_click_xy");
    expect(message).toContain("coordinates 420,240");
    expect(message).toContain("failed 2 times");
    expect(message).toContain("evidence only");
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
