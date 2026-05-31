# Agent Run UI PRD

## Problem Statement

Browser Brain Loop vNext has already migrated a usable Side Panel chat surface, but the current interaction model is still too close to a basic transcript. It can stream assistant text and show tool call/result cards, but it does not give the user a clear, first-class view of what the agent is doing right now.

The original product had richer runtime cues, including model-thinking, tool-running, handoff, final-answer, context-compaction, and pending-tool states. That direction was useful, but the presentation was not satisfying: runtime state, tool traces, raw logs, and semantic chat content were too tightly coupled inside the chat feed. The result was noisy, hard to scan, and difficult to compare against modern coding-agent interfaces.

The user needs Browser Brain Loop to align with best-in-class agent interaction standards: the chat transcript should remain semantically readable, while thinking summaries, tool execution, diagnostics, errors, retries, compaction, and human intervention should be visible as structured run activity. The UI should communicate progress without exposing raw chain-of-thought or flooding the conversation with logs.

## Solution

Build a first-class Agent Run UI model for the Side Panel. The product should separate three surfaces:

- Chat transcript: user requests and final assistant-facing responses.
- Current run status: the live phase of the active agent run.
- Activity timeline: structured model activity, tool calls, tool results, runtime diagnostics, compaction, and human-intervention events.

The product should keep the original Browser Brain Loop insight that agent runtime has meaningful phases, but redesign the hierarchy around a clearer mental model. The run UI should show concise progress by default, reveal structured details on demand, and keep errors or human-action-required states visible.

The design should borrow the stronger patterns from current agent tools:

- OpenAI Responses: structured event stream, reasoning summaries, tool calls, and tool outputs as separate first-class items.
- Pi coding-agent: assistant message streaming, tool argument streaming, and tool execution lifecycle are separate events and renderers.
- Claude-style coding agents: compact transcript, visible tool use, collapsed successful outputs, prominent errors and permission/action gates.
- Cursor/Windsurf/Continue-style IDE agents: current action and plan are visible, raw logs are secondary, and user intervention is explicit.
- Aider-style terminal agents: high signal transcript, file/tool changes summarized, commands and failures kept inspectable.

The end state is not a visual clone of any reference product. Browser Brain Loop should define its own browser-native agent run model that fits AI Surface, Site Runtime, BrowserVFS, JS Runner, Execution Host, and Kernel boundaries.

## User Stories

1. As a user, I want to see whether the agent is thinking, calling the model, running a tool, processing results, compacting context, waiting for me, or finalizing, so that I can understand progress without guessing.
2. As a user, I want the chat transcript to stay focused on my request and the assistant's meaningful response, so that long runs remain readable after completion.
3. As a user, I want tool calls to appear as structured activity, so that I can inspect what the agent did without mixing raw execution logs into the conversation.
4. As a user, I want successful tool outputs collapsed by default, so that routine activity does not dominate the UI.
5. As a user, I want failed tool outputs expanded or visibly marked, so that I can immediately see what needs attention.
6. As a user, I want the currently running tool to remain visible while it runs, so that I know the agent has not stalled.
7. As a user, I want tool arguments to stream or update before execution completes, so that I can see the intended action early.
8. As a user, I want tool results to attach to the correct tool call, so that I can trace cause and effect.
9. As a user, I want browser actions, file/VFS actions, host actions, skill actions, network actions, and runtime/config actions to have recognizable labels, so that I can scan activity quickly.
10. As a user, I want raw logs to remain available behind an expansion control, so that advanced debugging remains possible without overwhelming normal use.
11. As a user, I want the final assistant response to summarize relevant tool outcomes, so that I do not need to read every tool detail to understand the answer.
12. As a user, I want the activity timeline to preserve execution order, so that I can reconstruct what happened during a run.
13. As a user, I want compaction to appear as a runtime event, so that context-management delays are explainable.
14. As a user, I want human-intervention requests to be prominent and actionable, so that I know when the agent is waiting for my decision.
15. As a user, I want stopped and aborted runs to show partial progress and the stop reason, so that I can decide whether to retry or continue.
16. As a user, I want retry attempts and repeated failures to be visible, so that I can distinguish normal recovery from a loop.
17. As a user, I want no-progress or ping-pong detection to appear in the run activity, so that I can understand why a run stopped early.
18. As a user, I want a compact current-run ribbon or status strip, so that I can read the active phase without scrolling.
19. As a user, I want the current activity state to survive Side Panel re-open or runtime bootstrap, so that I do not lose context during a long run.
20. As a user, I want completed activity to remain available in session history, so that I can audit what the agent did later.
21. As a user, I want old transcript messages to remain stable after completion, so that live status updates do not rewrite historical conversation unexpectedly.
22. As a user, I want system or compaction summaries to be visually distinct from user/assistant conversation, so that I do not confuse runtime maintenance with assistant output.
23. As a user, I want thinking to be shown as a short progress summary or hidden label, not raw private reasoning, so that the UI is useful and safe.
24. As a user, I want model/tool activity to be accessible with screen readers, so that runtime state is not only visual.
25. As a user, I want keyboard navigation for expanding and collapsing activity details, so that I can inspect runs without relying on pointer interactions.
26. As an operator, I want run activity to reflect Kernel and runtime telemetry instead of UI-only guesses, so that the display matches actual runtime truth.
27. As an operator, I want runtime diagnostics to share the same activity language as the Side Panel, so that debugging and user-facing status are consistent.
28. As an operator, I want activity events to include stable identifiers, so that tool call/result matching remains reliable across streaming and bootstrap paths.
29. As an operator, I want activity entries to have severity and visibility rules, so that errors and action-required states are not accidentally hidden by history filters.
30. As an operator, I want event reducers to be deterministic and testable, so that Side Panel behavior can be verified without a browser.
31. As a developer, I want a deep module that converts raw runtime/chat events into a stable run-activity view model, so that UI components do not duplicate event semantics.
32. As a developer, I want the activity model to support future providers and tools without redesigning the transcript, so that new capability families can be added safely.
33. As a developer, I want the assistant transcript and activity timeline to be rendered from separate view models, so that UI changes do not corrupt LLM replay or session storage.
34. As a developer, I want bootstrap and live events to use the same projection rules, so that rehydrated sessions look the same as live sessions.
35. As a developer, I want existing rich assistant rendering and inline tool result behavior preserved where useful, so that the PRD improves the experience without regressing current chat basics.
36. As a developer, I want tests for running, completed, failed, stopped, and intervention states, so that high-risk run states remain stable.
37. As a developer, I want the UI to support compact and expanded modes, so that later product work can add richer inspector panels without changing the core event model.
38. As a user, I want the UI to make long-running agent work feel accountable rather than mysterious, so that I can trust the system while it acts in the browser.

## Implementation Decisions

- Build an Agent Run Activity model as the product-facing projection of runtime truth. It should represent phase, current activity, timeline entries, tool call lifecycle, severity, visibility, and user-action state.
- Treat Chat transcript and Run activity as separate view models. Transcript items represent conversation. Activity items represent execution.
- Use a stable phase vocabulary for active runs: idle, planning/thinking, model streaming, tool planned, tool running, tool result, processing result, compacting, waiting for user, finalizing, completed, failed, stopped.
- Keep raw chain-of-thought out of the UI. Show progress labels, model-provided reasoning summaries where explicitly available, and structured action summaries.
- Preserve the useful original Browser Brain Loop phase model, but do not preserve the old visual hierarchy or chat-coupled runtime state.
- Use Pi's split event lifecycle as a reference: assistant streaming, tool argument streaming, execution start, execution update, and execution end should remain distinct in the product model.
- Use OpenAI Responses-style stream structure as a reference: reasoning summaries, tool calls, and tool outputs are separate first-class content/event types.
- Successful tool results should collapse by default after completion unless they are directly embedded in final assistant content.
- Running tools, failed tools, blocked tools, intervention requests, and stop/error states must remain visible even when tool-history filtering is off.
- Activity cards should be typed by capability family. Initial families are browser/page, tabs, site runtime, VFS/file, host/execution, skill, config/runtime, model/provider, and generic capability.
- Tool cards should expose a concise header, status, capability family, arguments summary, result summary, and expandable details.
- Raw logs and large structured payloads belong behind expansion controls with stable height constraints.
- The current-run status strip should not be implemented as another transcript message. It is a live run surface.
- Bootstrap and live streaming must converge through the same reducer/projection logic, so reloaded sessions do not display a different hierarchy.
- Activity state should be derived from Kernel/runtime telemetry where available. UI heuristics may fill presentation gaps, but they should not become the source of truth for run phase.
- The assistant final response may absorb relevant tool result context, but the full tool trace remains in activity history.
- Existing rich text rendering, code-copy behavior, user message edit/retry/fork controls, system summary expansion, and current tool-card basics should be preserved unless they conflict with the new hierarchy.
- The implementation should avoid introducing Plugin as a product concept. All product language remains Skill, AI Surface, Capability, Kernel, Site Runtime, BrowserVFS, JS Runner, and Execution Host.
- The deepest reusable module should be the run-activity projector/reducer. Its public interface should accept ordered runtime/chat events and return a deterministic view model.
- UI components should be comparatively shallow: status strip, activity timeline, activity card renderer, and transcript renderer integration.
- Public event contracts should remain compatible with future runtime observability and replay surfaces.
- Any new event shape should prefer additive fields and stable IDs over string parsing of summaries or details.
- The P0 implementation should favor correctness and information hierarchy over visual polish. Visual refinement can follow once the state model is stable.

## Testing Decisions

- Tests should assert external behavior of the run UI, not private implementation details. The core question is whether users see the correct phase, status, transcript, activity card, and error/action-required behavior for a given event sequence.
- The run-activity projector/reducer should have unit tests for live streaming, bootstrap replay, tool call/result pairing, interleaved assistant/tool events, errors, stopped runs, compaction events, intervention events, and visibility rules.
- Side Panel state tests should verify that chat transcript state and activity state do not overwrite each other.
- Side Panel rendering tests should verify the current-run status strip, collapsed successful activity, visible running activity, visible failed activity, intervention prompts, and expanded details.
- Runtime chat tests should verify that emitted events contain enough structure for the UI to render phases and tool lifecycle without relying on fragile summary text parsing.
- Regression tests should preserve existing rich assistant content blocks, inline tool results, system/compaction summary rendering, and current stop/error behavior.
- Accessibility tests should verify live-region semantics for running state and clear labels for expand/collapse controls.
- Good tests should use representative event sequences rather than snapshots of CSS-heavy markup. Assertions should focus on labels, roles, visibility, ordering, and state transitions.
- Prior art exists in the current Side Panel state tests, Side Panel app rendering tests, runtime chat tests, and old-product phase/tool-run tracking tests.

## Out of Scope

- Full visual redesign of the Side Panel.
- Full Skill Studio, package authoring, lifecycle, or marketplace UI.
- Provider-routing policy redesign.
- New browser automation capabilities beyond what is needed to display existing tool activity.
- New Execution Host transports.
- Raw chain-of-thought display.
- Reintroducing Plugin as a product-level concept.
- Changing LLM replay semantics unless required to preserve structured assistant/tool content.
- Replacing Kernel, BrowserVFS, JS Runner, or Site Runtime architecture.
- Reworking release cutover criteria unless this PRD reveals a real product blocker that must be promoted separately.

## Further Notes

- This PRD is based on the 2026-05-31 local review of Browser Brain Loop vNext, the original Browser Brain Loop chat/runtime UI, and the updated Pi mono checkout at v0.78.0.
- The key product correction is conceptual: Chat is not the agent runtime. Chat is one surface over a richer agent run.
- The P0 should produce a stable runtime activity language before spending effort on detailed visual polish.
- The design should remain browser-native. Browser-side Kernel, Site Runtime, BrowserVFS, JS Runner, and Execution Host are not incidental implementation details; they are the product's runtime vocabulary.
