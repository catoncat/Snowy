---
id: ISSUE-037
title: "Review: page and tabs public automation path is still underdefined"
status: done
priority: p1
source: "browser automation follow-up planning 2026-03-29"
created: 2026-03-29
assignee: copilot
tags:
  - review
  - site-runtime
  - page
  - tabs
  - automation
module_id: site-runtime-browser-automation
module_stage: secondary
tracking_kind: gap
kind: slice
epic: EPIC-site-runtime
parallel_group: site-runtime
depends_on:
  - ISSUE-036
write_scope:
  - docs/
  - packages/contracts/src/index.ts
  - packages/core/src/index.ts
  - packages/site-runtime/src/index.ts
  - packages/site-runtime/test/site-runtime.spec.ts
acceptance_ref: docs/ai-native-capability-surface-design.md
check_cmd: "bun run check"
---

## Goal

在 `ISSUE-036` 锁定 cutover boundary 后，明确 `page.*` / `tabs.*` 的最小 public automation path，避免后续实现既不够用、又开始无序扩 capability 名称。

## Review Finding

- `docs/legacy-to-vnext-migration-matrix.md` 显示 `tab / page interaction tools` 仍是 `partial`。
- 当前仓已具备最小 site runtime invoke path，但并未把 cutover 前必需的 `page.*` / `tabs.*` production path 明确成一组稳定 contract。
- 如果不先锁最小 automation path，后续容易在“只补一个 page.click”与“重造整套旧 automation 工具”之间反复摇摆。

## Acceptance

- 明确 cutover 前必需的最小 `page.*` / `tabs.*` 集合。
- 明确这些能力与 site runtime / verifier / active-tab 边界的关系。
- 若结论需要新增或收紧 public capability contract，必须落为明确的 follow-up implementation slice。
- 不把截图/下载/人工接管混进本 issue 范围。

## 工作总结

### 完成内容

1. **创建 `docs/page-tabs-public-automation-path.md`**
   - 旧仓 page/tabs 工具全面映射（element actions、tab-level actions、snapshot、tab management、screenshot）
   - 最小 cutover 前集合锁定：
     - `page.query` / `page.click` / `page.fill`（已声明）
     - `page.press_key` / `page.screenshot`（待新增，完整 descriptor 设计已定义）
     - `tabs.get_active`（已声明）/ `tabs.navigate`（待新增，完整 descriptor 设计已定义）
   - 明确 Tier 2 排除项：scroll, hover, select_option, tabs.list/create/close
   - 明确与 site-runtime invoke pipe 的双轨关系（capability path vs site skill path）
   - UID-based selector strategy 设计决策记录
   - 三阶段实现路径：descriptor 补全 → MV3 shell 执行层 → capability bridge

2. **更新 migration-matrix**
   - tab/page interaction tools 备注更新：最小 public automation path 已锁定，实现落 ISSUE-057/058

3. **Follow-up 确认**
   - ISSUE-057 (Tier 1 page descriptors + runtime path) 和 ISSUE-058 (tabs.navigate) 已覆盖全部实现需求
   - ISSUE-040 (screenshot/download) 侧重 surface 边界审查，与本 review 互补
   - 无需新建额外 issue
