---
id: ISSUE-048
title: 修复测试边界违规与 js-runner 时间依赖
status: done
priority: p2
source: docs/reviews/2026-03-29-code-engineering-quality-review.md § 1.3 / § 3.4
created: 2026-03-29
assignee: unassigned
tags: [test-quality, hygiene]
kind: slice
epic: EPIC-test-hardening
parallel_group: contracts-core
depends_on: []
write_scope:
  - packages/core/test/core.spec.ts
  - packages/site-runtime/test/site-runtime.spec.ts
  - packages/js-runner/test/js-runner.spec.ts
acceptance_ref: docs/reviews/2026-03-29-code-engineering-quality-review.md
check_cmd: bun run test && bun run typecheck
---

## 问题

### 跨包源码引用（2 处）
1. `core/test/core.spec.ts` L23 — `import { BrowserVfs } from "../../browser-vfs/src/index"` — 绕过包边界直接引用兄弟包 src
2. `site-runtime/test/site-runtime.spec.ts` L7 — `import { createPageHookBridge } from "../../../apps/mv3-shell/src/background.js"` — 跨层级引用 app 源码

### js-runner 时间依赖（3 处）
- 3 个 timeout 测试依赖 `setTimeout(50)` vs `timeoutMs: 5`，在 CI 高负载下有 flake 风险

### TS 错误
- `packages/js-runner/test/js-runner.spec.ts:352` — `HostSubstrateRpcRequest` union type 字面量推断问题

## 接受标准

1. core.spec.ts 改用 `@bbl-next/browser-vfs` 包名引入（或创建 test-only mock）
2. site-runtime.spec.ts 消除对 mv3-shell src 的直接引用（提取共享类型或 mock）
3. js-runner timeout 测试改用永不 resolve 的 Promise + AbortSignal 模式，消除时间竞争
4. js-runner.spec.ts TS 错误修复
5. `bun run test` 全通过 + `bun run typecheck` 零错误
