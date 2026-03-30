#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  dependenciesSatisfied,
  issueModuleId,
  issueModuleStage,
  issuePriority,
  issueTrackingKind,
  loadAllIssues,
  readArray,
  readString,
  scopesConflict,
  toIssueSummary,
  type IssueFile,
  type Priority
} from "./claim-issue";
import { getModuleRecord, loadModuleLedger, moduleStageRank, type ModuleLedger } from "./module-ledger";
import { liveQueuePath, type LiveQueue, type QueueEntry } from "./ticket-machine";

export interface BuildLiveQueueArgs {
  repoRoot: string;
  dryRun: boolean;
  json: boolean;
}

export interface BuildLiveQueueResult {
  kind: "preview" | "built";
  outputPath: string;
  entryCount: number;
  queue: LiveQueue;
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

function compareQueueOrder(left: IssueFile, right: IssueFile, moduleLedger: ModuleLedger): number {
  const leftModule = getModuleRecord(moduleLedger, issueModuleId(left));
  const rightModule = getModuleRecord(moduleLedger, issueModuleId(right));
  const stageDelta = moduleStageRank(issueModuleStage(left)) - moduleStageRank(issueModuleStage(right));
  if (stageDelta !== 0) {
    return stageDelta;
  }

  const leftOrder = leftModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = rightModule?.tracking_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
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

function queueEntryFromIssue(repoRoot: string, issue: IssueFile): QueueEntry {
  const summary = toIssueSummary(issue);
  return {
    issue_id: summary.id,
    issue_path: path.relative(repoRoot, issue.path),
    title: summary.title,
    parallel_group: summary.parallel_group,
    module_id: summary.module_id,
    module_stage: summary.module_stage,
    tracking_kind: summary.tracking_kind,
    check_cmd: summary.check_cmd,
    depends_on: summary.depends_on,
    write_scope: summary.write_scope
  };
}

function conflictsWithSelected(issue: IssueFile, selected: QueueEntry[]): boolean {
  const currentScopes = readArray(issue, "write_scope");
  if (currentScopes.length === 0) {
    return false;
  }
  return selected.some((entry) =>
    currentScopes.some((left) => entry.write_scope.some((right) => scopesConflict(left, right)))
  );
}

export function buildLiveQueue(args: BuildLiveQueueArgs): BuildLiveQueueResult {
  const moduleLedger = loadModuleLedger(args.repoRoot);
  const issues = loadAllIssues(args.repoRoot, {
    moduleLedger,
    validateModuleMetadata: true
  });

  const readyIssues = issues
    .filter((issue) => readString(issue, "status") === "open")
    .filter((issue) => dependenciesSatisfied(issue, issues))
    .sort((left, right) => compareQueueOrder(left, right, moduleLedger));

  const entries: QueueEntry[] = [];
  for (const issue of readyIssues) {
    if (conflictsWithSelected(issue, entries)) {
      continue;
    }
    entries.push(queueEntryFromIssue(args.repoRoot, issue));
  }

  const queue: LiveQueue = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repo_root: args.repoRoot,
    entries
  };

  const outputPath = liveQueuePath(args.repoRoot);
  if (!args.dryRun) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "built",
    outputPath: path.relative(args.repoRoot, outputPath),
    entryCount: queue.entries.length,
    queue
  };
}

function parseArgs(argv: string[], cwd = process.cwd()): BuildLiveQueueArgs {
  const out: BuildLiveQueueArgs = {
    repoRoot: cwd,
    dryRun: false,
    json: false
  };

  for (const item of argv) {
    if (item === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (item === "--json") {
      out.json = true;
    }
  }

  return out;
}

function printResult(result: BuildLiveQueueResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`result: ${result.kind}`);
  console.log(`outputPath: ${result.outputPath}`);
  console.log(`entryCount: ${result.entryCount}`);
  for (const entry of result.queue.entries) {
    console.log(`- ${entry.issue_id} ${entry.title}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = buildLiveQueue(args);
  printResult(result, args.json);
}

if (import.meta.main) {
  main();
}
