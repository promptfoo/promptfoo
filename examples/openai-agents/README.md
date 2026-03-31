# openai-agents (Long-Horizon OpenAI Agents Python SDK)

This example shows how to evaluate the official Python `openai-agents` SDK end to end in Promptfoo.

It demonstrates:

- a long-horizon task executed as multiple turns over a persistent `SQLiteSession`
- specialist handoffs between a triage agent, an FAQ agent, and a seat-booking agent
- agentic assertions such as `trajectory:tool-used`, `trajectory:tool-args-match`, `trajectory:tool-sequence`, and `trajectory:step-count`
- telemetry you can inspect in Promptfoo's Trace Timeline

The tracing path is important: the example installs a custom OpenAI Agents tracing processor that exports the SDK's spans to Promptfoo's built-in OTLP receiver. That is what makes the trajectory assertions and trace visualization work inside Promptfoo. The config accepts both OTLP JSON and protobuf because the SDK bridge emits JSON while the optional Python wrapper span uses protobuf by default.

## Files

- `agent_provider.py`: the Promptfoo Python provider and agent graph
- `promptfoo_tracing.py`: bridges OpenAI Agents SDK traces to Promptfoo OTLP
- `promptfooconfig.yaml`: eval config with tracing and trajectory assertions
- `requirements.txt`: Python dependencies for the example

## Requirements

- Python 3.10+
- Node.js 20+
- `OPENAI_API_KEY`

## Setup

```bash
npx promptfoo@latest init --example openai-agents
cd openai-agents

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_KEY=your_api_key_here
```

## Run

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
PROMPTFOO_ENABLE_OTEL=true npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```

Open any result and inspect the **Trace Timeline** tab. You should see agent, handoff, generation, and tool spans from the OpenAI Agents SDK.

If you also want a provider-level Python OTEL span alongside the SDK spans, run the eval with `PROMPTFOO_ENABLE_OTEL=true`.

## What The Eval Asserts

- the agent used `lookup_reservation`, `update_seat`, and `faq_lookup`
- the seat update tool received the expected arguments
- the tools appeared in the expected order across a multi-step task
- at least three traced agent spans were captured during the long-horizon run
- no traced error spans were emitted
- the final trajectory achieved the stated goal

## Notes

- The example uses the Python SDK, not the built-in `openai:agents:*` provider. That built-in provider is for the JavaScript `@openai/agents` SDK.
- `requirements.txt` includes the optional OpenTelemetry Python packages used by Promptfoo's wrapper. Set `PROMPTFOO_ENABLE_OTEL=true` to emit the provider-level Python span in addition to the SDK spans.
- If you do not need SDK spans, remove the `configure_promptfoo_tracing(...)` import and call from `agent_provider.py`. You can then delete `promptfoo_tracing.py`, but you will lose tool-path assertions because Promptfoo will no longer receive the SDK's internal agent spans.
- `trajectory:goal-success` adds an extra judge-model call. Remove it if you want a cheaper run.
