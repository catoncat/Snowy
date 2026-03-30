# Plugin Mainline Correction Control

> control-date: 2026-03-30
> status: active
> purpose: 把“插件主线纠偏”review 结果转成可执行控制面，而不再平行发明第二套 backlog

## 0. 这份文档解决什么

这份文档不替代：

- `docs/backlog/*.md`
- `docs/workflow/live-queue.json`
- `docs/module-tracking-ledger.json`

它只做三件事：

1. 固定本轮 review 的纠偏结论
2. 定义纠偏阶段 gate
3. 把每条结构性 finding 映射到 backlog issue

一句话：

> backlog 继续承载执行；本文件承载“这批执行为什么存在、按什么 gate 收口”。

## 1. 当前判断

- 方向：正确，但还不是“已纠偏”
- 档位：`半纠偏`
- 保留下来的正确部分：
  - `packages/*` monorepo 形态
  - descriptor / core / js-runner / site-runtime / kernel substrate 拆包
  - MV3 offscreen / page-hook 容器方向
- 仍未收口的主偏差：
  - `apps/mv3-shell` 还不是纯 MV3 container / bridge
  - `packages/*` 还不是 `apps/mv3-shell` 的真实上游
  - browser-side kernel 还没成为 runtime 中枢
  - 质量门禁还不能稳定拦住 bridge regressions

## 2. 纠偏规则

- 不再接受新的 `app-local truth`
- `packages/*` 必须拥有产品语义与运行时语义；`apps/*` 只拥有 MV3 容器、Chrome API、桥接与启动胶水
- 不把“包内单测通过”当成“插件主线已收口”
- kernel 相关工作必须最终落到 app integration path，而不是只停在 package-local skeleton
- 若 backlog issue 已标 `done` 但代码/测试不支持“已收口”判断，以代码和测试为准，再补 follow-up issue；不要口头跳过

## 3. Gate

| Gate | 目标 | 退出标准 | Backlog |
|---|---|---|---|
| Gate 0 | 恢复可信 runtime baseline | `mv3-shell` bridge 启动无未定义符号；相关测试重新可信；质量门禁能拦住同类回归 | `ISSUE-065` |
| Gate 1 | 去掉 app-local truth | `background.js` 不再手写产品真相；公共 action/control-plane 走 package-upstream 路径 | `ISSUE-066` |
| Gate 2 | 让 kernel 成为运行中枢 | app integration 至少一条 runner step 和一条 site step 由 kernel 编排，而不是 app 旁路直调 | `ISSUE-067` |
| Gate 3 | 收口剩余 cutover gap | Tier 1 page automation、skills control plane、intervention durable/shared-surface integration 进入 active correction queue；diagnostics resource contract 已补上 | `ISSUE-057`, `ISSUE-056`, `ISSUE-071` |

## 4. Finding 到 Backlog 的映射

| Review finding | 承载 issue | 说明 |
|---|---|---|
| `mv3-shell` bridge 可因未定义符号直接 runtime crash，且 `typecheck` 抓不到 | `ISSUE-065` | 先恢复红线可信度，再做结构收口 |
| `apps/mv3-shell` 仍在手写 `runtime/hosts/host/page/tabs/config` 真相，`dispatchCapability()` 未进入主链 | `ISSUE-066` | 这是“apps 不是纯 MV3 container” 的主 finding |
| kernel 虽然有 facade，但 app integration 仍旁路 kernel 直调 runner/site-runtime | `ISSUE-067` | 这是“browser-side kernel 还不是中枢” 的主 finding |
| `page.query/click/fill` 仍没有 production path，Tier 1 automation 还没真正收口 | `ISSUE-057` | `page.press_key` / `page.screenshot` 不等于 Tier 1 全部完成 |
| diagnostics 还是 action-only，缺资源读面 | `ISSUE-063` | 已完成轻量 resource contract 收口；统一 app integration read path 仍不替代 Gate 0 |
| `skills.*` lifecycle control plane 仍未落地 | `ISSUE-056` | 继续承接 AI Surface control-plane 缺口 |
| intervention / human handoff 仍未定性 | `ISSUE-041` | 已完成定性：cutover 前必需，但当前不新造 capability family，而是先落到 runtime handoff contract |
| intervention lifecycle baseline 已接通，但 state/audit 仍是 MV3-private 且重启后不持久 | `ISSUE-071` | `ISSUE-068` 已补最小 lifecycle；剩余 shared resource surface + restart durability 继续收口 |

## 5. 已完成但不能误判为“纠偏完成”的基础件

以下 issue 视为已交付基础件，但不能据此宣布“插件主线已纠偏”：

- `ISSUE-021` MV3 offscreen lifecycle recovery
- `ISSUE-026` MV3 runtime wiring baseline
- `ISSUE-031` hosts.* control plane
- `ISSUE-032` host.* substrate routing
- `ISSUE-033` runtime.capture_diagnostics public action
- `ISSUE-055` config.update control plane
- `ISSUE-058` tabs.navigate 最小 active-tab path
- `ISSUE-060` kernel core dispatch wiring

这些 issue 解决的是：

- substrate 正确性
- public contract 缺口
- 最小 bridge path

它们没有自动解决的是：

- app-local truth
- kernel-centered integration
- 纠偏后的长期质量门禁

## 6. 执行规则

- Active correction issue 统一打 `plugin-mainline-correction` tag
- 新增 correction issue 时，优先复用现有 module，不另造平行模块
- backlog 变化后必须重建 `docs/workflow/live-queue.json`
- 若后续 review 再发现结构性偏差，先补到本文件，再决定是否新增 backlog issue

## 7. 完成条件

满足下面 5 条，才可以把“插件主线纠偏”从 `半纠偏` 提升到 `已纠偏`：

1. `apps/mv3-shell` 启动与 bridge baseline 测试重新全绿，且门禁能拦住同类回归
2. `apps/mv3-shell` 不再持有产品真相，只保留 MV3 容器/bridge 责任
3. kernel 通过 app integration path 成为 runner/site 编排中枢
4. Tier 1 page automation 剩余路径与 intervention 位置都已收口
5. diagnostics / skills control plane 的剩余 active correction issue 已清空或显式降级为 cutover 后项
