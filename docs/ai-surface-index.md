# AI Surface Index

## Doc Class

- `workflow-control`

## 目标

给 Agent、UI、Skill 作者一个简洁地图：

1. 当前已经有哪些 action surface
2. 哪些属于 substrate
3. 哪些属于产品 control plane
4. 哪些仍是目标态，不是现状

## 1. 判断规则

不要先问“这个功能是不是一个 tool”。

先问它属于哪类：

1. action
2. resource
3. skill/workflow
4. audit

## 2. 当前 action surface (51 actions)

### Browser-local substrate (memfs / page / tabs / site)

- `memfs.read`
- `memfs.write`
- `memfs.edit`
- `memfs.stat`
- `memfs.list`
- `memfs.mkdir`
- `memfs.rm`
- `memfs.mv`
- `memfs.copy`
- `memfs.stage`
- `memfs.snapshot`
- `memfs.rehydrate`
- `debug.bundle`
- `page.info`
- `page.query`（非默认 debug DOM readback）
- `page.click_xy`
- `page.type_text`
- `page.press_key`
- `page.scroll`
- `page.screenshot`
- `tabs.list`
- `tabs.get_active`
- `tabs.navigate`
- `site.fetch_with_session`

### Runtime substrate (runner / skills / runtime)

- `runner.invoke`
- `skills.invoke`
- `skills.list`
- `runtime.list_capabilities`
- `runtime.get_capability`
- `runtime.capture_diagnostics`
- `runtime.clear_error`

### Execution host substrate (host)

- `host.read`
- `host.write`
- `host.edit`
- `host.exec`

### Product control plane (config / skills / hosts)

- `config.update`
- `skills.discover`
- `skills.install`
- `skills.enable`
- `skills.disable`
- `skills.uninstall`
- `skills.rollback`

- `hosts.list`
- `hosts.get`
- `hosts.connect`
- `hosts.disconnect`
- `hosts.set_default`
- `hosts.health`

## 3. 当前已锁定的 skill lifecycle control-plane 边界

- `skills.invoke` 是 runtime substrate action；在 MV3 shared runtime path 中，它只会调用已安装且已启用的 executable skill，并按 skill 声明权限触达真实 capability
- `skills.discover/install/enable/disable/uninstall/rollback` 现在都属于 northbound product control plane
- `skills.uninstall` 的语义是把 skill 从 active product library 归档到 `archived`
- `skills.uninstall` 不等于物理删除 `mem://skills/...` 包内容
- `skills.uninstall` 不等于清空 `@versions` 历史，也不改变 rollback / trusted version contract
- `skills.rollback` 的语义是从 shared version surface 选择显式 `versionUri` 或 latest trusted rollback target，经 BrowserVFS rehydrate 还原 `mem://skills/<id>`，并保留原 lifecycle status / trusted 状态
- `skills.discover` 的语义是扫描 `mem://skills` 之类的 BrowserVFS package roots，自动发现带 `SKILL.md` 标记的 package-backed skills，并通过同一 shared control plane 安装进 product library；它不是粘贴 `SKILL.md` 的私有导入流

## 4. 当前已落地的轻量 resources

当前已在 `packages/contracts` / `packages/core` 落地轻量 resource ids、typed summary/audit payload 与 builder：

- `runtime.summary`
- `config.summary`
- `skills.summary`
- `hosts.summary`
- `audit.tail`
- `audit.intervention`
- `observability.replay`
- `observability.timeline`
- `observability.summary`
- `observability.rawEventTail`

当前口径：

- `packages/contracts` 现提供 `AI_SURFACE_RESOURCE_METADATA_REGISTRY`、`getAiSurfaceResourceMetadata()`、`listAiSurfaceResourcesForAudience()`
- metadata registry 已覆盖当前全部 resource id，并显式锁定 `audiences` / `projections` / `readOwner` / `bootstrapKey`
- `packages/core` 继续提供 `readAiSurfaceResource()` lookup path；`apps/mv3-shell` 继续通过统一 `resource.read` bridge 暴露 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail/audit.intervention/observability.replay/observability.timeline/observability.summary/observability.rawEventTail`
- `runtime.bootstrap` 继续保留为 bootstrap bundle compatibility read path
- `skills.summary` 现在包含 per-skill `items`。对 package-backed skills，items 会把 `skill.json` 的 `actions`、`eventSubscriptions`、`matches`、`requiresActiveTab`、`entry`、`version`、`kind`、`description`、`permissions` 与 `tags` 暴露给 AI/product consumers；malformed packages 只保留 lifecycle record，不暴露无效 action / subscription catalog。sidepanel management 的 Skills catalog 消费同一份 `skills.summary.items`，不维护 app-local package registry。
- package-backed `skills.summary.items` 现在还暴露 `versionSurface`，把 active manifest version、canonical snapshot root、rollback policy、latest trusted rollback target（若存在）接到 shared AI Surface；sidepanel Skills catalog 只消费该 shared surface，并通过 `skills.rollback` 触发 rollback，不维护 app-local version/rollback truth。
- `runtime.event.dispatch` 是当前 legacy hook pilot 的 runtime-event dispatch entry；它只投递给已安装且已启用的 package-backed Skill `eventSubscriptions`，并复用 `skills.invoke` + JS Runner，不引入私有 Plugin registry。
- `audit.tail` 仍是当前 control-plane / execution evidence 主资源，最小覆盖 `hosts.*`、`config.update`、`skills.discover/install/enable/disable/uninstall/rollback`，并通过 `loop.step` 记录 explicit `skills.invoke`、event-triggered `skills.invoke` 及其子 capability trace 的 operator-visible evidence；`skills.discover` audit entry 会记录扫描 / 发现 / 安装 / 跳过计数，rollback audit entry 会记录 skill/version evidence
- `runtime.summary` 现已包含 typed `interventions` summary；`audit.intervention` 是 intervention lifecycle 的 shared audit read path
- `observability.replay` 负责把 loop telemetry、control-plane audit、intervention lifecycle 与 compaction continuity marker 按时间顺序 stitch 成统一 replay 文档
- `observability.timeline` / `observability.summary` / `observability.rawEventTail` 现已通过 shared MV3 `resource.read` 暴露 runtime-owned observability export builder 的 operator-facing read path，并保持 `observability.replay` 作为更高层 stitched replay 文档
- 对话调试的当前等价 API 是 shared bridge 的 `resource.read`，不是旧仓 bridge HTTP server：一次 `runtime.chat.send` 后，读 `observability.timeline` 可看到 `runtime.chat.run.*`、`runtime.llm.*`、`runtime.tool.call.*` 调用链事件；读 `observability.rawEventTail` 可看到同一调用链的脱敏原始事件尾部；读 `runtime.history` / `audit.tail` 仍用于 loop step 与 operator evidence；读 `runtime.capture_diagnostics` 用于最新 runtime snapshot。
- 对话 debug dogfood 回归入口是 `apps/mv3-shell/test/runtime-chat.spec.ts` 的 `dogfoods conversation backend debug events through observability resources`。该用例用项目自身的 `runtime.chat.send` + `resource.read` 路径验证 LLM request/response、tool call 和 run lifecycle 已进入共享观测面，并断言 raw tail 不泄露 `llmKey`。
- Browser action evidence envelope 是 debug-only observability data：`runtime.tool.call.*` 的 details/raw payload 可以包含 `browserActionEvidence`，但 `StepResult -> tool message -> LLM context` 和 normal chat tool event 必须剥离 evidence envelope、raw events、trace 与截图 data URL。
- `audit.host` 仅保留为 host-only compatibility alias
- 当前 registry 仍是轻量 contract 层，不引入新的 descriptor family
- provider/profile routing 当前不新增独立 `providers.*` namespace；northbound shared surface 复用 `config.summary.values.model` 与 `config.update.patch.model`
- 当前 contracts/core 明确保证的 base key 是 `model.provider`、`model.model`、`model.baseUrl`
- deeper override/policy state 走 `model.routing`，当前最小 key 为 `policy`、`defaultProfile`、`fallbackProfile`、`laneProfiles`
- kernel `resolveProviderRoute()` 已可直接消费 `model.routing` 语义；这条 shared contract 的 runtime 持久化/产品接线仍应继续走统一 control-plane，而不是回退成 app-local settings glue

## 5. Audience 原则

至少区分：

- 聊天默认可见
- Skill runtime 可见
- 系统内部可见
- 外部导出可见

当前 resources 的 audience 投影由 `listAiSurfaceResourcesForAudience()` 收口；聊天 / skill / system 的默认 read 面不再靠散落常量或文档描述维护。

当前 action 的 audience / projection 也已收口到 descriptor-owned metadata：

- `CapabilityDescriptor.projection` 负责 `audiences` / `defaultExposed` / `confirmPolicy` / `executionTarget`
- `packages/contracts` 提供 `getCapabilityProjectionMetadata()` 与 `filterCapabilityDescriptorsByProjection()`
- `packages/core` 的 `CapabilityRegistry.listByProjection()` / `projectTools()` 使用同一套 metadata 做过滤
- `defaultExposed` 表示“在该 audience 的默认 tool surface 是否直出”；例如 `runner.invoke` 仍属于聊天 audience，但默认不直出
- `confirmPolicy` 当前最小语义：
  - `inherit-risk`：沿用高风险 action 的 confirm gate
  - `always`：即使不是 high risk，也要求显式确认
当前明确不该默认直接摊给聊天面的：

- `runner.invoke`

## 6. 当前 intervention / human handoff 口径

- intervention 是 cutover 前必需，但当前不作为新的 public action namespace
- 当前最小形态是 `kernel/site-runtime` 之间的 runtime handoff contract
- northbound read 面收口到 `runtime.summary.interventions`、`audit.intervention` 与 `observability.replay`
- high-risk capability 的 pre-dispatch 确认继续走 core confirm gate
- browser automation 的 verify failure / runtime blocked handoff 则产出结构化 intervention request
## 7. Host 原则

Host 已是一等执行面。

但 `host.*` 仍要保持粗粒度：

- `read`
- `write`
- `edit`
- `exec`

产品对 Host 的管理，应放在：

- `hosts.*`

而不是继续扩张：

- `host.xxx`

## 8. 维护规则

以下变化发生时，必须回看本文件：

1. public capability namespace 变化
2. 聊天默认可见 action 变化
3. 新增/删除 product control plane action
4. Host control plane 变化
