import type { ToolContract } from "@bbl-next/contracts";

// ──────────────────────────────────────────────────────────
// Base System Prompt
// ──────────────────────────────────────────────────────────

const DEFAULT_AVAILABLE_SKILLS_CHARACTER_BUDGET = 6000;
const AVAILABLE_SKILLS_OPEN_TAG = '<available_skills schema="compact-v1">';
const AVAILABLE_SKILLS_CLOSE_TAG = "</available_skills>";

const BASE_GUIDELINES = `
## Guidelines

1. **Browser automation priority**: Use structured element queries (\`page_query\`) first, then targeted interactions (\`page_click\`, \`page_fill\`) by UID. Fall back to \`page_press_key\` or \`page_screenshot\` only when structured tools fail.
2. **File operations**: Use memfs.* for browser-side virtual files (mem:// protocol). Use host.* for host-side filesystem operations through the WebSocket bridge.
3. **Verification**: After performing an action, verify the result before proceeding. Use \`page_query\` to confirm state changes.
4. **One step at a time**: Execute one tool call per turn when possible. Batch only when operations are independent.
5. **Error handling**: If a tool call fails, try an alternative approach rather than repeating the same call. After 2 failures with the same tool, switch strategy.
6. **Terminal behavior**: When the task is complete, respond with a text summary without any tool calls. This signals task completion.
7. **Tool result interpretation**: Tool results are JSON. Parse them to decide next steps. Do not echo raw JSON to the user.
8. **Tab awareness**: Always check the active tab before performing page actions. Use \`tabs_get_active\` and \`tabs_navigate\` to work on the right page first.
`.trim();

export interface PromptSkillMetadata {
  name: string;
  description?: string;
  path?: string;
  triggers?: string[];
}

export interface AvailableSkillsPromptOptions {
  characterBudget?: number;
}

export interface PromptBuilderOptions {
  /** Additional instructions to append to the system prompt */
  customInstructions?: string;
  /** Browser sandbox mount path (default: "mem://") */
  browserCwd?: string;
  /** Host working directory (if available) */
  hostCwd?: string;
  /** Ranked skill metadata to inject into the prompt */
  availableSkills?: PromptSkillMetadata[];
  /** Character budget for the serialized available skills block */
  availableSkillsCharacterBudget?: number;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatSkillTag(skill: PromptSkillMetadata, rank: number): string {
  const attrs = [`rank="${rank}"`, `name="${escapeXml(skill.name)}"`];
  if (skill.path) {
    attrs.push(`path="${escapeXml(skill.path)}"`);
  }

  const children: string[] = [];
  if (skill.description) {
    children.push(`<description>${escapeXml(skill.description)}</description>`);
  }
  if ((skill.triggers?.length ?? 0) > 0) {
    children.push(`<triggers>${escapeXml(skill.triggers!.join(", "))}</triggers>`);
  }

  return `<skill ${attrs.join(" ")}>${children.join("")}</skill>`;
}

export function buildAvailableSkillsPrompt(
  skills: PromptSkillMetadata[],
  options?: AvailableSkillsPromptOptions,
): string {
  if (skills.length === 0) {
    return `${AVAILABLE_SKILLS_OPEN_TAG}${AVAILABLE_SKILLS_CLOSE_TAG}`;
  }

  const minBudget = AVAILABLE_SKILLS_OPEN_TAG.length + AVAILABLE_SKILLS_CLOSE_TAG.length;
  const characterBudget = Math.max(
    minBudget,
    options?.characterBudget ?? DEFAULT_AVAILABLE_SKILLS_CHARACTER_BUDGET,
  );
  const included: string[] = [];
  let remaining = skills.length;

  for (const [index, skill] of skills.entries()) {
    const nextTag = formatSkillTag(skill, index + 1);
    const nextBody = `${included.join("")}${nextTag}`;
    if (
      `${AVAILABLE_SKILLS_OPEN_TAG}${nextBody}${AVAILABLE_SKILLS_CLOSE_TAG}`.length <=
      characterBudget
    ) {
      included.push(nextTag);
      remaining -= 1;
      continue;
    }
    break;
  }

  let body = included.join("");
  if (remaining > 0) {
    let truncated = `<truncated remaining="${remaining}" />`;
    while (
      included.length > 0 &&
      `${AVAILABLE_SKILLS_OPEN_TAG}${body}${truncated}${AVAILABLE_SKILLS_CLOSE_TAG}`.length >
        characterBudget
    ) {
      included.pop();
      remaining += 1;
      body = included.join("");
      truncated = `<truncated remaining="${remaining}" />`;
    }

    if (
      `${AVAILABLE_SKILLS_OPEN_TAG}${body}${truncated}${AVAILABLE_SKILLS_CLOSE_TAG}`.length <=
      characterBudget
    ) {
      body += truncated;
    }
  }

  return `${AVAILABLE_SKILLS_OPEN_TAG}${body}${AVAILABLE_SKILLS_CLOSE_TAG}`;
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

  if ((options?.availableSkills?.length ?? 0) > 0) {
    sections.push(
      [
        "## Available Skills",
        "Use the ranked skills below when a skill-specific workflow matches the task.",
        buildAvailableSkillsPrompt(options!.availableSkills!, {
          characterBudget: options?.availableSkillsCharacterBudget,
        }),
      ].join("\n\n"),
    );
  }

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
  actionFailureHints?: ActionFailureHint[];
}

export interface ActionFailureHint {
  toolName: string;
  capabilityId: string;
  target?: string;
  failureCount: number;
}

function formatActionFailureHint(hint: ActionFailureHint): string {
  const target = hint.target ? ` on ${hint.target}` : "";
  return `- STRATEGY HINT: \`${hint.toolName}\`${target} failed ${hint.failureCount} times. Switch tactics: re-query state, choose a different target, or use an alternative tool instead of retrying the same action.`;
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
  const actionFailureHints = input.actionFailureHints ?? [];

  const lines = [
    "Task progress (brief):",
    `- loop_step: ${step}/${max}`,
    `- tool_steps_done: ${tool}`,
  ];

  if (retry > 0) {
    lines.push(`- retry_state: ${retry}/${retryMax}`);
  }

  if (actionFailureHints.length > 0) {
    lines.push("- repeated_action_failures:");
    for (const hint of actionFailureHints) {
      lines.push(formatActionFailureHint(hint));
    }
  }

  lines.push("- Keep moving toward the same user goal; avoid repeating already completed steps.");

  return lines.join("\n");
}
