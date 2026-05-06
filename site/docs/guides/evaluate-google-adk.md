---
title: Evaluate Google ADK Agents
description: Evaluate Google ADK Python agents with Promptfoo tracing, sessions, tools, callbacks, plugins, artifacts, and workflow-agent checks.
sidebar_position: 27
---

# Evaluate Google ADK Agents

Use Google ADK's Python SDK with Promptfoo by wrapping your app as a Python provider. That keeps the ADK runtime in process, so Promptfoo can inspect the same sessions, artifacts, and native OpenTelemetry spans that the agent produced.

:::note
This guide targets stable ADK 1.x. Google's public docs also advertise ADK Python 2.0 beta releases, but those releases have breaking API and session-schema changes. Validate a 2.0 integration separately before moving production evals onto it.
:::

## Quick Start

```bash
npx promptfoo@latest init --example integration-google-adk
cd integration-google-adk

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export GOOGLE_API_KEY=your_google_api_key_here
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest eval -c promptfooconfig.workflow.yaml --no-cache
npx promptfoo@latest view
```

The example defaults to `gemini-2.5-flash`. If you want to use another ADK-supported model, set `ADK_MODEL`. Provider-style model strings such as `openai/gpt-5.4-mini` require the optional ADK extensions:

```bash
pip install 'google-adk[extensions]>=1.32.0,<2'
export ADK_MODEL=openai/gpt-5.4-mini
```

If Promptfoo runs outside the activated virtual environment, set the interpreter explicitly:

```bash
PROMPTFOO_PYTHON=.venv/bin/python npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

## What The Example Covers

`promptfooconfig.yaml` evaluates one conversational task across three user turns. The ADK app uses:

- `Agent` with function tools
- `InMemorySessionService` state
- a `before_agent_callback`
- an app-wide `BasePlugin`
- `InMemoryArtifactService`
- native ADK OpenTelemetry traces

`promptfooconfig.workflow.yaml` evaluates a small `SequentialAgent` flow with two child agents. It verifies that the weather lookup happens before the briefing agent finishes the task.

## Why Use A Python Provider

You can put ADK behind `adk api_server` and test it over HTTP, but that is usually the wrong default for agent evals. An in-process Python provider gives Promptfoo access to the framework behavior that matters most:

- one Promptfoo row can represent a multi-turn task
- session state can be inspected directly
- artifacts can be loaded after the run
- ADK's internal spans are available for `trajectory:*` assertions
- plugin and callback effects can be surfaced in the returned payload

Use an HTTP provider when the deployed HTTP contract is what you need to test.

## How Native ADK Tracing Fits Promptfoo

ADK 1.x already emits OpenTelemetry spans such as:

- `invocation`
- `invoke_agent weather_agent`
- `call_llm`
- `execute_tool get_weather`

The example provider preserves Promptfoo's W3C `traceparent`, starts a small provider span beneath it, and exports ADK's child spans to Promptfoo's built-in OTLP receiver. ADK already records `gen_ai.tool.name` and tool-call arguments, so Promptfoo can normalize them into trajectory steps without a custom span translator.

```yaml
assert:
  - type: trajectory:tool-used
    value:
      - get_weather
      - save_trip_note

  - type: trajectory:tool-args-match
    value:
      name: get_weather
      args:
        city: London
      mode: partial

  - type: trajectory:tool-sequence
    value:
      steps:
        - get_weather
        - save_trip_note
```

Use `trace-span-count` and `trace-error-spans` alongside trajectory assertions when you also want to prove that the ADK runtime emitted the expected framework spans and stayed error-free.

After the eval, inspect the row in the Trace Timeline. The bundled conversational run should show:

- one Promptfoo provider span beneath the injected parent trace
- `invoke_agent weather_agent` once per user turn
- `call_llm` spans around the model hops
- `execute_tool get_weather`
- `execute_tool save_trip_note`
- `gen_ai.tool.name` on tool spans
- serialized ADK tool arguments in `gcp.vertex.agent.tool_call_args`

## Sessions, State, Plugins, And Artifacts

ADK separates short-lived conversation state from artifacts:

- the `get_weather` tool writes `last_city` into session state through `ToolContext.state`
- `before_agent_callback` increments a callback counter in the same state
- `AuditPlugin` records runner lifecycle callbacks
- `save_trip_note` writes a Markdown artifact through `ToolContext.save_artifact`

The provider returns a JSON inspection payload after each run so deterministic assertions can check those effects:

```json
{
  "artifact_names": ["london-trip-note.md"],
  "plugin_events": ["before_run:...", "after_run:..."],
  "session_state": {
    "callback_invocations": 3,
    "last_city": "London",
    "last_saved_artifact": "london-trip-note.md"
  }
}
```

That pattern is useful when you care about more than the final assistant sentence. It lets one eval verify user-visible output and internal agent behavior together.

## Workflow Agents

ADK's workflow agents are useful when orchestration should be explicit rather than model-routed. The bundled workflow example uses:

1. `weather_lookup_agent` to call `get_weather`
2. `briefing_agent` to turn the stored `weather_snapshot` into a trip brief
3. `SequentialAgent` to run those steps in order

The same provider pattern works for `ParallelAgent`, `LoopAgent`, custom `BaseAgent` implementations, and agent trees that use `sub_agents` or `AgentTool`. Add span-count assertions for the workflow agents you care about, then keep tool assertions focused on the side effects that must happen.

## Structured Outputs, Memory, And Advanced Tools

The example stays small enough to run quickly, but the same integration shape works with the rest of the stable ADK 1.x surface:

| ADK feature                           | Promptfoo check to add                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| `output_schema` or `output_key`       | deterministic JSON / schema assertions plus returned state            |
| `MemoryService`                       | separate cases for same-session vs cross-session recall               |
| MCP, OpenAPI, or authenticated tools  | `trajectory:tool-used`, argument checks, and negative-path assertions |
| code executors                        | command / tool spans plus output and safety checks                    |
| multi-agent trees                     | span counts for each agent plus tool order assertions                 |
| long-running tools and resumable apps | state / event assertions around pause and resume behavior             |

ADK also has its own `adk eval` stack. Use that when you want ADK-native eval sets or ADK-specific metrics; use Promptfoo when you want one harness that can compare ADK against other frameworks, share the same assertion language, run red teams, or inspect OpenTelemetry traces alongside the final output.

## Production Notes

- Keep the provider span small. ADK already emits the useful child spans; the wrapper only needs to preserve Promptfoo's parent trace and flush before the worker exits.
- The bundled example uses in-memory services so it is deterministic and easy to inspect. Swap in your real `SessionService`, `ArtifactService`, or `MemoryService` when persistence is part of the behavior under test.
- Prefer direct state and artifact assertions for deterministic effects, then use model-graded assertions for genuinely semantic outcomes.
- If you test provider-style model strings such as `openai/...`, install `google-adk[extensions]`. That optional dependency set is much larger than the base SDK and may emit unrelated upstream warnings that do not indicate an eval failure.

## Source References

- [ADK technical overview](https://adk.dev/get-started/about/)
- [ADK Python quickstart](https://adk.dev/get-started/python/)
- [ADK sessions](https://adk.dev/sessions/)
- [ADK callbacks](https://adk.dev/callbacks/)
- [ADK artifacts](https://adk.dev/artifacts/)
- [ADK agents](https://adk.dev/agents/)
