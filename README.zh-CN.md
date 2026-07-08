[English](README.md)

# browser-brain-loop-next

后 LIFO Browser Brain Loop 运行时的未来主线。

## 前置要求

- [Bun](https://bun.sh/) ≥ 1.3

## 快速开始

```bash
git clone <repo-url> && cd browser-brain-loop-next
bun install
bun run check   # 类型检查 + lint + 测试
```

## Monorepo 结构

```
packages/
  contracts/      规范模型 — 类型、校验、状态机
  core/           能力注册表、Provider 分发、Skill 运行时上下文
  browser-vfs/    浏览器内 mem:// 虚拟文件系统，支持 IndexedDB 持久化
  js-runner/      隔离 JS 执行宿主，带 RPC 协议
  site-runtime/   活动标签页站点 Skill 匹配与注入
  skill-sdk/      Skill 开发 SDK（defineSkill、类型化能力）
  kernel/         会话存储、运行状态机、循环引擎、压缩
apps/
  mv3-shell/      最小化 Chrome MV3 扩展外壳
```

## 包说明

| 包 | 描述 |
|---|------|
| [`@bbl-next/contracts`](packages/contracts/) | 规范描述模型、错误、Skill 生命周期、Kernel 会话类型 |
| [`@bbl-next/core`](packages/core/) | 能力注册表、Family Provider、工具投影、Skill 运行时上下文 |
| [`@bbl-next/browser-vfs`](packages/browser-vfs/) | `mem://` 虚拟文件系统，支持 `ephemeral/workspace/library` 作用域，IndexedDB 持久化 |
| [`@bbl-next/js-runner`](packages/js-runner/) | 隔离 JS Runner 宿主，支持 invoke/cancel/health RPC |
| [`@bbl-next/site-runtime`](packages/site-runtime/) | 活动标签页站点 Skill 激活、注入规划、验证流程 |
| [`@bbl-next/skill-sdk`](packages/skill-sdk/) | Skill 开发辅助 — `defineSkill()`、类型化能力 |
| [`@bbl-next/kernel`](packages/kernel/) | 会话管理、运行状态机、循环引擎、压缩 |
| [`mv3-shell`](apps/mv3-shell/) | 最小化 Chrome MV3 外壳（Background Worker、Offscreen、Page Hook） |

## 命令

```bash
bun install          # 安装所有工作区依赖
bun run test         # 运行所有测试（vitest）
bun run typecheck    # TypeScript 类型检查
bun run check        # 类型检查 + lint + 测试
bun run lint         # biome 检查（需安装 biome）
bun run lint:fix     # biome 自动修复
```

## 文档

- [产品续航规划](docs/product-roadmap-2026-07-08.md) — 当前产品章节主线（M1-M4 里程碑与砍掉清单）
- [规划调查笔记](docs/planning/2026-07-08-product-discovery-notes.md) — 2026-07-08 代码级调查与决策记录
- [下一会话 Handoff 提示词](docs/planning/2026-07-08-handoff-prompt.md) — 可复制到新对话的完整接手说明
- [从这里开始](docs/start-here.md) — 仓库目标与必读顺序
- [真实来源地图](docs/source-of-truth-map.md) — 哪些文档驱动实际实现
- [锁定决策](docs/locked-decisions-2026-03-29.md) — 不应偏离的架构约束
- [恢复报告](docs/reviews/2026-03-29-vnext-architecture-recovery-report.md) — 为什么主线被重新归类为浏览器端 Kernel
- [Kernel 骨架设计](docs/kernel-skeleton-design.md) — 当前 `packages/kernel` 主线形态与切片计划
- [模块追踪台账](docs/module-tracking-ledger.json) — 机器可读的模块真相，用于工作流 Skill 和规划
- [V0 切片](docs/v0-slice.md) — 已实现的部分
- [AI 原生表面设计](docs/ai-native-capability-surface-design.md) — 产品如何向 AI 暴露自身
- [AI 表面索引](docs/ai-surface-index.md) — 当前与目标 AI 表面的紧凑地图
- [旧版参考地图](docs/legacy-reference-map.md) — 旧仓库与研究仓库查找
- [迁移矩阵](docs/legacy-to-vnext-migration-matrix.md) — 旧仓库功能区域到 vNext 的目标映射
- [平价仪表板](docs/migration-parity-dashboard.md) — 快速查看迁移状态
- [切换就绪标准](docs/cutover-readiness-criteria.md) — 切换主线的客观标准

## Skill 开发

- [Skill 包规范](docs/skill-package-convention.md) — 目录布局、清单、ID 规则
- [Skill 开发指南](docs/skill-authoring-guide.md) — 快速入门、示例、测试
