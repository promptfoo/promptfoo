# integration-google-adk (Google ADK Integration)

This example shows how to evaluate the Python [Google Agent Development Kit (ADK)](https://adk.dev/) in promptfoo with native ADK tracing.

It demonstrates:

- an in-process Python provider instead of an `adk api_server` wrapper
- native ADK OpenTelemetry spans exported into Promptfoo
- multi-turn session state, callbacks, plugins, and artifacts
- workflow agents via `SequentialAgent`
- trajectory assertions over real ADK tool calls

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

The default model is `gemini-2.5-flash`. To use another ADK-supported model, set `ADK_MODEL` before running the eval. Provider-style model strings such as `openai/gpt-5.4-mini` require the optional ADK extensions:

```bash
pip install 'google-adk[extensions]>=1.32.0,<2'
export ADK_MODEL=openai/gpt-5.4-mini
```

If Promptfoo is launched outside the activated virtual environment, point the Python provider at it explicitly:

```bash
PROMPTFOO_PYTHON=.venv/bin/python npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

## Files

- `agent.py`: ADK app builders, tools, callback, plugin, and workflow agent graph
- `provider.py`: Promptfoo Python provider plus ADK-to-Promptfoo trace propagation
- `provider_test.py`: focused tests for provider helpers
- `promptfooconfig.yaml`: conversational multi-turn eval with state, artifacts, and trajectory assertions
- `promptfooconfig.workflow.yaml`: workflow-agent eval with `SequentialAgent`
- `requirements.txt`: Python dependencies

## What The Conversational Eval Covers

The main config turns one Promptfoo row into a small multi-turn task:

1. Ask for London weather.
2. Ask the agent to save a trip note.
3. Ask which city was discussed earlier.

The provider returns the user-visible answer plus an inspection payload:

- `session_state` from ADK state
- `artifact_names` and `artifacts` from `InMemoryArtifactService`
- `plugin_events` recorded by an ADK `BasePlugin`
- `event_count` from the ADK session

The eval asserts that:

- ADK used both `get_weather` and `save_trip_note`
- the tool arguments were correct
- the tool sequence was correct
- ADK emitted `invoke_agent`, `call_llm`, and `execute_tool` spans
- no traced error spans were emitted

## How Tracing Works

ADK 1.x already emits OpenTelemetry spans for the important framework steps:

- `invocation`
- `invoke_agent <name>`
- `call_llm`
- `execute_tool <name>`

`provider.py` keeps those spans inside Promptfoo's trace by:

1. reading the W3C `traceparent` from the Promptfoo Python provider context
2. creating an OpenTelemetry provider with an OTLP HTTP exporter pointed at Promptfoo's receiver
3. starting a small provider span under the Promptfoo parent trace
4. letting ADK emit its native child spans beneath it

Because ADK records `gen_ai.tool.name` and tool-call arguments, Promptfoo can normalize those spans into `trajectory:*` assertions without a custom SDK span converter.

After an eval, open the Trace Timeline for the row and inspect:

- `invoke_agent weather_agent`
- `call_llm`
- `execute_tool get_weather`
- `execute_tool save_trip_note`
- tool attributes such as `gen_ai.tool.name`
- ADK tool arguments captured in `gcp.vertex.agent.tool_call_args`

## Why This Uses A Python Provider

The older HTTP shape around `adk api_server` is fine when you need to test a deployed service boundary, but it hides useful framework details from Promptfoo. The in-process provider is the better default when you want:

- direct control over sessions and state
- access to artifacts and plugins
- trace assertions on ADK's internal workflow
- one eval row to represent a long-horizon task

Use an HTTP provider when the deployed API itself is what you want to validate.

## Learn More

- [Evaluate Google ADK agents](https://promptfoo.dev/docs/guides/evaluate-google-adk)
- [ADK technical overview](https://adk.dev/get-started/about/)
- [ADK sessions](https://adk.dev/sessions/)
- [ADK callbacks](https://adk.dev/callbacks/)
- [ADK artifacts](https://adk.dev/artifacts/)
