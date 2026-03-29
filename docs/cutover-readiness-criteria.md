# Cutover Readiness Criteria

本文件定义：

什么时候新仓可以从“重构实验仓”进入“可替代旧主线”的状态。

## Cutover Levels

### Level 0: Runtime Prototype

- 已证明北极星方向可行
- 但还不能替旧主线

### Level 1: Migration-Controlled Mainline Candidate

- 核心 runtime substrate 已稳定
- 关键 review gap 已收口
- 迁移矩阵和 parity dashboard 在维护

### Level 2: Mainline Cutover Ready

- 新仓已满足切主线门槛
- 旧仓可进入维护 / 收尾阶段

## Hard Gates For Level 2

### Gate A: Contract / Runtime Correctness

- `CapabilityDescriptor` / projection / namespace / registry 稳定
- `ctx / permissions / trace / nested invoke` 已收口

### Gate B: BrowserVFS Correctness

- `ephemeral / workspace / library` 行为稳定
- `mem://skills/<id>/...` 已成为 canonical public URI

### Gate C: JS Runner + MV3 Host Correctness

- runner timeout / cancel / health / isolation 稳定
- offscreen host 路径稳定
- 注入脚本构建约束被测试锁住

### Gate D: Site Runtime Minimum Production Path

- active-tab metadata only 已锁住
- explicit invoke 才注入已锁住
- 至少一条真实 injection chain 被验证，不只靠 fixture

### Gate E: Migration Control Plane Exists

- migration matrix 已覆盖主要旧能力面
- parity dashboard 已维护
- 未迁项与明确放弃项都能说清楚

### Gate F: Operability

- 新仓至少有最小 diagnostics / debug / audit 面
- 出故障时，不必回到旧仓才能定位核心 runtime 问题

## Soft Gates

### Soft Gate 1: Skill Studio / Lifecycle Product Surface

必须明确它是：

- cutover 前必需
- 或 cutover 后补

### Soft Gate 2: Browser Automation Product Parity

必须明确哪些旧 automation 能力属于 cutover 前必需。

### Soft Gate 3: Visual / Download / Intervention Surface

必须明确这些能力是核心主线还是可延后。

## Not Enough To Claim Cutover

- 只有 v0 substrate，但没有迁移矩阵
- 有 backlog，但没有 parity dashboard
- site runtime 只有 fixture，没有真实注入链
- BrowserVFS 还在对外泄露旧底层路径
- runtime 问题仍只能回旧仓 diagnostics 里查

## Current Assessment

当前新仓：

- 已经超过空壳
- 但仍未达到 `Level 1 fully stable`
- 更未达到 `Level 2 cutover ready`

主要原因：

1. site runtime 真实链路未收口
2. 迁移控制面刚建立，还未长期维护
3. diagnostics / provider / studio / automation parity 仍未成体系

## Maintenance Rule

- 每关闭一个关键迁移 issue，回看本文件
- 若某个 gate 判定变化，必须同步更新本文件
- 若要宣称“可以切主线”，必须逐条过本文件，而不是只过 `bun run check`
