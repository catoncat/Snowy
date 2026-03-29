---
id: ISSUE-019
title: "Review: bridge-side MCP export is still descriptor-only"
status: done
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: agent
tags:
  - review
  - mcp
  - export
kind: slice
epic: EPIC-contracts-core
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/core/test/core.spec.ts
  - docs/
acceptance_ref: project_plan.md
check_cmd: "bun run check"
claimed_at: 2026-03-29T10:50:26.532Z
---

## Goal

把 descriptor 上的 export metadata 收口成 bridge 可消费的最小 handoff contract。

## Review Finding

- CapabilityDescriptor 已带 exportable/exportName/exportRisk，但仓内还没有 bridge-side handoff 或 MCP export skeleton。
- 当前测试只验证 export metadata 字段存在，不验证导出清单如何从 descriptor 安全派生。
- docs/v0-slice.md 与 project_plan.md 都把 bridge-side MCP export server 标为 deferred。

## Acceptance

- exportable capability 清单可以从 descriptors 稳定派生为 bridge handoff 数据。
- 测试锁住可导出/不可导出 capability 的包含与排除规则。
- 文档明确当前仓到真正 bridge-side MCP server 之间的边界。

## 工作总结

- 在 `packages/contracts` 新增 descriptor -> bridge-side MCP export handoff contract 投影，统一产出 exportable capability 的最小导出数据。
- 在 `packages/core` 新增 registry/builtin 级 handoff 导出入口，并用测试锁住 exportable builtin 的包含/排除规则。
- 同步更新迁移控制面文档，明确当前已具备 descriptor-derived handoff contract，但真正 bridge-side MCP server/transport 仍未实现。
- 已运行 `bun run check`。
- 残留风险：当前只完成 handoff contract 与清单投影，bridge transport、认证复用与真正 MCP server 仍是后续工作。

## 相关 commits

- `7ea7adc` `contracts/core: add MCP export handoff projection`
