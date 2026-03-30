---
id: ISSUE-045
title: "Review: Site Runtime 与 Capability Routing 桥接策略未定义"
status: done
priority: p1
source: "architecture quality review 2026-03-29"
created: 2026-03-29
assignee: unassigned
tags:
  - review
  - site-runtime
  - core
  - capability-routing
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on: []
write_scope:
  - packages/site-runtime/src/
  - packages/site-runtime/test/
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
acceptance_ref: docs/reviews/2026-03-29-architecture-quality-review.md
check_cmd: "bun run check"
---

## Goal

定义并实现 `SiteSkillRuntime` 到 `CapabilityRegistry` / `FamilyProviderRegistry` 的桥接策略，让 `ctx.call("page.click", input)` 能最终走到 content script injection 链路。

## Review Finding

当前 `SiteSkillRuntime.invoke()` 是一条完全独立于 `CapabilityRegistry` 的平行路径：
- `SiteSkillRegistry.matchActiveTab()` → `buildInjectionPlan()` → install → invoke → verify
- 不经过 `FamilyProviderRegistry`

而 `page.*` 和 `site.*` 在 `BUILTIN_CATALOG` 中已有 descriptor，但没有注册对应的 `FamilyProvider`。

这意味着：
1. `ctx.call("page.click", { uid })` 会 throw "No provider registered for family page"
2. Skill 无法通过统一的 `ctx.call()` 使用 page/site 能力
3. 两条路径的权限模型、trace 记录不统一

## Acceptance

- 明确 page/site family provider 的桥接方案（至少有一个设计决定文档）
- 至少有一个 page 或 site 操作可以通过 `ctx.call()` → injected content script 完成 round-trip
- 桥接后 trace entry 仍能记录为标准 `CapabilityTraceEntry`
- 或者：如果决定 page/site 不走 family provider 而保持独立路径，需要在 `docs/locked-decisions-2026-03-29.md` 中锁定这个决定

## Notes

- 与 `2026-03-29-page-and-tabs-public-automation-path-is-still-underdefined.md` 有关联但不重复：那个 issue 关注的是 page/tabs 的 public namespace 覆盖度，本 issue 关注的是执行链路的统一性
- 参见 `docs/reviews/2026-03-29-architecture-quality-review.md` § 4.2
- 决策输出：`docs/reviews/2026-03-29-site-runtime-capability-routing-decision.md`
- 锁定更新：`docs/locked-decisions-2026-03-29.md`（Site Runtime 节）

## 工作总结

- 完成“当前阶段保持独立路径”的桥接策略决策文档
- 在 locked decisions 中锁定该决策，避免后续实现漂移
- 在 source-of-truth map 中登记该决策文档，纳入 review 真相入口

## 相关 commits

- pending
