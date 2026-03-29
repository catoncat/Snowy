# browser-brain-loop-next 系统设计质量综合评审报告

> review-date: 2026-03-29
> dimensions: A（架构质变）+ B（代码工程质量）+ C（文档体系与 DX）
> status: active
> refresh-trigger: 任何维度详细报告更新时同步

## 1. 执行摘要

对 browser-brain-loop-next 新仓进行了三个维度的深度评审，与旧仓 browser-brain-loop 进行了全面对比分析。

### 一句话结论

**新仓在架构层面实现了本质性提升（8.2/10），代码工程质量扎实（8.3/10），但文档体系和开发者体验存在明显缺口（6.2/10），是当前最大的短板。**

## 1.1 使用边界

这份文档是 A/B/C 三个评审维度的汇总，不是当前 roadmap 的唯一真相源。

当前主线优先级应以：

- `docs/reviews/2026-03-29-vnext-architecture-recovery-report.md`
- `docs/kernel-skeleton-design.md`

为准。

也就是说：

- 本文仍然有效地描述了 A/B/C 三个评审维度
- 但它不单独决定现在该优先做 DX、测试补洞，还是 kernel mainline

### 综合评分

| 维度 | 评分 | 核心形容 |
|------|------|---------|
| A. 架构设计质变 | **8.2/10** | 旧仓 9 大核心问题解决 7 个，2 个部分解决 |
| B. 代码工程质量 | **8.3/10** | 依赖方向教科书级别，测试策略有明确缺口 |
| C. 文档体系与 DX | **6.2/10** | 系统文档自洽，包级文档和工具链严重不足 |
| **总体** | **7.6/10** | |

---

## 2. Dimension A：架构设计质变

**详细报告**：`docs/reviews/2026-03-29-architecture-quality-review.md`

### 已解决的旧仓核心问题（7/9）

| # | 旧仓问题 | 新仓状态 |
|---|---------|---------|
| P1 | Shell 中心化 | ✅ 完全解决 — BrowserVFS + JsRunnerHost 取代 |
| P2 | 概念多重叠 (plugin/skill/tool) | ✅ 完全解决 — 统一为 Skill |
| P3 | ToolContract 作为唯一真相源 | ✅ 完全解决 — CapabilityDescriptor 是 canonical model |
| P4 | 硬编码路由 | ✅ 完全解决 — FamilyProviderRegistry |
| P6 | Capability 爆炸 | ✅ 完全解决 — 9 namespace + family 模式 |
| P8 | Orchestrator 膨胀 | ✅ 完全解决 — 分解为独立 package |
| P9 | 执行模式混乱 | ✅ 完全解决 — ExecutionHost 一等公民 |

### 部分解决（2/9）

| # | 问题 | 现状 | 缺什么 |
|---|------|------|--------|
| P5 | Host 不是一等实体 | 契约完整，缺真实 provider 实现 | 至少 1 个非 stub 的 host provider |
| P7 | AI Surface 局限于 tool 列表 | events 有 stub，audit 仍空白 | event 订阅 + audit trail 实现 |

### 关键发现

- CapabilityDescriptor → ToolContract 投影模式是整个架构的最大亮点
- 34 个 builtin descriptor 覆盖 9 个 namespace，设计紧凑
- FamilyProviderRegistry 使 provider 注册从 O(capability) 降为 O(family)

---

## 3. Dimension B：代码工程质量

**详细报告**：`docs/reviews/2026-03-29-code-engineering-quality-review.md`

### 亮点

| 指标 | 评分 | 说明 |
|------|------|------|
| 依赖方向 | 10/10 | 严格单向 DAG，零循环，仅 1 个运行时外部依赖 |
| MV3 集成测试 | 9/10 | background → offscreen → runner → page-hook 全链路 |
| Builtin catalog 锁定 | 9/10 | namespace 三重锁 + descriptor 格式断言 |
| 命名/风格一致性 | 9/10 | 全仓统一命名规范 |

### 关键缺口

| 缺口 | 严重度 | 当前覆盖 |
|------|--------|---------|
| SkillStatus 状态机 | 高 | 2/11 合法转移（18%） |
| VFS error path | 高 | 5 个 E_BAD_INPUT 分支零覆盖 |
| 测试边界违规 | 中 | 2 处跨包源码直接引用 |
| js-runner 时间依赖 | 中 | 3 个 timeout 测试有 flake 风险 |

### 测试分布（128 用例）

```
Contract Lock ████████░░ 15%
Behavior      ██████████████████████░░ 42%
Error Path    ██████████░░░░ 19%
Integration   ████████████░░ 24%
```

---

## 4. Dimension C：文档体系与 DX

**详细报告**：`docs/reviews/2026-03-29-docs-dx-review.md`

### 亮点

| 指标 | 评分 | 说明 |
|------|------|------|
| 文档一致性 | 9/10 | 仓内零断链，真相源有优先级和仲裁规则 |
| 文档体系完整性 | 7.5/10 | 20+ 份文档，覆盖架构/决策/迁移/工作流 |
| Backlog 机器可读性 | 7.5/10 | frontmatter 格式核心字段一致，自动化工具覆盖关键流程 |

### 关键缺口

| 缺口 | 严重度 | 现状 |
|------|--------|------|
| 包级 README | 高 | 7/7 包均无 |
| JSDoc 覆盖 | 高 | ≈ 0%（整个 monorepo 仅 1 个 JSDoc 块） |
| Linter / Formatter | 高 | 完全缺失 |
| CI/CD | 高 | 无 GitHub Actions |
| Quickstart | 中 | 根 README 无 Getting Started |
| .vscode 配置 | 中 | 仅 mcp.json |

---

## 5. Review 产出物一览

### 文档（3 份活文档）

| 文档 | 维度 | 综合评分 |
|------|------|---------|
| `docs/reviews/2026-03-29-architecture-quality-review.md` | A | 8.2/10 |
| `docs/reviews/2026-03-29-code-engineering-quality-review.md` | B | 8.3/10 |
| `docs/reviews/2026-03-29-docs-dx-review.md` | C | 6.2/10 |

### Follow-up Issues（7 个）

| Issue | 标题 | 优先级 | 维度来源 |
|-------|------|--------|---------|
| ISSUE-044 | core 单文件增长预防 | p2 | A |
| ISSUE-045 | site-runtime capability routing bridge | p1 | A |
| ISSUE-046 | SkillStatus 状态机全矩阵测试 | p1 | B |
| ISSUE-047 | VFS error path 与 round-trip 测试补全 | p1 | B |
| ISSUE-048 | 测试边界违规与 flake 修复 | p2 | B |
| ISSUE-049 | Linter + Formatter + CI 质量门禁 | p1 | C |
| ISSUE-050 | 根 README quickstart + 包级 README | p2 | C |

### 建议执行顺序

```
优先级 1 (质量门禁底线)
├── ISSUE-049  Linter + Formatter + CI
├── ISSUE-046  状态机全矩阵测试
└── ISSUE-047  VFS error path 测试

优先级 2 (架构完善)
├── ISSUE-045  site-runtime capability routing bridge
├── ISSUE-048  测试边界违规修复
├── ISSUE-050  quickstart + 包级 README
└── ISSUE-044  core 单文件增长预防
```

---

## 6. 总体判断

### 能否实现旧项目的架构提升？

**是的。** 新仓已经在架构层面实现了本质性提升：

1. **概念统一**：从 plugin/skill/tool/capability 四概念混杂，收敛为 Skill + CapabilityDescriptor 双核心
2. **依赖解耦**：从 orchestrator 万能对象，分解为 6 个边界明确的 package
3. **路由动态化**：从硬编码 switch/case，进化为 FamilyProviderRegistry 注册式分发
4. **Shell 去除**：从浏览器 POSIX 模拟，转向 BrowserVFS + JsRunnerHost 原生方案
5. **测试驱动**：136 个测试全通过，TDD 文化已建立

### 当前最大风险在哪？

1. **DX 治理缺口** — 无 linter/CI 的情况下，多 agent 并行开发的代码质量将随规模衰减
2. **测试覆盖盲区** — 状态机、VFS error path 的缺口意味着核心不变量可能被回归破坏
3. **包级文档空白** — 0% JSDoc 使 IDE 辅助效果大打折扣

### 与旧仓对比改善幅度

```
旧仓 (估计)     新仓 (实测)     改善方向
───────────────────────────────────────
架构  4/10  →   8.2/10          +4.2
工程  5/10  →   8.3/10          +3.3
文档  3/10  →   6.2/10          +3.2
总体  4/10  →   7.6/10          +3.6
```

新仓在所有维度上均有显著提升，总体从"需大幅重构"水平提升到"可持续演进"水平。

---

## 7. 文档维护规则

本综合报告在任何维度详细报告更新时需同步刷新对应章节。新增评审维度时在本报告追加章节并更新总评分。
