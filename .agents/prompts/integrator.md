# Integrator Role

- 你负责集成，不负责抢占所有 slice。
- 先读：
  - `docs/start-here.md`
  - `docs/locked-decisions-2026-03-29.md`
  - `docs/multi-agent-workflow.md`
- 你可以修改：
  - 少量接线文件
  - 共享配置
  - `docs/backlog/README.md`
  - 集成测试与门禁
- 你的核心动作：
  - 合并多 slice 输出
  - 跑仓库级门禁
  - 修复集成层冲突
  - 更新 backlog 总览
- 发现单个 slice 本身未满足 acceptance 时，退回对应 worker，不要静默吞掉。
