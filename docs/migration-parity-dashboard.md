# Migration Parity Dashboard

这是迁移状态总览，不是详细设计文档。

## 图例

- `green`
- `yellow`
- `red`
- `gray`

## Dashboard

| Area | Status | Why |
|---|---|---|
| descriptor / contract / projection | `green` | canonical model、projection、registry 基础已成形，且 action-only 边界已显式锁定 |
| core runtime ctx / invoke | `green` | permissions / trace / nested invoke 已收口并有测试 |
| BrowserVFS baseline | `green` | read/write/snapshot/rehydrate/quota/package discovery 已落地 |
| BrowserVFS public skill URI parity | `green` | canonical `mem://skills/...` round-trip 已测 |
| JS Runner host | `green` | host / cancel / timeout / health / offscreen bridge 已测 |
| MV3 shell substrate | `green` | offscreen bridge 与显式 page-hook bridge 已测 |
| local execution host adapter | `yellow` | 默认 offscreen local adapter 已实现 read/write/edit（ISSUE-038）；exec 需 remote host；remote host path 仍未实现 |
| site runtime baseline | `green` | active-tab 边界、explicit invoke 与真实 injection chain 已测 |
| AI-native product control plane | `yellow` | 最小 `runtime/config/skills/hosts` bootstrap summary、轻量 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`runtime.capture_diagnostics` / `runtime.clear_error`、本地 `hosts.*` control plane 与 `config.update` 已落地并有测试；`skills.*` lifecycle 与统一 northbound resource read path 仍未收口 |
| old browser automation parity | `yellow` | Tier 1/2/3 cutover boundary 已锁定；`tabs.navigate`、`page.press_key`、`page.screenshot` 已落地；background mode / background-specific failure tracking 已明确后置（见 `docs/background-automation-mode-boundary.md`）；剩余 gap 主要是 `page.query/click/fill` production path 与 intervention |
| old visual/download/intervention parity | `red` | screenshot/download 边界已锁定（见 `docs/screenshot-download-surface-boundary.md`）：`page.screenshot` 已由 `ISSUE-057` 落地，download 延后到 product/workflow 层，intervention 仍待 `ISSUE-041` |
| skill SDK / authoring | `yellow` | typed facade 与文档已起步，完整 authoring/studio 不足 |
| plugin -> executable skill migration | `yellow` | 方向明确，但还不是可替代旧 plugin 生态的状态 |
| Skill Studio / lifecycle product surface | `red` | 生命周期模型有，产品 UI 没有 |
| provider / profile routing | `red` | 新仓未迁旧 LLM provider/profile 层 |
| diagnostics / debug / audit | `red` | 轻量 `audit.tail` / summary resource contract 已落地，但新仓仍没有旧仓同等级 debug/diagnostics 主面 |
| bridge-side MCP export | `yellow` | descriptor-derived handoff contract 已落地并有测试；真正 bridge-side MCP server/transport 仍未实现 |

## Current Gate View

### 已基本稳定的基础层

- descriptor / contract
- core invoke baseline
- BrowserVFS baseline
- JS Runner host
- MV3 shell substrate
- site runtime baseline

### 仍不能宣称“已完成迁移”的关键层

- AI-native product control plane
- 完整 browser automation 能力
- diagnostics / observability
- provider/profile 层
- Skill Studio / lifecycle 产品面

## 文档维护规则

- 每次某个 area 状态变化时，同步更新本文件
- 若新增迁移 area，也先补到本文件
- 状态争议较大时，以：
  - 代码 + 测试
  - `docs/legacy-to-vnext-migration-matrix.md`
  - `docs/cutover-readiness-criteria.md`
  三者交叉判断
