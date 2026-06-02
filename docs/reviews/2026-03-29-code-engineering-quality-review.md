# Code Engineering Quality Review

> review-date: 2026-03-29
> scope: 模块边界、依赖方向、测试策略、代码可维护性
> status: active
> refresh-trigger: 测试边界违规修复后、状态机测试补全后

## 0. 一句话结论

模块分层和依赖方向达到教科书级别水平，测试策略在 contract lock 和 integration 维度表现出色，但状态机覆盖度和 VFS error path 存在明显缺口。

## 1. 模块依赖分析

### 1.1 依赖图

```
                    ┌──────────────┐
                    │  contracts   │  ← 零依赖叶节点
                    └──┬──┬──┬──┬─┘
                       │  │  │  │
          ┌────────────┘  │  │  └────────────┐
          │               │  │               │
          ▼               ▼  │               ▼
    ┌──────────┐  ┌────────┐ │         ┌──────────┐
    │   core   │  │  vfs   │ │         │ js-runner│
    └────┬─────┘  └────────┘ │         └────┬─────┘
         │                   │              │
         ▼                   │              ▼
    ┌──────────┐             │   ┌─────────────────┐
    │ skill-sdk│             │   │  site-runtime   │
    └──────────┘             │   └─────────────────┘
                      ┌──────▼─────┐
                      │  mv3-shell │
                      └────────────┘
```

### 1.2 依赖方向评分

| 规则 | 结果 |
|------|------|
| 循环依赖 | ✅ 零循环，严格 DAG |
| contracts 不依赖任何包 | ✅ |
| core 只依赖 contracts | ✅ |
| 所有 src/ import 与 package.json 声明一致 | ✅ |
| 外部运行时依赖 | 仅 `idb`（browser-vfs），极度精简 |

### 1.3 测试边界违规 ⚠️

| 位置 | 问题 | 严重度 |
|------|------|--------|
| `core/test/core.spec.ts` L23 | `import { BrowserVfs } from "../../browser-vfs/src/index"` — 相对路径穿透兄弟包 src | 中 |
| `site-runtime/test/site-runtime.spec.ts` L7 | `import { createPageHookBridge } from "../../../apps/mv3-shell/src/background.js"` — 跨层级引用 app 源码 | 中 |

**建议**：
- core: 将 `@bbl-next/browser-vfs` 加入 devDependencies，用包名引用
- site-runtime: 将 `createPageHookBridge` 提取到共享模块，或将 mv3-shell 声明为 dev 依赖

## 2. 公共 API Surface

| Package | Exports | Types/Interfaces | Classes | Functions | Constants |
|---------|---------|-----------------|---------|-----------|-----------|
| contracts | 57 | ~28 | 1 | 19 | 9 |
| core | 43 | ~24 | 3 | 11 | 5 |
| browser-vfs | 18 | ~12 | 2 | 2 | 2 |
| js-runner | 29 | ~26 | 1 | 0 | 0 |
| site-runtime | 15 | ~12 | 2 | 1 | 0 |
| skill-sdk | 4+13 re-export | 2 | 0 | 1 | 0 |

**特征**：contracts 和 core 面积最大但职责匹配；js-runner 的 29 export 主因 RPC 协议类型完整性；skill-sdk 最精简（thin facade 定位正确）。

## 3. 测试质量分析

### 3.1 测试分类统计（128 个用例）

| 分类 | 数量 | 占比 | 评估 |
|------|------|------|------|
| Contract Lock | 19 | 15% | 核心常量/namespace/builtin 结构锁定全面 |
| Behavior Test | 54 | 42% | 正路径覆盖充分 |
| Error Path | 24 | 19% | 高优先级路径已覆盖，VFS/site-runtime error code 不足 |
| Integration | 31 | 24% | MV3 bridge 全链路测试出色 |

### 3.2 契约覆盖度

| 契约 | 覆盖度 | 说明 |
|------|--------|------|
| PUBLIC_CAPABILITY_NAMESPACES | 9/9 (100%) | 三重锁：精确数组 + coverage 函数 + 逐 namespace 检查 |
| SkillStatus 状态机 | 2/11 合法转移 (18%) | **严重缺口** — 仅覆盖 draft→staged、installed→enabled |
| assertCapabilityDescriptor | 5/11+ case (45%) | 高影响 case 已覆盖，输入校验边界不足 |
| MAX_SKILL_CALL_DEPTH | 行为覆盖 | 超深被阻断 ✅，但常量值 3 未被测试精确锁定 |
| Host control plane | 核心路径 ✅ | 全生命周期在 mv3 集成测试中验证 |
| External export handoff | 投影路径 ✅ | 数据投影完整，bridge 执行未实现 |
| Typed facade | 4/4 路径 ✅ | 全量/过滤/窄化/子集均覆盖 |

### 3.3 关键测试缺口

#### 高优先级

1. **SkillStatus 状态机完整矩阵** — 6 状态 × 11 合法转移仅覆盖 2 条，非法矩阵仅 1 条。状态机是 skill 生命周期的核心不变量，必须全矩阵锁定。
2. **VFS error path** — `resolveMemUri` 的 5 个 `E_BAD_INPUT` 分支均无测试（非法 URI、未知 scope、无效路径段、非文件路径、retention < 1）

#### 中优先级

3. **VFS 操作 round-trip** — `edit`、`mv`、`stage`、`copy` 缺少独立的 write→read round-trip 验证
4. **VFS ephemeral scope** — `mem://ephemeral/` 完全未被测试
5. **site-runtime error code 断言** — verifier failure 仅 regex 匹配 message，未断言 `.code`；unknown skill/action 无测试

#### 低优先级

6. assertCapabilityDescriptor 输入校验边界（空 ID、version ≤ 0、非法枚举值等）
7. CapabilityRegistry 空注册时 projectTools 行为
8. Bootstrap summary 多 host 混合场景

### 3.4 测试反模式

| 反模式 | 位置 | 严重度 | 建议 |
|--------|------|--------|------|
| 时间依赖 | js-runner.spec.ts — 50ms setTimeout + 5ms timeout | 中 | 改用永不 resolve 的 Promise + AbortSignal |
| 原型反射 | core.spec.ts L623 — `Object.getOwnPropertyNames(BrowserVfs.prototype)` | 中 | 改为显式列出期望的方法名 |
| 跨包源码引用 | core.spec.ts L23, site-runtime.spec.ts L7 | 中 | 走包名引用 + devDependencies |

### 3.5 亮点

- **MV3 集成测试** (23 用例) 覆盖了从 background → offscreen → runner → page-hook 的完整链路，是整个仓库测试质量的高点
- **Builtin catalog 结构断言** (9 项) 确保每个 descriptor 符合格式、ID 以 namespace 开头、无重复、schema 有 type
- **Nested skill trace 隔离** 测试确保父子 skill 的 trace 数组完全隔离且 traceId 正确关联

## 4. 代码可维护性

### 4.1 单文件架构

所有 package 为单文件 `src/index.ts`（js-runner 额外有 `runner-host-core.js`）。当前行数合理（最大 1236 行），但需要监控 core 的增长。

### 4.2 命名一致性

✅ 全仓使用一致的命名风格：
- 类型：PascalCase
- 函数：camelCase
- 常量：UPPER_SNAKE_CASE
- Capability ID：dotted.lowercase
- namespace：lowercase 单词

### 4.3 CapabilityDescriptor 数据流

```
contracts(定义+校验) → core(创建+注册) → 消费者(只读)
```

创建路径唯一：`catalogEntry()` → `BUILTIN_CATALOG` → `CapabilityRegistry(assertCapabilityDescriptor)`。无任何包绕过 contracts 校验。

### 4.4 TypeScript 静态检查

当前 1 个 TS 错误：`packages/js-runner/test/js-runner.spec.ts:352` — `HostSubstrateRpcRequest` union type 字面量推断问题。非阻断但应修复。

## 5. 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 依赖方向 | 10/10 | 严格单向 DAG，零循环，声明与实际一致 |
| 外部依赖控制 | 10/10 | 仅 1 个运行时依赖 |
| Contract Lock 密度 | 8/10 | namespace/builtin catalog 锁定全面，状态机缺口 |
| Error Path 覆盖 | 5/10 | 高优先级覆盖，VFS/site-runtime 大量分支未测 |
| Integration 深度 | 9/10 | MV3 全链路出色 |
| 测试边界尊重 | 7/10 | 2 处跨包源码违规 |
| 命名/风格一致性 | 9/10 | 统一规范 |
| **综合** | **8.3/10** | |

## 6. 文档维护规则

- 测试边界违规修复后更新 § 1.3
- 状态机测试补全后更新 § 3.2
- TS 错误修复后更新 § 4.4
- core 拆分后更新 § 4.1
