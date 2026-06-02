import type { ToolContract } from "@bbl-next/contracts";

// ──────────────────────────────────────────────────────────
// Base System Prompt
// ──────────────────────────────────────────────────────────

const DEFAULT_AVAILABLE_SKILLS_CHARACTER_BUDGET = 6000;
const AVAILABLE_SKILLS_OPEN_TAG = '<available_skills schema="compact-v1">';
const AVAILABLE_SKILLS_CLOSE_TAG = "</available_skills>";

const BASE_GUIDELINES = `
## Guidelines

1. **Browser automation priority**: Prefer Browser Harness primitives. Orient with the active tab and visible evidence (\`tabs_get_active\`, \`page_info\`, \`page_screenshot\`) when useful, then take the smallest direct action (\`tabs_navigate\`, \`page_click_xy\`, \`page_type_text\`, \`page_press_key\`, \`page_scroll\`). Use DOM/debug readback only when that tool is explicitly listed.
2. **Evidence boundary**: Ordinary tool results are compact projections. Use explicit debug/artifact/observability tools when listed to read fuller evidence; do not expect raw DOM, full screenshots, network dumps, or provider bodies to appear automatically.
3. **Verification**: Judge progress from explicit evidence that is visible in the current result or the next observation. Do not invent hidden scoring, ranking, or automatic verification loops.
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

export interface PromptSharedTabMetadata {
  tabId: number;
  url: string;
  title?: string;
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
  /** Shared tab metadata selected into prompt context */
  sharedTabs?: PromptSharedTabMetadata[];
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
export function buildSharedTabsContextMessage(tabs: PromptSharedTabMetadata[]): string | null {
  if (tabs.length === 0) {
    return null;
  }

  const lines = [
    "Shared Tabs Context",
    "The user selected these browser tabs as relevant context:",
  ];

  for (const tab of tabs) {
    const parts = [`- tab ${tab.tabId}`];
    if (tab.title) {
      parts.push(`title: ${tab.title}`);
    }
    parts.push(`url: ${tab.url}`);
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

export function buildSystemPromptMessages(
  tools: ToolContract[],
  options?: PromptBuilderOptions,
): string[] {
  const messages = [buildSystemPromptBase(tools, options)];
  const sharedTabsMessage = buildSharedTabsContextMessage(options?.sharedTabs ?? []);
  if (sharedTabsMessage) {
    messages.push(sharedTabsMessage);
  }
  return messages;
}

export function buildSystemPromptBase(
  tools: ToolContract[],
  options?: PromptBuilderOptions,
): string {
  const sections: string[] = [];

  // Role
  sections.push(
    "You are an expert browser automation agent operating inside a Chrome extension. Use only the tools listed in this request; do not assume access to unlisted browser, filesystem, host, or private runtime capabilities.",
  );

  // Environment
  sections.push(
    `
## Environment

- **Tool boundary**: The Available Tools section is the complete callable surface for this chat turn
- **Active tabs**: You can observe, navigate, and interact with browser tabs when the corresponding tools are listed
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
  completedToolCalls?: CompletedToolCallSummary[];
  actionFailureHints?: ActionFailureHint[];
}

export interface CompletedToolCallSummary {
  toolName: string;
  capabilityId: string;
  ok: boolean;
  argsSummary?: string;
  resultSummary?: string;
}

export interface ActionFailureHint {
  toolName: string;
  capabilityId: string;
  target?: string;
  failureCount: number;
}

const COMPLETED_TOOL_CALL_LIMIT = 6;
const COMPLETED_TOOL_SUMMARY_LIMIT = 600;

function truncateProgressText(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}[truncated]` : text;
}

function formatCompletedToolCall(call: CompletedToolCallSummary): string {
  const parts = [
    `- ${call.toolName} (${call.capabilityId})`,
    `status=${call.ok ? "ok" : "failed"}`,
  ];
  if (call.argsSummary) {
    parts.push(`args=${truncateProgressText(call.argsSummary, COMPLETED_TOOL_SUMMARY_LIMIT)}`);
  }
  if (call.resultSummary) {
    parts.push(`result=${truncateProgressText(call.resultSummary, COMPLETED_TOOL_SUMMARY_LIMIT)}`);
  }
  return parts.join("; ");
}

function formatActionFailureHint(hint: ActionFailureHint): string {
  const target = hint.target ? ` on ${hint.target}` : "";
  return `- DIAGNOSTIC: \`${hint.toolName}\`${target} failed ${hint.failureCount} times. Treat this as evidence only; judge the next step from the current page observation and available tools.`;
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
  const completedToolCalls = input.completedToolCalls ?? [];
  const actionFailureHints = input.actionFailureHints ?? [];

  const lines = [
    "Task progress (brief):",
    `- loop_step: ${step}/${max}`,
    `- tool_steps_done: ${tool}`,
  ];

  if (retry > 0) {
    lines.push(`- retry_state: ${retry}/${retryMax}`);
  }

  if (completedToolCalls.length > 0) {
    lines.push("- completed_tool_calls:");
    for (const call of completedToolCalls.slice(-COMPLETED_TOOL_CALL_LIMIT)) {
      lines.push(formatCompletedToolCall(call));
    }
  }

  if (actionFailureHints.length > 0) {
    lines.push("- repeated_action_failures:");
    for (const hint of actionFailureHints) {
      lines.push(formatActionFailureHint(hint));
    }
  }

  lines.push("- Keep moving toward the same user goal; avoid repeating already completed steps.");
  if (completedToolCalls.length > 0) {
    lines.push(
      "- Use completed tool results above instead of repeating the same tool call/arguments. If more evidence is needed, call explicit debug/artifact/resource tools listed for this turn.",
    );
  }

  return lines.join("\n");
}
