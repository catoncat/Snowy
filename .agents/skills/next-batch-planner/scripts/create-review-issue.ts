#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type IssueFile,
  type Priority,
  loadAllIssues,
} from "../../auto-claim-issues-next/scripts/claim-issue";
import {
  type ModuleLedger,
  getModuleRecord,
  loadModuleLedger,
} from "../../auto-claim-issues-next/scripts/module-ledger";

export interface CreateReviewIssueArgs {
  repoRoot: string;
  date?: string;
  dryRun: boolean;
  json: boolean;
  title: string;
  priority: Priority;
  moduleId: string;
  parallelGroup?: string;
  epic: string;
  acceptanceRef: string;
  source: string;
  tags: string[];
  writeScope: string[];
  dependsOn?: string[];
  assignee?: string;
  trackingKind?: "mainline" | "gap" | "follow-up" | "doc-debt";
  goal?: string;
  reviewFinding?: string[];
  acceptance: string[];
}

export type CreateReviewIssueResult = {
  kind: "preview" | "created";
  reason: string;
  issue: {
    id: string;
    title: string;
    path: string;
    module_id: string;
    module_stage: string;
    parallel_group: string;
    write_scope: string[];
    acceptance_ref: string;
  };
};

function fail(message: string): never {
  console.error(`[next-batch-planner] ${message}`);
  process.exit(1);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(title: string): string {
  return title
    .replace(/^review:\s*/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nextIssueId(issues: IssueFile[]): string {
  const max = issues.reduce((current, issue) => {
    const match = issue.frontmatter.data.id?.toString().match(/^ISSUE-(\d+)$/);
    if (!match) {
      return current;
    }
    return Math.max(current, Number(match[1]));
  }, 0);
  return `ISSUE-${String(max + 1).padStart(3, "0")}`;
}

function quoteIfNeeded(value: string): string {
  if (/^[A-Za-z0-9._/:=-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function resolveParallelGroup(args: CreateReviewIssueArgs, moduleLedger: ModuleLedger): string {
  const module = getModuleRecord(moduleLedger, args.moduleId);
  if (!module) {
    fail(`unknown --module=${args.moduleId}`);
  }
  return args.parallelGroup || module.default_parallel_group;
}

function resolveTrackingKind(args: CreateReviewIssueArgs) {
  return args.trackingKind ?? "gap";
}

function buildFrontmatter(
  args: CreateReviewIssueArgs,
  issueId: string,
  moduleLedger: ModuleLedger,
): string {
  const dependsOn = args.dependsOn ?? [];
  const tags = [...new Set(args.tags)];
  const module = getModuleRecord(moduleLedger, args.moduleId);
  if (!module) {
    fail(`unknown --module=${args.moduleId}`);
  }
  const parallelGroup = resolveParallelGroup(args, moduleLedger);
  const lines: string[] = [
    "---",
    `id: ${issueId}`,
    `title: ${quoteIfNeeded(args.title)}`,
    "status: open",
    `priority: ${args.priority}`,
    `source: ${quoteIfNeeded(args.source)}`,
    `created: ${args.date ?? todayDate()}`,
    `assignee: ${args.assignee ?? "unassigned"}`,
    "tags:",
  ];

  for (const tag of tags) {
    lines.push(`  - ${quoteIfNeeded(tag)}`);
  }

  lines.push(
    `module_id: ${quoteIfNeeded(module.module_id)}`,
    `module_stage: ${module.stage}`,
    `tracking_kind: ${quoteIfNeeded(resolveTrackingKind(args))}`,
    "kind: slice",
    `epic: ${quoteIfNeeded(args.epic)}`,
    `parallel_group: ${quoteIfNeeded(parallelGroup)}`,
  );

  if (dependsOn.length === 0) {
    lines.push("depends_on: []");
  } else {
    lines.push("depends_on:");
    for (const dep of dependsOn) {
      lines.push(`  - ${quoteIfNeeded(dep)}`);
    }
  }

  lines.push("write_scope:");
  for (const scope of args.writeScope) {
    lines.push(`  - ${quoteIfNeeded(scope)}`);
  }
  lines.push(
    `acceptance_ref: ${quoteIfNeeded(args.acceptanceRef)}`,
    'check_cmd: "bun run check"',
    "---",
  );
  return `${lines.join("\n")}\n`;
}

function buildBody(args: CreateReviewIssueArgs): string {
  const titleWithoutPrefix = args.title.replace(/^review:\s*/i, "").trim();
  const goal =
    args.goal ??
    `把 ${titleWithoutPrefix || "当前 drift"} 收口成可执行的 backlog 结论，并明确后续 follow-up。`;
  const findings = args.reviewFinding ?? ["待补充具体 drift / 风险描述"];

  const lines: string[] = ["", "## Goal", "", goal, "", "## Review Finding", ""];

  for (const finding of findings) {
    lines.push(`- ${finding}`);
  }

  lines.push("", "## Acceptance", "");
  for (const item of args.acceptance) {
    lines.push(`- ${item}`);
  }

  return `${lines.join("\n")}\n`;
}

export function parseArgs(argv: string[], cwd = process.cwd()): CreateReviewIssueArgs {
  const out: CreateReviewIssueArgs = {
    repoRoot: cwd,
    date: undefined,
    dryRun: false,
    json: false,
    title: "",
    priority: "p1",
    moduleId: "",
    parallelGroup: undefined,
    epic: "",
    acceptanceRef: "",
    source: "review",
    tags: ["review"],
    writeScope: [],
    dependsOn: [],
    assignee: "unassigned",
    reviewFinding: [],
    acceptance: [],
  };

  const appendList = (target: string[], value: string) => {
    for (const item of value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      target.push(item);
    }
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

    if (key === "repo-root" && value) {
      out.repoRoot = path.resolve(cwd, value);
    } else if (key === "date" && value) {
      out.date = value;
    } else if (key === "title" && value) {
      out.title = value;
    } else if (key === "priority" && value) {
      out.priority = value as Priority;
    } else if (key === "module" && value) {
      out.moduleId = value;
    } else if (key === "group" && value) {
      out.parallelGroup = value;
    } else if (key === "epic" && value) {
      out.epic = value;
    } else if (key === "acceptance-ref" && value) {
      out.acceptanceRef = value;
    } else if (key === "source" && value) {
      out.source = value;
    } else if (key === "assignee" && value) {
      out.assignee = value;
    } else if (key === "tracking-kind" && value) {
      out.trackingKind = value as CreateReviewIssueArgs["trackingKind"];
    } else if (key === "goal" && value) {
      out.goal = value;
    } else if (key === "tag" && value) {
      appendList(out.tags, value);
    } else if (key === "scope" && value) {
      appendList(out.writeScope, value);
    } else if (key === "depends-on" && value) {
      appendList(out.dependsOn ?? [], value);
    } else if (key === "finding" && value) {
      appendList(out.reviewFinding ?? [], value);
    } else if (key === "accept" && value) {
      appendList(out.acceptance, value);
    }
  }

  return out;
}

function validateArgs(args: CreateReviewIssueArgs): void {
  if (!args.title) {
    fail("missing --title");
  }
  if (!args.moduleId) {
    fail("missing --module");
  }
  if (!args.epic) {
    fail("missing --epic");
  }
  if (!args.acceptanceRef) {
    fail("missing --acceptance-ref");
  }
  if (args.writeScope.length === 0) {
    fail("missing --scope");
  }
  if (args.acceptance.length === 0) {
    fail("missing --accept");
  }
}

export function createReviewIssue(args: CreateReviewIssueArgs): CreateReviewIssueResult {
  validateArgs(args);
  const moduleLedger = loadModuleLedger(args.repoRoot);
  const module = getModuleRecord(moduleLedger, args.moduleId);
  if (!module) {
    fail(`unknown --module=${args.moduleId}`);
  }
  const issues = loadAllIssues(args.repoRoot);
  const issueId = nextIssueId(issues);
  const date = args.date ?? todayDate();
  const slug = slugify(args.title) || "review-item";
  const relativePath = path.join("docs", "backlog", `${date}-${slug}.md`);
  const content = `${buildFrontmatter({ ...args, date }, issueId, moduleLedger)}${buildBody({ ...args, date })}`;

  if (!args.dryRun) {
    const fullPath = path.join(args.repoRoot, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }

  return {
    kind: args.dryRun ? "preview" : "created",
    reason: "Created review backlog issue from planning pass",
    issue: {
      id: issueId,
      title: args.title,
      path: relativePath,
      module_id: module.module_id,
      module_stage: module.stage,
      parallel_group: resolveParallelGroup(args, moduleLedger),
      write_scope: args.writeScope,
      acceptance_ref: args.acceptanceRef,
    },
  };
}

function printResult(result: CreateReviewIssueResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`result: ${result.kind}`);
  console.log(`reason: ${result.reason}`);
  console.log(`id: ${result.issue.id}`);
  console.log(`title: ${result.issue.title}`);
  console.log(`path: ${result.issue.path}`);
  console.log(`parallel_group: ${result.issue.parallel_group}`);
}

export function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = createReviewIssue(args);
  printResult(result, args.json);
}

if (import.meta.main) {
  main();
}
