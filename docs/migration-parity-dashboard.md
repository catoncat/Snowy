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
| descriptor / contract / projection | `green` | canonical model、projection、registry 基础已成形 |
| core runtime ctx / invoke | `yellow` | 基础已做，但 permissions / trace / nested invoke 仍有 review gap |
| BrowserVFS baseline | `green` | read/write/snapshot/rehydrate/quota/package discovery 已落地 |
| BrowserVFS public skill URI parity | `yellow` | canonical `mem://skills/...` 口径仍在收口 |
| JS Runner host | `green` | host / cancel / timeout / health / offscreen bridge 已测 |
| MV3 shell substrate | `yellow` | 最小壳已成，真实站点注入链未收口 |
| site runtime baseline | `yellow` | fixture 链路已成，但 active-tab 边界和 real injection 仍在 review |
| old browser automation parity | `red` | 旧 background/focus/CDP 体系尚未正式迁入 |
| old visual/download/intervention parity | `red` | 旧产品能力未在新仓形成主链 |
| skill SDK / authoring | `yellow` | typed facade 与文档已起步，完整 authoring/studio 不足 |
| plugin -> executable skill migration | `yellow` | 方向明确，但还不是可替代旧 plugin 生态的状态 |
| Skill Studio / lifecycle product surface | `red` | 生命周期模型有，产品 UI 没有 |
| provider / profile routing | `red` | 新仓未迁旧 LLM provider/profile 层 |
| diagnostics / debug / audit | `red` | 新仓没有旧仓同等级 debug/diagnostics 面 |
| bridge-side MCP export | `red` | 仍是 locked decision，不是已实现能力 |

## Current Gate View

### 已基本稳定的基础层

- descriptor / contract
- core invoke baseline
- BrowserVFS baseline
- JS Runner host

### 仍不能宣称“已完成迁移”的关键层

- site runtime 真实注入和 active-tab 边界
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
