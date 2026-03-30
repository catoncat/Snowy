#!/usr/bin/env bun

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  chooseIssue,
  claimIssueFile,
  findById,
  isNamedAgentAssignee,
  loadAllIssues,
  readString,
  toIssueSummary,
  type IssueSummary
} from "../../.agents/skills/auto-claim-issues-next/scripts/claim-issue";
import { loadModuleLedger } from "../../.agents/skills/auto-claim-issues-next/scripts/module-ledger";

interface HookPayload {
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  session_id?: string;
  turn_id?: string;
}

interface TicketRecord {
  agent_name: string;
  check_cmd: string;
  claimed_at: string;
  claim_mode: "claimed" | "preview";
  issue_id: string;
  issue_title: string;
  module_id: string;
  module_stage: string;
  parallel_group: string;
  tracking_kind: string;
}

interface TicketState {
  repo_root: string;
  schema_version: 1;
  sessions: Record<string, TicketRecord>;
  updated_at: string;
}

export const CLAIM_SKILLS = ["agent-workflow-next", "auto-claim-issues-next"];
const LOCK_WAIT_MS = 5_000;
const LOCK_RETRY_MS = 50;
const STALE_LOCK_MS = 15_000;
const SESSION_AGENT_PREFIX = "codex";

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function statePath(repoRoot: string): string {
  const repoName = path.basename(repoRoot);
  return path.join(os.homedir(), ".codex", "workflow-tickets", `${repoName}.json`);
}

function lockPath(repoRoot: string): string {
  return `${statePath(repoRoot)}.lock`;
}

function defaultState(repoRoot: string): TicketState {
  return {
    schema_version: 1,
    repo_root: repoRoot,
    sessions: {},
    updated_at: new Date().toISOString()
  };
}

function loadState(repoRoot: string): TicketState {
  const filePath = statePath(repoRoot);
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TicketState>;
    if (
      parsed.schema_version === 1 &&
      parsed.repo_root === repoRoot &&
      parsed.sessions &&
      typeof parsed.sessions === "object"
    ) {
      return {
        schema_version: 1,
        repo_root,
        sessions: parsed.sessions as Record<string, TicketRecord>,
        updated_at: String(parsed.updated_at || new Date().toISOString())
      };
    }
  } catch {}
  return defaultState(repoRoot);
}

function saveState(repoRoot: string, state: TicketState): void {
  const filePath = statePath(repoRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });
  state.updated_at = new Date().toISOString();
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function acquireLock(repoRoot: string): Promise<void> {
  const filePath = lockPath(repoRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    try {
      mkdirSync(filePath, { recursive: false });
      writeFileSync(
        path.join(filePath, "owner.json"),
        `${JSON.stringify({ created_at: new Date().toISOString(), pid: process.pid })}\n`,
        "utf8"
      );
      return;
    } catch (error) {
      try {
        const stats = statSync(filePath);
        if (Date.now() - stats.mtimeMs >= STALE_LOCK_MS) {
          rmSync(filePath, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (Date.now() - startedAt >= LOCK_WAIT_MS) {
        throw new Error(`workflow ticket lock timeout: ${filePath}`);
      }
      await Bun.sleep(LOCK_RETRY_MS);
    }
  }
}

function releaseLock(repoRoot: string): void {
  rmSync(lockPath(repoRoot), { recursive: true, force: true });
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
    (skill) => text.includes(`$${skill}`) || text.includes(`<name>${skill}</name>`)
  );
}

export function readExplicitIssueId(prompt: string): string | undefined {
  const match = normalizePrompt(prompt).match(/\bISSUE-\d+\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

export function deriveAgentName(sessionId: string, current?: TicketRecord): string {
  if (current?.agent_name && isNamedAgentAssignee(current.agent_name)) {
    return current.agent_name;
  }

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
  summary: IssueSummary,
  agentName: string,
  claimMode: "claimed" | "preview",
  reason: string
): string {
  const dependsOn = summary.depends_on.length > 0 ? summary.depends_on.join(", ") : "(none)";
  const writeScope = summary.write_scope.length > 0 ? summary.write_scope.join(", ") : "(none)";
  return [
    "Workflow ticket was resolved before the model turn.",
    `agent_name: ${agentName}`,
    `claim_mode: ${claimMode}`,
    `reason: ${reason}`,
    `issue_id: ${summary.id}`,
    `issue_title: ${summary.title}`,
    `module_id: ${summary.module_id}`,
    `module_stage: ${summary.module_stage}`,
    `tracking_kind: ${summary.tracking_kind}`,
    `parallel_group: ${summary.parallel_group}`,
    `depends_on: ${dependsOn}`,
    `write_scope: ${writeScope}`,
    `check_cmd: ${summary.check_cmd || "(none)"}`,
    "Treat this as the current workflow issue. Do not run claim again in this turn unless the user explicitly asks to change issue."
  ].join("\n");
}

function formatBlockedContext(reason: string, blockedBy: string[]): string {
  return [
    "Workflow ticket preflight did not claim an issue.",
    `reason: ${reason}`,
    `blocked: ${blockedBy.length > 0 ? blockedBy.join(", ") : "(none)"}`,
    "If the user is asking for planning, continue with next-batch-planner. Otherwise inspect live in-progress work before claiming again."
  ].join("\n");
}

function liveSummaryForSession(repoRoot: string, record: TicketRecord): IssueSummary | undefined {
  const moduleLedger = loadModuleLedger(repoRoot);
  const issues = loadAllIssues(repoRoot, {
    moduleLedger,
    validateModuleMetadata: true
  });
  const issue = findById(issues, record.issue_id);
  if (!issue) {
    return undefined;
  }
  const summary = toIssueSummary(issue);
  if (summary.status === "done") {
    return undefined;
  }
  if (record.claim_mode === "claimed" && summary.assignee !== record.agent_name) {
    return undefined;
  }
  return summary;
}

function printJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function withTicketLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(repoRoot);
  try {
    return await fn();
  } finally {
    releaseLock(repoRoot);
  }
}

export async function run(): Promise<void> {
  const payload = JSON.parse(await new Response(Bun.stdin).text()) as HookPayload;
  const prompt = normalizePrompt(payload.prompt || "");
  if (!isWorkflowSkillPrompt(prompt)) {
    return;
  }

  const repoRoot = repoRootFromScript();
  const sessionId = String(payload.session_id || "session");
  const explicitIssueId = readExplicitIssueId(prompt);

  await withTicketLock(repoRoot, async () => {
    const state = loadState(repoRoot);
    const existing = state.sessions[sessionId];
    const agentName = deriveAgentName(sessionId, existing);
    const live = existing ? liveSummaryForSession(repoRoot, existing) : undefined;

    if (live && (!explicitIssueId || explicitIssueId === live.id)) {
      printJson({
        continue: true,
        systemMessage: `Workflow ticket reused: ${live.id}`,
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: formatIssueContext(live, agentName, existing.claim_mode, "existing session ticket")
        }
      });
      return;
    }

    delete state.sessions[sessionId];

    const moduleLedger = loadModuleLedger(repoRoot);
    const issues = loadAllIssues(repoRoot, {
      moduleLedger,
      validateModuleMetadata: true
    });
    const result = chooseIssue(
      issues,
      {
        assignee: agentName,
        allowConflicts: false,
        dryRun: dryRunEnabled(),
        group: undefined,
        issueId: explicitIssueId,
        json: false
      },
      { moduleLedger }
    );

    if (result.kind === "blocked") {
      const blockedIds = [
        ...result.blockedByDependencies.map((item) => item.id),
        ...result.blockedByConflicts.map((item) => item.id)
      ];
      printJson({
        continue: true,
        systemMessage: "Workflow ticket: no claimable issue",
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: formatBlockedContext(result.reason, blockedIds)
        }
      });
      saveState(repoRoot, state);
      return;
    }

    let summary = result.issue;
    let claimMode: "claimed" | "preview" = dryRunEnabled() ? "preview" : "claimed";

    if (!dryRunEnabled()) {
      const issueFile = findById(issues, result.issue.id);
      if (!issueFile) {
        throw new Error(`workflow ticket issue not found: ${result.issue.id}`);
      }
      claimIssueFile(issueFile, agentName);
      summary = toIssueSummary(issueFile);
    } else {
      summary = {
        ...summary,
        assignee: agentName,
        status: "open"
      };
    }

    state.sessions[sessionId] = {
      agent_name: agentName,
      check_cmd: summary.check_cmd,
      claimed_at: new Date().toISOString(),
      claim_mode: claimMode,
      issue_id: summary.id,
      issue_title: summary.title,
      module_id: summary.module_id,
      module_stage: summary.module_stage,
      parallel_group: summary.parallel_group,
      tracking_kind: summary.tracking_kind
    };
    saveState(repoRoot, state);

    printJson({
      continue: true,
      systemMessage: `Workflow ticket ${claimMode}: ${summary.id}`,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: formatIssueContext(summary, agentName, claimMode, result.reason)
      }
    });
  });
}

if (import.meta.main) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    printJson({
      continue: true,
      systemMessage: `Workflow ticket hook failed: ${message}`
    });
  });
}
