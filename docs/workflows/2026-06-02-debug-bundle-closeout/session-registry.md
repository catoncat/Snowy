# Session Registry

| Task | Thread | Goal | Status | Scope | Proof | Last Update | Next |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 019e8711-a1e2-7e21-95d1-df9f4b30eeed | `2026-06-02-debug-bundle-closeout: T1 - verify real product debug bundle dogfood` | verified | dogfood artifacts + handoff only | MDN product dogfood artifact complete | 2026-06-02 | integrate proof |
| T2 | 019e8711-e0bc-7402-8767-47877d82e770 | `2026-06-02-debug-bundle-closeout: T2 - audit dirty diff and Mainline overlaps` | verified | read-only + handoff only | handoff complete | 2026-06-02 | integrate classification |
| T3 | 019e8712-19bc-7eb3-8c56-62b30f72e6a8 | `2026-06-02-debug-bundle-closeout: T3 - run focused verification and cutover gate` | verified | verification commands + handoff only | focused/check green; cutover delivery blocker | 2026-06-02 | wait for T1 then T4 |
| T4 | orchestrator | `2026-06-02-debug-bundle-closeout: T4 - integrate proof, commit, and seal if allowed` | needs-check | orchestrator only | commit/seal handoff prepared; no commit/seal yet | 2026-06-02 | integrator commit/seal pass |
