# Documentation System & Developer Experience Review

> review-date: 2026-03-29
> scope: 文档体系完整性、包级文档、文档一致性、DX 工具链、Backlog 机器可读性
> status: active
> refresh-trigger: 包级 README 创建后、CI 配置后、linter/formatter 配置后

## 0. 一句话结论

文档体系在系统层面组织有序、内部零断链且有清晰的真相源仲裁规则，但包级文档和 DX 基础设施存在明显缺口，特别是 JSDoc 覆盖率近乎为零在多 agent 并行开发场景下是显著瓶颈。

## 1. 文档体系完整性

### 1.1 文档目录一览

| 文件 | 行数 | 一句话评估 |
|------|------|-----------|
| start-here.md | ~112 | 新人入门总纲，结构清晰、路径明确 |
| source-of-truth-map.md | ~186 | 真相源优先级排序 + 冲突仲裁规则，质量高 |
| locked-decisions-2026-03-29.md | ~76 | 纯粹的已锁定决策列表，无讨论噪音 |
| ai-native-capability-surface-design.md | ~250+ | 最长的设计文档，AI Surface 主轴论证 |
| ai-surface-index.md | ~120 | 当前 action surface 清单 + 缺失项 + host 原则 |
| agent-bootstrap-context-pack.md | ~92 | Agent 高信号上下文包 |
| document-system-contract.md | ~184 | 文档四类分层 + Doc Freshness Gate + DoD |
| multi-agent-workflow.md | ~242 | Agent 工作流全面说明 |
| skill-authoring-guide.md | ~178 | Skill 作者快速上手，含代码示例 |
| skill-package-convention.md | ~153 | Skill 包规范（manifest/handler/lifecycle/permission） |
| v0-slice.md | ~36 | v0 已实现/延后清单 |
| legacy-reference-map.md | ~106 | 旧仓/研究仓参考地图 |
| legacy-to-vnext-migration-matrix.md | ~120 | 迁移矩阵 |
| migration-parity-dashboard.md | ~78 | 迁移状态仪表盘 |
| cutover-readiness-criteria.md | ~100 | 切主线门槛 |
| next-development-slices-*.md | 各约短 | Batch 快照（历史记录） |

### 1.2 缺失文档

| 缺失 | 影响 | 优先级 |
|------|------|--------|
| CONTRIBUTING.md | 外部贡献者无入口指引 | 中 |
| ARCHITECTURE.md | 无独立架构总览（部分由 ai-native-capability-surface-design.md 承担） | 低 |
| CHANGELOG.md | 无变更日志 | 低 |
| 包级 README.md（全部 7 个包/app） | 包用途不透明，IDE 无法显示包说明 | 高 |

### 1.3 Onboarding 路径评分：7.5/10

**优点**：
- start-here.md 结构清晰：为什么存在 → 5 件必知 → 替换/保留/不做 → 进度 → 强制阅读顺序 → 按 lane 分工
- 阅读路径有编号（15 步），按场景区分
- source-of-truth-map 有优先级排序和冲突仲裁

**不足**：
- 新人需读 9-15 份文档才能开始工作，认知负载偏高
- 缺少"5 分钟 quickstart"——从 `bun install` 到跑通第一个测试的最短路径
- start-here.md ↔ AGENTS.md 存在循环引用

### 1.4 locked-decisions 质量：9/10

纯粹断言式，无讨论噪音。9 大领域全覆盖。唯一可改进：缺少每条决策的锁定日期和决策者。

## 2. 包级文档与 API 覆盖

### 2.1 README / description 状态

| 包 | package.json name | description | README.md |
|----|-------------------|-------------|-----------|
| contracts | @bbl-next/contracts | ❌ | ❌ |
| core | @bbl-next/core | ❌ | ❌ |
| browser-vfs | @bbl-next/browser-vfs | ❌ | ❌ |
| js-runner | @bbl-next/js-runner | ❌ | ❌ |
| site-runtime | @bbl-next/site-runtime | ❌ | ❌ |
| skill-sdk | @bbl-next/skill-sdk | ❌ | ❌ |
| mv3-shell | apps/mv3-shell | ❌ | ❌ |

全部 7 个包/app 均无 README.md 和 description 字段。已有对应 issue ISSUE-010。

### 2.2 JSDoc 覆盖密度

| 源文件 | export 数 | JSDoc 块数 | 覆盖率 |
|--------|----------|-----------|--------|
| contracts/src/index.ts | ~71 | 0 | 0% |
| core/src/index.ts | ~54 | 0 | 0% |
| browser-vfs/src/index.ts | ~18 | 0 | 0% |
| js-runner/src/index.ts | ~30 | 0 | 0% |
| site-runtime/src/index.ts | ~15 | 0 | 0% |
| skill-sdk/src/index.ts | ~15 | 1 | ~7% |

**整个 monorepo JSDoc 覆盖率约 0.5%。** 对 IDE 提示、自动文档生成、外部消费者理解接口语义有显著负面影响。

### 2.3 skill-sdk 作者引导：6/10

skill-authoring-guide.md 和 skill-package-convention.md 质量不错。但 SDK 代码本身几乎无 JSDoc——`defineSkill()` 参数/返回值/异常无 inline 文档，`SkillDeclaration<Permissions>` 泛型用法没注释，`ctx.capabilities.*` 无 IDE 自动补全提示。

## 3. 文档一致性

### 3.1 仓内引用验证

- AGENTS.md §4 列出的 **17 个路径全部存在**，零断链
- source-of-truth-map.md 引用的所有文件经验证存在
- ai-surface-index.md ✅ 存在且有效
- agent-bootstrap-context-pack.md ✅ 存在且有效
- document-system-contract.md ✅ 存在且有效

### 3.2 自洽度评分：9/10

仓内引用完全自洽。唯一潜在风险是对旧仓/研究仓的硬编码绝对路径依赖，但已被 legacy-reference-map.md 集中管理。

## 4. 开发者体验（DX）

### 4.1 工具链完整度

| 工具 | 状态 | 说明 |
|------|------|------|
| 包管理器（bun） | ✅ | monorepo workspaces |
| TypeScript | ✅ | ES2022 / ESNext / Bundler, strict: true |
| 测试（vitest） | ✅ | 配置清晰 |
| 类型检查 | ✅ | `bun run typecheck` → `tsc --noEmit` |
| 联合检查 | ✅ | `bun run check` → typecheck + test |
| **Linter** | **❌** | 无 eslint / biome |
| **Formatter** | **❌** | 无 prettier / biome |
| **CI/CD** | **❌** | 无 GitHub Actions workflow |
| .vscode/ 配置 | ⚠️ | 缺 settings/extensions/tasks |
| dev 命令 | ❌ | 无 `dev` / `build` / `lint` |
| monorepo path mapping | ❌ | tsconfig 无 paths 映射 |
| engines / .nvmrc | ❌ | 无 runtime 版本约束 |

### 4.2 Scripts 分析

package.json 定义 12 个 script：
- **基础**：`test`, `test:watch`, `typecheck`, `check`
- **工作流**：`workflow:*` (6 个)

**缺少**：`dev`, `build`, `lint`, `format`, `clean`

### 4.3 新人上手路径：5.5/10

基本可行（`bun install` → `bun run check`），但缺少：
- 根 README 无 Getting Started
- 无 bun/node 版本要求
- 无 dev 命令
- 无 linter/formatter
- 多 agent 并行开发下代码风格可能漂移

## 5. Backlog 机器可读性

### 5.1 Frontmatter 一致性：8/10

核心字段（id, status, priority, kind, parallel_group, write_scope, check_cmd）在所有 issue 中一致。

**问题**：
- `assignee` 部分写 `agent`（违反 AGENTS.md §9 "不能写通用 agent" 规则）
- `claimed_at` 早期 issue 缺失
- `tags` 格式不统一（flow `[a, b]` vs block style）
- 无 frontmatter schema 强校验（如 zod + CI 门禁）

### 5.2 自动化工具覆盖度：7/10

| 工具 | 功能 |
|------|------|
| claim-issue.ts | frontmatter 解析 → write_scope 冲突检测 → claim 回写 |
| plan-next-batch.ts | 读取 backlog → 生成下一批 planning |
| create-review-issue.ts | 从 review 结果创建新 issue（自动编号） |

**缺失**：frontmatter schema 校验工具 / stale issue 检测

## 6. 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 文档体系完整性 | 7.5/10 | 丰富且内部自洽，onboarding 认知负载偏高 |
| 包级文档与 API 覆盖 | 2/10 | 7 个包均无 README，JSDoc ≈ 0% |
| 文档一致性 | 9/10 | 零断链，真相源优先级明确 |
| DX 工具链 | 5/10 | 基础可用但缺 linter/formatter/CI |
| Backlog 机器可读性 | 7.5/10 | 核心字段一致，自动化已覆盖关键流程 |
| **综合** | **6.2/10** | |

## 7. Top 3 改善优先级

1. **包级 README + JSDoc** — 代码接口几乎无 inline 文档，对 IDE 提示和 API 理解影响最大
2. **Linter + Formatter + CI** — 多 agent 并行开发的质量门禁底线
3. **5 分钟 Quickstart** — 从 15 份文档缩短到 "clone → install → test → 开始第一个 issue"

## 8. 文档维护规则

- 包级 README 创建后更新 § 2.1
- JSDoc 批量补充后更新 § 2.2
- CI 配置后更新 § 4.1
- linter/formatter 配置后更新 § 4.1
- quickstart 编写后更新 § 4.3
