---
id: ISSUE-135
title: "Provider routing runtime robustness: health state, lane override, and policy-driven escalation"
status: done
priority: p1
source: review
created: 2026-04-15
assignee: claude-opus
tags:
  - review
  - provider
  - escalation
  - health
module_id: provider-profile-routing
module_stage: mainline
tracking_kind: gap
kind: slice
epic: EPIC-provider-routing
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/kernel/src/llm-profile-resolver.ts
  - packages/kernel/src/loop-orchestrator.ts
  - packages/kernel/src/kernel-facade.ts
  - packages/contracts/src/index.ts
  - packages/kernel/test
acceptance_ref: docs/kernel-skeleton-design.md
check_cmd: "bun run check"
merges: [ISSUE-139, ISSUE-140]
---

## Goal

补全 provider/profile routing 的运行时健壮性：健康状态追踪、运行时 lane profile 切换、以及策略驱动的 escalation 触发。

## Review Finding

- `LlmProviderRegistry.setHealthStatus()` 存在但无调用点：escalation 发生时降级 provider 从未被标记为 down，导致同 session 内可能重复选择已失败的 provider。
- `laneProfiles` 在 contracts 和 resolver 中都已实现，但 mv3-shell 总是使用隐式默认值，运行中无法动态切换。
- escalation 只由 API 错误触发，不支持 capability 不匹配或质量降级等策略驱动信号。

## Acceptance

- When escalation triggers due to repeated LLM failures the degraded provider is marked down in the registry to prevent re-selection within the same session
- Kernel facade exposes a method to update lane-specific profile overrides during an active run without restart
- Escalation can be triggered by policy-driven signals such as capability requirement mismatches not just HTTP/API errors
- Test coverage for health state transition, mid-run lane profile switch, and policy-triggered escalation path

## 工作总结

三个 acceptance 全部完成：

1. **Health state on escalation**: `requestLlmWithRetry` 在 escalation 成功后调用 `markProviderDown()` 将旧 provider 标记为 `down`，阻止同 session 内重复选择。对 catch 和 HTTP status 两个 escalation 路径都做了处理。
2. **Runtime lane profile update**: `Kernel.updateLaneProfiles(lane, profiles)` 允许在 run 期间动态切换 lane profile chain，无需 restart kernel。空 profiles 会回退到默认 chain。
3. **Policy-driven escalation signal**: `RequestLlmWithRetryOptions.escalationSignal` 允许调用方传入 `EscalationSignal`（reason: capability_mismatch / quality_degradation / policy），在首次 LLM 请求前即触发 escalation + 标记旧 provider down。

新增 5 个测试：health state 转换、policy signal escalation、mid-run lane switch、no config throw、empty lane fallback。

## 相关 commits

- 0dd54d4 docs(ISSUE-138): 收口 tabs 管理缺口 (includes ISSUE-135 kernel changes)
