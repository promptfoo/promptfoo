# integration-google-adk (Google ADK Integration)

This example shows how to evaluate the Python [Google Agent Development Kit (ADK)](https://adk.dev/) in promptfoo with native ADK tracing.

It demonstrates:

- an in-process Python provider instead of an `adk api_server` wrapper
- native ADK OpenTelemetry spans exported into Promptfoo
- multi-turn session state, callbacks, plugins, and artifacts
- workflow agents via `SequentialAgent`
- trajectory assertions over real ADK tool calls

## Prerequisites

- Python 3.10+
- Node.js >=22.22.0
- A Google API key for the default Gemini model

## Quick Start

```bash
npx promptfoo@latest init --example integration-google-adk
cd integration-google-adk

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

export GOOGLE_API_KEY=your_google_api_key_here
```

Choose whether ADK model and tool spans store messages, arguments, and results. To run the tool-argument assertions, opt in with these settings in the example directory's `.env`:

```text
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=SPAN_ONLY
ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=true
```

To suppress payload content on both schemas, use `NO_CONTENT` and `false`, respectively. Legacy ADK captures content by default and writes empty JSON to its payload attributes when disabled; telemetry v2 omits the attributes. The tool-argument assertions fail with capture off. The **exported trace can still contain sensitive text**: Promptfoo includes test variables and grader explanations, and model errors can include rejected input. Saved eval results also include model output.

The commands below load `.env` from the current directory (`integration-google-adk`). If you run the same configs from the repository root, pass `--env-file examples/integration-google-adk/.env` to each eval. Shell values win for an implicit `.env` by default; an [explicit env file](https://www.promptfoo.dev/docs/usage/command-line/#multiple-environment-files) overrides them.

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest eval -c promptfooconfig.workflow.yaml --no-cache
npx promptfoo@latest view
```

The default model is `gemini-2.5-flash`, using ADK 2.x.

ADK 2.9.2 still supports `SequentialAgent`, but deprecates it in favor of
`Workflow`. This example retains the original sequential-agent trace contract;
new graph-based apps should use [ADK workflows](https://adk.dev/workflows/).

To use OpenAI GPT-5 models, install the optional LiteLLM adapter with its MCP
dependencies and keep the provider prefix so ADK selects the compatible adapter:

```bash
python -m pip install 'litellm[mcp]>=1.101,<2'
export OPENAI_API_KEY=your_openai_api_key_here
export ADK_MODEL=openai/gpt-5.4-mini
```

If Promptfoo runs outside the activated virtual environment, prefix either eval command above with `PROMPTFOO_PYTHON=.venv/bin/python`.

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
- ADK emitted `invoke_agent`, `generate_content`, and `execute_tool` spans
- no traced error spans were emitted

## How Tracing Works

ADK 2.x emits OpenTelemetry spans for the important framework steps:

- `invocation` (legacy ADK) or `invoke_workflow <name>` (ADK 2.13 v2)
- `invoke_agent <name>`
- `generate_content <model>`
- `execute_tool <name>`

`provider.py` keeps those spans inside Promptfoo's trace by:

1. reading the W3C `traceparent` from the Promptfoo Python provider context
2. creating an OpenTelemetry provider with an OTLP HTTP exporter pointed at Promptfoo's receiver
3. starting a small provider span under the Promptfoo parent trace
4. letting ADK emit its native child spans beneath it

ADK 2.13 defaults to telemetry v2. Tool names remain visible when content capture is off. Leave `PROMPTFOO_ENABLE_OTEL` off to avoid recording provider request and response bodies in separate Python worker spans.

ADK 2.9.2 and 2.12 store tool arguments in `gcp.vertex.agent.tool_call_args` and emit `call_llm`. ADK 2.13’s v2 schema uses `gen_ai.tool.call.arguments` and drops `call_llm`. Use `generate_content <model>` to count model calls across these releases.

After an eval, open the Trace Timeline for the row and inspect:

- `invoke_agent weather_agent`
- `generate_content <model>`
- `execute_tool get_weather`
- `execute_tool save_trip_note`
- tool attributes such as `gen_ai.tool.name`
- tool arguments in `gcp.vertex.agent.tool_call_args` (legacy ADK) or `gen_ai.tool.call.arguments` (ADK 2.13 v2)

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
