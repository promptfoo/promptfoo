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

`promptfooconfig.yaml` evaluates one conversational task across three user turns against a single `Agent`:

```python title="agent.py"
root_agent = Agent(
    name="weather_agent",
    model=model,
    instruction="...travel weather assistant. Call get_weather... Call save_trip_note...",
    tools=[get_weather, save_trip_note],
    before_agent_callback=before_agent_callback,
)
app = App(name=APP_NAME, root_agent=root_agent, plugins=[audit_plugin])
```

The runtime wires up an `InMemorySessionService`, an `InMemoryArtifactService`, an app-wide `BasePlugin` (`AuditPlugin`), and the native ADK OpenTelemetry exporter. `promptfooconfig.workflow.yaml` evaluates a `SequentialAgent` flow with two child agents and asserts that the weather lookup runs before the briefing.

## Why Use A Python Provider

An in-process Python provider lets one Promptfoo row drive a multi-turn task, read session state, load artifacts, observe plugin and callback side effects, and assert against ADK's native trajectory spans — all without going over the wire. The HTTP shape around `adk api_server` cannot expose any of those without a parallel inspection channel.

Pick the HTTP provider when the deployed HTTP contract itself is what you want to validate (auth, request shape, status codes). Pick the Python provider for everything else.

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

State is mutated through `ToolContext`. Artifacts go through the same context but a different method:

```python title="agent.py"
async def save_trip_note(city: str, summary: str, tool_context: ToolContext):
    artifact = types.Part.from_bytes(
        data=f"# Trip note for {city}\n\n{summary}\n".encode("utf-8"),
        mime_type="text/markdown",
    )
    await tool_context.save_artifact(filename=f"{city}-trip-note.md", artifact=artifact)
    tool_context.state["last_saved_artifact"] = f"{city}-trip-note.md"
```

The provider drains both back out and returns them as one JSON payload. Deterministic `contains` and `is-json` assertions can then check internal effects without a model grader:

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

One eval row now covers the assistant's reply _and_ the agent's internal bookkeeping.

## Workflow Agents

When the order of work is fixed, encode it as a workflow agent instead of relying on the LLM to route. The bundled example chains a lookup agent into a briefing agent:

```python title="agent.py"
weather_lookup_agent = Agent(
    name="weather_lookup_agent",
    model=model,
    tools=[get_weather],
    output_key="weather_snapshot",  # writes the final response to session state
)
briefing_agent = Agent(name="briefing_agent", model=model, instruction="Use weather_snapshot...")
workflow = SequentialAgent(
    name="trip_planning_workflow",
    sub_agents=[weather_lookup_agent, briefing_agent],
)
```

The provider pattern is unchanged — `_run_workflow_provider` still calls `runner.run_async`. Swap `SequentialAgent` for `ParallelAgent`, `LoopAgent`, a custom `BaseAgent`, or any tree that uses `sub_agents` / `AgentTool`. Add a `trace-span-count` for each named workflow agent, and keep `trajectory:tool-used` focused on the tool calls that must happen.

## Structured Outputs, Memory, And Advanced Tools

The same provider shape covers the rest of the stable ADK 1.x surface. Map each ADK feature to the assertion type that proves it works:

| ADK feature                          | Assertion to add                                                           |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `output_schema` or `output_key`      | `is-json` with a JSON schema in `value`, plus `contains` on returned state |
| `MemoryService`                      | paired test cases that share a session id vs use distinct ones             |
| MCP, OpenAPI, or authenticated tools | `trajectory:tool-used`, `trajectory:tool-args-match`, `is-refusal`         |
| code executors                       | `trace-span-count` on `execute_tool *` plus safety `contains` / `regex`    |
| multi-agent trees                    | one `trace-span-count` per `invoke_agent <name>` you require               |
| long-running / resumable apps        | `contains` on `session_state` snapshots before and after resume            |

ADK ships its own `adk eval` stack — use it for ADK-native eval sets and ADK-specific metrics. Promptfoo is the better fit when one harness has to compare ADK against other frameworks, run red teams against the same surface, or assert on OpenTelemetry traces alongside the final output.

## Production Notes

- Keep the provider span small. ADK emits the framework spans; the wrapper only has to preserve Promptfoo's parent trace and flush before the worker exits.
- The bundled example uses in-memory services so runs are deterministic. Swap in your real `SessionService`, `ArtifactService`, or `MemoryService` when persistence is part of the behavior under test.
- Reach for state and artifact assertions first; reserve model-graded assertions for outcomes that actually require semantics (tone, factuality, refusal quality).
- The optional `google-adk[extensions]` set adds hundreds of MB of LiteLLM and provider SDKs. Install it only when you need provider-prefixed model strings (`openai/...`, `anthropic/...`), and expect upstream warnings unrelated to your eval.

## Source References

- [ADK technical overview](https://adk.dev/get-started/about/)
- [ADK Python quickstart](https://adk.dev/get-started/python/)
- [ADK sessions](https://adk.dev/sessions/)
- [ADK callbacks](https://adk.dev/callbacks/)
- [ADK artifacts](https://adk.dev/artifacts/)
- [ADK agents](https://adk.dev/agents/)
