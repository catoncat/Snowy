---
id: ISSUE-170
title: "Review: Mainline repo guidance is not installed after init"
status: done
priority: p1
source: "mainline status agents_guidance"
created: 2026-05-15
assignee: codex-cat
tags:
  - review
  - workflow
  - mainline
module_id: repo-workflow-dx
module_stage: deferred
tracking_kind: doc-debt
kind: slice
epic: EPIC-repo-workflow-dx
parallel_group: sdk-docs
depends_on: []
write_scope:
  - AGENTS.md
acceptance_ref: AGENTS.md
check_cmd: "mainline agents check --json && git diff --check"
completed_at: 2026-05-15T09:43:47.734Z
---

## Goal

把 mainline init 后仍未安装的 repo-local Mainline agent guidance 收口到 AGENTS.md，避免后续 agent 只看到 hook/CLI 状态而缺少仓库级指针。

## Review Finding

- mainline status --json reports agents_guidance.state=not_installed even though .mainline/config.toml and hooks are installed.
- AGENTS.md currently has no Mainline managed policy block; future agents may miss the repo-level opt-in and stop-line pointer.

## Acceptance

- mainline agents check --json reports AGENTS.md state=in_sync for the current template version.
- AGENTS.md contains the versioned Mainline managed policy block without rewriting repo-specific Browser Brain Loop guidance.
- mainline preflight --json remains ok after the guidance install.

## 工作总结

### 实现了什么
- 安装 Mainline managed AGENTS.md 指引，补充 ISSUE-170 与 batch-14 planning，并把 live queue 指向该 doc-debt slice。

### 实际跑了什么检查
- mainline agents check --json && git diff --check && mainline preflight --json

### 残留风险
- 无

## 相关 commits

- `bfdf0ba5ad18` docs(workflow): 安装 Mainline 仓库指引
