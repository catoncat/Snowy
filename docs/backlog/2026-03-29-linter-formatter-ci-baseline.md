---
id: ISSUE-049
title: Linter + Formatter + CI 质量门禁基线
status: done
priority: p1
source: docs/reviews/2026-03-29-docs-dx-review.md § 4.1
created: 2026-03-29
assignee: unassigned
tags: [dx, ci, toolchain]
kind: slice
epic: EPIC-dx-hardening
parallel_group: sdk-docs
depends_on: []
write_scope:
  - package.json
  - .github/workflows/
  - biome.json
acceptance_ref: docs/reviews/2026-03-29-docs-dx-review.md
check_cmd: bun run lint && bun run format:check
---

## 问题

当前仓库无 linter、formatter 和 CI pipeline。多 agent 并行开发场景下，代码风格漂移是确定性风险。

## 接受标准

1. 配置 biome（或 eslint + prettier），包含 TypeScript + JSON 支持
2. 添加 `lint` 和 `format` / `format:check` 脚本到根 package.json
3. 创建 `.github/workflows/ci.yml`，在 PR 上运行 `bun run check`（typecheck + test + lint）
4. 现有代码通过 lint + format（允许在本 PR 内批量修复）
5. `bun run check` 脚本更新为包含 lint
