# Agent Bootstrap Context Pack

## Doc Class

- `workflow-control`

## 用途

给新进入仓库的 Agent 一个高信号、小体积的上下文包。

任务级阅读路由见：

- `docs/agent-task-index.md`

## 1. 仓库身份

- 仓库：`browser-brain-loop-next`
- 性质：Browser Brain Loop 的 vNext 主线实验仓
- 主轴：`Skill + AI Surface + Browser-side Kernel + BrowserVFS + JS Runner + Site Runtime + Execution Host`
- planning 真相源：`docs/module-tracking-ledger.json` + live backlog
- dispatch 真相源：`docs/workflow/live-queue.json` + `~/.codex/workflow-leases/browser-brain-loop-next.json`

## 2. 不能变的原则

1. 用户级扩展单位只保留 `Skill`
2. 浏览器仍是控制中枢
3. Host 是一等执行面
4. invokable actions 继续通过 public `Capability API`
5. 少量强原语 + 足够上下文，优先于细碎 capability 设计

## 3. 当前 AI Surface 心智

- `actions`
- `resources`
- `skills/workflows`
- `audit`

最重要的区分：

- `host.*`
  - execution host 上的粗粒度原语
- `hosts.*`
  - execution host 本身的产品控制面

## 4. 当前已落地的 v0

- canonical action descriptor / tool projection
- core capability registry / runtime ctx
- BrowserVFS baseline
- JS Runner baseline
- Site Runtime baseline
- MV3 shell baseline
- lightweight resource contracts/builders + lookup: `runtime.summary` / `config.summary` / `skills.summary` / `hosts.summary` / `audit.tail` / `audit.intervention` + `readAiSurfaceResource()` / MV3 `resource.read`
- minimal product control-plane actions: `hosts.*`, `config.update`, `skills.install/enable/disable/uninstall`, `runtime.capture_diagnostics`, `runtime.clear_error`
- representative executable Skill old-product loop: `install setupPlan → mem://skills package files → persist/restart → discover skill.json → expose actions/eventSubscriptions in skills.summary/runtime.bootstrap → sidepanel Skills catalog → register handler.js → enable → skills.invoke/runtime.event.dispatch → JS Runner → tabs.get_active/memfs.read/event handler result → audit.tail`
- `ISSUE-177` 已把 `ISSUE-172` 到 `ISSUE-176` 的 old-product replacement proof 收口成 shipped-with-deferred-scope；后续不要把这条链重新拆成局部小票

注意：

- 这些是 foundation
- 不是完整旧产品全量生态迁移
- `skills.*` lifecycle、`skills.invoke` shared runtime invocation、`runtime.summary.interventions`、`audit.intervention` 与 MV3 `resource.read` 已有最小 app integration path
- 更完整的 diagnostics / debug 主面仍未收口

## 5. 当前最重要的未收口区

1. 外部 cutover decision / release acceptance
2. 完整 Skill Studio / lifecycle / versioning 产品面
3. Tier 2 / Tier 3 browser automation 与 download/export composites
4. diagnostics / debug bulk export breadth
5. bridge-side MCP server 与更广 provider policy hardening

## 6. 新 Agent 默认 operating loop

1. 先读：
   - `docs/agent-task-index.md`
   - 本文件
2. 再判断：
   - 用户是否指定了 issue
   - 当前 session 是否已有 live ticket / lease
   - live queue 是否还有可取 ticket
   - 若 live queue 仍有 entry，但都已被 lease，可先做 planning preview
   - 若 queue 为空，是否刚发生 backlog 变化需要先重建 queue
   - 若无，则进入 next-batch planning commit
3. 进入 issue 后：
   - 按 TDD 推进
   - 跑 `check_cmd`
   - 过 Doc Freshness Gate
   - 回写 issue

## 7. 当前最值得看的索引

- 仓库工作规则：`AGENTS.md`
- 任务阅读入口：`docs/agent-task-index.md`
- 真相源排序：`docs/source-of-truth-map.md`
- 派工规则：`docs/backlog/README.md`
- 多 Agent 工作流：`docs/multi-agent-workflow.md`
- 当前 live queue：`docs/workflow/live-queue.json`
- 架构铁律：`docs/locked-decisions-2026-03-29.md`
- 模块追踪台账：`docs/module-tracking-ledger.json`
- 当前纠偏结论：`docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- kernel 主线设计：`docs/kernel-skeleton-design.md`
- AI surface 主轴：`docs/ai-native-capability-surface-design.md`
- AI surface 当前地图：`docs/ai-surface-index.md`
- backlog issue registry：`docs/backlog/*.md`

## 8. 维护规则

以下变化出现时，必须回看本文件：

1. 主轴变化
2. 当前最重要未收口区变化
3. 默认 operating loop 变化
4. AI surface 主地图变化
5. live queue / lease 取号逻辑变化
