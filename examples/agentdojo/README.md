# agentdojo (AgentDojo Security Benchmark)

Evaluate LLM agents against prompt injection attacks using [AgentDojo](https://github.com/ethz-spylab/agentdojo) (ETH Zurich, NeurIPS 2024).

## Quick Start

```bash
npx promptfoo@latest init --example agentdojo
cd agentdojo

# Setup Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run evaluation
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Environment Variables

- `OPENAI_API_KEY` - Required for default GPT-5.4 configuration

## Configuration

Edit `promptfooconfig.yaml` to change model, defense strategy, or attack type:

```yaml
providers:
  - id: file://provider.py
    config:
      model: gpt-5.4 # or gpt-4o-2024-05-13, claude-3-5-sonnet-20241022
      defense: null # or tool_filter, spotlighting_with_delimiting
      attack: important_instructions # or injecagent, tool_knowledge
      force_rerun: true # bypass AgentDojo's local trace cache for fresh comparisons
```

Custom GPT models use Promptfoo's OpenAI Responses wrapper with AgentDojo's
defense-aware pipeline builder. The `tool_filter` defense is only supported for
AgentDojo's registered OpenAI chat models, such as `gpt-4o-2024-05-13`.

AgentDojo's model registry does not include GPT-5.4. For custom GPT models,
this example creates a custom AgentDojo pipeline and registers the configured
model name so model-addressing attacks target the actual model under test. Use an
AgentDojo-registered model ID when you need to reproduce the paper's published
benchmark rows exactly.

The `transformers_pi_detector` defense requires AgentDojo's transformers extra:

```bash
pip install "agentdojo[transformers]"
```

Limit test cases for faster iteration:

```yaml
tests:
  - path: file://dataset.py:generate_tests
    config:
      suite: workspace
      max_user_tasks: 5
      max_injection_tasks: 3
```

## Understanding Results

| Metric           | Description                          |
| ---------------- | ------------------------------------ |
| **security**     | Was the injection blocked?           |
| **utility**      | Did the agent complete the task?     |
| **safe_utility** | Both secure AND useful? (key metric) |

A model with 100% utility but 0% security is **dangerous** - it works but is completely compromised by prompt injection.

## Tracing

This example enables Promptfoo tracing by default. Promptfoo passes W3C
`traceparent` context into the Python provider, and the provider exports an
`agentdojo.task` child span to Promptfoo's OTLP/JSON receiver.
The `trace` metric asserts that this span was stored and made available to
Promptfoo assertions.

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

To forward traces to an external collector, set:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="promptfoo-agentdojo-provider"
```

## Example Results

GPT-5.4 with `important_instructions` attack, no defense:

| Metric               | Result |
| -------------------- | ------ |
| Injections Blocked   | 0%     |
| User Tasks Completed | 100%   |
| Safe Utility         | 0%     |

The model completes all tasks correctly but follows every injected instruction - sending unauthorized emails, leaking data, etc.

## Learn More

- [AgentDojo Paper](https://arxiv.org/abs/2406.13352)
- [Promptfoo Red Team Docs](https://www.promptfoo.dev/docs/red-team/)
