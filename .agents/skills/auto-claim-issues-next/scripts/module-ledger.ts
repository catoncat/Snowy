import { readFileSync } from "node:fs";
import path from "node:path";

export type ModuleStage = "mainline" | "secondary" | "deferred";
export type ModuleStatus = "shipped" | "partial" | "not-started";

export interface ModuleRecord {
  module_id: string;
  title: string;
  summary: string;
  tracking_order: number;
  stage: ModuleStage;
  status: ModuleStatus;
  depends_on_modules: string[];
  code_roots: string[];
  source_docs: string[];
  cutover_gate: string | null;
  default_parallel_group: string;
}

export interface ModuleLedger {
  schema_version: number;
  updated_at: string;
  modules: ModuleRecord[];
}

export const MODULE_STAGE_ORDER: Record<ModuleStage, number> = {
  mainline: 0,
  secondary: 1,
  deferred: 2
};

function isModuleStage(value: unknown): value is ModuleStage {
  return value === "mainline" || value === "secondary" || value === "deferred";
}

function isModuleStatus(value: unknown): value is ModuleStatus {
  return value === "shipped" || value === "partial" || value === "not-started";
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`module ledger field ${field} must be a non-empty string`);
  }
  return value;
}

function expectStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`module ledger field ${field} must be a string array`);
  }
  return value;
}

export function moduleStageRank(stage: ModuleStage): number {
  return MODULE_STAGE_ORDER[stage];
}

export function loadModuleLedger(repoRoot: string): ModuleLedger {
  const ledgerPath = path.join(repoRoot, "docs", "module-tracking-ledger.json");
  const parsed = JSON.parse(readFileSync(ledgerPath, "utf8")) as Partial<ModuleLedger>;

  if (parsed.schema_version !== 1) {
    throw new Error("module ledger schema_version must be 1");
  }
  if (typeof parsed.updated_at !== "string" || !Array.isArray(parsed.modules)) {
    throw new Error("module ledger must contain updated_at and modules");
  }

  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  const modules = parsed.modules.map((entry, index) => {
    const moduleId = expectString(entry?.module_id, `modules[${index}].module_id`);
    if (seenIds.has(moduleId)) {
      throw new Error(`duplicate module_id in module ledger: ${moduleId}`);
    }
    seenIds.add(moduleId);

    const trackingOrder = entry?.tracking_order;
    if (typeof trackingOrder !== "number" || !Number.isFinite(trackingOrder)) {
      throw new Error(`module ledger field modules[${index}].tracking_order must be a number`);
    }
    if (seenOrders.has(trackingOrder)) {
      throw new Error(`duplicate tracking_order in module ledger: ${trackingOrder}`);
    }
    seenOrders.add(trackingOrder);

    if (!isModuleStage(entry?.stage)) {
      throw new Error(`invalid stage for module ${moduleId}`);
    }
    if (!isModuleStatus(entry?.status)) {
      throw new Error(`invalid status for module ${moduleId}`);
    }

    return {
      module_id: moduleId,
      title: expectString(entry?.title, `modules[${index}].title`),
      summary: expectString(entry?.summary, `modules[${index}].summary`),
      tracking_order: trackingOrder,
      stage: entry.stage,
      status: entry.status,
      depends_on_modules: expectStringArray(
        entry?.depends_on_modules,
        `modules[${index}].depends_on_modules`
      ),
      code_roots: expectStringArray(entry?.code_roots, `modules[${index}].code_roots`),
      source_docs: expectStringArray(entry?.source_docs, `modules[${index}].source_docs`),
      cutover_gate:
        entry?.cutover_gate == null ? null : expectString(entry.cutover_gate, `modules[${index}].cutover_gate`),
      default_parallel_group: expectString(
        entry?.default_parallel_group,
        `modules[${index}].default_parallel_group`
      )
    } satisfies ModuleRecord;
  });

  return {
    schema_version: 1,
    updated_at: parsed.updated_at,
    modules
  };
}

export function getModuleRecord(ledger: ModuleLedger, moduleId: string): ModuleRecord | undefined {
  return ledger.modules.find((entry) => entry.module_id === moduleId);
}

export function sortModules(left: ModuleRecord, right: ModuleRecord): number {
  const stageDelta = moduleStageRank(left.stage) - moduleStageRank(right.stage);
  if (stageDelta !== 0) {
    return stageDelta;
  }
  return left.tracking_order - right.tracking_order;
}
