#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  getModuleRecord,
  loadModuleLedger,
  moduleStageRank,
  type ModuleLedger,
  type ModuleStage
} from "./module-ledger";
import { takeTicket, type QueueEntry } from "./ticket-machine";

export type Status = "open" | "in-progress" | "done";
export type Priority = "p0" | "p1" | "p2";
export type TrackingKind = "mainline" | "gap" | "follow-up" | "doc-debt";

export type FrontmatterValue = string | string[];

export interface Frontmatter {
  order: string[];
  data: Record<string, FrontmatterValue>;
}

export interface IssueFile {
  path: string;
  filename: string;
  body: string;
  frontmatter: Frontmatter;
}

export interface ParsedArgs {
  issueId?: string;
  assignee: string;
  group?: string;
  dryRun: boolean;
  json: boolean;
  allowConflicts: boolean;
}

export interface IssueSummary {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee: string;
  parallel_group: string;
  depends_on: string[];
  write_scope: string[];
  check_cmd: string;
  path: string;
  module_id: string;
  module_stage: ModuleStage;
  tracking_kind: TrackingKind;
}

export type ClaimResult =
  | {
      kind: "claimed" | "preview";
      issue: IssueSummary;
      reason: string;
    }
  | {
      kind: "blocked";
      reason: string;
      blockedByDependencies: IssueSummary[];
      blockedByConflicts: IssueSummary[];
    }
  | {
      kind: "already_claimed";
      issue: IssueSummary;
      reason: string;
    };

function fail(message: string): never {
  console.error(`[auto-claim-issues-next] ${message}`);
  process.exit(1);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    assignee: String(process.env.BBL_AGENT_NAME || "").trim(),
    dryRun: false,
    json: false,
    allowConflicts: false
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (item === "--json") {
      out.json = true;
      continue;
    }
    if (item === "--allow-conflicts") {
      out.allowConflicts = true;
      continue;
    }
    if (!item.startsWith("--")) {
      continue;
    }
    const eq = item.indexOf("=");
    const key = eq >= 0 ? item.slice(2, eq) : item.slice(2);
    const value = eq >= 0 ? item.slice(eq + 1).trim() : "";
    if (key === "issue" && value) {
      out.issueId = value;
    }
    if ((key === "assignee" || key === "name") && value) {
      out.assignee = value;
    }
    if (key === "group" && value) {
      out.group = value;
    }
  }

  return out;
}

const RESERVED_ASSIGNEE_NAMES = new Set(["agent", "human", "unassigned"]);

export function isNamedAgentAssignee(value: string): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }
  return !RESERVED_ASSIGNEE_NAMES.has(normalized.toLowerCase());
}

function stripQuotes(raw: string): string {
  const text = String(raw || "").trim();
  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) {
    return [];
  }
  return inner
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function stripInlineComment(raw: string): string {
  const text = String(raw || "");
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const prev = index > 0 ? text[index - 1] : "";
    if (char === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      const before = index === 0 ? "" : text[index - 1];
      if (!before || /\s/.test(before)) {
        return text.slice(0, index).trimEnd();
      }
    }
  }
  return text.trimEnd();
}

function isModuleStage(value: string): value is ModuleStage {
  return value === "mainline" || value === "secondary" || value === "deferred";
}

function isTrackingKind(value: string): value is TrackingKind {
  return value === "mainline" || value === "gap" || value === "follow-up" || value === "doc-debt";
}

export function parseFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    fail("backlog 文件缺少合法 frontmatter");
  }
  const yaml = String(match[1] || "");
  const body = String(match[2] || "");
  const lines = yaml.split(/\r?\n/);
  const data: Record<string, FrontmatterValue> = {};
  const order: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!top) {
      continue;
    }
    const key = top[1];
    const rest = stripInlineComment(top[2]);
    order.push(key);
    if (!rest) {
      const items: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const child = lines[cursor];
        const bullet = child.match(/^\s*-\s+(.*)$/);
        if (!bullet) {
          break;
        }
        items.push(stripQuotes(stripInlineComment(bullet[1])));
        cursor += 1;
      }
      data[key] = items;
      index = cursor - 1;
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      data[key] = parseInlineArray(rest);
      continue;
    }
    data[key] = stripQuotes(rest);
  }

  return {
    frontmatter: { order, data },
    body
  };
}

function formatScalar(raw: string): string {
  const text = String(raw ?? "");
  if (/^[A-Za-z0-9._/:=-]+$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function serializeFrontmatter(frontmatter: Frontmatter): string {
  const seen = new Set<string>();
  const keys = [...frontmatter.order, ...Object.keys(frontmatter.data)].filter((key) => {
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const lines: string[] = ["---"];
  for (const key of keys) {
    const value = frontmatter.data[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatScalar(item)}`);
        }
      }
      continue;
    }
    lines.push(`${key}: ${formatScalar(String(value || ""))}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

export function loadIssueFile(filePath: string): IssueFile {
  const text = readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(text);
  return {
    path: filePath,
    filename: path.basename(filePath),
    body: parsed.body,
    frontmatter: parsed.frontmatter
  };
}

function writeIssueFile(issue: IssueFile): void {
  const next = `${serializeFrontmatter(issue.frontmatter)}\n${issue.body.replace(/^\n*/, "")}`;
  writeFileSync(issue.path, next, "utf8");
}

export function readString(issue: IssueFile, key: string): string {
  const value = issue.frontmatter.data[key];
  return Array.isArray(value) ? "" : String(value || "").trim();
}

export function readArray(issue: IssueFile, key: string): string[] {
  const value = issue.frontmatter.data[key];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (!value) {
    return [];
  }
  return [String(value).trim()].filter(Boolean);
}

export function issueModuleId(issue: IssueFile): string {
  return readString(issue, "module_id");
}

export function issueModuleStage(issue: IssueFile): ModuleStage {
  const value = readString(issue, "module_stage");
  if (isModuleStage(value)) {
    return value;
  }
  fail(`issue ${readString(issue, "id")} 缺少合法 module_stage`);
}

export function issueTrackingKind(issue: IssueFile): TrackingKind {
  const value = readString(issue, "tracking_kind");
  if (isTrackingKind(value)) {
    return value;
  }
  fail(`issue ${readString(issue, "id")} 缺少合法 tracking_kind`);
}

function normalizeScope(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\/\*$/, "")
    .replace(/\*$/, "")
    .replace(/\/+$/, "");
}

export function scopesConflict(a: string, b: string): boolean {
  const left = normalizeScope(a);
  const right = normalizeScope(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function issueStatus(issue: IssueFile): Status {
  const value = readString(issue, "status");
  if (value === "open" || value === "in-progress" || value === "done") {
    return value;
  }
  return "open";
}

export function issuePriority(issue: IssueFile): Priority {
  const value = readString(issue, "priority");
  if (value === "p0" || value === "p1" || value === "p2") {
    return value;
  }
  return "p2";
}

function priorityRank(priority: Priority): number {
  if (priority === "p0") {
    return 0;
  }
  if (priority === "p1") {
    return 1;
  }
  return 2;
}

export function toIssueSummary(issue: IssueFile): IssueSummary {
  return {
    id: readString(issue, "id"),
    title: readString(issue, "title"),
    status: issueStatus(issue),
    priority: issuePriority(issue),
    assignee: readString(issue, "assignee"),
    parallel_group: readString(issue, "parallel_group"),
    depends_on: readArray(issue, "depends_on"),
    write_scope: readArray(issue, "write_scope"),
    check_cmd: readString(issue, "check_cmd"),
    path: path.relative(process.cwd(), issue.path),
    module_id: issueModuleId(issue),
    module_stage: issueModuleStage(issue),
    tracking_kind: issueTrackingKind(issue)
  };
}

export function findById(issues: IssueFile[], issueId: string): IssueFile | undefined {
  return issues.find((issue) => readString(issue, "id") === issueId);
}

export function dependenciesSatisfied(issue: IssueFile, all: IssueFile[]): boolean {
  const deps = readArray(issue, "depends_on");
  if (deps.length === 0) {
    return true;
  }
  return deps.every((depId) => {
    const dep = findById(all, depId);
    return dep != null && issueStatus(dep) === "done";
  });
}

export function hasScopeConflict(issue: IssueFile, active: IssueFile[]): boolean {
  const currentScopes = readArray(issue, "write_scope");
  if (currentScopes.length === 0) {
    return false;
  }
  return active.some((other) => {
    const otherId = readString(other, "id");
    const currentId = readString(issue, "id");
    if (otherId === currentId) {
      return false;
    }
    const otherScopes = readArray(other, "write_scope");
    return currentScopes.some((left) =>
      otherScopes.some((right) => scopesConflict(left, right))
    );
  });
}

export function validateIssueModuleMetadata(issue: IssueFile, moduleLedger: ModuleLedger): void {
  const issueId = readString(issue, "id");
  const moduleId = issueModuleId(issue);
  if (!moduleId) {
    fail(`issue ${issueId} 缺少 module_id`);
  }

  const module = getModuleRecord(moduleLedger, moduleId);
  if (!module) {
    fail(`issue ${issueId} 使用了未知 module_id: ${moduleId}`);
  }

  const stage = issueModuleStage(issue);
  if (stage !== module.stage) {
    fail(`issue ${issueId} 的 module_stage=${stage} 与台账 ${module.stage} 不一致`);
  }

  issueTrackingKind(issue);
}

export function loadAllIssues(
  repoRoot: string,
  opts?: { moduleLedger?: ModuleLedger; validateModuleMetadata?: boolean }
): IssueFile[] {
  const backlogDir = path.join(repoRoot, "docs", "backlog");
  const files = readdirSync(backlogDir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  const issues = files.map((name) => loadIssueFile(path.join(backlogDir, name)));
  if (opts?.validateModuleMetadata) {
    if (!opts.moduleLedger) {
      fail("validateModuleMetadata 需要 module ledger");
    }
    for (const issue of issues) {
      validateIssueModuleMetadata(issue, opts.moduleLedger);
    }
  }
  return issues;
}

function compareClaimPriority(
  left: IssueFile,
  right: IssueFile,
  moduleLedger?: ModuleLedger
): number {
  const leftStage = issueModuleStage(left);
  const rightStage = issueModuleStage(right);
  const stageDelta = moduleStageRank(leftStage) - moduleStageRank(rightStage);
  if (stageDelta !== 0) {
    return stageDelta;
  }

  if (moduleLedger) {
    const leftModule = getModuleRecord(moduleLedger, issueModuleId(left));
    const rightModule = getModuleRecord(moduleLedger, issueModuleId(right));
    const leftOrder = leftModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = rightModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
  }

  const priorityDelta = priorityRank(issuePriority(left)) - priorityRank(issuePriority(right));
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const createdDelta = readString(left, "created").localeCompare(readString(right, "created"));
  if (createdDelta !== 0) {
    return createdDelta;
  }
  return readString(left, "id").localeCompare(readString(right, "id"));
}

export function chooseIssue(
  issues: IssueFile[],
  args: ParsedArgs,
  opts?: { moduleLedger?: ModuleLedger }
): ClaimResult {
  const active = issues.filter((issue) => issueStatus(issue) === "in-progress");

  if (args.issueId) {
    const exact = findById(issues, args.issueId);
    if (!exact) {
      fail(`未找到 issue: ${args.issueId}`);
    }
    if (issueStatus(exact) === "in-progress") {
      return {
        kind: "already_claimed",
        issue: toIssueSummary(exact),
        reason: "指定 issue 已经是 in-progress"
      };
    }
    if (issueStatus(exact) === "done") {
      fail(`指定 issue 已完成，不能重新 claim: ${args.issueId}`);
    }
    if (!dependenciesSatisfied(exact, issues)) {
      return {
        kind: "blocked",
        reason: "指定 issue 的 depends_on 尚未完成",
        blockedByDependencies: [toIssueSummary(exact)],
        blockedByConflicts: []
      };
    }
    if (!args.allowConflicts && hasScopeConflict(exact, active)) {
      return {
        kind: "blocked",
        reason: "指定 issue 与当前 in-progress write_scope 冲突",
        blockedByDependencies: [],
        blockedByConflicts: [toIssueSummary(exact)]
      };
    }
    return {
      kind: args.dryRun ? "preview" : "claimed",
      issue: toIssueSummary(exact),
      reason: "按指定 issue 认领"
    };
  }

  const candidates = issues
    .filter((issue) => issueStatus(issue) === "open")
    .filter((issue) => !args.group || readString(issue, "parallel_group") === args.group);

  const claimable = candidates
    .filter((issue) => dependenciesSatisfied(issue, issues))
    .filter((issue) => args.allowConflicts || !hasScopeConflict(issue, active))
    .sort((a, b) => compareClaimPriority(a, b, opts?.moduleLedger));

  if (claimable[0]) {
    return {
      kind: args.dryRun ? "preview" : "claimed",
      issue: toIssueSummary(claimable[0]),
      reason: "按优先级、依赖和 write_scope 冲突规则自动认领"
    };
  }

  return {
    kind: "blocked",
    reason: "当前没有可认领的 open issue",
    blockedByDependencies: candidates
      .filter((issue) => !dependenciesSatisfied(issue, issues))
      .map(toIssueSummary)
      .slice(0, 5),
    blockedByConflicts: candidates
      .filter((issue) => dependenciesSatisfied(issue, issues))
      .filter((issue) => hasScopeConflict(issue, active))
      .map(toIssueSummary)
      .slice(0, 5)
  };
}

export function claimIssueFile(issue: IssueFile, assignee: string): void {
  issue.frontmatter.data.status = "in-progress";
  issue.frontmatter.data.assignee = assignee;
  issue.frontmatter.data.claimed_at = new Date().toISOString();
  if (!issue.frontmatter.order.includes("claimed_at")) {
    issue.frontmatter.order.push("claimed_at");
  }
  writeIssueFile(issue);
}

function printResult(result: ClaimResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.kind === "blocked") {
    console.log(`result: ${result.kind}`);
    console.log(`reason: ${result.reason}`);
    if (result.blockedByDependencies.length > 0) {
      console.log("blockedByDependencies:");
      for (const item of result.blockedByDependencies) {
        console.log(`- ${item.id} ${item.title}`);
      }
    }
    if (result.blockedByConflicts.length > 0) {
      console.log("blockedByConflicts:");
      for (const item of result.blockedByConflicts) {
        console.log(`- ${item.id} ${item.title}`);
      }
    }
    return;
  }

  console.log(`result: ${result.kind}`);
  console.log(`reason: ${result.reason}`);
  console.log(`id: ${result.issue.id}`);
  console.log(`title: ${result.issue.title}`);
  console.log(`assignee: ${result.issue.assignee || "(none)"}`);
  console.log(`parallel_group: ${result.issue.parallel_group}`);
  console.log(`module_id: ${result.issue.module_id}`);
  console.log(`module_stage: ${result.issue.module_stage}`);
  console.log(`tracking_kind: ${result.issue.tracking_kind}`);
  console.log(`path: ${result.issue.path}`);
  console.log(`depends_on: ${result.issue.depends_on.join(", ") || "(none)"}`);
  console.log(`write_scope: ${result.issue.write_scope.join(", ") || "(none)"}`);
  console.log(`check_cmd: ${result.issue.check_cmd || "(none)"}`);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  if (!args.dryRun && !isNamedAgentAssignee(args.assignee)) {
    fail(
      "真正 claim 时必须写 Agent 自己的名字，使用 --name=<your-name>、--assignee=<your-name>，或设置 BBL_AGENT_NAME；不要用 agent/human/unassigned"
    );
  }

  const sessionId = `cli:${args.assignee || "preview"}`;
  takeTicket({
    repoRoot,
    sessionId,
    agentName: args.assignee || "preview",
    dryRun: args.dryRun,
    issueId: args.issueId
  })
    .then((ticket) => {
      if (args.json) {
        console.log(JSON.stringify(ticket, null, 2));
        return;
      }

      if (ticket.kind === "queue_empty") {
        console.log("result: blocked");
        console.log(`reason: ${ticket.reason}`);
        return;
      }

      printTicketEntry(ticket.entry, args.dryRun ? "preview" : "claimed", ticket.reason, args.assignee);
    })
    .catch((error) => {
      fail(error instanceof Error ? error.message : String(error));
    });
}

if (import.meta.main) {
  main();
}

function printTicketEntry(
  entry: QueueEntry,
  result: "preview" | "claimed",
  reason: string,
  assignee: string
): void {
  console.log(`result: ${result}`);
  console.log(`reason: ${reason}`);
  console.log(`id: ${entry.issue_id}`);
  console.log(`title: ${entry.title}`);
  console.log(`assignee: ${assignee || "(none)"}`);
  console.log(`parallel_group: ${entry.parallel_group}`);
  console.log(`module_id: ${entry.module_id}`);
  console.log(`module_stage: ${entry.module_stage}`);
  console.log(`tracking_kind: ${entry.tracking_kind}`);
  console.log(`path: ${entry.issue_path}`);
  console.log(`depends_on: ${entry.depends_on.join(", ") || "(none)"}`);
  console.log(`write_scope: ${entry.write_scope.join(", ") || "(none)"}`);
  console.log(`check_cmd: ${entry.check_cmd || "(none)"}`);
}
