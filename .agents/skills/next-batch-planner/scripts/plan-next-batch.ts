#!/usr/bin/env bun

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  dependenciesSatisfied,
  issuePriority,
  issueStatus,
  loadAllIssues,
  readArray,
  readString,
  toIssueSummary,
  type IssueFile,
  type Priority
} from "../../auto-claim-issues-next/scripts/claim-issue";

export interface PlanArgs {
  repoRoot: string;
  date?: string;
  outputPath?: string;
  dryRun: boolean;
  json: boolean;
}

export interface PlannedIssueSummary {
  id: string;
  title: string;
  priority: Priority;
  parallelGroup: string;
  dependsOn: string[];
  writeScope: string[];
  readyNow: boolean;
}

export type PlanResult =
  | {
      kind: "blocked";
      reason: string;
      inProgress: Array<ReturnType<typeof toIssueSummary>>;
      open: Array<ReturnType<typeof toIssueSummary>>;
    }
  | {
      kind: "preview" | "planned";
      reason: string;
      issueCount: number;
      outputPath: string;
      markdown: string;
      issues: PlannedIssueSummary[];
    };

function fail(message: string): never {
  console.error(`[next-batch-planner] ${message}`);
  process.exit(1);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
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

function batchNumber(repoRoot: string): number {
  const docsDir = path.join(repoRoot, "docs");
  let count = 0;
  try {
    count = readdirSync(docsDir).filter((name) =>
      /^next-development-slices-\d{4}-\d{2}-\d{2}\.md$/.test(name)
    ).length;
  } catch {
    count = 0;
  }
  return count + 1;
}

function sortIssues(left: IssueFile, right: IssueFile): number {
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

function summarizeOpenIssues(open: IssueFile[], all: IssueFile[]): PlannedIssueSummary[] {
  return [...open].sort(sortIssues).map((issue) => ({
    id: readString(issue, "id"),
    title: readString(issue, "title"),
    priority: issuePriority(issue),
    parallelGroup: readString(issue, "parallel_group"),
    dependsOn: readArray(issue, "depends_on"),
    writeScope: readArray(issue, "write_scope"),
    readyNow: dependenciesSatisfied(issue, all)
  }));
}

function buildPlanMarkdown(
  date: string,
  repoRoot: string,
  issues: PlannedIssueSummary[],
  counts: { done: number; open: number }
): string {
  const currentBatch = batchNumber(repoRoot);
  const lines: string[] = [
    `# Next Development Slices (${date})`,
    "",
    "Auto-generated from the current open backlog issues.",
    "",
    "## Snapshot",
    "",
    `- open issues: ${counts.open}`,
    `- done issues: ${counts.done}`,
    `- recommended batch: Batch ${currentBatch}`
  ];

  const groups = new Map<string, PlannedIssueSummary[]>();
  for (const issue of issues) {
    const list = groups.get(issue.parallelGroup) ?? [];
    list.push(issue);
    groups.set(issue.parallelGroup, list);
  }

  lines.push("", `## Recommended Batch ${currentBatch}`, "");
  for (const [group, entries] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`### Lane: ${group}`, "");
    for (const entry of entries) {
      lines.push(`- ${entry.id} ${entry.title}`);
      lines.push(`  - priority: ${entry.priority}`);
      lines.push(`  - ready_now: ${entry.readyNow ? "yes" : "no"}`);
      lines.push(
        `  - depends_on: ${entry.dependsOn.length > 0 ? entry.dependsOn.join(", ") : "(none)"}`
      );
      lines.push(
        `  - write_scope: ${entry.writeScope.length > 0 ? entry.writeScope.join(", ") : "(none)"}`
      );
    }
    lines.push("");
  }

  const deferred = issues.filter((issue) => !issue.readyNow);
  if (deferred.length > 0) {
    lines.push("## Deferred Inside Batch", "");
    for (const entry of deferred) {
      lines.push(`- ${entry.id} waits on ${entry.dependsOn.join(", ")}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseArgs(argv: string[], cwd = process.cwd()): PlanArgs {
  const out: PlanArgs = {
    repoRoot: cwd,
    date: undefined,
    outputPath: undefined,
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
      continue;
    }
    if (!item.startsWith("--")) {
      continue;
    }
    const eq = item.indexOf("=");
    const key = eq >= 0 ? item.slice(2, eq) : item.slice(2);
    const value = eq >= 0 ? item.slice(eq + 1).trim() : "";
    if (key === "date" && value) {
      out.date = value;
    }
    if (key === "output" && value) {
      out.outputPath = value;
    }
    if (key === "repo-root" && value) {
      out.repoRoot = path.resolve(cwd, value);
    }
  }

  return out;
}

export function planNextBatch(args: PlanArgs): PlanResult {
  const issues = loadAllIssues(args.repoRoot);
  const inProgress = issues.filter((issue) => issueStatus(issue) === "in-progress");
  const open = issues.filter((issue) => issueStatus(issue) === "open");
  const doneCount = issues.filter((issue) => issueStatus(issue) === "done").length;

  if (inProgress.length > 0) {
    return {
      kind: "blocked",
      reason: "Cannot plan a new batch while issues are still in-progress",
      inProgress: inProgress.map(toIssueSummary),
      open: open.map(toIssueSummary)
    };
  }

  if (open.length === 0) {
    return {
      kind: "blocked",
      reason: "No open issues available; create review backlog items first",
      inProgress: [],
      open: []
    };
  }

  const date = args.date ?? todayDate();
  const outputPath = args.outputPath ?? `docs/next-development-slices-${date}.md`;
  const summaries = summarizeOpenIssues(open, issues);
  const markdown = buildPlanMarkdown(date, args.repoRoot, summaries, {
    done: doneCount,
    open: open.length
  });

  if (!args.dryRun) {
    const fullPath = path.join(args.repoRoot, outputPath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, markdown, "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "planned",
    reason: "Generated next batch plan from open backlog issues",
    issueCount: summaries.length,
    outputPath,
    markdown,
    issues: summaries
  };
}

function printResult(result: PlanResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.kind === "blocked") {
    console.log(`result: ${result.kind}`);
    console.log(`reason: ${result.reason}`);
    if (result.inProgress.length > 0) {
      console.log("inProgress:");
      for (const issue of result.inProgress) {
        console.log(`- ${issue.id} ${issue.title}`);
      }
    }
    if (result.open.length > 0) {
      console.log("open:");
      for (const issue of result.open) {
        console.log(`- ${issue.id} ${issue.title}`);
      }
    }
    return;
  }

  console.log(`result: ${result.kind}`);
  console.log(`reason: ${result.reason}`);
  console.log(`issueCount: ${result.issueCount}`);
  console.log(`outputPath: ${result.outputPath}`);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = planNextBatch(args);
  printResult(result, args.json);
}

if (import.meta.main) {
  main();
}
