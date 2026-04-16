---
id: ISSUE-136
title: "Intervention cross-endpoint coordination and timeout governance"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: unassigned
tags:
  - review
  - intervention
  - timeout
  - cross-tab
module_id: intervention-handoff
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-intervention
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/kernel/src/intervention-controller.ts
  - packages/contracts/src/index.ts
  - apps/mv3-shell/src/background.ts
  - packages/kernel/test
acceptance_ref: docs/reviews/2026-03-29-vnext-architecture-recovery-report.md
check_cmd: "bun run check"
merges: [ISSUE-142]
---

## Goal

补全 intervention 的跨端协调与超时治理：超时/未解决的 intervention 产生结构化审计条目，跨 tab/window 的 intervention 状态同步。

## Review Finding

- Intervention 超时或长时间未解决时没有结构化审计/告警机制，operator 无法从 audit.tail 发现积压的 intervention。
- Intervention 状态在单 session 内持久化，但跨 tab/window 不可见也不可解决，限制了多窗口工作流。

## Acceptance

- When an intervention request times out or remains unresolved beyond a configurable threshold the system emits a structured audit entry with escalation metadata; timeout-triggered audit entries appear in audit.tail resource
- Intervention requests created in one tab are visible and resolvable from another tab or window; state synchronization uses a shared channel not polling
- Test coverage for timeout audit emission and cross-tab state visibility

## Impact Note

1. 影响的 northbound surface：
   - 既有 `audit.tail` resource 新增 intervention escalation 结构化条目
   - 既有 `runtime.summary.interventions` / `audit.intervention` 继续沿用原有 resource id，不新增 public capability namespace
2. 影响的消费者：
   - chat / UI / MCP 读取 `audit.tail` 时可看到 intervention 的 stale / timeout 升级条目
   - 多 tab/window 的 runtime service 实例可共享 intervention 状态并跨端 resolve
3. 控制面文档同步：
   - 已执行 Doc Freshness Gate；因未新增 resource id、action namespace 或 cutover 判定，仅扩展既有 resource payload，当前无需同步控制面文档

## 工作总结

- 在 `packages/contracts` 为 intervention escalation 增加结构化 audit 词汇与 payload，并为 intervention record 持久化 escalation 阈值/触发时间
- 在 `packages/kernel` 的 intervention controller 中补齐 configurable stale escalation 与 timeout escalation 事件；超时后会写入带 metadata 的 intervention audit
- 在 `apps/mv3-shell` 中将 intervention escalation 投影到统一 `audit.tail`，并通过 shared channel 让不同 tab/window 的 runtime service 实例在无需 polling 的情况下同步 intervention 状态
- 新增/更新测试覆盖 kernel escalation、`audit.tail` 暴露、shared-channel 同步，以及相关 contract/VFS snapshot 兼容
- 验证：
  - `bun run typecheck`
  - `bun run check`
- 残留风险：
  - 当前 shared channel 依赖 `BroadcastChannel`（或注入的等价通道）；若目标运行环境缺失该能力，会回退为仅靠持久化重启/重进时 rehydrate，而不会提供已初始化实例间的即时同步

## 相关 commits

- `52605db` `feat(intervention): 补齐超时升级与跨端同步`
