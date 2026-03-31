#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type IssueFile,
  type Priority,
  dependenciesSatisfied,
  issueModuleId,
  issueModuleStage,
  issuePriority,
  loadAllIssues,
  readArray,
  readString,
  scopesConflict,
  toIssueSummary,
} from "./claim-issue";
import {
  type ModuleLedger,
  getModuleRecord,
  loadModuleLedger,
  moduleStageRank,
} from "./module-ledger";
import { type LiveQueue, type QueueEntry, liveQueuePath } from "./ticket-machine";

const SCRIPT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
const BIOME_CONFIG_PATH = path.join(SCRIPT_REPO_ROOT, "biome.json");
const BIOME_EXECUTABLE_PATH = path.join(
  SCRIPT_REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "biome.cmd" : "biome",
);

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
  const stageDelta =
    moduleStageRank(issueModuleStage(left)) - moduleStageRank(issueModuleStage(right));
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
    write_scope: summary.write_scope,
  };
}

function conflictsWithSelected(issue: IssueFile, selected: QueueEntry[]): boolean {
  const currentScopes = readArray(issue, "write_scope");
  if (currentScopes.length === 0) {
    return false;
  }
  return selected.some((entry) =>
    currentScopes.some((left) => entry.write_scope.some((right) => scopesConflict(left, right))),
  );
}

function formatQueueJson(outputPath: string, queue: LiveQueue, repoRoot: string): string {
  const relativeOutputPath = path.relative(repoRoot, outputPath) || path.basename(outputPath);
  const raw = `${JSON.stringify(queue, null, 2)}\n`;
  return execFileSync(
    BIOME_EXECUTABLE_PATH,
    ["format", `--config-path=${BIOME_CONFIG_PATH}`, `--stdin-file-path=${relativeOutputPath}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: raw,
    },
  );
}

export function buildLiveQueue(args: BuildLiveQueueArgs): BuildLiveQueueResult {
  const moduleLedger = loadModuleLedger(args.repoRoot);
  const issues = loadAllIssues(args.repoRoot, {
    moduleLedger,
    validateModuleMetadata: true,
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
    entries,
  };

  const outputPath = liveQueuePath(args.repoRoot);
  if (!args.dryRun) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, formatQueueJson(outputPath, queue, args.repoRoot), "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "built",
    outputPath: path.relative(args.repoRoot, outputPath),
    entryCount: queue.entries.length,
    queue,
  };
}

function parseArgs(argv: string[], cwd = process.cwd()): BuildLiveQueueArgs {
  const out: BuildLiveQueueArgs = {
    repoRoot: cwd,
    dryRun: false,
    json: false,
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
