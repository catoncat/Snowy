---
id: ISSUE-046
title: SkillStatus 状态机需要全矩阵测试覆盖
status: done
priority: p1
source: docs/reviews/2026-03-29-code-engineering-quality-review.md § 3.3
created: 2026-03-29
assignee: unassigned
tags: [test-quality, contracts, state-machine]
kind: slice
epic: EPIC-test-hardening
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/contracts/test/contracts.spec.ts
acceptance_ref: docs/reviews/2026-03-29-code-engineering-quality-review.md
check_cmd: bun run test -- packages/contracts
---

## 问题

`SkillStatus` 定义了 6 个状态和 11 条合法转移，但当前仅测试了 2 条合法转移（draft→staged, installed→enabled）和 1 条非法转移。

状态机是 skill 生命周期的核心不变量，缺失的测试意味着状态机回归可以悄无声息地通过 CI。

## 接受标准

1. 11 条合法转移每条有独立测试用例
2. 至少 5 条高价值非法转移有断言（confirmed→draft, running→staged, error→running, disabled→running, draft→running）
3. 每个测试通过 `isValidTransition()` 验证，断言返回 boolean 与 transition reason
4. 测试与 contracts/src 中 `SKILL_STATUS_TRANSITIONS` 定义保持一致性断言
