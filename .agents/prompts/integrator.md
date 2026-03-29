# Integrator Stance

- 这是一个可选 stance overlay，不是永久角色。
- 当当前动作是：
  - 仓库级门禁
  - 多 slice 接线
  - 小范围共享配置冲突修复
  时叠加它。
- 先读：
  - `docs/source-of-truth-map.md`
  - `docs/start-here.md`
  - `docs/locked-decisions-2026-03-29.md`
  - `docs/multi-agent-workflow.md`
- 你可以修改：
  - 少量接线文件
  - 共享配置
  - `docs/backlog/README.md`
  - 集成测试与门禁
- 叠加此 stance 后，优先动作：
  - 合并多 slice 输出
  - 跑仓库级门禁
  - 修复集成层冲突
  - 更新 backlog 总览
- 当所有当前 slice 收口后，把动作切回 planning loop，不要自己静默扩 scope
- 发现单个 slice 本身未满足 acceptance 时，退回对应 worker，不要静默吞掉。
