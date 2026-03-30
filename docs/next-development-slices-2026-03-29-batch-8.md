# Development Slices — Batch 8

> generated: 2026-03-30
> trigger: next-batch-planner gap analysis after batch 7 exhaustion
> batch-pointer: this file

## 背景

Batch 7 所有可认领 issue 已完成（ISSUE-042/043/051/052/053）。
当前 backlog 经 gap analysis 后新增 6 个 issue（ISSUE-059–064），其中 ISSUE-064 已在规划期间完成。
ISSUE-036 由 codex-019d3c93 在 in-progress，阻塞 4 个下游 issue。

## Module Coverage 现状

| 模块 | Stage | Live Issues | 状态 |
|------|-------|-------------|------|
| kernel | mainline | ISSUE-059, 060, 061 | ✅ 有覆盖 |
| observability-audit | mainline | ISSUE-062, 063 | ✅ 有覆盖 |
| intervention-handoff | mainline | ISSUE-041 | ✅ 有覆盖（被 036 阻塞） |
| ai-surface-control-plane | secondary | ISSUE-055, 056 | ✅ 有覆盖 |
| site-runtime-browser-automation | secondary | ISSUE-037, 039, 040, 057, 058 | ✅ 有覆盖（多数被 036 阻塞） |
| execution-host-bridge | secondary | — | ⚠️ 无 live issue |

## Batch 8 优先级排序

### 立即可做（无阻塞）

| 优先级 | Issue | 模块 | 类型 |
|--------|-------|------|------|
| 1 | ISSUE-059 | kernel | follow-up: VFS-backed SessionStorage adapter |
| 2 | ISSUE-060 | kernel | follow-up: core wiring (registry+providers inject) |
| 3 | ISSUE-061 | kernel | gap: real loop orchestration integration |
| 4 | ISSUE-062 | observability-audit | gap: persistent audit event store |
| 5 | ISSUE-063 | observability-audit | follow-up: diagnostics resource surface |

### 等待 ISSUE-055 完成后

| 优先级 | Issue | 模块 | 类型 |
|--------|-------|------|------|
| 6 | ISSUE-056 | ai-surface-control-plane | review: skill lifecycle control-plane |

### 等待 ISSUE-036 完成后

| 优先级 | Issue | 模块 | 类型 |
|--------|-------|------|------|
| 7 | ISSUE-037 | site-runtime-browser-automation | review: page/tabs automation |
| 8 | ISSUE-039 | site-runtime-browser-automation | review: background automation |
| 9 | ISSUE-040 | site-runtime-browser-automation | review: screenshot/download |
| 10 | ISSUE-041 | intervention-handoff | review: intervention/handoff |
| 11 | ISSUE-057 | site-runtime-browser-automation | follow-up: Tier 1 page automation |
| 12 | ISSUE-058 | site-runtime-browser-automation | follow-up: tabs.navigate |

## 已知 Gap

- **execution-host-bridge** 无 live issue — 所有 8 个 issue done，远程 host adapter 缺失（deferred-leaning，不急开 issue）
- **ISSUE-036** 是 4 issue 的单点瓶颈 — 若长期 stalled，需要重新分配

## Doc Freshness 已处理

- [x] ai-surface-index.md 全面刷新（ISSUE-064, done）
- [x] kernel-skeleton-design.md status 更新为 `slices B-1/B-2/B-3 delivered`
