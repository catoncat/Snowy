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
| local execution host adapter | `green` | 默认 offscreen local adapter 的 cutover boundary 已收口：browser-only local host 继续负责 `host.read/write/edit` 与 offscreen diagnostics，true exec parity 明确由 exec-capable remote host path 承担；control-plane 现已通过 capability-aware host summary / get / bootstrap 暴露 file-only vs exec-capable 边界，并让 `host.exec` 默认走 exec-capable host，而不是把 `local` 当成同质默认目标 |
| site runtime baseline | `green` | active-tab 边界、explicit invoke 与真实 injection chain 已测 |
| kernel session/run/compaction baseline | `green` | `SessionStore` / `RunController` / `LoopEngine` / `CompactionManager` / `createKernel()` / `runLoop()` / child-run seam 与 prompt context message wiring 已落地并有测试；剩余问题已转入 provider policy / observability 等相邻模块 |
| old-product replacement loop | `green` | `ISSUE-172` 到 `ISSUE-177` 已把一条代表性旧 Plugin / Skill 能力链收束为 shipped-with-deferred-scope proof：install setupPlan → package files → restart discovery → manifest handler execution → shared action/catalog discovery → sidepanel-visible management → invoke real shared capability → audit evidence；`ISSUE-178` / `ISSUE-179` 继续把 shared version surface 和 executable rollback action 接回这条产品链路；`ISSUE-180` 证明 shared surface 可从 Studio/package convention 数据 create/update package-backed skill，并在更新时自动 snapshot 旧包、刷新 registry、summary/invoke/rollback/audit 读回；`ISSUE-181` 补上旧 hook-driven plugin pilot：`eventSubscriptions` → `runtime.event.dispatch` → event-triggered `skills.invoke` → JS Runner → `audit.tail`。交互式 version selection、diff/preview 与旧 plugin 生态批量迁移仍是 post-cutover breadth |
| AI-native product control plane | `yellow` | Gate G 的 cutover-critical scope 已 landed：descriptor-owned action projection controls、最小 `runtime/config/skills/hosts` bootstrap summary、`runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail` resource contract、`readAiSurfaceResource()` / MV3 `resource.read` 统一 lookup、`runtime.capture_diagnostics` / `runtime.clear_error`、本地 `hosts.*` / `config.update` / `skills.install/enable/disable/uninstall/rollback`、provider routing 的 `model.routing` shared control-plane、`ISSUE-093` 的 shared management consumer，以及 `ISSUE-172` / `ISSUE-173` / `ISSUE-174` / `ISSUE-175` / `ISSUE-176` 的 `install setupPlan → mem://skills package files → persist/restart → discover skill.json → expose actions in skills.summary/runtime.bootstrap → sidepanel Skills catalog → register handler.js → enable → skills.invoke → JS runner → tabs.get_active/memfs.read → audit.tail` executable skill 纵向证明都已落地并有测试；`ISSUE-179` 已补上 shared `skills.rollback` → BrowserVFS rehydrate → package registry refresh → summary/invoke/audit readback 的产品闭环；`ISSUE-180` 已把 package author/update 接进同一 shared `skills.install` 路径，更新时自动产生 rollbackTarget 并刷新 runtime registry；`ISSUE-181` 已把 package event subscription metadata 接入 `skills.summary` / `runtime.bootstrap`，并用 `runtime.event.dispatch` 复用 `skills.invoke` 留证；`yellow` 只反映 diff/preview、version selection、批量迁移与更宽 product breadth 仍后置 |
| old browser automation parity | `yellow` | Tier 1/2/3 cutover boundary 已锁定；cutover 前必需的 active-tab Tier 1 path（`tabs.navigate/get_active`、`page.query/click/fill/press_key/screenshot`、verify、intervention）已收口，`tabs.list`、`site.fetch_with_session` 与 background lane baseline 也已有最小 runtime/test 覆盖。Status 仍保持 `yellow`，因为 `page.scroll/select_option/hover`、`tabs.create/close`、stealth/computer mode 与 screenshot/download export composites 仍属于 cutover 后 breadth |
| old visual/download/intervention parity | `yellow` | screenshot/download/intervention 边界已锁定：`page.screenshot` 已由 `ISSUE-057` 落地，intervention 的 request/resolve/cancel/timeout/audit、restart durability、shared sidepanel handoff UI 与 page action failure handoff 已落地；download 继续延后到 product/workflow 层，因此该组合 area 仍保持 `yellow` |
| skill SDK / authoring | `green` | typed facade、install-only setup hook contract、setupPlan forwarding、shared MV3 BrowserVFS materialization proof、package manifest runtime discovery、shared summary action catalog projection、shared version/rollback readiness projection 与 sidepanel catalog consumption 已起步；`ISSUE-172` / `ISSUE-173` / `ISSUE-174` / `ISSUE-175` / `ISSUE-176` 证明代表性 executable skill 可经 shared MV3 runtime 调用真实 `tabs.get_active`、读取 setup 写入的 `mem://skills/...` package 文件、从安装后的 `skill.json` + `handler.js` 自动注册执行，通过 `skills.summary` / `runtime.bootstrap` 暴露 manifest actions/site metadata，并被可见 Skills catalog inspect/operate；`ISSUE-178` 把 lifecycle/version engine 的 active version、snapshot root、rollback policy 和 rollback target 接到同一 shared catalog，`ISSUE-179` 把 rollback 从只读 readiness 变成 shared control-plane 执行动作；`ISSUE-180` 证明 Studio/package convention 字段可生成 setupPlan，经 shared `skills.install` create/update 后立刻 invoke，并可 rollback 到自动快照的旧包。剩余是更丰富 editor UX 与生态 breadth |
| plugin -> executable skill migration | `green` | `ISSUE-172` / `ISSUE-173` / `ISSUE-174` / `ISSUE-175` / `ISSUE-176` 已证明一条旧 plugin loop 替代链路可由 executable skill 完成，并覆盖 install-time package content injection、persisted package handler execution、package action catalog discovery 与 sidepanel-visible management entry；`ISSUE-181` 进一步用 `send-success-global-message` 类 hook-driven plugin 证明 event subscription 自动触发路径。完整旧 plugin 生态批量迁移仍是 post-cutover breadth |
| Skill Studio / lifecycle product surface | `green` | 生命周期模型、shared management consumer、executable skill invoke proof、setupPlan materialization proof、package manifest execution proof、package manifest action catalog discoverability、sidepanel catalog consumption、`ISSUE-178` 的 shared version/rollback readiness surface、`ISSUE-179` 的 shared rollback execution loop，以及 `ISSUE-180` 的 sidepanel/package convention author-update path 已有；Studio 可从 manifest/handler/SKILL.md 保存 package，runtime 可自动 snapshot 旧包、刷新 registry、invoke 新包、rollback 旧包并通过 audit.tail 留证。交互式 rollback confirmation / version selection、diff/preview、旧 plugin 生态批量迁移仍是 Not Now breadth |
| provider / profile routing | `yellow` | provider health negotiation、lane-aware routing、ordered profile chain、retry escalation、`primary / compaction / title` baseline capability requirements，以及 shared `model.routing` override/update + runtime-owned rehydrate 已 landed；`yellow` 只反映非 kernel 调用点 rollout 与更广 provider policy hardening 仍后置 |
| diagnostics / debug / audit | `yellow` | Gate F 的最小 operability surface 已 landed：`runtime.capture_diagnostics` / `runtime.history` / `audit.tail` / `audit.intervention` / `observability.replay` / error lifecycle / provider routing diagnostics 已有实现，`ISSUE-143` 已补齐 timeline / summary / rawEventTail contract/builder，`ISSUE-166` 已把它们接到 shared MV3 `resource.read`；`yellow` 只反映 bulk debug dump/export、persistent debug depth 与更广 future event breadth 仍 deferred |
| bridge-side MCP export | `yellow` | descriptor-derived handoff contract 已落地并有测试；真正 bridge-side MCP server/transport 仍未实现 |

## Current Gate View

当前 repo-side Level 2 gate evidence 已由 `docs/level-2-cutover-acceptance-2026-05-27.md` 汇总为 complete。下列 `yellow` 行不再自动代表当前 cutover blocker；它们表示被显式后置的 product breadth、生态 breadth 或外部桥接范围。

### 已基本稳定的基础层

- descriptor / contract
- core invoke baseline
- BrowserVFS baseline
- JS Runner host
- MV3 shell substrate
- site runtime baseline
- cutover-critical old-product replacement loop

### 后置或需外部决策的关键层

- AI-native product control plane
- provider / profile policy hardening
- 完整 browser automation breadth
- diagnostics / observability export breadth
- Skill Studio 的 diff/preview、interactive version selection 与 legacy plugin 生态批量迁移 breadth
- bridge-side MCP server/transport

这些项只有在外部 release acceptance 明确要求时，才应提升为新的 mainline milestone；默认不要逐行拆成 queue filler。

## 文档维护规则

- 每次某个 area 状态变化时，同步更新本文件
- 若新增迁移 area，也先补到本文件
- 状态争议较大时，以：
  - 代码 + 测试
  - `docs/legacy-to-vnext-migration-matrix.md`
  - `docs/cutover-readiness-criteria.md`
  三者交叉判断
