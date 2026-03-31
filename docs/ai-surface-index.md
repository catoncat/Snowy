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

## 2. 当前 action surface (43 actions)

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
- `page.query`
- `page.click`
- `page.fill`
- `page.press_key`
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
- `skills.install`
- `skills.enable`
- `skills.disable`
- `skills.uninstall`

- `hosts.list`
- `hosts.get`
- `hosts.connect`
- `hosts.disconnect`
- `hosts.set_default`
- `hosts.health`

## 3. 当前已锁定的 skill lifecycle control-plane 边界

- `skills.install/enable/disable/uninstall` 现在都属于 northbound product control plane
- `skills.uninstall` 的语义是把 skill 从 active product library 归档到 `archived`
- `skills.uninstall` 不等于物理删除 `mem://skills/...` 包内容
- `skills.uninstall` 不等于清空 `@versions` 历史，也不改变 rollback / trusted version contract

## 4. 当前已落地的轻量 resources

当前已在 `packages/contracts` / `packages/core` 落地轻量 resource ids、typed summary/audit payload 与 builder：

- `runtime.summary`
- `config.summary`
- `skills.summary`
- `hosts.summary`
- `audit.tail`
- `audit.intervention`

当前口径：

- 这是轻量 resource contract + lookup surface，不是完整 resource registry
- `packages/core` 现提供 `readAiSurfaceResource()`；`apps/mv3-shell` 通过统一 `resource.read` bridge read path 暴露 `runtime.summary/config.summary/skills.summary/hosts.summary/audit.tail`
- `runtime.bootstrap` 继续保留为 bootstrap bundle compatibility read path
- `audit.tail` 仍是当前 control-plane audit 主资源，最小覆盖 `hosts.*`、`config.update`、`skills.install/enable/disable/uninstall`
- `runtime.summary` 现已包含 typed `interventions` summary；`audit.intervention` 是 intervention lifecycle 的 shared audit read path
- `audit.host` 仅保留为 host-only compatibility alias
- 更完整的 resource metadata / audience registry 仍由后续 issue 收口

## 5. Audience 原则

至少区分：

- 聊天默认可见
- Skill runtime 可见
- 系统内部可见
- MCP/export 可见

当前明确不该默认直接摊给聊天面的：

- `runner.invoke`

## 6. 当前 intervention / human handoff 口径

- intervention 是 cutover 前必需，但当前不作为新的 public action namespace
- 当前最小形态是 `kernel/site-runtime` 之间的 runtime handoff contract
- northbound read 面收口到 `runtime.summary.interventions` 与 `audit.intervention`
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
