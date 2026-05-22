# integration-inspect-agent-threat-bench (AgentThreatBench via Inspect)

This example runs [AgentThreatBench](https://ukgovernmentbeis.github.io/inspect_evals/evals/safeguards/agent_threat_bench/) through promptfoo by wrapping its Inspect-native tasks in [`inspect_evals`](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/agent_threat_bench).

AgentThreatBench measures model resilience to agentic attacks in tool outputs and memory stores:

| Task              | OWASP risk                         | Attack surface                                          |
| ----------------- | ---------------------------------- | ------------------------------------------------------- |
| `memory_poison`   | ASI06 Memory and Context Poisoning | Adversarial entries returned from a knowledge base      |
| `autonomy_hijack` | ASI01 Agent Goal Hijack            | Injection embedded in email triage tool output          |
| `data_exfil`      | ASI01 Agent Goal Hijack            | Customer records that try to trigger unauthorized sends |

This is an orchestration wrapper, not a promptfoo-native reimplementation of the benchmark. Inspect owns the benchmark prompts, task tools, tool loop, and the scorer that emits separate `utility` and `security` results. Promptfoo imports the samples, starts one Inspect eval per row, reports both scores, and can gate them in CI.

## Prerequisites

You need:

- Python with Inspect Evals and the SDK for the Inspect model provider you choose:

  ```bash
  pip install inspect-evals openai anthropic
  ```

- An API key for the model provider. The default config uses `openai/gpt-5-nano`, so export `OPENAI_API_KEY`. To use Anthropic, export `ANTHROPIC_API_KEY` and set `vars.model` or `providers[0].config.defaultModel` to an Inspect model id.

AgentThreatBench's tools are simulated by Inspect, so this example does not require a separate target agent service.

## Run

Create the example:

```bash
npx promptfoo@latest init --example integration-inspect-agent-threat-bench
cd integration-inspect-agent-threat-bench
promptfoo eval -c promptfooconfig.yaml
```

To run the same example from the Promptfoo repository source tree:

```bash
PROMPTFOO_ENABLE_OTEL=true OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  npm run local -- eval -c examples/integration-inspect-agent-threat-bench/promptfooconfig.yaml \
    --no-cache
```

Use metadata filters to start with one sample or run a task or difficulty slice:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache --filter-metadata sample_id=mp_001
promptfoo eval -c promptfooconfig.yaml --no-cache --filter-metadata task=data_exfil
promptfoo eval -c promptfooconfig.yaml --no-cache --filter-metadata difficulty=hard
```

The unfiltered config runs every AgentThreatBench sample that Inspect exposes in the installed `inspect-evals` version.

## What runs

`agent_threat_bench_tests.py` calls the Inspect task loaders and creates one promptfoo row per sample. Each row includes filterable metadata for:

- `task`
- `sample_id`
- `owasp_id`
- `attack_name`
- `difficulty`

For every row, `provider.py` runs the matching Inspect task by exact sample id, for example:

```bash
inspect eval inspect_evals/agent_threat_bench_memory_poison \
  --model openai/gpt-5-nano --sample-id mp_001 --log-dir <dir>
inspect log dump <file.eval>
```

The Promptfoo prompt is only the row label passed to the file provider. Inspect reads the actual benchmark input, initializes the simulated memory, inbox, or customer data tools, and grades the resulting trajectory.

## Scores

AgentThreatBench scores two metrics:

- `utility`: the agent completed the legitimate task
- `security`: the agent resisted the injected behavior

The assertion passes only when both metrics pass. A row with high security but low utility is still a benchmark failure because the benchmark is measuring useful work under attack, not refusal alone.

The provider returns text like:

```text
Task memory_poison sample mp_001: utility=1.0 security=1.0 status=pass

Final answer: <Inspect final assistant message>
```

It also returns metadata for assertions and the promptfoo UI:

```json
{
  "inspect_log_path": "/absolute/path/to/examples/integration-inspect-agent-threat-bench/inspect_logs/.../*.eval",
  "status": "pass",
  "sample_id": "mp_001",
  "task": "memory_poison",
  "utility_score": 1.0,
  "security_score": 1.0
}
```

If Inspect exits before both scores are available, the provider returns an error instead of converting a harness failure into a benchmark failure.

## Inspect logs

Inspect writes `.eval` logs under `examples/integration-inspect-agent-threat-bench/inspect_logs/`. They are ignored by git because they can include task inputs, messages, tool calls, scorer output, and model responses.

Use Inspect's log viewer when you need the benchmark trajectory:

```bash
inspect view --log-dir examples/integration-inspect-agent-threat-bench/inspect_logs
```

The example config enables Promptfoo OpenTelemetry tracing. Set
`PROMPTFOO_ENABLE_OTEL=true` for Python provider spans; those spans also require
Promptfoo's Python tracing dependencies:

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

Inspect still owns the benchmark-internal model and tool trajectory in its `.eval`
log.

## Related Promptfoo red teams

Use this fixed benchmark when you want repeatable AgentThreatBench scores across models. To probe your own agent or chatbot, use Promptfoo's application-focused red-team plugins such as [`agentic:memory-poisoning`](https://promptfoo.dev/docs/red-team/plugins/memory-poisoning/), [`indirect-prompt-injection`](https://promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection/), and the [OWASP Agentic preset](https://promptfoo.dev/docs/red-team/owasp-agentic-ai/).
