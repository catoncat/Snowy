---
id: ISSUE-019
title: "Review: bridge-side MCP export is still descriptor-only"
status: open
priority: p1
source: "next-batch review 2026-03-29"
created: 2026-03-29
assignee: unassigned
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
