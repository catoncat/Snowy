---
id: ISSUE-170
title: "Review: Mainline repo guidance is not installed after init"
status: open
priority: p1
source: "mainline status agents_guidance"
created: 2026-05-15
assignee: unassigned
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
