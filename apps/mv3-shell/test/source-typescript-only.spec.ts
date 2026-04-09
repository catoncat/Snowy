import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git"]);
const ALLOWED_FILES = new Set<string>([]);
const NO_NOCHECK_TARGETS = [
  "apps/mv3-shell/src/local-host-adapter.ts",
  "apps/mv3-shell/src/page-hook-bridge.ts",
  "apps/mv3-shell/vite.config.ts",
  "packages/js-runner/src/runner-host-core.ts",
];

function collectJsFiles(dir: string, results: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      collectJsFiles(join(dir, entry.name), results);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }

    const absPath = join(dir, entry.name);
    const relPath = relative(REPO_ROOT, absPath);
    if (ALLOWED_FILES.has(relPath)) {
      continue;
    }
    results.push(relPath);
  }
}

describe("source files are typescript-only", () => {
  it("contains no source-level .js files under apps/ packages/ or repo-root config", () => {
    const jsFiles: string[] = [];

    collectJsFiles(join(REPO_ROOT, "apps"), jsFiles);
    collectJsFiles(join(REPO_ROOT, "packages"), jsFiles);

    for (const rootEntry of readdirSync(REPO_ROOT)) {
      const absPath = join(REPO_ROOT, rootEntry);
      if (!statSync(absPath).isFile()) {
        continue;
      }
      if (!rootEntry.endsWith(".js")) {
        continue;
      }
      jsFiles.push(relative(REPO_ROOT, absPath));
    }

    expect(jsFiles.sort()).toEqual([]);
  });

  it("keeps key migrated typescript files free of @ts-nocheck", () => {
    const nocheckFiles = NO_NOCHECK_TARGETS.filter((relPath) =>
      readFileSync(join(REPO_ROOT, relPath), "utf8").includes("@ts-nocheck"),
    );

    expect(nocheckFiles).toEqual([]);
  });
});
