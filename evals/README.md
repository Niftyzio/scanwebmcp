# WebMCP agent eval pack

This pack follows Chrome's [WebMCP eval guidance](https://developer.chrome.com/docs/ai/webmcp/evals): test tool selection and arguments in isolation, then test ordering and complete user journeys.

`webmcp-agent-evals.json` contains 12 representative scenarios. Each scenario names the browser state it needs:

- `site`: a public page with the three site-wide tools.
- `scan_locked`: a report page before the email gate is unlocked.
- `scan_unlocked`: a report page with full findings available.

The `surfaces` map is a deterministic snapshot of every tool exposed in each state. The repository test compares it with the same constants used by `WebMCPTools`, so adding or removing a shipped tool requires an intentional eval update.

## Fields

- `messages` is the model conversation input.
- `expectedCall` uses Chrome's ordered `functionName` and `arguments` shape. An empty array means the assistant should respond without calling a tool.
- `prohibitedCalls` lists tools that must not be invoked in that scenario.
- `mockToolResults` injects a deterministic tool result after the indexed call for a failure-path eval.
- `expectedAssistantBehavior` records response requirements that need semantic or model-based grading.
- `successCriteria` states when the full user journey is complete.

For a probabilistic run, open the requested state, give the model the complete live tool list from that page, replay `messages`, inject any `mockToolResults`, and grade calls plus the final response. Include multiple runs per scenario because model choices are probabilistic.

The repository's deterministic validation checks structure, live-surface alignment, scenario coverage, parameter fixtures, call ordering and consent invariants:

```sh
npm run test:evals
```
