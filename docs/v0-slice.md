# V0 Slice

## Implemented

- canonical `CapabilityDescriptor` model and `ToolContract` projection
- action-only AI surface boundary for `CapabilityDescriptor` / `ToolContract`, with bootstrap resources kept separate
- descriptor-derived MCP export handoff contract for exportable capabilities
- minimal bootstrap read path for `runtime/config/skills/hosts` summaries via background bridge
- minimal local `hosts.*` control plane for list/get/connect/disconnect/set_default/health
- host substrate contract for `host.read/write/edit/exec`, including default-host routing through the MV3 background/offscreen bridge
- skill lifecycle state machine with `trusted` as an enabled-only flag
- public capability registry + family provider dispatch
- skill runtime ctx with permission checks, trace, and reentrancy guard
- BrowserVFS with `ephemeral/workspace/library`, write-through persistence, quotas, snapshot/rehydrate
- isolated JS runner host with timeout handling
- site skill active-tab matching and explicit hook install on invoke
- minimal MV3 shell with background worker, side panel, and offscreen host entry

## Deferred

- real IndexedDB migration/versioning strategy
- descriptor-driven full builtin catalog beyond the v0 namespace baseline
- real local/remote execution host adapters behind the `host.*` substrate
- bridge-side MCP export server/transport beyond the descriptor-derived handoff contract
- full Skill Studio UI
- Chrome integration for real script injection, runner RPC, and offscreen lifecycle
