# Site Runtime × Capability Routing Decision (ISSUE-045)

## Decision

在 v0 / 当前主线阶段，`SiteSkillRuntime.invoke()` 保持为**独立编排路径**，不直接桥接到 `CapabilityRegistry` / `FamilyProviderRegistry`。

同时锁定以下边界：

1. `page.*` / `site.*` 仍是 public capability namespace（contracts 与 catalog 保留）
2. 运行时不强制要求 `ctx.call("page.*")` 立即具备默认 provider 绑定
3. 站点级动作执行以 `SiteSkillRuntime`（match → plan → install → invoke → verify）为主
4. 统一 trace 的 canonical 形态仍然是 `CapabilityTraceEntry`，但 site-runtime 目前保留自身阶段 trace（string[]）

## Why

当前两条路径代表不同抽象层级：

- `CapabilityRegistry` / `FamilyProviderRegistry`：通用 capability 调度层
- `SiteSkillRuntime`：站点动作编排层（active-tab match、按需注入、verifier）

在 browser-side kernel 主线尚未补齐前，强行把 site runtime 折叠进 family provider 会引入额外耦合（active tab 解析、注入时机、verifier 语义混合），反而降低边界清晰度。

## Consequences

- 优点：保持 `site-runtime` 编排语义稳定，避免在当前 batch 做高风险架构折叠
- 代价：`page.*` / `site.*` catalog 与默认 provider 绑定仍存在“声明先于实现”的空档

## Follow-up Trigger

当以下任一条件满足时，重新开启 bridge 实现议题：

1. kernel 进入 browser automation 收口批次（需要统一 trace / intervention / diagnostics）
2. 需要在 skill handler 内把 page/site 作为统一 `ctx.call()` 基础原语落地
3. 需要把 site-runtime trace 纳入 kernel run/session compaction 链路

届时新 issue 应包含：

- `PageFamilyProvider` / `SiteFamilyProvider` 最小实现
- 至少一个 `ctx.call("page.*")` round-trip 验证到注入链路
- trace 归一到 `CapabilityTraceEntry`

## Scope

本决策仅锁定“当前阶段是否桥接”。

不改变以下既有决定：

- `CapabilityDescriptor` 作为 action canonical model
- public capability namespace 仍为统一对 AI 暴露面
- browser 本地能力（`page.*` / `tabs.*` / `site.*`）归属不变
