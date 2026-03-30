---
id: ISSUE-077
title: "Review: executable skill setup hooks still have no vNext slice"
status: done
priority: p2
source: "current workflow concurrency correction 2026-03-30"
created: 2026-03-30
assignee: unassigned
tags:
  - review
  - skill-sdk
  - hooks
  - authoring
module_id: skill-runtime-sdk-studio
module_stage: deferred
tracking_kind: gap
kind: slice
epic: EPIC-skill-runtime-sdk
parallel_group: sdk-docs
depends_on: []
write_scope:
  - packages/skill-sdk/src/index.ts
  - packages/skill-sdk/test/skill-sdk.spec.ts
acceptance_ref: docs/legacy-to-vnext-migration-matrix.md
check_cmd: "bun run check"
---

## Goal

把 executable skill setup hooks still have no vNext slice 收口成可执行的 backlog 结论，并明确后续 follow-up。

## Review Finding

- migration matrix 仍把 hooks system / extension points 标成 not-started，但 backlog 里还没有对应的 vNext slice
- skill-sdk 目前只有 defineSkill 与 typed facade，缺少 setup/install-time extension point，后续 executable Skill packaging 很容易再次回流到 ad-hoc app glue
- 这块 write_scope 与当前 correction head 不冲突，适合作为等待期间的独立并行 lane

## Acceptance

- 明确 executable skill setup hook 的最小 contract：何时运行、拿到什么上下文、允许做哪些副作用
- packages/skill-sdk 至少提供一个可测试的 hook authoring surface 或 placeholder contract，而不是继续停留在口头方向
- 测试锁住 hook 声明与运行时边界，避免未来再退回旧 plugin hook 语义

## 工作总结

- `packages/skill-sdk` 新增 install-only `setup` 声明面、`SKILL_SETUP_PHASES`、`runSkillSetupHooks()`，把 setup side effect 先收口为 `mem://skills/<skillId>/...` 包内文件计划与 notes。
- `packages/skill-sdk/test/skill-sdk.spec.ts` 新增 setup contract 测试，覆盖 phase 锁定、声明归一化、非法 phase / 非函数拒绝、包根逃逸阻断，以及 runtime invoke 不执行 setup hooks。
- Doc Freshness Gate 已检查 `docs/ai-surface-index.md`、`docs/agent-bootstrap-context-pack.md`、`docs/module-tracking-ledger.json`、`docs/legacy-to-vnext-migration-matrix.md`、`docs/migration-parity-dashboard.md`、`docs/cutover-readiness-criteria.md`。
- 已更新 `docs/legacy-to-vnext-migration-matrix.md`，把 hooks system / extension points 从 `not-started` 回写为 `partial`；其余控制面文档未声明该 authoring surface 或 cutover 判定，无需同步。
- 已新增 `ISSUE-079`，继续收口 skill setup hook 的 README / authoring guide / package convention 文档缺口。
- 已运行：
  - `bun test packages/skill-sdk/test/skill-sdk.spec.ts`
  - `bunx biome check packages/skill-sdk/src/index.ts packages/skill-sdk/test/skill-sdk.spec.ts`
  - `bun run check`（失败于仓内既有、且不在本 issue write scope 的 Biome drift；当前日志定位到 `apps/mv3-shell/src/local-host-adapter.js`、`apps/mv3-shell/src/offscreen.js`、`apps/mv3-shell/src/page-hook.js`、`docs/workflow/live-queue.json` 等，已有 `ISSUE-076` 跟踪）
- 残留风险：当前只实现 install-only declarative setup contract；runtime 接线、更丰富 phase 与作者文档仍需后续 slice。

## 相关 commits

- `97d9d0d` `feat(skill-sdk): add install-time setup hooks`
