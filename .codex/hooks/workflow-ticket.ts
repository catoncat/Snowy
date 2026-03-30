#!/usr/bin/env bun

import path from "node:path";
import { fileURLToPath } from "node:url";

import { isNamedAgentAssignee } from "../../.agents/skills/auto-claim-issues-next/scripts/claim-issue";
import {
  type QueueEntry,
  takeTicket,
} from "../../.agents/skills/auto-claim-issues-next/scripts/ticket-machine";

interface HookPayload {
  prompt?: string;
  session_id?: string;
}

export const CLAIM_SKILLS = ["agent-workflow-next", "auto-claim-issues-next"];
const SESSION_AGENT_PREFIX = "codex";

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function normalizePrompt(prompt: string): string {
  return String(prompt || "").trim();
}

export function isWorkflowSkillPrompt(prompt: string): boolean {
  const text = normalizePrompt(prompt);
  if (!text) {
    return false;
  }
  return CLAIM_SKILLS.some(
    (skill) => text.includes(`$${skill}`) || text.includes(`<name>${skill}</name>`),
  );
}

export function readExplicitIssueId(prompt: string): string | undefined {
  const match = normalizePrompt(prompt).match(/\bISSUE-\d+\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

export function deriveAgentName(sessionId: string): string {
  const envName = String(process.env.BBL_AGENT_NAME || "").trim();
  if (isNamedAgentAssignee(envName)) {
    return envName;
  }

  const suffix = (sessionId || "session").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "session";
  return `${SESSION_AGENT_PREFIX}-${suffix.toLowerCase()}`;
}

function dryRunEnabled(): boolean {
  return String(process.env.BBL_WORKFLOW_TICKET_DRY_RUN || "") === "1";
}

function formatIssueContext(
  entry: QueueEntry,
  agentName: string,
  claimMode: "claimed" | "preview",
  reason: string,
  reused: boolean,
): string {
  return [
    "Workflow ticket was resolved before the model turn.",
    `agent_name: ${agentName}`,
    `claim_mode: ${claimMode}`,
    `reused: ${reused ? "yes" : "no"}`,
    `reason: ${reason}`,
    `issue_id: ${entry.issue_id}`,
    `issue_title: ${entry.title}`,
    `issue_path: ${entry.issue_path}`,
    `module_id: ${entry.module_id}`,
    `module_stage: ${entry.module_stage}`,
    `tracking_kind: ${entry.tracking_kind}`,
    `parallel_group: ${entry.parallel_group}`,
    `depends_on: ${entry.depends_on.join(", ") || "(none)"}`,
    `write_scope: ${entry.write_scope.join(", ") || "(none)"}`,
    `check_cmd: ${entry.check_cmd || "(none)"}`,
    "Treat this as the current workflow issue.",
    "Read path now: issue file -> acceptance_ref -> matching src/test.",
    "Skip workflow/planning docs in this turn unless the user asks to change issue, rebuild queue, or do planning.",
    "Do not run claim again in this turn unless the user explicitly asks to change issue.",
  ].join("\n");
}

function formatQueueEmptyContext(reason: string): string {
  return [
    "Workflow ticket preflight did not assign an issue.",
    `reason: ${reason}`,
    "If the queue is empty, continue with next-batch planning or rebuild the live queue after backlog changes.",
  ].join("\n");
}

function printJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export async function run(): Promise<void> {
  const payload = JSON.parse(await new Response(Bun.stdin).text()) as HookPayload;
  const prompt = normalizePrompt(payload.prompt || "");
  if (!isWorkflowSkillPrompt(prompt)) {
    return;
  }

  const repoRoot = repoRootFromScript();
  const sessionId = String(payload.session_id || "session");
  const agentName = deriveAgentName(sessionId);
  const ticket = await takeTicket({
    repoRoot,
    sessionId,
    agentName,
    dryRun: dryRunEnabled(),
    issueId: readExplicitIssueId(prompt),
  });

  if (ticket.kind === "queue_empty") {
    printJson({
      continue: true,
      systemMessage: "Workflow ticket: queue empty",
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: formatQueueEmptyContext(ticket.reason),
      },
    });
    return;
  }

  printJson({
    continue: true,
    systemMessage: `Workflow ticket ${dryRunEnabled() ? "preview" : "claimed"}: ${ticket.entry.issue_id}`,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: formatIssueContext(
        ticket.entry,
        agentName,
        dryRunEnabled() ? "preview" : "claimed",
        ticket.reason,
        ticket.reused,
      ),
    },
  });
}

if (import.meta.main) {
  run().catch((error) => {
    printJson({
      continue: true,
      systemMessage: `Workflow ticket hook failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  });
}
