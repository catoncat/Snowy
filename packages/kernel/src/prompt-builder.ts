import type { ToolContract } from "@bbl-next/contracts";

// ──────────────────────────────────────────────────────────
// Base System Prompt
// ──────────────────────────────────────────────────────────

const BASE_GUIDELINES = `
## Guidelines

1. **Browser automation priority**: Use structured element queries (page.query) first, then targeted interactions (page.click, page.fill) by UID. Fall back to press_key or screenshot only when structured tools fail.
2. **File operations**: Use memfs.* for browser-side virtual files (mem:// protocol). Use host.* for host-side filesystem operations through the WebSocket bridge.
3. **Verification**: After performing an action, verify the result before proceeding. Use page.query to confirm state changes.
4. **One step at a time**: Execute one tool call per turn when possible. Batch only when operations are independent.
5. **Error handling**: If a tool call fails, try an alternative approach rather than repeating the same call. After 2 failures with the same tool, switch strategy.
6. **Terminal behavior**: When the task is complete, respond with a text summary without any tool calls. This signals task completion.
7. **Tool result interpretation**: Tool results are JSON. Parse them to decide next steps. Do not echo raw JSON to the user.
8. **Tab awareness**: Always check the active tab before performing page actions. Use tabs.navigate to go to the right page first.
`.trim();

export interface PromptBuilderOptions {
  /** Additional instructions to append to the system prompt */
  customInstructions?: string;
  /** Browser sandbox mount path (default: "mem://") */
  browserCwd?: string;
  /** Host working directory (if available) */
  hostCwd?: string;
}

/**
 * Build the base system prompt for the browser automation agent.
 */
export function buildSystemPromptBase(
  tools: ToolContract[],
  options?: PromptBuilderOptions,
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    "You are an expert browser automation agent operating inside a Chrome extension. You can interact with web pages, manage tabs, read and write files in a virtual filesystem, and execute tasks through a WebSocket bridge to a local host.",
  );

  // Environment
  const browserCwd = options?.browserCwd ?? "mem://";
  sections.push(
    `
## Environment

- **Browser sandbox**: Virtual filesystem at \`${browserCwd}\` (ephemeral workspace, persisted to IndexedDB)
- **Host bridge**: Local filesystem access via \`host.*\` capabilities through WebSocket
- **Active tabs**: You can query, navigate, and interact with browser tabs
- **Runtime**: Chrome MV3 extension with service worker kernel`.trim(),
  );

  // Host cwd
  if (options?.hostCwd) {
    sections.push(
      `- **Host working directory**: \`${options.hostCwd}\` (resolve relative paths against this)`,
    );
  }

  // Available tools
  const toolList = tools.map((t) => `- \`${t.name}\`: ${t.description}`).join("\n");
  sections.push(
    `
## Available Tools

${toolList}`.trim(),
  );

  // Guidelines
  sections.push(BASE_GUIDELINES);

  // Custom instructions
  if (options?.customInstructions) {
    sections.push(`## Additional Instructions\n\n${options.customInstructions}`);
  }

  return sections.join("\n\n");
}

// ──────────────────────────────────────────────────────────
// Task Progress (injected per iteration)
// ──────────────────────────────────────────────────────────

export interface TaskProgressInput {
  llmStep: number;
  maxLoopSteps: number;
  toolStep: number;
  retryAttempt?: number;
  retryMaxAttempts?: number;
}

/**
 * Build a brief task progress message to inject each loop iteration.
 */
export function buildTaskProgressMessage(input: TaskProgressInput): string {
  const step = Math.max(1, input.llmStep);
  const max = Math.max(1, input.maxLoopSteps);
  const tool = Math.max(0, input.toolStep);
  const retry = input.retryAttempt ?? 0;
  const retryMax = input.retryMaxAttempts ?? 0;

  const lines = [
    "Task progress (brief):",
    `- loop_step: ${step}/${max}`,
    `- tool_steps_done: ${tool}`,
  ];

  if (retry > 0) {
    lines.push(`- retry_state: ${retry}/${retryMax}`);
  }

  lines.push("- Keep moving toward the same user goal; avoid repeating already completed steps.");

  return lines.join("\n");
}
