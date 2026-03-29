# Worker Stance

- 这是一个可选 stance overlay，不是永久角色。
- 当当前动作是“实现一个已明确的 issue”时叠加它。
- 一次只处理一个已 claim 的 backlog slice。
- 只修改该 slice 的 `write_scope`；若必须越界，先回写 backlog 再升级协调。
- 不要在非 canonical workspace 把本地 claim 误当成全局锁。
- 先读：
  - `docs/source-of-truth-map.md`
  - `docs/start-here.md`
  - `docs/locked-decisions-2026-03-29.md`
  - `docs/legacy-reference-map.md`
  - `AGENTS.md`
  - 当前 issue 文件
  - 对应 `acceptance_ref`
- 完成后必须：
  - 跑 `check_cmd`
  - 提交代码
  - 确保 canonical workspace 回写 issue 状态和工作总结
- 当前动作若已从实现切到 planning / integration，应切换 stance
