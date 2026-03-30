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

## 2. 当前 action surface (39 actions)

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

### Product control plane (config / hosts)

- `config.update`

- `hosts.list`
- `hosts.get`
- `hosts.connect`
- `hosts.disconnect`
- `hosts.set_default`
- `hosts.health`

## 3. 当前明显缺失但应优先补的 action surface

### Skill lifecycle control plane

- `skills.install`
- `skills.enable`
- `skills.disable`
- `skills.uninstall`

## 4. 当前已落地的轻量 resources

当前已在 `packages/contracts` / `packages/core` 落地轻量 resource ids、typed summary/audit payload 与 builder：

- `runtime.summary`
- `config.summary`
- `skills.summary`
- `hosts.summary`
- `audit.tail`

当前口径：

- 这是轻量 resource contract，不是完整 resource registry
- `runtime.bootstrap` / `audit.host` 仍是当前 bridge read path
- 统一 northbound resource registry 与 app integration 仍由后续 issue 收口

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
