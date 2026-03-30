# Development Slices — Batch 9

> generated: 2026-03-30
> trigger: explicit next-batch planning after `ISSUE-056` close + module coverage gap review
> batch-pointer: this file

## 背景

- `ISSUE-056` 已完成；当前 live queue 头已切到 `ISSUE-069`。
- `ISSUE-057` 仍在 `in-progress`，site-runtime lane 继续并行推进。
- 本次 planning 新补了 2 张 coverage follow-up：
  - `ISSUE-070` observability audit tail 统一收口
  - `ISSUE-071` intervention durable/shared-surface 收口
- 这是手动 planning snapshot；不覆盖 `docs/workflow/live-queue.json` 与 lease 文件的 dispatch 真相。

## Snapshot

- open issues: 5
- in-progress issues: 1
- done issues: 59
- current live queue head: `ISSUE-069`
- batch theme: 先清理当前 correction queue，再补 mainline observability / intervention coverage

## Module Coverage 现状

| 模块 | Stage | Live Issues | 状态 |
|---|---|---|---|
| kernel | mainline | `ISSUE-067` | ✅ 有覆盖 |
| observability-audit | mainline | `ISSUE-070` | ✅ 有覆盖 |
| intervention-handoff | mainline | `ISSUE-071` | ✅ 有覆盖 |
| ai-surface-control-plane | secondary | `ISSUE-069` | ✅ 有覆盖 |
| site-runtime-browser-automation | secondary | `ISSUE-057` | ✅ 有覆盖（进行中） |
| execution-host-bridge | secondary | `ISSUE-066` | ✅ 有覆盖 |

结论：

- 所有非 deferred module 现在都有 live backlog coverage，不再出现 mainline 模块掉出 active planning 的空窗。
- `intervention-handoff` 在台账中的状态已从 `not-started` 校正为 `partial`。

## Batch 9 优先级排序

### 当前执行面

| 优先级 | Issue | 模块 | 状态 | ready_now |
|---|---|---|---|---|
| 1 | `ISSUE-057` | site-runtime-browser-automation | in-progress | yes |
| 2 | `ISSUE-069` | ai-surface-control-plane | open | yes |

### Correction Queue

| 优先级 | Issue | 模块 | 说明 | ready_now |
|---|---|---|---|---|
| 3 | `ISSUE-066` | execution-host-bridge | Gate 1: 去掉 app-local truth | yes |
| 4 | `ISSUE-067` | kernel | Gate 2: 让 kernel 成为运行中枢 | no, depends on `ISSUE-066` |

### Mainline Coverage Follow-ups

| 优先级 | Issue | 模块 | 说明 | ready_now |
|---|---|---|---|---|
| 5 | `ISSUE-070` | observability-audit | 统一 `audit.tail`，补 config/skills lifecycle audit coverage | no, depends on `ISSUE-066` |
| 6 | `ISSUE-071` | intervention-handoff | 收口 intervention shared surface + restart durability | no, depends on `ISSUE-067` |

## Sequencing Notes

- `ISSUE-069` 虽是 secondary，但它是当前 queue builder 选出的可 dispatch 头票；在 `ISSUE-056` 收口后应先完成。
- `ISSUE-066` / `ISSUE-067` 仍是插件主线纠偏的中心链路；`ISSUE-070` / `ISSUE-071` 不应绕过这两张 gate 直接抢跑。
- `ISSUE-070` 的目标不是新增另一套 audit 面，而是把 `audit.tail` 从 host-only 扩成统一 control-plane audit 真相。
- `ISSUE-071` 必须保持 `ISSUE-041` 的 locked decision：不新增新的 public capability family，只补 runtime handoff 的 shared contract 与 durability。
