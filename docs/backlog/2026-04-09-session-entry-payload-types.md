---
id: ISSUE-096
title: "Add typed interfaces for all SessionEntry payload kinds"
status: done
priority: p2
source: "next-batch planning 2026-04-09"
created: 2026-04-09
assignee: vega
claimed_at: 2026-04-09T02:25:00Z
tags:
  - contracts
  - types
  - session
module_id: kernel
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-kernel
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/contracts/test/contracts.spec.ts
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bunx vitest run packages/contracts/test/contracts.spec.ts"
---

## Goal

Define typed payload interfaces for all `SESSION_ENTRY_TYPES` that currently lack them: `thinking_level_change`, `model_change`, `label`, `session_info`. This completes the contracts type surface for session entries.

## Scope

1. Add `ThinkingLevelChangePayload` interface: `{ level: "low" | "medium" | "high" }`
2. Add `ModelChangePayload` interface: `{ from: string; to: string; reason?: string }`
3. Add `LabelPayload` interface: `{ label: string; color?: string }`
4. Add `SessionInfoPayload` interface: `{ key: string; value: unknown }`
5. Add discriminated union `SessionEntryPayload` that maps entry type → payload
6. Tests for payload type validity

## Acceptance

- All `SESSION_ENTRY_TYPES` have a corresponding typed payload interface
- Discriminated union allows type-safe payload access by entry type
- Existing contract tests still pass

## 工作总结

### 实现了什么

1. `ThinkingLevelChangePayload` — `{ level: "low" | "medium" | "high" }`，附带 `THINKING_LEVELS` const
2. `ModelChangePayload` — `{ from: string; to: string; reason?: string }`
3. `LabelPayload` — `{ label: string; color?: string }`
4. `SessionInfoPayload` — `{ key: string; value: unknown }`
5. `SessionEntryPayloadMap` — 覆盖全部 6 种 entry type 的 discriminated map type
6. 新增 6 个测试验证各 payload 类型和 map 完整性

### 检查结果

- `bunx vitest run packages/contracts/test/contracts.spec.ts` — 55 tests passed
- `biome check` — clean

### 残留风险

- `SessionEntry.payload` 仍为 `unknown`；改为 conditional type 需要更大规模的重构，留作 follow-up

## 相关 commits

- `5fa2a0b` feat(contracts): add typed payload interfaces for all SessionEntry kinds (ISSUE-096)
