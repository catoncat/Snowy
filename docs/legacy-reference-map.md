# Legacy Reference Map

## 目的

让新仓 agent 能快速建立：

- 旧仓原来是怎么工作的
- 新仓打算怎么替换它
- 哪些旧实现值得参考
- 哪些旧实现只是迁移对象

如果要判断“旧仓能力是否已经被新仓覆盖”，不要只看本文件。

继续看：

- `docs/legacy-to-vnext-migration-matrix.md`
- `docs/migration-parity-dashboard.md`
- `docs/cutover-readiness-criteria.md`

## Top-Level Mapping

| 旧概念 | 新概念 | 说明 |
|---|---|---|
| `Plugin` | executable `Skill` | 不再作为主产品概念 |
| `ToolContract` 真相源 | `CapabilityDescriptor` 真相源 | tool 退化成投影 |
| `ToolProviderRegistry` 雏形 | `CapabilityRegistry + FamilyProviderRegistry` | 从 plumbing 升级为正式公共契约 |
| `LIFO adapter` | `BrowserVFS + JS Runner` | 文件和执行解耦 |
| `plugin-sandbox.ts` | `JsRunnerHost` | 运行时代码迁移目标 |
| `virtual-fs.browser.ts` | `BrowserVfs` | `mem://` 继续保留 |
| page-specific hardcode | `SiteSkill + Site Runtime` | 结构化 action / verifier |
| `browser_bash` | removed from core model | 不再是中心能力 |

## Old Repo Hotspots

旧仓根路径：`/Users/envvar/work/repos/snowy/browser-brain-loop`

### Capability / Routing

- `extension/src/sw/kernel/types.ts`
- `extension/src/sw/kernel/orchestrator.browser.ts`
- `extension/src/sw/kernel/tool-provider-registry.ts`
- `extension/src/sw/kernel/loop-tool-dispatch.ts`
- `extension/src/sw/kernel/extension-api.ts`

### Skill / Plugin / Sandbox

- `extension/src/sw/kernel/runtime-router/skill-controller.ts`
- `extension/src/sw/kernel/skill-registry.ts`
- `extension/src/sw/kernel/plugin-runtime.ts`
- `extension/src/sw/kernel/runtime-router/plugin-sandbox.ts`

### VFS / Sandbox Runtime

- `extension/src/sw/kernel/virtual-fs.browser.ts`
- `extension/src/sw/kernel/browser-unix-runtime/lifo-adapter.ts`
- `extension/src/sw/kernel/browser-unix-runtime/virtual-path-resolver.ts`

### Browser Automation / Site

- `extension/src/content/dom-snapshot-collector.ts`
- `extension/src/sw/kernel/dom-locator.ts`
- `extension/src/sw/kernel/automation-mode.ts`
- `extension/src/sw/kernel/runtime-loop.browser.ts`

## External Repos By Purpose

| Repo | 看什么 |
|---|---|
| `pi-mono` | canonical model / projection / registry |
| `AIPex` | DOM snapshot / action / stabilization / CDP |
| `opencli` | bridge 薄层 / adapter / auth |
| `bb-browser` | site package / browser-as-api |
| `bb-sites` | 单站点动作包 |

## Reading Strategy

### 你要改 contracts/core

- 先看 `pi-mono`
- 再看旧仓 capability 入口

### 你要改 BrowserVFS

- 先看旧仓 `virtual-fs.browser.ts`
- 再看旧仓 `lifo-adapter.ts`
- 明确哪些行为要保留，哪些实现不要带过来

### 你要改 Site Runtime

- 先看旧仓 DOM/CDP 相关文件
- 再看 `AIPex`、`bb-browser`、`bb-sites`

### 你要改 bridge / export

- 先看 `opencli`
- 再回来看旧仓 bridge 设计
