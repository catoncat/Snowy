#!/usr/bin/env bun

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  dependenciesSatisfied,
  issueModuleId,
  issueModuleStage,
  issuePriority,
  issueStatus,
  issueTrackingKind,
  loadAllIssues,
  readString,
  toIssueSummary,
  type IssueFile,
  type IssueSummary,
  type Priority,
  type TrackingKind
} from "../../auto-claim-issues-next/scripts/claim-issue";
import {
  getModuleRecord,
  loadModuleLedger,
  sortModules,
  type ModuleLedger,
  type ModuleRecord,
  type ModuleStage
} from "../../auto-claim-issues-next/scripts/module-ledger";

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
  moduleId: string;
  moduleTitle: string;
  moduleStage: ModuleStage;
  trackingKind: TrackingKind;
  moduleOrder: number;
}

export interface ModuleCoverageSummary {
  moduleId: string;
  title: string;
  stage: ModuleStage;
  status: ModuleRecord["status"];
  openIssueIds: string[];
  inProgressIssueIds: string[];
}

export type PlanResult =
  | {
      kind: "blocked";
      reason: string;
      inProgress: IssueSummary[];
      open: IssueSummary[];
      missingModules: ModuleCoverageSummary[];
      unmappedIssues: string[];
      moduleCoverage: ModuleCoverageSummary[];
    }
  | {
      kind: "preview" | "planned";
      reason: string;
      issueCount: number;
      outputPath: string;
      markdown: string;
      issues: PlannedIssueSummary[];
      missingModules: ModuleCoverageSummary[];
      unmappedIssues: string[];
      moduleCoverage: ModuleCoverageSummary[];
    };

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
  let maxBatch = 0;
  try {
    for (const name of readdirSync(docsDir)) {
      const match = name.match(/^next-development-slices-\d{4}-\d{2}-\d{2}-batch-(\d+)\.md$/);
      if (match) {
        maxBatch = Math.max(maxBatch, Number(match[1]));
      }
    }
  } catch {
    maxBatch = 0;
  }
  return maxBatch + 1;
}

function compareIssues(left: IssueFile, right: IssueFile, moduleLedger: ModuleLedger): number {
  const leftModule = getModuleRecord(moduleLedger, issueModuleId(left));
  const rightModule = getModuleRecord(moduleLedger, issueModuleId(right));
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

function inspectIssueMappings(issues: IssueFile[], moduleLedger: ModuleLedger): string[] {
  const errors: string[] = [];
  for (const issue of issues) {
    const issueId = readString(issue, "id");
    const moduleId = readString(issue, "module_id");
    if (!moduleId) {
      errors.push(`${issueId} 缺少 module_id`);
      continue;
    }

    const module = getModuleRecord(moduleLedger, moduleId);
    if (!module) {
      errors.push(`${issueId} 使用了未知 module_id: ${moduleId}`);
      continue;
    }

    const stage = readString(issue, "module_stage");
    if (!stage) {
      errors.push(`${issueId} 缺少 module_stage`);
    } else if (stage !== module.stage) {
      errors.push(`${issueId} 的 module_stage=${stage} 与台账 ${module.stage} 不一致`);
    }

    const trackingKind = readString(issue, "tracking_kind");
    if (
      trackingKind !== "mainline" &&
      trackingKind !== "gap" &&
      trackingKind !== "follow-up" &&
      trackingKind !== "doc-debt"
    ) {
      errors.push(`${issueId} 缺少合法 tracking_kind`);
    }
  }
  return errors;
}

function summarizeOpenIssues(
  open: IssueFile[],
  all: IssueFile[],
  moduleLedger: ModuleLedger
): PlannedIssueSummary[] {
  return [...open].sort((left, right) => compareIssues(left, right, moduleLedger)).map((issue) => {
    const module = getModuleRecord(moduleLedger, issueModuleId(issue));
    if (!module) {
      throw new Error(`unknown module_id for issue ${readString(issue, "id")}`);
    }
    return {
      id: readString(issue, "id"),
      title: readString(issue, "title"),
      priority: issuePriority(issue),
      parallelGroup: readString(issue, "parallel_group"),
      dependsOn: issue.frontmatter.data.depends_on
        ? Array.isArray(issue.frontmatter.data.depends_on)
          ? issue.frontmatter.data.depends_on.map((item) => String(item))
          : [String(issue.frontmatter.data.depends_on)]
        : [],
      writeScope: issue.frontmatter.data.write_scope
        ? Array.isArray(issue.frontmatter.data.write_scope)
          ? issue.frontmatter.data.write_scope.map((item) => String(item))
          : [String(issue.frontmatter.data.write_scope)]
        : [],
      readyNow: dependenciesSatisfied(issue, all),
      moduleId: module.module_id,
      moduleTitle: module.title,
      moduleStage: issueModuleStage(issue),
      trackingKind: issueTrackingKind(issue),
      moduleOrder: module.tracking_order
    };
  });
}

function collectModuleCoverage(
  moduleLedger: ModuleLedger,
  issues: IssueFile[]
): ModuleCoverageSummary[] {
  return [...moduleLedger.modules].sort(sortModules).map((module) => {
    const openIssueIds = issues
      .filter((issue) => issueStatus(issue) === "open" && readString(issue, "module_id") === module.module_id)
      .map((issue) => readString(issue, "id"));
    const inProgressIssueIds = issues
      .filter(
        (issue) => issueStatus(issue) === "in-progress" && readString(issue, "module_id") === module.module_id
      )
      .map((issue) => readString(issue, "id"));
    return {
      moduleId: module.module_id,
      title: module.title,
      stage: module.stage,
      status: module.status,
      openIssueIds,
      inProgressIssueIds
    };
  });
}

function findMissingModules(moduleCoverage: ModuleCoverageSummary[]): ModuleCoverageSummary[] {
  return moduleCoverage.filter((entry) => {
    if (entry.stage === "deferred" || entry.status === "shipped") {
      return false;
    }
    return entry.openIssueIds.length === 0 && entry.inProgressIssueIds.length === 0;
  });
}

function stageHeading(stage: ModuleStage): string {
  if (stage === "mainline") {
    return "Mainline Modules";
  }
  if (stage === "secondary") {
    return "Secondary Modules";
  }
  return "Deferred Modules";
}

function buildPlanMarkdown(
  date: string,
  repoRoot: string,
  issues: PlannedIssueSummary[],
  counts: { done: number; open: number },
  moduleLedger: ModuleLedger
): string {
  const currentBatch = batchNumber(repoRoot);
  const lines: string[] = [
    `# Next Development Slices (${date})`,
    "",
    "Auto-generated from the current module ledger and live open backlog issues.",
    "",
    "## Snapshot",
    "",
    `- open issues: ${counts.open}`,
    `- done issues: ${counts.done}`,
    `- tracked modules: ${moduleLedger.modules.length}`,
    `- recommended batch: Batch ${currentBatch}`
  ];

  const stageOrder: ModuleStage[] = ["mainline", "secondary", "deferred"];
  for (const stage of stageOrder) {
    const stageModules = moduleLedger.modules
      .filter((module) => module.stage === stage)
      .sort(sortModules)
      .filter((module) => issues.some((issue) => issue.moduleId === module.module_id));

    if (stageModules.length === 0) {
      continue;
    }

    lines.push("", `## ${stageHeading(stage)}`, "");
    for (const module of stageModules) {
      lines.push(`### ${module.title} (\`${module.module_id}\`)`, "");
      lines.push(`- stage: ${module.stage}`);
      lines.push(`- status: ${module.status}`);
      lines.push(`- default_parallel_group: ${module.default_parallel_group}`);
      lines.push("");

      for (const issue of issues.filter((entry) => entry.moduleId === module.module_id)) {
        lines.push(`- ${issue.id} ${issue.title}`);
        lines.push(`  - tracking_kind: ${issue.trackingKind}`);
        lines.push(`  - priority: ${issue.priority}`);
        lines.push(`  - parallel_group: ${issue.parallelGroup}`);
        lines.push(`  - ready_now: ${issue.readyNow ? "yes" : "no"}`);
        lines.push(
          `  - depends_on: ${issue.dependsOn.length > 0 ? issue.dependsOn.join(", ") : "(none)"}`
        );
        lines.push(
          `  - write_scope: ${issue.writeScope.length > 0 ? issue.writeScope.join(", ") : "(none)"}`
        );
      }
      lines.push("");
    }
  }

  const deferred = issues.filter((issue) => !issue.readyNow);
  if (deferred.length > 0) {
    lines.push("## Deferred Inside Batch", "");
    for (const issue of deferred) {
      lines.push(`- ${issue.id} waits on ${issue.dependsOn.join(", ")}`);
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
  const moduleLedger = loadModuleLedger(args.repoRoot);
  const issues = loadAllIssues(args.repoRoot);
  const metadataProblems = inspectIssueMappings(issues, moduleLedger);
  const moduleCoverage = collectModuleCoverage(moduleLedger, issues);
  const missingModules = findMissingModules(moduleCoverage);
  const inProgressIssues = issues.filter((issue) => issueStatus(issue) === "in-progress");
  const openIssues = issues.filter((issue) => issueStatus(issue) === "open");
  const doneCount = issues.filter((issue) => issueStatus(issue) === "done").length;

  if (metadataProblems.length > 0) {
    return {
      kind: "blocked",
      reason: "Backlog issue metadata is missing module mappings",
      inProgress: [],
      open: [],
      missingModules,
      unmappedIssues: metadataProblems,
      moduleCoverage
    };
  }

  if (inProgressIssues.length > 0) {
    return {
      kind: "blocked",
      reason: "Cannot plan a new batch while issues are still in-progress",
      inProgress: inProgressIssues.map(toIssueSummary),
      open: openIssues.map(toIssueSummary),
      missingModules,
      unmappedIssues: [],
      moduleCoverage
    };
  }

  if (missingModules.length > 0) {
    return {
      kind: "blocked",
      reason: "Missing live backlog coverage for tracked modules",
      inProgress: [],
      open: openIssues.map(toIssueSummary),
      missingModules,
      unmappedIssues: [],
      moduleCoverage
    };
  }

  if (openIssues.length === 0) {
    return {
      kind: "blocked",
      reason: "No open issues available; create review backlog items first",
      inProgress: [],
      open: [],
      missingModules,
      unmappedIssues: [],
      moduleCoverage
    };
  }

  const date = args.date ?? todayDate();
  const outputPath = args.outputPath ?? `docs/next-development-slices-${date}-batch-${batchNumber(args.repoRoot)}.md`;
  const summaries = summarizeOpenIssues(openIssues, issues, moduleLedger);
  const markdown = buildPlanMarkdown(date, args.repoRoot, summaries, {
    done: doneCount,
    open: openIssues.length
  }, moduleLedger);

  if (!args.dryRun) {
    const fullPath = path.join(args.repoRoot, outputPath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, markdown, "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "planned",
    reason: "Generated next batch plan from module coverage and open backlog issues",
    issueCount: summaries.length,
    outputPath,
    markdown,
    issues: summaries,
    missingModules,
    unmappedIssues: [],
    moduleCoverage
  };
}

function printCoverageSummary(entries: ModuleCoverageSummary[]): void {
  if (entries.length === 0) {
    return;
  }
  console.log("moduleCoverage:");
  for (const entry of entries) {
    const live = [...entry.inProgressIssueIds, ...entry.openIssueIds];
    console.log(
      `- ${entry.moduleId} stage=${entry.stage} status=${entry.status} live=${live.length > 0 ? live.join(", ") : "(none)"}`
    );
  }
}

function printResult(result: PlanResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.kind === "blocked") {
    console.log(`result: ${result.kind}`);
    console.log(`reason: ${result.reason}`);
    if (result.unmappedIssues.length > 0) {
      console.log("unmappedIssues:");
      for (const item of result.unmappedIssues) {
        console.log(`- ${item}`);
      }
    }
    if (result.missingModules.length > 0) {
      console.log("missingModules:");
      for (const module of result.missingModules) {
        console.log(`- ${module.moduleId} ${module.title}`);
      }
    }
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
    printCoverageSummary(result.moduleCoverage);
    return;
  }

  console.log(`result: ${result.kind}`);
  console.log(`reason: ${result.reason}`);
  console.log(`issueCount: ${result.issueCount}`);
  console.log(`outputPath: ${result.outputPath}`);
  printCoverageSummary(result.moduleCoverage);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = planNextBatch(args);
  printResult(result, args.json);
}

if (import.meta.main) {
  main();
}
