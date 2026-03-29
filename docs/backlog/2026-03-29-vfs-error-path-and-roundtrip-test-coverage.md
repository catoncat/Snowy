---
id: ISSUE-047
title: VFS error path 与 round-trip 操作测试补全
status: done
priority: p1
source: docs/reviews/2026-03-29-code-engineering-quality-review.md § 3.3
created: 2026-03-29
assignee: unassigned
tags: [test-quality, browser-vfs, error-path]
kind: slice
epic: EPIC-test-hardening
parallel_group: browser-vfs
depends_on: []
write_scope:
  - packages/browser-vfs/test/browser-vfs.spec.ts
acceptance_ref: docs/reviews/2026-03-29-code-engineering-quality-review.md
check_cmd: bun run test -- packages/browser-vfs
---

## 问题

### Error Path 缺口
`resolveMemUri` 有 5 个 `E_BAD_INPUT` 分支完全无测试：
- 非 `mem://` 前缀 URI
- 未知 scope（非 ephemeral/workspace/library）
- 无效路径段（空段、`..`）
- 非文件路径（目录型 URI 传给 file-only 操作）
- version retention < 1

### Round-trip 操作缺口
以下操作缺乏独立 write → read round-trip 验证：
- `edit` — write → edit → read
- `mv` — write → mv → stat(old 不存在) + read(new)
- `stage` — 完全无测试
- `copy` — write → copy → 独立修改确认不影响原件

### Scope 缺口
- `mem://ephemeral/` scope 完全未被任何测试覆盖

## 接受标准

1. 5 个 `E_BAD_INPUT` 分支各有独立 test，断言 error.code
2. edit / mv / copy 各有 round-trip 测试，每个操作至少 write → op → read 验证
3. stage 至少有 1 个 happy path 测试
4. ephemeral scope 至少有 write → read → stat 三步验证
5. 所有新增测试通过 `bun run test -- packages/browser-vfs`
