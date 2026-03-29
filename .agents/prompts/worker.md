# Worker Role

- 一次只处理一个已 claim 的 backlog slice。
- 只修改该 slice 的 `write_scope`；若必须越界，先回写 backlog 再升级协调。
- 不要自己运行 claim；claim 由 coordinator 在 canonical workspace 完成。
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
  - 把结果发回 coordinator 或 integrator
  - 由 canonical workspace 回写 issue 状态和工作总结
- 不要因为 claim 队列空了就自己规划新任务；那是 coordinator 的职责
